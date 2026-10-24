// Servidor da folha de pagamento: API + telas (pasta dist).
// Normal: roda só neste computador (127.0.0.1), em http://localhost:3210
// Com --rede (servidor da empresa): aceita outros computadores e exige senha.

import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  db, tx, copiarBanco, backupAutomatico, copiasNaPasta, explicarErroPasta, lerConfig, gravarConfig, PASTA_BACKUPS, PASTA_DADOS,
} from './db.js';
import { instalarAcesso, temSenha } from './acesso.js';
import { calcularLancamento, round2, saldoVale, somarResultados } from '../shared/calculo.js';
import { calcularEspelho, formatarHorario, lerAFD, lerHorario, periodoDaFolha, somarDias, sugerirFuncionario } from '../shared/ponto.js';
import {
  definicaoDaRegra, ehMarcada, limparDefinicao, regraLegada, TIPOS_CAMPO, variaveisDa, variaveisUsadas,
} from '../shared/regras.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(RAIZ, 'dist');
const PORTA = Number(process.env.PORT) || 3210;
const EM_REDE = process.argv.includes('--rede');

if (EM_REDE && !temSenha()) {
  console.error('\n  Para abrir o sistema para outros computadores é preciso definir uma senha antes:');
  console.error('  node server/definir-senha.js\n');
  process.exit(1);
}

// Produção = servidor da empresa (--rede). Sem --rede é a versão de testes deste computador.
const AMBIENTE = EM_REDE ? 'producao' : 'testes';
// versao.json é gerado pelo "Gerar Atualização.bat"; na pasta de desenvolvimento ele não existe.
const VERSAO = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(RAIZ, 'versao.json'), 'utf8')).versao || 'desenvolvimento';
  } catch {
    return 'desenvolvimento';
  }
})();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));
app.get('/api/info', (req, res) => res.json({ ambiente: AMBIENTE, versao: VERSAO }));
instalarAcesso(app);

// ---------------------------------------------------------------- utilitários

class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}
const falhar = (status, mensagem) => {
  throw new ErroHttp(status, mensagem);
};

const comum = (linha) => (linha ? { ...linha } : linha); // linhas do sqlite vêm sem protótipo
const lerJson = (s, padrao) => {
  try {
    return s ? JSON.parse(s) : padrao;
  } catch {
    return padrao;
  }
};
const numero = (v, padrao = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : padrao;
};
const textoOuNulo = (v) => (v == null ? null : String(v).trim() || null);
const id = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) falhar(400, 'Identificador inválido.');
  return n;
};
const marcadores = (lista) => lista.map(() => '?').join(',');
const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });

// ---------------------------------------------------------------- carregamento

function carregarOficina(oficinaId) {
  const o = comum(db.prepare('SELECT * FROM oficinas WHERE id = ?').get(oficinaId));
  if (!o) return null;
  o.arredondar_dia = !!o.arredondar_dia;
  o.folhas = db.prepare('SELECT numero, apelido, dia_fechamento FROM folhas WHERE oficina_id = ? AND excluida = 0 ORDER BY numero')
    .all(oficinaId).map(comum);
  // Regras de pagamento (shared/regras.js); a definição vem sempre completa, mesmo nas bonificações antigas.
  o.bonificacoes = db.prepare('SELECT * FROM bonificacoes WHERE oficina_id = ? ORDER BY ordem, id').all(oficinaId)
    .map((b) => ({ ...b, ativo: !!b.ativo, definicao: definicaoDaRegra({ ...b, definicao: lerJson(b.definicao, null) }) }));
  o.campos = db.prepare('SELECT id, nome, tipo, escopo FROM campos_personalizados WHERE oficina_id = ? ORDER BY ordem, id').all(oficinaId).map(comum);
  const logo = db.prepare('SELECT versao FROM logos WHERE oficina_id = ?').get(oficinaId);
  o.logo_url = logo ? `/api/oficinas/${oficinaId}/logo?v=${logo.versao}` : null;
  return o;
}

function oficinaOu404(oficinaId) {
  return carregarOficina(id(oficinaId)) || falhar(404, 'Empresa não encontrada.');
}

/** Folha (grupo) da oficina, mesmo se já foi apagada: o histórico continua mostrando o nome dela. */
function folhaDaOficina(oficina, numeroFolha) {
  return oficina.folhas.find((f) => f.numero === numeroFolha)
    || comum(db.prepare('SELECT numero, apelido, dia_fechamento FROM folhas WHERE oficina_id = ? AND numero = ?').get(oficina.id, numeroFolha))
    || { numero: numeroFolha, apelido: null, dia_fechamento: null };
}

/** Número de uma folha que existe (e não foi apagada) na oficina. */
function folhaValida(oficina, valor, mensagem = 'Folha inválida.') {
  const n = Number(valor);
  return oficina.folhas.some((f) => f.numero === n) ? n : falhar(400, mensagem);
}

function normalizarFuncionario(f) {
  const r = comum(f);
  r.ativo = !!r.ativo;
  r.comissionado = !!r.comissionado;
  r.campos = lerJson(r.campos, {});
  return r;
}

/** Junta bonificações e parcelamentos de cada funcionário. */
function anexarDetalhes(funcionarios) {
  if (!funcionarios.length) return funcionarios;
  const ids = funcionarios.map((f) => f.id);
  const porId = new Map(funcionarios.map((f) => [f.id, Object.assign(f, { bonificacoes: [], parcelamentos: [] })]));
  for (const b of db.prepare(`SELECT * FROM funcionario_bonificacoes WHERE funcionario_id IN (${marcadores(ids)})`).all(...ids)) {
    porId.get(b.funcionario_id).bonificacoes.push({ bonificacao_id: b.bonificacao_id, valor: b.valor });
  }
  const vales = db.prepare(`SELECT * FROM parcelamentos WHERE funcionario_id IN (${marcadores(ids)}) ORDER BY inicio, id`).all(...ids).map(comum);
  anexarDescontosVales(vales);
  for (const v of vales) porId.get(v.funcionario_id).parcelamentos.push(v);
  return funcionarios;
}

/**
 * Quanto de cada vale já foi descontado em folhas fechadas (descontado, vezes) e o saldo.
 * Folhas abertas não contam: o desconto delas só vale quando a folha é fechada.
 */
function anexarDescontosVales(vales) {
  if (!vales.length) return vales;
  const ids = vales.map((v) => v.id);
  const somas = new Map(db.prepare(`SELECT parcelamento_id, SUM(valor) AS total, COUNT(*) AS vezes FROM descontos_vales
    WHERE parcelamento_id IN (${marcadores(ids)}) GROUP BY parcelamento_id`).all(...ids).map((r) => [r.parcelamento_id, r]));
  for (const v of vales) {
    const s = somas.get(v.id);
    v.descontado = s ? round2(s.total) : 0;
    v.vezes = s ? s.vezes : 0;
    const saldo = saldoVale(v);
    v.valor_total = saldo.total;
    v.saldo = saldo.saldo;
  }
  return vales;
}

function carregarFuncionarios(ids) {
  if (!ids.length) return [];
  const lista = db.prepare(`SELECT * FROM funcionarios WHERE id IN (${marcadores(ids)})`).all(...ids).map(normalizarFuncionario);
  return anexarDetalhes(lista);
}

function lerLancamento(l) {
  const r = comum(l);
  r.acrescimos = lerJson(r.acrescimos, []);
  r.descontos = lerJson(r.descontos, []);
  r.campos = lerJson(r.campos, {});
  r.regras_manuais = lerJson(r.regras_manuais, {});
  r.pular_parcelas = !!r.pular_parcelas;
  r.snapshot = lerJson(r.snapshot, null);
  return r;
}

const contexto = (oficina, fm, funcionario) => ({
  oficina,
  bonificacoes: oficina.bonificacoes,
  funcionario,
  parcelamentos: funcionario.parcelamentos,
  ano: fm.ano,
  mes: fm.mes,
});

const CAMPOS_SNAPSHOT = ['nome', 'nome_completo', 'funcao', 'salario', 'pix_tipo', 'pix_chave', 'pix_titular', 'pix_banco'];

/** Folha do mês completa: lançamentos com o cálculo de cada funcionário. */
function carregarFolhaMensal(fmId) {
  const fm = comum(db.prepare('SELECT * FROM folhas_mensais WHERE id = ?').get(fmId));
  if (!fm) return null;
  fm.totais = lerJson(fm.totais, null);
  const oficina = carregarOficina(fm.oficina_id);
  const fechada = fm.status === 'fechada';

  const lancamentos = db.prepare('SELECT * FROM lancamentos WHERE folha_mensal_id = ?').all(fmId).map(lerLancamento);
  const funcionarios = new Map(carregarFuncionarios(lancamentos.map((l) => l.funcionario_id)).map((f) => [f.id, f]));

  for (const l of lancamentos) {
    const atual = funcionarios.get(l.funcionario_id);
    if (fechada && l.snapshot) {
      l.funcionario = { ...atual, ...l.snapshot.funcionario };
      l.resultado = l.snapshot.resultado;
    } else {
      l.funcionario = atual;
      l.resultado = calcularLancamento(contexto(oficina, fm, atual), l);
    }
    delete l.snapshot;
  }
  lancamentos.sort((a, b) => porNome(a.funcionario, b.funcionario));

  const presentes = new Set(lancamentos.map((l) => l.funcionario_id));
  const pendentes = fechada ? [] : db.prepare(
    'SELECT id, nome, funcao FROM funcionarios WHERE oficina_id = ? AND folha_numero = ? AND ativo = 1',
  ).all(fm.oficina_id, fm.folha_numero).map(comum).filter((f) => !presentes.has(f.id)).sort(porNome);

  if (!fechada) fm.totais = somarResultados(lancamentos.map((l) => l.resultado));

  return {
    folha_mensal: fm,
    oficina,
    folha: folhaDaOficina(oficina, fm.folha_numero),
    lancamentos,
    pendentes,
  };
}

function folhaMensalOu404(fmId) {
  return carregarFolhaMensal(id(fmId)) || falhar(404, 'Folha não encontrada.');
}

/** Totais de uma folha (gravados se fechada, calculados na hora se aberta). */
function totaisDe(fmLinha) {
  if (fmLinha.status === 'fechada' && fmLinha.totais) return lerJson(fmLinha.totais, null);
  return carregarFolhaMensal(fmLinha.id).folha_mensal.totais;
}

function exigirAberta(fmId) {
  const fm = db.prepare('SELECT status FROM folhas_mensais WHERE id = ?').get(fmId) || falhar(404, 'Folha não encontrada.');
  if (fm.status === 'fechada') falhar(409, 'Esta folha está fechada. Reabra a folha para fazer alterações.');
}

// ---------------------------------------------------------------- oficinas e configurações

app.get('/api/oficinas', (req, res) => {
  const ids = db.prepare('SELECT id FROM oficinas ORDER BY id').all();
  const contagem = db.prepare('SELECT folha_numero, COUNT(*) AS n FROM funcionarios WHERE oficina_id = ? AND ativo = 1 GROUP BY folha_numero');
  res.json(ids.map(({ id: oficinaId }) => {
    const o = carregarOficina(oficinaId);
    o.ativos_por_folha = Object.fromEntries(o.folhas.map((f) => [f.numero, 0]));
    o.ativos = 0;
    for (const c of contagem.all(oficinaId)) {
      if (c.folha_numero in o.ativos_por_folha) o.ativos_por_folha[c.folha_numero] = c.n;
      o.ativos += c.n;
    }
    return o;
  }));
});

const CORES_OFICINA = ['#3d7a4f', '#2a6f97', '#9a4a2c', '#6b4c9a', '#b07d1a', '#3a7d7c', '#a33b5c', '#55606e'];

/** "Loja Centro" → "loja-centro" (endereço da empresa nas telas; não muda ao renomear). */
function novoSlug(nome) {
  const base = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'empresa';
  const existe = db.prepare('SELECT 1 FROM oficinas WHERE slug = ?');
  let slug = base;
  for (let i = 2; existe.get(slug); i++) slug = `${base}-${i}`;
  return slug;
}

function dadosIdentificacao(b, atualId = null) {
  const nome = textoOuNulo(b.nome) || falhar(400, 'Informe o nome da empresa.');
  if (nome.length > 60) falhar(400, 'O nome da empresa está muito comprido.');
  const igual = (a) => a.localeCompare(nome, 'pt-BR', { sensitivity: 'accent' }) === 0; // ignora maiúsculas, não acentos
  if (db.prepare('SELECT id, nome FROM oficinas').all().some((o) => o.id !== atualId && igual(o.nome))) {
    falhar(409, `Já existe uma empresa chamada "${nome}".`);
  }
  const cor = /^#[0-9a-f]{6}$/i.test(b.cor || '') ? b.cor.toLowerCase() : null;
  return { nome, cor };
}

// Nova oficina: começa com as regras padrão e uma folha; o resto se ajusta em Configurações.
app.post('/api/oficinas', (req, res) => {
  const { nome, cor } = dadosIdentificacao(req.body || {});
  const quantas = db.prepare('SELECT COUNT(*) AS n FROM oficinas').get().n;
  const oficinaId = tx(() => {
    const novo = Number(db.prepare('INSERT INTO oficinas (slug, nome, cor) VALUES (?, ?, ?)')
      .run(novoSlug(nome), nome, cor || CORES_OFICINA[quantas % CORES_OFICINA.length]).lastInsertRowid);
    db.prepare('INSERT INTO folhas (oficina_id, numero) VALUES (?, 1)').run(novo);
    return novo;
  });
  res.status(201).json(carregarOficina(oficinaId));
});

// Muda o nome e a cor. Folhas já fechadas guardaram o nome antigo no card e no histórico.
app.put('/api/oficinas/:id/identificacao', (req, res) => {
  const o = oficinaOu404(req.params.id);
  const { nome, cor } = dadosIdentificacao(req.body || {}, o.id);
  db.prepare('UPDATE oficinas SET nome = ?, cor = ? WHERE id = ?').run(nome, cor || o.cor, o.id);
  res.json(carregarOficina(o.id));
});

/** Quanto existe guardado de uma oficina (para avisar antes de apagar). */
app.get('/api/oficinas/:id/conteudo', (req, res) => {
  const o = oficinaOu404(req.params.id);
  const contar = (sql) => db.prepare(sql).get(o.id).n;
  res.json({
    funcionarios: contar('SELECT COUNT(*) AS n FROM funcionarios WHERE oficina_id = ?'),
    folhas_mensais: contar('SELECT COUNT(*) AS n FROM folhas_mensais WHERE oficina_id = ?'),
    vales: contar('SELECT COUNT(*) AS n FROM parcelamentos p JOIN funcionarios f ON f.id = p.funcionario_id WHERE f.oficina_id = ?'),
  });
});

// Apaga a oficina com tudo dela. Antes, renova a cópia de segurança do dia (dá para voltar por ela).
app.delete('/api/oficinas/:id', (req, res) => {
  const o = oficinaOu404(req.params.id);
  if (db.prepare('SELECT COUNT(*) AS n FROM oficinas').get().n <= 1) falhar(409, 'Esta é a única empresa. Crie outra antes de apagar esta.');
  if (textoOuNulo(req.query.confirmacao)?.toLowerCase() !== o.nome.toLowerCase()) falhar(400, 'Digite o nome da empresa para confirmar.');
  backupAutomatico({ forcar: true });
  tx(() => {
    const apagar = (sql) => db.prepare(sql).run(o.id);
    apagar('DELETE FROM folhas_mensais WHERE oficina_id = ?'); // leva lançamentos e descontos de vales
    apagar('DELETE FROM funcionarios WHERE oficina_id = ?'); // leva vales e bonificações dos funcionários
    apagar('DELETE FROM bonificacoes WHERE oficina_id = ?');
    apagar('DELETE FROM campos_personalizados WHERE oficina_id = ?');
    apagar('DELETE FROM batidas WHERE relogio_id IN (SELECT id FROM relogios WHERE oficina_id = ?)');
    apagar('DELETE FROM relogios WHERE oficina_id = ?');
    apagar('DELETE FROM logos WHERE oficina_id = ?');
    apagar('DELETE FROM folhas WHERE oficina_id = ?');
    apagar('DELETE FROM oficinas WHERE id = ?');
  });
  res.status(204).end();
});

app.put('/api/oficinas/:id', (req, res) => {
  const o = oficinaOu404(req.params.id);
  const b = req.body || {};
  const sabadoModo = b.sabado_modo === 'fixo' ? 'fixo' : 'diaria';
  const divisor = numero(b.divisor_dias, o.divisor_dias);
  const horas = numero(b.horas_por_dia, o.horas_por_dia);
  if (divisor <= 0) falhar(400, 'O divisor de dias precisa ser maior que zero.');
  if (horas <= 0) falhar(400, 'As horas por dia precisam ser maiores que zero.');
  const divisorNome = b.divisor_nome === undefined ? o.divisor_nome : String(b.divisor_nome ?? '').trim().slice(0, 30) || 'dias';
  db.prepare(`UPDATE oficinas SET valor_hora_extra = ?, divisor_dias = ?, divisor_nome = ?, arredondar_dia = ?, horas_por_dia = ?,
      sabado_modo = ?, sabado_valor = ? WHERE id = ?`)
    .run(numero(b.valor_hora_extra, o.valor_hora_extra), divisor, divisorNome, b.arredondar_dia ? 1 : 0, horas,
      sabadoModo, numero(b.sabado_valor, 0), o.id);
  res.json(carregarOficina(o.id));
});

const diaFechamento = (dia) => (dia === '' || dia == null ? null : Math.min(31, Math.max(1, Math.round(numero(dia, 1)))));

app.put('/api/oficinas/:id/folhas/:numero', (req, res) => {
  const o = oficinaOu404(req.params.id);
  const numeroFolha = folhaValida(o, req.params.numero);
  db.prepare('UPDATE folhas SET apelido = ?, dia_fechamento = ? WHERE oficina_id = ? AND numero = ?')
    .run(textoOuNulo(req.body?.apelido), diaFechamento(req.body?.dia_fechamento), o.id, numeroFolha);
  res.json(carregarOficina(o.id));
});

// Nova folha (grupo). Pega o menor número livre. Uma folha apagada só libera o número se nunca teve
// folha do mês: as que já aparecem no histórico guardam o número, para não misturar.
app.post('/api/oficinas/:id/folhas', (req, res) => {
  const o = oficinaOu404(req.params.id);
  tx(() => {
    db.prepare(`DELETE FROM folhas WHERE oficina_id = ? AND excluida = 1
        AND numero NOT IN (SELECT folha_numero FROM folhas_mensais WHERE oficina_id = ?)
        AND numero NOT IN (SELECT folha_numero FROM funcionarios WHERE oficina_id = ?)`).run(o.id, o.id, o.id);
    const usados = new Set(db.prepare(`SELECT numero AS n FROM folhas WHERE oficina_id = ?
        UNION SELECT folha_numero FROM folhas_mensais WHERE oficina_id = ?
        UNION SELECT folha_numero FROM funcionarios WHERE oficina_id = ?`).all(o.id, o.id, o.id).map((r) => r.n));
    let n = 1;
    while (usados.has(n)) n += 1;
    db.prepare('INSERT INTO folhas (oficina_id, numero, apelido, dia_fechamento) VALUES (?, ?, ?, ?)')
      .run(o.id, n, textoOuNulo(req.body?.apelido), diaFechamento(req.body?.dia_fechamento));
  });
  res.status(201).json(carregarOficina(o.id));
});

// Apaga uma folha (grupo). As folhas já fechadas continuam no histórico com o nome dela.
app.delete('/api/oficinas/:id/folhas/:numero', (req, res) => {
  const o = oficinaOu404(req.params.id);
  const numeroFolha = folhaValida(o, req.params.numero);
  const outras = o.folhas.filter((f) => f.numero !== numeroFolha);
  if (!outras.length) falhar(409, 'A empresa precisa ter pelo menos uma folha.');
  const ativos = db.prepare('SELECT COUNT(*) AS n FROM funcionarios WHERE oficina_id = ? AND folha_numero = ? AND ativo = 1')
    .get(o.id, numeroFolha).n;
  if (ativos) {
    falhar(409, `Esta folha tem ${ativos} ${ativos === 1 ? 'funcionário ativo' : 'funcionários ativos'}. `
      + 'Passe para outra folha (no cadastro do funcionário) antes de apagar.');
  }
  const aberta = db.prepare("SELECT ano, mes FROM folhas_mensais WHERE oficina_id = ? AND folha_numero = ? AND status = 'aberta'")
    .get(o.id, numeroFolha);
  if (aberta) {
    falhar(409, `Esta folha está em andamento em ${String(aberta.mes).padStart(2, '0')}/${aberta.ano}. `
      + 'Feche ou exclua essa folha do mês antes de apagar.');
  }
  tx(() => {
    // Desligados sumiriam se ficassem numa folha apagada: vão para a primeira que sobrou.
    db.prepare('UPDATE funcionarios SET folha_numero = ? WHERE oficina_id = ? AND folha_numero = ?').run(outras[0].numero, o.id, numeroFolha);
    db.prepare('UPDATE folhas SET excluida = 1 WHERE oficina_id = ? AND numero = ?').run(o.id, numeroFolha);
  });
  res.json(carregarOficina(o.id));
});

// Logo da empresa (aparece nos cards). A tela já envia a imagem reduzida, em PNG.
app.get('/api/oficinas/:id/logo', (req, res) => {
  const logo = db.prepare('SELECT tipo, dados FROM logos WHERE oficina_id = ?').get(id(req.params.id));
  if (!logo) falhar(404, 'Esta empresa não tem logo.');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.type(logo.tipo).send(Buffer.from(logo.dados));
});

app.put('/api/oficinas/:id/logo', (req, res) => {
  const o = oficinaOu404(req.params.id);
  const partes = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.imagem || ''));
  if (!partes) falhar(400, 'Envie uma imagem PNG, JPG ou WEBP.');
  const dados = Buffer.from(partes[2], 'base64');
  if (dados.length > 2 * 1024 * 1024) falhar(413, 'A imagem é muito grande (máximo 2 MB).');
  const alvos = req.body?.todas ? db.prepare('SELECT id FROM oficinas').all().map((x) => x.id) : [o.id];
  const versao = Date.now();
  const salvar = db.prepare(`INSERT INTO logos (oficina_id, tipo, dados, versao) VALUES (?, ?, ?, ?)
    ON CONFLICT (oficina_id) DO UPDATE SET tipo = excluded.tipo, dados = excluded.dados, versao = excluded.versao`);
  tx(() => alvos.forEach((oficinaId) => salvar.run(oficinaId, partes[1], dados, versao)));
  res.json(carregarOficina(o.id));
});

app.delete('/api/oficinas/:id/logo', (req, res) => {
  const o = oficinaOu404(req.params.id);
  db.prepare('DELETE FROM logos WHERE oficina_id = ?').run(o.id);
  res.json(carregarOficina(o.id));
});

// ---------------------------------------------------------------- regras de pagamento (tabela bonificacoes)

/**
 * Regra vinda da tela, conferida. Sem "definicao" (telas antigas) vale a escolha antiga zero falta / atribuída.
 * A regra pode usar as outras regras da empresa, nunca ela mesma (idAtual).
 */
function dadosBonificacao(b, oficina, idAtual = null) {
  const nome = textoOuNulo(b.nome) || falhar(400, 'Dê um nome para a regra.');
  if (nome.length > 60) falhar(400, 'O nome da regra está muito comprido.');
  const tipo = b.tipo === 'desconto' ? 'desconto' : 'provento';
  let definicao;
  try {
    const bruta = b.definicao && typeof b.definicao === 'object' ? b.definicao : definicaoDaRegra({ regra: b.regra });
    definicao = limparDefinicao(bruta, variaveisDa(oficina.campos, oficina.bonificacoes.filter((r) => r.id !== idAtual)));
  } catch (e) {
    falhar(400, e.message);
  }
  return {
    nome, tipo, valor: numero(b.valor), regra: regraLegada(definicao, tipo), definicao: JSON.stringify(definicao), ativo: b.ativo === false ? 0 : 1,
  };
}

app.post('/api/oficinas/:id/bonificacoes', (req, res) => {
  const o = oficinaOu404(req.params.id);
  const b = dadosBonificacao(req.body || {}, o);
  const ordem = (db.prepare('SELECT MAX(ordem) AS m FROM bonificacoes WHERE oficina_id = ?').get(o.id).m ?? -1) + 1;
  db.prepare('INSERT INTO bonificacoes (oficina_id, nome, valor, regra, ativo, ordem, tipo, definicao) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(o.id, b.nome, b.valor, b.regra, b.ativo, ordem, b.tipo, b.definicao);
  res.status(201).json(carregarOficina(o.id));
});

app.put('/api/bonificacoes/:id', (req, res) => {
  const atual = db.prepare('SELECT * FROM bonificacoes WHERE id = ?').get(id(req.params.id)) || falhar(404, 'Regra não encontrada.');
  const b = dadosBonificacao(req.body || {}, carregarOficina(atual.oficina_id), atual.id);
  db.prepare('UPDATE bonificacoes SET nome = ?, valor = ?, regra = ?, ativo = ?, tipo = ?, definicao = ? WHERE id = ?')
    .run(b.nome, b.valor, b.regra, b.ativo, b.tipo, b.definicao, atual.id);
  res.json(carregarOficina(atual.oficina_id));
});

app.delete('/api/bonificacoes/:id', (req, res) => {
  const atual = db.prepare('SELECT * FROM bonificacoes WHERE id = ?').get(id(req.params.id)) || falhar(404, 'Regra não encontrada.');
  const usam = carregarOficina(atual.oficina_id).bonificacoes
    .filter((b) => b.id !== atual.id && variaveisUsadas(b.definicao).has(`regra:${atual.id}`)).map((b) => `"${b.nome}"`);
  if (usam.length) falhar(409, `Esta regra é usada pela regra ${usam.join(', ')}. Mude ou apague a outra regra antes.`);
  tx(() => {
    db.prepare('DELETE FROM bonificacoes WHERE id = ?').run(atual.id);
    // O número pode ser reaproveitado por uma regra nova: ela não pode herdar os ajustes manuais desta.
    const caminho = `$."${atual.id}"`;
    db.prepare('UPDATE lancamentos SET regras_manuais = json_remove(regras_manuais, ?) WHERE json_type(regras_manuais, ?) IS NOT NULL')
      .run(caminho, caminho);
  });
  res.json(carregarOficina(atual.oficina_id));
});

// Ordem das regras: elas são calculadas de cima para baixo (uma regra pode usar o valor das de cima).
app.put('/api/oficinas/:id/bonificacoes/ordem', (req, res) => {
  const o = oficinaOu404(req.params.id);
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
  const daOficina = new Set(o.bonificacoes.map((b) => b.id));
  if (ids.length !== daOficina.size || !ids.every((x) => daOficina.has(x))) falhar(400, 'A lista de regras mudou. Recarregue a página.');
  const salvar = db.prepare('UPDATE bonificacoes SET ordem = ? WHERE id = ?');
  tx(() => ids.forEach((regraId, i) => salvar.run(i, regraId)));
  res.json(carregarOficina(o.id));
});

// ---------------------------------------------------------------- campos criados pela empresa (do mês ou do cadastro)

function dadosCampo(b) {
  const nome = textoOuNulo(b.nome) || falhar(400, 'Dê um nome para o campo.');
  if (nome.length > 40) falhar(400, 'O nome do campo está muito comprido.');
  return { nome, tipo: b.tipo in TIPOS_CAMPO ? b.tipo : 'numero', escopo: b.escopo === 'cadastro' ? 'cadastro' : 'mes' };
}

app.post('/api/oficinas/:id/campos', (req, res) => {
  const o = oficinaOu404(req.params.id);
  const c = dadosCampo(req.body || {});
  const ordem = (db.prepare('SELECT MAX(ordem) AS m FROM campos_personalizados WHERE oficina_id = ?').get(o.id).m ?? -1) + 1;
  db.prepare('INSERT INTO campos_personalizados (oficina_id, nome, tipo, ordem, escopo) VALUES (?, ?, ?, ?, ?)').run(o.id, c.nome, c.tipo, ordem, c.escopo);
  res.status(201).json(carregarOficina(o.id));
});

app.put('/api/campos/:id', (req, res) => {
  const atual = db.prepare('SELECT * FROM campos_personalizados WHERE id = ?').get(id(req.params.id)) || falhar(404, 'Campo não encontrado.');
  const c = dadosCampo(req.body || {});
  db.prepare('UPDATE campos_personalizados SET nome = ?, tipo = ? WHERE id = ?').run(c.nome, c.tipo, atual.id);
  res.json(carregarOficina(atual.oficina_id));
});

// Os valores já lançados ficam guardados nas folhas (as fechadas não mudam); só a coluna some das próximas.
app.delete('/api/campos/:id', (req, res) => {
  const atual = db.prepare('SELECT * FROM campos_personalizados WHERE id = ?').get(id(req.params.id)) || falhar(404, 'Campo não encontrado.');
  const o = carregarOficina(atual.oficina_id);
  const usam = o.bonificacoes.filter((b) => variaveisUsadas(b.definicao).has(`campo:${atual.id}`)).map((b) => `"${b.nome}"`);
  if (usam.length) falhar(409, `Este campo é usado pela regra ${usam.join(', ')}. Mude ou apague a regra antes.`);
  db.prepare('DELETE FROM campos_personalizados WHERE id = ?').run(atual.id);
  res.json(carregarOficina(o.id));
});

// ---------------------------------------------------------------- funcionários

app.get('/api/oficinas/:id/funcionarios', (req, res) => {
  const o = oficinaOu404(req.params.id);
  const lista = db.prepare('SELECT * FROM funcionarios WHERE oficina_id = ?').all(o.id).map(normalizarFuncionario);
  res.json(anexarDetalhes(lista).sort(porNome));
});

function historicoDoFuncionario(funcionario) {
  const linhas = db.prepare(`
    SELECT l.*, fm.ano, fm.mes, fm.folha_numero, fm.status, fm.oficina_id
    FROM lancamentos l JOIN folhas_mensais fm ON fm.id = l.folha_mensal_id
    WHERE l.funcionario_id = ? ORDER BY fm.ano DESC, fm.mes DESC, fm.folha_numero`).all(funcionario.id);
  const oficinas = new Map();
  return linhas.map((linha) => {
    const l = lerLancamento(linha);
    let resultado;
    if (l.status === 'fechada' && l.snapshot) {
      resultado = l.snapshot.resultado;
    } else {
      if (!oficinas.has(l.oficina_id)) oficinas.set(l.oficina_id, carregarOficina(l.oficina_id));
      resultado = calcularLancamento(contexto(oficinas.get(l.oficina_id), l, funcionario), l);
    }
    return {
      folha_mensal_id: l.folha_mensal_id,
      ano: l.ano,
      mes: l.mes,
      folha_numero: l.folha_numero,
      status: l.status,
      faltas: l.faltas,
      total_proventos: resultado.total_proventos,
      total_descontos: resultado.total_descontos,
      liquido: resultado.liquido,
    };
  });
}

app.get('/api/funcionarios/:id', (req, res) => {
  const [f] = carregarFuncionarios([id(req.params.id)]);
  if (!f) falhar(404, 'Funcionário não encontrado.');
  f.historico = historicoDoFuncionario(f);
  res.json(f);
});

function salvarFuncionario(oficina, corpo, funcionarioId = null) {
  const b = corpo || {};
  const nome = textoOuNulo(b.nome) || falhar(400, 'Informe o nome do funcionário.');
  const folha = folhaValida(oficina, b.folha_numero, 'Escolha a folha do funcionário.');
  const salario = numero(b.salario, NaN);
  if (!Number.isFinite(salario) || salario < 0) falhar(400, 'Informe um salário válido.');

  const valores = [
    folha, nome.toUpperCase(), textoOuNulo(b.nome_completo), textoOuNulo(b.funcao), salario, b.comissionado ? 1 : 0,
    textoOuNulo(b.pix_tipo), textoOuNulo(b.pix_chave), textoOuNulo(b.pix_titular), textoOuNulo(b.pix_banco),
    textoOuNulo(b.admissao), textoOuNulo(b.observacoes), b.ativo === false ? 0 : 1,
  ];

  return tx(() => {
    let fid = funcionarioId;
    if (fid) {
      db.prepare(`UPDATE funcionarios SET folha_numero = ?, nome = ?, nome_completo = ?, funcao = ?, salario = ?, comissionado = ?,
        pix_tipo = ?, pix_chave = ?, pix_titular = ?, pix_banco = ?, admissao = ?, observacoes = ?, ativo = ? WHERE id = ?`).run(...valores, fid);
    } else {
      fid = Number(db.prepare(`INSERT INTO funcionarios (folha_numero, nome, nome_completo, funcao, salario, comissionado,
        pix_tipo, pix_chave, pix_titular, pix_banco, admissao, observacoes, ativo, oficina_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...valores, oficina.id).lastInsertRowid);
    }
    // Campos do cadastro criados pela empresa (ex.: número de filhos), usados pelas regras.
    if (b.campos && typeof b.campos === 'object' && !Array.isArray(b.campos)) {
      const extras = oficina.campos.filter((c) => c.escopo === 'cadastro' && c.id in b.campos)
        .map((c) => [c.id, c.tipo === 'sim_nao' ? (numero(b.campos[c.id]) ? 1 : 0) : numero(b.campos[c.id])]);
      db.prepare('UPDATE funcionarios SET campos = ? WHERE id = ?').run(JSON.stringify(Object.fromEntries(extras)), fid);
    }
    if (Array.isArray(b.bonificacoes)) {
      const validas = new Set(oficina.bonificacoes.filter(ehMarcada).map((x) => x.id));
      db.prepare('DELETE FROM funcionario_bonificacoes WHERE funcionario_id = ?').run(fid);
      const ins = db.prepare('INSERT INTO funcionario_bonificacoes (funcionario_id, bonificacao_id, valor) VALUES (?, ?, ?)');
      for (const x of b.bonificacoes) {
        const bid = Number(x.bonificacao_id);
        if (!validas.has(bid)) continue;
        const v = x.valor === '' || x.valor == null ? null : numero(x.valor, null);
        ins.run(fid, bid, v);
      }
    }
    return fid;
  });
}

app.post('/api/oficinas/:id/funcionarios', (req, res) => {
  const o = oficinaOu404(req.params.id);
  const fid = salvarFuncionario(o, req.body);
  res.status(201).json(carregarFuncionarios([fid])[0]);
});

app.put('/api/funcionarios/:id', (req, res) => {
  const atual = db.prepare('SELECT * FROM funcionarios WHERE id = ?').get(id(req.params.id)) || falhar(404, 'Funcionário não encontrado.');
  salvarFuncionario(carregarOficina(atual.oficina_id), req.body, atual.id);
  const [f] = carregarFuncionarios([atual.id]);
  f.historico = historicoDoFuncionario(f);
  res.json(f);
});

app.delete('/api/funcionarios/:id', (req, res) => {
  const atual = db.prepare('SELECT * FROM funcionarios WHERE id = ?').get(id(req.params.id)) || falhar(404, 'Funcionário não encontrado.');
  const usos = db.prepare('SELECT COUNT(*) AS n FROM lancamentos WHERE funcionario_id = ?').get(atual.id).n;
  if (usos > 0) falhar(409, 'Este funcionário já tem pagamentos no histórico. Em vez de excluir, marque como "desligado".');
  db.prepare('DELETE FROM funcionarios WHERE id = ?').run(atual.id);
  res.status(204).end();
});

// ---------------------------------------------------------------- vales (descontados na folha)

function carregarVales(onde, parametros) {
  const vales = db.prepare(`SELECT p.*, f.nome AS funcionario_nome, f.folha_numero, f.ativo AS funcionario_ativo, f.oficina_id
    FROM parcelamentos p JOIN funcionarios f ON f.id = p.funcionario_id
    WHERE ${onde} ORDER BY COALESCE(p.data, substr(p.criado_em, 1, 10)) DESC, p.id DESC`).all(...parametros).map(comum);
  if (!vales.length) return vales;
  anexarDescontosVales(vales);
  const ids = vales.map((v) => v.id);
  const descontos = db.prepare(`SELECT dv.parcelamento_id, dv.valor, fm.id AS folha_mensal_id, fm.ano, fm.mes, fm.folha_numero
    FROM descontos_vales dv JOIN folhas_mensais fm ON fm.id = dv.folha_mensal_id
    WHERE dv.parcelamento_id IN (${marcadores(ids)}) ORDER BY fm.ano, fm.mes`).all(...ids).map(comum);
  for (const v of vales) {
    v.funcionario_ativo = !!v.funcionario_ativo;
    v.descontos = descontos.filter((d) => d.parcelamento_id === v.id);
  }
  return vales;
}

const valeOu404 = (valeId) => carregarVales('p.id = ?', [id(valeId)])[0] || falhar(404, 'Vale não encontrado.');

function dadosVale(b) {
  const tipo = ['vale', 'compra', 'outro'].includes(b.tipo) ? b.tipo : 'vale';
  const total = round2(numero(b.valor_total, NaN));
  const parcelas = Math.round(numero(b.num_parcelas, 1));
  const inicio = String(b.inicio || '');
  const data = textoOuNulo(b.data);
  if (!(total > 0)) falhar(400, 'Informe o valor do vale.');
  if (!(parcelas >= 1 && parcelas <= 60)) falhar(400, 'Informe em quantas vezes descontar (de 1 a 60).');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(inicio)) falhar(400, 'Informe a partir de qual folha o vale será descontado.');
  if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) falhar(400, 'Data do vale inválida.');
  return { tipo, descricao: textoOuNulo(b.descricao), valor_total: total, num_parcelas: parcelas, valor_parcela: round2(total / parcelas), inicio, data };
}

app.get('/api/oficinas/:id/vales', (req, res) => {
  const o = oficinaOu404(req.params.id);
  res.json(carregarVales('f.oficina_id = ?', [o.id]));
});

app.get('/api/vales/:id', (req, res) => {
  const v = valeOu404(req.params.id);
  const funcionario = comum(db.prepare('SELECT id, nome, nome_completo, funcao, folha_numero FROM funcionarios WHERE id = ?').get(v.funcionario_id));
  res.json({ ...v, funcionario, oficina: carregarOficina(v.oficina_id) });
});

app.post('/api/vales', (req, res) => {
  const f = db.prepare('SELECT id FROM funcionarios WHERE id = ?').get(id(req.body?.funcionario_id)) || falhar(400, 'Escolha o funcionário.');
  const v = dadosVale(req.body || {});
  const novo = Number(db.prepare(`INSERT INTO parcelamentos (funcionario_id, tipo, descricao, valor_total, valor_parcela, num_parcelas, inicio, data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(f.id, v.tipo, v.descricao, v.valor_total, v.valor_parcela, v.num_parcelas, v.inicio, v.data).lastInsertRowid);
  res.status(201).json(valeOu404(novo));
});

app.put('/api/vales/:id', (req, res) => {
  const atual = valeOu404(req.params.id);
  const v = dadosVale(req.body || {});
  let funcionarioId = atual.funcionario_id;
  if (req.body?.funcionario_id && Number(req.body.funcionario_id) !== atual.funcionario_id) {
    if (atual.descontos.length) falhar(409, 'Este vale já foi descontado em folha fechada; não dá para trocar o funcionário.');
    funcionarioId = (db.prepare('SELECT id FROM funcionarios WHERE id = ?').get(id(req.body.funcionario_id)) || falhar(400, 'Funcionário não encontrado.')).id;
  }
  if (v.valor_total < atual.descontado) {
    falhar(400, `O valor não pode ser menor que o já descontado nas folhas fechadas (R$ ${atual.descontado.toFixed(2).replace('.', ',')}).`);
  }
  db.prepare(`UPDATE parcelamentos SET funcionario_id = ?, tipo = ?, descricao = ?, valor_total = ?, valor_parcela = ?, num_parcelas = ?, inicio = ?, data = ?
    WHERE id = ?`).run(funcionarioId, v.tipo, v.descricao, v.valor_total, v.valor_parcela, v.num_parcelas, v.inicio, v.data, atual.id);
  res.json(valeOu404(atual.id));
});

/** Encerra o vale com o que já foi descontado (perdoa o saldo restante). */
app.post('/api/vales/:id/encerrar', (req, res) => {
  const atual = valeOu404(req.params.id);
  if (!atual.descontado) falhar(400, 'Nada foi descontado ainda. Se o vale não vale mais, exclua.');
  db.prepare('UPDATE parcelamentos SET valor_total = ?, valor_parcela = ? WHERE id = ?')
    .run(atual.descontado, round2(atual.descontado / atual.num_parcelas), atual.id);
  res.json(valeOu404(atual.id));
});

app.delete('/api/vales/:id', (req, res) => {
  const atual = valeOu404(req.params.id);
  if (atual.descontos.length) {
    falhar(409, 'Este vale já foi descontado em folha fechada e não pode ser excluído. Use "Encerrar saldo" se não for mais descontar o restante.');
  }
  db.prepare('DELETE FROM parcelamentos WHERE id = ?').run(atual.id);
  res.status(204).end();
});

// ---------------------------------------------------------------- folhas do mês

/** Situação das folhas de uma oficina em um mês. */
app.get('/api/oficinas/:id/folhas-mensais', (req, res) => {
  const o = oficinaOu404(req.params.id);
  const ano = Math.round(numero(req.query.ano));
  const mes = Math.round(numero(req.query.mes));
  const existentes = db.prepare('SELECT * FROM folhas_mensais WHERE oficina_id = ? AND ano = ? AND mes = ?').all(o.id, ano, mes);
  const contagem = db.prepare('SELECT COUNT(*) AS n FROM funcionarios WHERE oficina_id = ? AND folha_numero = ? AND ativo = 1');
  res.json(o.folhas.map((folha) => {
    const fm = existentes.find((x) => x.folha_numero === folha.numero);
    return {
      ...folha,
      ativos: contagem.get(o.id, folha.numero).n,
      folha_mensal: fm ? { id: fm.id, status: fm.status, fechada_em: fm.fechada_em, totais: totaisDe(fm) } : null,
    };
  }));
});

app.post('/api/folhas-mensais', (req, res) => {
  const o = oficinaOu404(req.body?.oficina_id);
  const folhaNumero = folhaValida(o, req.body?.folha_numero);
  const ano = Math.round(numero(req.body?.ano));
  const mes = Math.round(numero(req.body?.mes));
  if (ano < 2000 || ano > 2100 || mes < 1 || mes > 12) falhar(400, 'Mês inválido.');
  const existe = db.prepare('SELECT id FROM folhas_mensais WHERE oficina_id = ? AND folha_numero = ? AND ano = ? AND mes = ?')
    .get(o.id, folhaNumero, ano, mes);
  if (existe) return res.json(carregarFolhaMensal(existe.id));

  const fmId = tx(() => {
    const novo = Number(db.prepare('INSERT INTO folhas_mensais (oficina_id, folha_numero, ano, mes) VALUES (?, ?, ?, ?)')
      .run(o.id, folhaNumero, ano, mes).lastInsertRowid);
    db.prepare(`INSERT INTO lancamentos (folha_mensal_id, funcionario_id)
      SELECT ?, id FROM funcionarios WHERE oficina_id = ? AND folha_numero = ? AND ativo = 1`).run(novo, o.id, folhaNumero);
    return novo;
  });
  res.status(201).json(carregarFolhaMensal(fmId));
});

app.get('/api/folhas-mensais/:id', (req, res) => {
  res.json(folhaMensalOu404(req.params.id));
});

app.delete('/api/folhas-mensais/:id', (req, res) => {
  const fmId = id(req.params.id);
  exigirAberta(fmId);
  tx(() => {
    db.prepare('DELETE FROM lancamentos WHERE folha_mensal_id = ?').run(fmId);
    db.prepare('DELETE FROM folhas_mensais WHERE id = ?').run(fmId);
  });
  res.status(204).end();
});

app.post('/api/folhas-mensais/:id/fechar', (req, res) => {
  const dados = folhaMensalOu404(req.params.id);
  if (dados.folha_mensal.status === 'fechada') falhar(409, 'Esta folha já está fechada.');
  tx(() => {
    const salvar = db.prepare('UPDATE lancamentos SET snapshot = ? WHERE id = ?');
    for (const l of dados.lancamentos) {
      const funcionario = Object.fromEntries(CAMPOS_SNAPSHOT.map((c) => [c, l.funcionario[c] ?? null]));
      salvar.run(JSON.stringify({ funcionario, resultado: l.resultado }), l.id);
    }
    db.prepare("UPDATE folhas_mensais SET status = 'fechada', fechada_em = datetime('now', 'localtime'), totais = ? WHERE id = ?")
      .run(JSON.stringify(somarResultados(dados.lancamentos.map((l) => l.resultado))), dados.folha_mensal.id);
    // Registra quanto de cada vale foi descontado nesta folha (é isso que forma o saldo dos vales).
    const registrar = db.prepare('INSERT OR REPLACE INTO descontos_vales (parcelamento_id, folha_mensal_id, valor) VALUES (?, ?, ?)');
    for (const l of dados.lancamentos) {
      for (const d of l.resultado.descontos) if (d.parcelamento_id) registrar.run(d.parcelamento_id, dados.folha_mensal.id, d.valor);
    }
  });
  try {
    backupAutomatico({ forcar: true });
  } catch (e) {
    console.error('Falha no backup automático:', e.message);
  }
  res.json(carregarFolhaMensal(dados.folha_mensal.id));
});

app.post('/api/folhas-mensais/:id/reabrir', (req, res) => {
  const fmId = id(req.params.id);
  tx(() => {
    db.prepare("UPDATE folhas_mensais SET status = 'aberta', fechada_em = NULL, totais = NULL WHERE id = ?").run(fmId);
    db.prepare('UPDATE lancamentos SET snapshot = NULL WHERE folha_mensal_id = ?').run(fmId);
    db.prepare('DELETE FROM descontos_vales WHERE folha_mensal_id = ?').run(fmId);
  });
  res.json(folhaMensalOu404(fmId));
});

/** Inclui na folha funcionários ativos que ainda não estão nela (ex.: contratados no meio do mês). */
app.post('/api/folhas-mensais/:id/incluir', (req, res) => {
  const fmId = id(req.params.id);
  exigirAberta(fmId);
  const fm = db.prepare('SELECT * FROM folhas_mensais WHERE id = ?').get(fmId);
  const pedidos = Array.isArray(req.body?.funcionario_ids) ? req.body.funcionario_ids.map(Number) : null;
  const candidatos = db.prepare('SELECT id FROM funcionarios WHERE oficina_id = ? AND ativo = 1 AND (folha_numero = ? OR ?)')
    .all(fm.oficina_id, fm.folha_numero, pedidos ? 1 : 0).map((f) => f.id)
    .filter((fid) => !pedidos || pedidos.includes(fid));
  const ins = db.prepare('INSERT OR IGNORE INTO lancamentos (folha_mensal_id, funcionario_id) VALUES (?, ?)');
  tx(() => candidatos.forEach((fid) => ins.run(fmId, fid)));
  res.json(carregarFolhaMensal(fmId));
});

// ---------------------------------------------------------------- lançamentos

function itensValidos(lista, comTipo) {
  if (!Array.isArray(lista)) return '[]';
  return JSON.stringify(lista.slice(0, 50).map((x) => {
    const item = { descricao: textoOuNulo(x?.descricao) || '', valor: numero(x?.valor) };
    if (comTipo) item.tipo = ['vale', 'compra', 'outro'].includes(x?.tipo) ? x.tipo : 'outro';
    return item;
  }));
}

app.patch('/api/lancamentos/:id', (req, res) => {
  const atual = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(id(req.params.id)) || falhar(404, 'Lançamento não encontrado.');
  exigirAberta(atual.folha_mensal_id);
  const b = req.body || {};
  const campos = {};
  for (const c of ['faltas', 'sabados', 'horas_extras', 'horas_atraso', 'comissao']) {
    if (c in b) campos[c] = Math.max(0, numero(b[c]));
  }
  if ('zero_falta' in b) campos.zero_falta = ['sim', 'nao'].includes(b.zero_falta) ? b.zero_falta : null;
  if ('campos' in b || 'regras_manuais' in b) {
    const o = carregarOficina(db.prepare('SELECT oficina_id FROM folhas_mensais WHERE id = ?').get(atual.folha_mensal_id).oficina_id);
    const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    if ('campos' in b) {
      const dados = objeto(b.campos);
      const valores = o.campos.filter((c) => c.escopo !== 'cadastro' && c.id in dados).map((c) => [c.id, c.tipo === 'sim_nao' ? (numero(dados[c.id]) ? 1 : 0) : numero(dados[c.id])]);
      campos.campos = JSON.stringify(Object.fromEntries(valores));
    }
    if ('regras_manuais' in b) {
      const dados = objeto(b.regras_manuais);
      const ajustes = o.bonificacoes.filter((r) => r.id in dados).map((r) => [r.id, ['sim', 'nao'].includes(dados[r.id]) ? dados[r.id] : null]);
      campos.regras_manuais = JSON.stringify(Object.fromEntries(ajustes));
    }
  }
  if ('acrescimos' in b) campos.acrescimos = itensValidos(b.acrescimos, false);
  if ('descontos' in b) campos.descontos = itensValidos(b.descontos, true);
  if ('pular_parcelas' in b) campos.pular_parcelas = b.pular_parcelas ? 1 : 0;
  if ('observacao' in b) campos.observacao = textoOuNulo(b.observacao);
  const chaves = Object.keys(campos);
  if (chaves.length) {
    db.prepare(`UPDATE lancamentos SET ${chaves.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...chaves.map((c) => campos[c]), atual.id);
  }
  res.json(lerLancamento(db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(atual.id)));
});

app.delete('/api/lancamentos/:id', (req, res) => {
  const atual = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(id(req.params.id)) || falhar(404, 'Lançamento não encontrado.');
  exigirAberta(atual.folha_mensal_id);
  db.prepare('DELETE FROM lancamentos WHERE id = ?').run(atual.id);
  res.status(204).end();
});

// ---------------------------------------------------------------- relógio de ponto

const relogiosDa = (oficinaId) => db.prepare('SELECT * FROM relogios WHERE oficina_id = ? ORDER BY id').all(oficinaId).map(comum);
const ehData = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

/** Último dia completo vindo do relógio: o arquivo tirado hoje ainda não tem o dia de hoje inteiro. */
function ultimoDiaCompleto(relogios) {
  const gerados = relogios.map((r) => r.gerado_em).filter(Boolean).sort();
  return gerados.length ? somarDias(gerados.at(-1).slice(0, 10), -1) : null;
}

/** Recebe o arquivo AFD (texto) tirado no pendrive. Batidas já importadas são ignoradas. */
app.post('/api/oficinas/:id/ponto/importar', express.text({ type: 'text/plain', limit: '50mb' }), (req, res) => {
  const o = oficinaOu404(req.params.id);
  let afd;
  try {
    afd = lerAFD(typeof req.body === 'string' ? req.body : '');
  } catch (e) {
    falhar(400, e.message);
  }
  const { cabecalho, batidas } = afd;
  if (!batidas.length) falhar(400, 'O arquivo não tem nenhuma batida de ponto.');
  const existente = db.prepare('SELECT * FROM relogios WHERE numero_fabricacao = ?').get(cabecalho.numero_fabricacao);
  if (existente && existente.oficina_id !== o.id) {
    const dono = db.prepare('SELECT nome FROM oficinas WHERE id = ?').get(existente.oficina_id);
    falhar(409, `Este arquivo é do relógio da empresa ${dono?.nome}. Importe pela aba Ponto dessa empresa.`);
  }

  const novas = tx(() => {
    const relogioId = existente?.id ?? Number(db.prepare('INSERT INTO relogios (numero_fabricacao, oficina_id) VALUES (?, ?)')
      .run(cabecalho.numero_fabricacao, o.id).lastInsertRowid);
    db.prepare(`UPDATE relogios SET empresa = ?, importado_em = datetime('now', 'localtime'),
      gerado_em = MAX(COALESCE(gerado_em, ''), ?) WHERE id = ?`).run(cabecalho.empresa, cabecalho.gerado_em, relogioId);
    const pessoa = db.prepare(`INSERT INTO ponto_pessoas (codigo, nome, excluido) VALUES (?, ?, ?)
      ON CONFLICT (codigo) DO UPDATE SET nome = excluded.nome, excluido = excluded.excluido`);
    for (const p of afd.pessoas) pessoa.run(p.codigo, p.nome, p.excluido ? 1 : 0);
    const inserir = db.prepare('INSERT OR IGNORE INTO batidas (relogio_id, nsr, codigo, data, hora) VALUES (?, ?, ?, ?, ?)');
    let n = 0;
    for (const b of batidas) n += Number(inserir.run(relogioId, b.nsr, b.codigo, b.data, b.hora).changes);
    return n;
  });

  let primeira = batidas[0].data;
  let ultima = batidas[0].data;
  for (const b of batidas) {
    if (b.data < primeira) primeira = b.data;
    if (b.data > ultima) ultima = b.data;
  }
  res.json({
    relogio: cabecalho.numero_fabricacao,
    empresa: cabecalho.empresa,
    gerado_em: cabecalho.gerado_em,
    batidas: batidas.length,
    novas,
    repetidas: batidas.length - novas,
    primeira,
    ultima,
  });
});

/** Relógios da oficina, horário de trabalho e as pessoas do relógio com o funcionário ligado a cada uma. */
app.get('/api/oficinas/:id/ponto', (req, res) => {
  const o = oficinaOu404(req.params.id);
  const relogios = relogiosDa(o.id);
  const contar = db.prepare('SELECT COUNT(*) AS batidas, MIN(data) AS primeira, MAX(data) AS ultima FROM batidas WHERE relogio_id = ?');
  for (const r of relogios) Object.assign(r, contar.get(r.id));

  const funcionarios = db.prepare(`SELECT id, nome, nome_completo, funcao, folha_numero, ativo, ponto_codigo, ponto_horario
    FROM funcionarios WHERE oficina_id = ?`).all(o.id).map(normalizarFuncionario).sort(porNome);
  const ultimoDia = ultimoDiaCompleto(relogios);
  const ids = relogios.map((r) => r.id);
  const pessoas = !ids.length ? [] : db.prepare(`SELECT b.codigo, MAX(b.data) AS ultima, COUNT(*) AS batidas, p.nome, p.excluido
    FROM batidas b LEFT JOIN ponto_pessoas p ON p.codigo = b.codigo
    WHERE b.relogio_id IN (${marcadores(ids)}) GROUP BY b.codigo`).all(...ids).map(comum);
  pessoas.sort((a, b) => b.ultima.localeCompare(a.ultima) || String(a.nome).localeCompare(String(b.nome)));

  const ligados = new Map(db.prepare(`SELECT f.id, f.nome, f.ponto_codigo, o.nome AS oficina FROM funcionarios f
    JOIN oficinas o ON o.id = f.oficina_id WHERE f.ponto_codigo IS NOT NULL`).all().map((f) => [f.ponto_codigo, comum(f)]));
  // Sugestões pelo nome só para quem bateu ponto nos últimos 60 dias (os outros já saíram da empresa),
  // das mais recentes para as mais antigas, sem repetir funcionário.
  const recente = ultimoDia ? somarDias(ultimoDia, -60) : '';
  const livres = funcionarios.filter((f) => f.ativo && !f.ponto_codigo);
  for (const p of pessoas) {
    p.nome = p.nome || '(sem nome no relógio)';
    p.excluido = !!p.excluido;
    p.recente = p.ultima >= recente;
    p.ligado = ligados.get(p.codigo) || null;
    const sugestao = p.ligado || !p.recente ? null : sugerirFuncionario(p.nome, livres);
    p.sugestao = sugestao?.funcionario_id ?? null;
    if (sugestao) livres.splice(livres.findIndex((f) => f.id === sugestao.funcionario_id), 1);
  }
  res.json({ horario: o.ponto_horario, relogios, ultimo_dia: ultimoDia, pessoas, funcionarios });
});

/** Horário próprio do funcionário no ponto (vazio volta para o horário da oficina). */
app.put('/api/funcionarios/:id/ponto-horario', (req, res) => {
  const f = db.prepare('SELECT id FROM funcionarios WHERE id = ?').get(id(req.params.id)) || falhar(404, 'Funcionário não encontrado.');
  const texto = textoOuNulo(req.body?.horario);
  const turnos = texto ? lerHorario(texto) : null;
  if (texto && !turnos) falhar(400, 'Horário inválido. Escreva assim: 07:00-11:00 12:10-17:00 (ou 07:00-13:00 para um turno só).');
  db.prepare('UPDATE funcionarios SET ponto_horario = ? WHERE id = ?').run(turnos ? formatarHorario(turnos) : null, f.id);
  res.json({ horario: turnos ? formatarHorario(turnos) : null });
});

app.put('/api/oficinas/:id/ponto/horario', (req, res) => {
  const o = oficinaOu404(req.params.id);
  const turnos = lerHorario(req.body?.horario);
  if (!turnos) falhar(400, 'Horário inválido. Escreva assim: 07:00-11:00 12:10-17:00');
  db.prepare('UPDATE oficinas SET ponto_horario = ? WHERE id = ?').run(formatarHorario(turnos), o.id);
  res.json({ horario: formatarHorario(turnos) });
});

/** Liga (ou desliga, com funcionario_id vazio) uma pessoa do relógio a um funcionário. */
app.put('/api/ponto/pessoas/:codigo', (req, res) => {
  const codigo = String(req.params.codigo);
  if (!/^\d{11}$/.test(codigo)) falhar(400, 'Código do relógio inválido.');
  const fid = req.body?.funcionario_id ? id(req.body.funcionario_id) : null;
  tx(() => {
    if (fid) {
      const f = db.prepare('SELECT id, ponto_codigo FROM funcionarios WHERE id = ?').get(fid) || falhar(404, 'Funcionário não encontrado.');
      if (f.ponto_codigo && f.ponto_codigo !== codigo) {
        const outra = db.prepare('SELECT nome FROM ponto_pessoas WHERE codigo = ?').get(f.ponto_codigo);
        falhar(409, `Este funcionário já está ligado a outra pessoa do relógio (${outra?.nome || f.ponto_codigo}). Desligue a outra primeiro.`);
      }
    }
    db.prepare('UPDATE funcionarios SET ponto_codigo = NULL WHERE ponto_codigo = ?').run(codigo);
    if (fid) db.prepare('UPDATE funcionarios SET ponto_codigo = ? WHERE id = ?').run(codigo, fid);
  });
  res.status(204).end();
});

/**
 * Espelho de ponto de uma folha: para cada funcionário, os dias do período e o que o ponto dá
 * em faltas, sábados, horas extras e atrasos. Sem início/fim usa o período pelo dia de fechamento.
 */
function espelhoDaFolha(o, folhaNumero, ano, mes, inicioPedido, fimPedido) {
  const folha = o.folhas.find((f) => f.numero === folhaNumero) || falhar(400, 'Folha inválida.');
  if (ano < 2000 || ano > 2100 || mes < 1 || mes > 12) falhar(400, 'Mês inválido.');
  const padrao = periodoDaFolha(ano, mes, folha.dia_fechamento);
  const inicio = ehData(inicioPedido) ? inicioPedido : padrao.inicio;
  const fim = ehData(fimPedido) ? fimPedido : padrao.fim;
  if (fim < inicio) falhar(400, 'A data final está antes da data inicial.');
  if (somarDias(inicio, 62) < fim) falhar(400, 'Escolha um período de no máximo 2 meses.');
  const turnosOficina = lerHorario(o.ponto_horario) || falhar(400, 'O horário de trabalho da empresa está inválido. Corrija na aba Ponto.');

  const fm = comum(db.prepare('SELECT id, status FROM folhas_mensais WHERE oficina_id = ? AND folha_numero = ? AND ano = ? AND mes = ?')
    .get(o.id, folhaNumero, ano, mes));
  const funcionarios = (fm
    ? db.prepare(`SELECT f.*, l.id AS lancamento_id, l.faltas, l.sabados, l.horas_extras, l.horas_atraso
        FROM lancamentos l JOIN funcionarios f ON f.id = l.funcionario_id WHERE l.folha_mensal_id = ?`).all(fm.id)
    : db.prepare('SELECT * FROM funcionarios WHERE oficina_id = ? AND folha_numero = ? AND ativo = 1').all(o.id, folhaNumero)
  ).map(comum).sort(porNome);

  const relogios = relogiosDa(o.id);
  const ids = relogios.map((r) => r.id);
  const codigos = funcionarios.map((f) => f.ponto_codigo).filter(Boolean);
  const diasComExpediente = new Set(!ids.length ? [] : db.prepare(`SELECT DISTINCT data FROM batidas
    WHERE relogio_id IN (${marcadores(ids)}) AND data BETWEEN ? AND ?`).all(...ids, inicio, fim).map((b) => b.data));
  const porCodigo = new Map();
  if (ids.length && codigos.length) {
    for (const b of db.prepare(`SELECT codigo, data, hora FROM batidas WHERE relogio_id IN (${marcadores(ids)})
      AND codigo IN (${marcadores(codigos)}) AND data BETWEEN ? AND ? ORDER BY data, hora`).all(...ids, ...codigos, inicio, fim)) {
      if (!porCodigo.has(b.codigo)) porCodigo.set(b.codigo, new Map());
      const dias = porCodigo.get(b.codigo);
      if (!dias.has(b.data)) dias.set(b.data, []);
      dias.get(b.data).push(b.hora);
    }
  }
  const ultimoDia = ultimoDiaCompleto(relogios);

  return {
    periodo: { inicio, fim },
    padrao,
    horario: o.ponto_horario,
    ultimo_dia: ultimoDia,
    empresa: relogios.find((r) => r.empresa)?.empresa || null,
    relogios: relogios.map((r) => ({ numero_fabricacao: r.numero_fabricacao, gerado_em: r.gerado_em })),
    folha_mensal: fm || null,
    funcionarios: funcionarios.map((f) => ({
      id: f.id,
      nome: f.nome,
      nome_completo: f.nome_completo,
      funcao: f.funcao,
      ponto_codigo: f.ponto_codigo,
      horario: f.ponto_horario || o.ponto_horario,
      horario_proprio: !!f.ponto_horario,
      lancamento: fm ? { id: f.lancamento_id, faltas: f.faltas, sabados: f.sabados, horas_extras: f.horas_extras, horas_atraso: f.horas_atraso } : null,
      espelho: !f.ponto_codigo || !ultimoDia ? null : calcularEspelho({
        inicio,
        fim,
        turnos: lerHorario(f.ponto_horario) || turnosOficina,
        batidasPorDia: porCodigo.get(f.ponto_codigo) || new Map(),
        diasComExpediente,
        ultimoDia,
        admissao: ehData(f.admissao) ? f.admissao : null,
      }),
    })),
  };
}

app.get('/api/oficinas/:id/ponto/espelho', (req, res) => {
  const o = oficinaOu404(req.params.id);
  res.json(espelhoDaFolha(o, Number(req.query.folha), Math.round(numero(req.query.ano)), Math.round(numero(req.query.mes)),
    req.query.inicio, req.query.fim));
});

/** Passa para a folha do mês as faltas, sábados, horas extras e atrasos calculados pelo ponto. */
app.post('/api/folhas-mensais/:id/ponto', (req, res) => {
  const fmId = id(req.params.id);
  exigirAberta(fmId);
  const fm = db.prepare('SELECT * FROM folhas_mensais WHERE id = ?').get(fmId);
  const e = espelhoDaFolha(carregarOficina(fm.oficina_id), fm.folha_numero, fm.ano, fm.mes, req.body?.inicio, req.body?.fim);
  const salvar = db.prepare('UPDATE lancamentos SET faltas = ?, sabados = ?, horas_extras = ?, horas_atraso = ? WHERE id = ?');
  const comPonto = e.funcionarios.filter((f) => f.espelho && f.lancamento);
  tx(() => comPonto.forEach((f) => salvar.run(f.espelho.faltas, f.espelho.sabados, f.espelho.horas_extras, f.espelho.horas_atraso, f.lancamento.id)));
  res.json({ atualizados: comPonto.length, sem_ponto: e.funcionarios.length - comPonto.length });
});

// ---------------------------------------------------------------- histórico e início

app.get('/api/oficinas/:id/historico', (req, res) => {
  const o = oficinaOu404(req.params.id);
  const fms = db.prepare('SELECT * FROM folhas_mensais WHERE oficina_id = ? ORDER BY ano DESC, mes DESC, folha_numero').all(o.id);
  res.json(fms.map((fm) => ({
    id: fm.id,
    ano: fm.ano,
    mes: fm.mes,
    folha_numero: fm.folha_numero,
    apelido: folhaDaOficina(o, fm.folha_numero).apelido,
    folha_apagada: !o.folhas.some((f) => f.numero === fm.folha_numero),
    status: fm.status,
    fechada_em: fm.fechada_em,
    totais: totaisDe(fm),
  })));
});

app.get('/api/backup', (req, res) => {
  const hoje = new Date().toLocaleDateString('sv-SE');
  const temporario = path.join(os.tmpdir(), `folha-backup-${Date.now()}.db`);
  copiarBanco(temporario);
  res.download(temporario, `folha-de-pagamento-${hoje}.db`, () => fs.rm(temporario, { force: true }, () => {}));
});

/** Quantas cópias há na pasta e qual a mais recente. */
function resumoPasta(pasta) {
  try {
    const copias = copiasNaPasta(pasta);
    const ultima = copias.at(-1);
    const info = ultima && fs.statSync(path.join(pasta, ultima));
    return { quantidade: copias.length, ultima: ultima ? { nome: ultima, em: info.mtime.toISOString(), bytes: info.size } : null };
  } catch (e) {
    return { erro: explicarErroPasta(e) };
  }
}

function situacaoCopias() {
  const pastaExtra = lerConfig('backup_pasta_extra');
  return {
    pastaPrincipal: PASTA_BACKUPS,
    principal: resumoPasta(PASTA_BACKUPS),
    pastaExtra,
    extra: pastaExtra ? resumoPasta(pastaExtra) : null,
    statusExtra: pastaExtra ? lerJson(lerConfig('backup_extra_status'), null) : null,
  };
}

app.get('/api/copias', (req, res) => res.json(situacaoCopias()));

app.put('/api/copias/pasta-extra', (req, res) => {
  const texto = textoOuNulo(req.body?.pasta);
  if (!texto) {
    gravarConfig('backup_pasta_extra', null);
    gravarConfig('backup_extra_status', null);
    return res.json(situacaoCopias());
  }
  if (!path.isAbsolute(texto)) falhar(400, 'Informe o caminho completo da pasta, por exemplo D:\\Backups\\Folha.');
  const pasta = path.resolve(texto);
  const relativo = path.relative(PASTA_DADOS, pasta);
  if (!relativo.startsWith('..') && !path.isAbsolute(relativo)) {
    falhar(400, 'Escolha uma pasta fora da pasta de dados do sistema; a ideia é ter a cópia em outro lugar.');
  }
  try {
    fs.mkdirSync(pasta, { recursive: true });
    const teste = path.join(pasta, `.teste-folha-${Date.now()}`);
    fs.writeFileSync(teste, 'ok');
    fs.rmSync(teste);
  } catch (e) {
    falhar(400, `Não foi possível usar esta pasta: ${explicarErroPasta(e)}`);
  }
  gravarConfig('backup_pasta_extra', pasta);
  backupAutomatico({ forcar: true });
  res.json(situacaoCopias());
});

app.post('/api/copias/agora', (req, res) => {
  backupAutomatico({ forcar: true });
  res.json(situacaoCopias());
});

app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// ---------------------------------------------------------------- telas

if (fs.existsSync(path.join(DIST, 'index.html'))) {
  app.use(express.static(DIST));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ erro: status >= 500 ? `Erro interno: ${err.message}` : err.message });
});

// ---------------------------------------------------------------- início

function backupDoDia() {
  try {
    backupAutomatico();
  } catch (e) {
    console.error('Falha no backup automático:', e.message);
  }
}
backupDoDia();
// No servidor o sistema fica ligado direto: confere a cada hora se a cópia do dia já foi feita.
setInterval(backupDoDia, 60 * 60 * 1000);

/** Endereços IPv4 desta máquina na rede (o do Tailscale começa com 100.). */
const enderecosDaRede = () =>
  Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i.address}:${PORTA}`);

const servidor = app.listen(PORTA, EM_REDE ? '0.0.0.0' : '127.0.0.1', () => {
  const url = `http://localhost:${PORTA}`;
  console.log(`\n  Folha de Pagamento (${AMBIENTE === 'producao' ? 'PRODUÇÃO' : 'VERSÃO DE TESTES'} · versão ${VERSAO}) rodando em ${url}`);
  if (EM_REDE) console.log(`  Outros computadores acessam por:\n${enderecosDaRede().map((e) => `    ${e}`).join('\n')}`);
  if (process.argv.includes('--abrir') && process.platform === 'win32') exec(`start "" "${url}"`);
});

servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`\n  O sistema já está aberto em http://localhost:${PORTA}\n`);
    if (process.argv.includes('--abrir') && process.platform === 'win32') exec(`start "" "http://localhost:${PORTA}"`);
    setTimeout(() => process.exit(0), 1500);
  } else {
    throw e;
  }
});

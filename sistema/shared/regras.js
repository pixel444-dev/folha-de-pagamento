// Regras de pagamento que cada empresa monta sozinha, sem programar (as antigas "bonificações").
// Cada regra é uma frase em três blocos: QUEM recebe · QUANDO (condições) · QUANTO (cálculo).
// A regra fica guardada como dados (JSON em bonificacoes.definicao), nunca como código: só os blocos
// desta lista existem (e as fórmulas de formula.js), então uma regra não consegue fazer nada além
// de somar ou descontar um valor.

import { brl, fmtHoras, fmtQtd } from './formato.js';
import { avaliarFormula, compilarFormula, dadosDaFormula, paraChaves, paraNomes } from './formula.js';

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const PERTO = 1e-9; // tolerância de ponto flutuante nas comparações (1,5 h vindo de "1:30")

/** Grupos dos dados nas listas de escolha. */
export const GRUPOS = {
  mes: 'Lançado na folha do mês',
  cadastro: 'Do cadastro do funcionário',
  calculado: 'Calculado pelo sistema',
  folha: 'Valores da folha (R$)',
  regras: 'Outras regras (valem as que estão acima desta na lista)',
  especial: 'Da própria regra',
};

/**
 * Dados de cada funcionário no mês que as regras podem usar (calculo.js → variaveisDoLancamento e calcularLancamento).
 * Os do grupo "folha" e as outras regras vêm do cálculo: "até aqui" = com as regras que estão acima na lista.
 */
export const VARIAVEIS = [
  { chave: 'faltas', rotulo: 'Faltas', tipo: 'numero', grupo: 'mes' },
  { chave: 'sabados', rotulo: 'Sábados trabalhados', tipo: 'numero', grupo: 'mes' },
  { chave: 'horas_extras', rotulo: 'Horas extras', tipo: 'horas', grupo: 'mes' },
  { chave: 'horas_atraso', rotulo: 'Horas de atraso', tipo: 'horas', grupo: 'mes' },
  { chave: 'comissao', rotulo: 'Comissão', tipo: 'moeda', grupo: 'mes' },
  { chave: 'salario', rotulo: 'Salário', tipo: 'moeda', grupo: 'cadastro' },
  { chave: 'meses_de_casa', rotulo: 'Meses de casa', tipo: 'numero', grupo: 'cadastro' },
  { chave: 'anos_de_casa', rotulo: 'Anos de casa', tipo: 'numero', grupo: 'cadastro' },
  { chave: 'comissionado', rotulo: 'Recebe comissão', tipo: 'sim_nao', grupo: 'cadastro' },
  { chave: 'valor_dia', rotulo: 'Valor do dia', tipo: 'moeda', grupo: 'calculado' },
  { chave: 'valor_hora', rotulo: 'Valor da hora', tipo: 'moeda', grupo: 'calculado' },
  { chave: 'dias_mes', rotulo: 'Dias do mês (divisor)', tipo: 'numero', grupo: 'calculado' },
  { chave: 'dias_trabalhados', rotulo: 'Dias trabalhados', tipo: 'numero', grupo: 'calculado' },
  { chave: 'mes', rotulo: 'Mês da folha', tipo: 'numero', grupo: 'calculado' },
  { chave: 'valor_sabados', rotulo: 'Valor dos sábados', tipo: 'moeda', grupo: 'folha' },
  { chave: 'valor_horas_extras', rotulo: 'Valor das horas extras', tipo: 'moeda', grupo: 'folha' },
  { chave: 'acrescimos', rotulo: 'Acréscimos', tipo: 'moeda', grupo: 'folha' },
  { chave: 'valor_faltas', rotulo: 'Desconto das faltas', tipo: 'moeda', grupo: 'folha' },
  { chave: 'valor_atrasos', rotulo: 'Desconto dos atrasos', tipo: 'moeda', grupo: 'folha' },
  { chave: 'total_proventos', rotulo: 'Total de proventos até aqui', tipo: 'moeda', grupo: 'folha' },
  { chave: 'total_descontos', rotulo: 'Total de descontos até aqui', tipo: 'moeda', grupo: 'folha' },
  { chave: 'bruto_mes', rotulo: 'Bruto do mês (proventos − faltas e atrasos)', tipo: 'moeda', grupo: 'folha' },
  // Só nas fórmulas: o valor da regra (ou o valor próprio da pessoa, se ela tiver no cadastro).
  { chave: 'valor_regra', rotulo: 'Valor da regra', tipo: 'moeda', grupo: 'especial', soFormula: true },
];
const FIXAS = new Set(VARIAVEIS.map((v) => v.chave));

/** Tipos dos campos que a empresa cria (ex.: "Peças produzidas", "Filhos"). */
export const TIPOS_CAMPO = { numero: 'Número', horas: 'Horas (h:mm)', moeda: 'Valor em R$', sim_nao: 'Sim ou não' };
/** Onde o campo é preenchido: todo mês na folha, ou uma vez no cadastro do funcionário. */
export const ESCOPOS_CAMPO = { mes: 'Lançado todo mês na folha', cadastro: 'Fica no cadastro do funcionário' };

/** Tudo o que as regras de uma empresa podem usar: os dados fixos, os campos criados por ela e as outras regras. */
export function variaveisDa(campos = [], regras = []) {
  return [
    ...VARIAVEIS,
    ...campos.map((c) => ({ chave: `campo:${c.id}`, rotulo: c.nome, tipo: c.tipo, grupo: c.escopo === 'cadastro' ? 'cadastro' : 'mes' })),
    ...regras.map((r) => ({ chave: `regra:${r.id}`, rotulo: `Regra: ${r.nome}`, tipo: 'moeda', grupo: 'regras' })),
  ];
}

export const QUEM = {
  todos: 'Todos os funcionários',
  marcados: 'Só quem estiver marcado no cadastro',
  funcoes: 'Só algumas funções',
};

export const OPERADORES = {
  igual: { rotulo: 'for igual a', sinal: '=' },
  diferente: { rotulo: 'for diferente de', sinal: '≠' },
  menor: { rotulo: 'for menor que', sinal: '<' },
  ate: { rotulo: 'for no máximo', sinal: '≤' },
  maior: { rotulo: 'for maior que', sinal: '>' },
  minimo: { rotulo: 'for no mínimo', sinal: '≥' },
};

export const MODOS = {
  fixo: 'Valor fixo',
  percentual: 'Porcentagem de um valor',
  por_quantidade: 'Valor por quantidade',
  faixas: 'Tabela de faixas',
  formula: 'Fórmula (como no Excel)',
};

/** No modo "por quantidade": quanto vale cada unidade. */
export const UNIDADES = { reais: 'reais', valor_hora: '× o valor da hora', valor_dia: '× o valor do dia' };

/** Como cada faixa da tabela paga. */
export const TIPOS_FAIXA = {
  fixo: 'Um valor em R$ para cada faixa',
  percentual: 'Uma porcentagem do valor, conforme a faixa',
  progressiva: 'Progressiva: cada faixa só sobre a parte dela (como o INSS)',
};

const MAX_CONDICOES = 10;
const MAX_FAIXAS = 20;

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

function limparFaixas(lista, falhar) {
  const faixas = (Array.isArray(lista) ? lista : []).slice(0, MAX_FAIXAS).map((f) => ({
    ate: f?.ate === null || f?.ate === '' || f?.ate === undefined ? null : n(f.ate),
    valor: n(f?.valor),
  }));
  const comLimite = faixas.filter((f) => f.ate !== null).sort((a, b) => a.ate - b.ate);
  if (comLimite.some((f, i) => i > 0 && Math.abs(f.ate - comLimite[i - 1].ate) < PERTO)) falhar('Duas faixas têm o mesmo limite.');
  const acima = faixas.find((f) => f.ate === null);
  const saida = acima ? [...comLimite, acima] : comLimite;
  if (!saida.length) falhar('Adicione pelo menos uma faixa.');
  return saida;
}

const temLimite = (v) => v !== null && v !== undefined && v !== '';

/**
 * Confere e arruma uma definição de regra.
 * Com `variaveis` (ao salvar: os dados que esta regra pode usar) recusa o que estiver errado, com uma mensagem
 * para o usuário, e guarda a fórmula pelas chaves dos dados; sem ela (ao ler) só completa o que faltar.
 */
export function limparDefinicao(def, variaveis = null) {
  const d = def && typeof def === 'object' ? def : {};
  const estrito = Array.isArray(variaveis);
  const chaves = estrito ? new Set(variaveis.filter((v) => !v.soFormula).map((v) => v.chave)) : null;
  const falhar = (msg) => {
    if (estrito) throw new Error(msg);
  };
  const existe = (chave) => typeof chave === 'string'
    && (estrito ? chaves.has(chave) : chave !== 'valor_regra' && (FIXAS.has(chave) || /^(campo|regra):\d+$/.test(chave)));
  const NAO_EXISTE = 'A regra usa um dado que não existe (talvez um campo ou uma regra que foi apagada).';
  const variavel = (chave, padrao) => {
    if (existe(chave)) return chave;
    falhar(NAO_EXISTE);
    return padrao;
  };

  const quem = d.quem in QUEM ? d.quem : 'todos';
  const funcoes = quem === 'funcoes'
    ? [...new Set((Array.isArray(d.funcoes) ? d.funcoes : []).map((f) => String(f).trim()).filter(Boolean))].slice(0, 30)
    : [];
  if (quem === 'funcoes' && !funcoes.length) falhar('Escolha pelo menos uma função em "Quem recebe".');

  const condicoes = [];
  for (const c of (Array.isArray(d.condicoes) ? d.condicoes : []).slice(0, MAX_CONDICOES)) {
    if (!existe(c?.variavel) || !(c?.op in OPERADORES)) {
      falhar(c?.variavel && !existe(c.variavel) ? NAO_EXISTE : 'Uma das condições está incompleta.');
      continue;
    }
    condicoes.push({ variavel: c.variavel, op: c.op, valor: n(c.valor) });
  }
  const juntar = d.juntar === 'alguma' ? 'alguma' : 'todas';

  const c = d.calculo && typeof d.calculo === 'object' ? d.calculo : {};
  const modo = c.modo in MODOS ? c.modo : 'fixo';
  const calculo = { modo };
  if (modo === 'percentual') calculo.base = variavel(c.base, 'salario');
  if (modo === 'por_quantidade') {
    calculo.quantidade = variavel(c.quantidade, 'horas_extras');
    calculo.unidade = c.unidade in UNIDADES ? c.unidade : 'reais';
  }
  if (modo === 'faixas') {
    calculo.variavel = variavel(c.variavel, 'anos_de_casa');
    calculo.tipo_faixa = c.tipo_faixa in TIPOS_FAIXA ? c.tipo_faixa : 'fixo';
    calculo.faixas = limparFaixas(c.faixas, falhar);
  }
  if (modo === 'formula') {
    const texto = String(c.formula ?? '').slice(0, 500);
    calculo.formula = texto;
    if (estrito) {
      const f = compilarFormula(texto, variaveis);
      if (f.erro) falhar(`A fórmula tem um erro: ${f.erro}`);
      calculo.formula = paraChaves(texto, variaveis);
    }
  }
  if (temLimite(c.minimo)) calculo.minimo = n(c.minimo);
  if (temLimite(c.maximo)) calculo.maximo = n(c.maximo);
  if (temLimite(calculo.minimo) && temLimite(calculo.maximo) && calculo.minimo > calculo.maximo) {
    falhar('O valor mínimo não pode ser maior que o máximo.');
  }
  return { quem, funcoes, juntar, condicoes, calculo };
}

/** Definição de uma regra. As bonificações de antes das regras só tinham "zero_falta" ou "atribuida". */
export function definicaoDaRegra(b) {
  if (b.definicao && typeof b.definicao === 'object') return limparDefinicao(b.definicao);
  if (b.regra === 'zero_falta') return limparDefinicao({ quem: 'todos', condicoes: [{ variavel: 'faltas', op: 'igual', valor: 0 }] });
  return limparDefinicao({ quem: 'marcados' });
}

/**
 * Valor da coluna antiga "regra", que continua gravada para o código anterior entender a regra
 * (o atualizador pode voltar a versão). Só o zero falta tem um formato próprio.
 */
export function regraLegada(def, tipo = 'provento') {
  const c = def.condicoes;
  const zeroFalta = tipo === 'provento' && def.quem === 'todos' && def.calculo.modo === 'fixo'
    && !temLimite(def.calculo.minimo) && !temLimite(def.calculo.maximo)
    && c.length === 1 && c[0].variavel === 'faltas' && c[0].op === 'igual' && c[0].valor === 0;
  return zeroFalta ? 'zero_falta' : 'atribuida';
}

/**
 * Chaves dos dados que a regra usa (para o teste e para não apagar um campo ou uma regra em uso).
 * Com `lista` (variaveisDa) também entende a fórmula escrita pelos nomes, como ela fica na tela.
 */
export function variaveisUsadas(def, lista = null) {
  const usadas = new Set(def.condicoes.map((c) => c.variavel));
  const c = def.calculo;
  for (const k of ['base', 'quantidade', 'variavel']) if (c[k]) usadas.add(c[k]);
  if (c.unidade && c.unidade !== 'reais') usadas.add(c.unidade);
  if (c.modo === 'formula') {
    const dados = lista ? compilarFormula(c.formula, lista).refs || [] : dadosDaFormula(c.formula);
    for (const k of dados) usadas.add(k);
  }
  return usadas;
}

export const temCondicoes = (b) => definicaoDaRegra(b).condicoes.length > 0;
export const ehMarcada = (b) => definicaoDaRegra(b).quem === 'marcados';

function comparar(a, op, b) {
  switch (op) {
    case 'igual': return Math.abs(a - b) < PERTO;
    case 'diferente': return Math.abs(a - b) >= PERTO;
    case 'menor': return a < b - PERTO;
    case 'ate': return a <= b + PERTO;
    case 'maior': return a > b + PERTO;
    case 'minimo': return a >= b - PERTO;
    default: return false;
  }
}

/** Um número no jeito de cada tipo de dado: "1h30", "R$ 10,00", "Sim", "2,5". */
export function formatarDado(tipo, v) {
  if (tipo === 'horas') return fmtHoras(v);
  if (tipo === 'moeda') return brl(v);
  if (tipo === 'sim_nao') return n(v) ? 'Sim' : 'Não';
  return fmtQtd(v);
}

function calcularFaixas(c, x) {
  if (c.tipo_faixa === 'progressiva') {
    // Cada faixa cobra a sua porcentagem só sobre a parte do valor que cai nela (ex.: INSS).
    let total = 0;
    let anterior = 0;
    for (const f of c.faixas) {
      if (x <= anterior + PERTO) break;
      const teto = f.ate === null ? Infinity : f.ate;
      total += ((Math.min(x, teto) - anterior) * f.valor) / 100;
      anterior = teto;
    }
    return { valor: total, detalhe: null };
  }
  const faixa = c.faixas.find((f) => f.ate === null || x <= f.ate + PERTO);
  if (!faixa) return { valor: 0, detalhe: null };
  if (c.tipo_faixa === 'percentual') return { valor: (x * faixa.valor) / 100, detalhe: `${fmtQtd(faixa.valor)}%` };
  return { valor: faixa.valor, detalhe: null };
}

function calcular(calculo, valor, variaveis, lista) {
  const dado = (k) => n(variaveis[k]);
  let r;
  switch (calculo.modo) {
    case 'percentual':
      r = { valor: (dado(calculo.base) * valor) / 100, detalhe: `${fmtQtd(valor)}%` };
      break;
    case 'por_quantidade': {
      const q = dado(calculo.quantidade);
      const unitario = calculo.unidade === 'reais' ? valor : valor * dado(calculo.unidade);
      const tipo = lista.find((v) => v.chave === calculo.quantidade)?.tipo;
      r = { valor: q * unitario, detalhe: formatarDado(tipo, q) };
      break;
    }
    case 'faixas':
      r = calcularFaixas(calculo, dado(calculo.variavel));
      break;
    case 'formula': {
      const f = compilarFormula(calculo.formula, lista);
      r = { valor: f.erro ? 0 : avaliarFormula(f.ast, { ...variaveis, valor_regra: valor }), detalhe: null, erro: f.erro };
      break;
    }
    default:
      r = { valor, detalhe: null };
  }
  if (temLimite(calculo.minimo) && r.valor < calculo.minimo) r.valor = calculo.minimo;
  if (temLimite(calculo.maximo) && r.valor > calculo.maximo) r.valor = calculo.maximo;
  return r;
}

/**
 * Aplica uma regra a um funcionário no mês.
 * variaveis = dados do mês { chave: número } (calculo.js); manual = 'sim' | 'nao' | null (ajuste na folha);
 * lista = os dados que existem (variaveisDa), para ler fórmulas e mostrar quantidades.
 * O ajuste manual só passa por cima das condições (QUANDO), nunca de QUEM recebe.
 */
export function avaliarRegra(b, { funcionario = {}, variaveis = {}, manual = null, lista = VARIAVEIS } = {}) {
  const def = definicaoDaRegra(b);
  const atribuida = (funcionario.bonificacoes || []).find((x) => x.bonificacao_id === b.id);
  if (def.quem === 'marcados' && !atribuida) return { elegivel: false, motivo: 'Não está marcado no cadastro do funcionário.' };
  if (def.quem === 'funcoes' && !def.funcoes.some((f) => semAcento(f) === semAcento(funcionario.funcao))) {
    return { elegivel: false, motivo: 'A função do funcionário não está na regra.' };
  }

  const resultados = def.condicoes.map((c) => comparar(n(variaveis[c.variavel]), c.op, c.valor));
  const automatico = def.juntar === 'alguma' && resultados.length ? resultados.some(Boolean) : resultados.every(Boolean);
  const m = manual === 'sim' || manual === 'nao' ? manual : null;
  const aplicada = m === 'sim' ? true : m === 'nao' ? false : automatico;

  // Quem é marcado no cadastro pode ter um valor próprio (vazio = valor da regra).
  const proprio = def.quem === 'marcados' ? atribuida.valor : null;
  const base = proprio == null || proprio === '' ? n(b.valor) : n(proprio);
  const r = aplicada ? calcular(def.calculo, base, variaveis, lista) : { valor: 0, detalhe: null };

  return {
    elegivel: true,
    condicional: def.condicoes.length > 0,
    automatico,
    aplicada,
    manual: m,
    valor: r.valor,
    detalhe: r.detalhe,
    erro: r.erro,
    falhas: def.condicoes.filter((_, i) => !resultados[i]),
  };
}

/**
 * Como uma regra com condição ficou para a pessoa numa folha: { automatico, aplicada, manual } ou null (não vale para ela).
 * Folhas fechadas antes das regras não guardavam isso; delas só se sabe se a regra entrou no pagamento.
 */
export function situacaoDaRegra(b, resultado) {
  if (resultado.regras) return resultado.regras[b.id] || null;
  const aplicada = b.regra === 'zero_falta'
    ? !!resultado.zero_falta
    : [...resultado.proventos, ...resultado.descontos].some((p) => p.chave === `bon:${b.id}`);
  return { automatico: aplicada, aplicada, manual: null };
}

// ---------------------------------------------------------------- textos (lista de regras, cadastro, teste)
// `variaveis` = variaveisDa(campos, regras) da empresa, para os nomes dos dados.

const infoDe = (chave, variaveis) => variaveis.find((v) => v.chave === chave) || { rotulo: 'dado apagado', tipo: 'numero' };

/** "Faltas = 0", "Horas de atraso > 5h" */
export function descreverCondicao(c, variaveis = VARIAVEIS) {
  const { rotulo, tipo } = infoDe(c.variavel, variaveis);
  if (tipo === 'sim_nao') return `${rotulo} ${c.op === 'diferente' ? '≠' : '='} ${formatarDado(tipo, c.valor)}`;
  return `${rotulo} ${OPERADORES[c.op].sinal} ${formatarDado(tipo, c.valor)}`;
}

/** "R$ 70,00", "10% de Salário", "1,5 × o valor da hora por horas extras", "conforme anos de casa: …" */
export function descreverCalculo(def, valor, variaveis = VARIAVEIS) {
  const c = def.calculo;
  const rotulo = (k) => infoDe(k, variaveis).rotulo;
  let texto;
  if (c.modo === 'percentual') texto = `${fmtQtd(valor)}% de ${rotulo(c.base)}`;
  else if (c.modo === 'por_quantidade') {
    const unidade = c.unidade === 'reais' ? brl(valor) : `${fmtQtd(valor)} ${UNIDADES[c.unidade]}`;
    texto = `${unidade} por ${rotulo(c.quantidade).toLowerCase()}`;
  } else if (c.modo === 'faixas') {
    const tipo = infoDe(c.variavel, variaveis).tipo;
    const pagar = (v) => (c.tipo_faixa === 'fixo' ? brl(v) : `${fmtQtd(v)}%`);
    const faixas = c.faixas.map((f) => `${f.ate === null ? 'acima' : `até ${formatarDado(tipo, f.ate)}`} → ${pagar(f.valor)}`).join('; ');
    texto = `${c.tipo_faixa === 'progressiva' ? 'tabela progressiva sobre' : 'conforme'} ${rotulo(c.variavel).toLowerCase()}: ${faixas}`;
  } else if (c.modo === 'formula') texto = `pela fórmula ${paraNomes(c.formula, variaveis)}`;
  else texto = brl(valor);
  const limites = [temLimite(c.minimo) && `no mínimo ${brl(c.minimo)}`, temLimite(c.maximo) && `no máximo ${brl(c.maximo)}`].filter(Boolean);
  return limites.length ? `${texto} (${limites.join(', ')})` : texto;
}

/** Resumo de uma regra em partes: { quem, quando, quanto }. */
export function descreverRegra(b, variaveis = VARIAVEIS) {
  const def = definicaoDaRegra(b);
  const quem = def.quem === 'funcoes' ? def.funcoes.join(', ') : def.quem === 'marcados' ? 'Quem está marcado no cadastro' : 'Todos';
  const quando = def.condicoes.length
    ? `quando ${def.condicoes.map((c) => descreverCondicao(c, variaveis)).join(def.juntar === 'alguma' ? ' ou ' : ' e ')}`
    : 'sempre';
  const verbo = b.tipo === 'desconto' ? 'desconta' : 'soma';
  return { quem, quando, quanto: `${verbo} ${descreverCalculo(def, b.valor, variaveis)}` };
}

// ---------------------------------------------------------------- modelos para começar uma regra nova

export const MODELOS = [
  {
    nome: 'Prêmio assiduidade',
    explicacao: 'Paga um valor para quem não faltou e quase não atrasou no mês.',
    tipo: 'provento',
    valor: 100,
    definicao: {
      quem: 'todos',
      condicoes: [{ variavel: 'faltas', op: 'igual', valor: 0 }, { variavel: 'horas_atraso', op: 'ate', valor: 2 }],
      calculo: { modo: 'fixo' },
    },
  },
  {
    nome: 'Prêmio que diminui com as faltas',
    explicacao: 'Fórmula: R$ 150,00 sem faltas, R$ 75,00 com uma falta e nada com mais faltas.',
    tipo: 'provento',
    valor: 0,
    definicao: { quem: 'todos', calculo: { modo: 'formula', formula: 'SE([Faltas] = 0; 150; SE([Faltas] <= 1; 75; 0))' } },
  },
  {
    nome: 'Vale almoço',
    explicacao: 'Valor fixo só para quem for marcado no cadastro (cada pessoa pode ter um valor próprio).',
    tipo: 'provento',
    valor: 150,
    definicao: { quem: 'marcados', calculo: { modo: 'fixo' } },
  },
  {
    nome: 'Benefício proporcional aos dias trabalhados',
    explicacao: 'Fórmula: o valor da regra dividido pelos dias do mês, vezes os dias trabalhados (cada falta tira um pedaço).',
    tipo: 'provento',
    valor: 200,
    definicao: { quem: 'todos', calculo: { modo: 'formula', formula: '[Valor da regra] * [Dias trabalhados] / [Dias do mês (divisor)]' } },
  },
  {
    nome: 'Adicional por tempo de casa',
    explicacao: 'Valor que aumenta com os anos de empresa (usa a data de admissão do cadastro).',
    tipo: 'provento',
    valor: 0,
    definicao: {
      quem: 'todos',
      calculo: {
        modo: 'faixas',
        variavel: 'anos_de_casa',
        tipo_faixa: 'fixo',
        faixas: [{ ate: 0, valor: 0 }, { ate: 2, valor: 50 }, { ate: 5, valor: 100 }, { ate: null, valor: 150 }],
      },
    },
  },
  {
    nome: 'Bônus sobre a comissão (com teto)',
    explicacao: '5% a mais sobre a comissão do mês, no máximo R$ 300,00.',
    tipo: 'provento',
    valor: 5,
    definicao: { quem: 'todos', calculo: { modo: 'percentual', base: 'comissao', maximo: 300 } },
  },
  {
    nome: 'Hora extra 50%',
    explicacao: 'Cada hora extra vale 1,5 × o valor da hora. Para não pagar duas vezes, deixe a hora extra do cálculo básico em R$ 0,00.',
    tipo: 'provento',
    valor: 1.5,
    definicao: { quem: 'todos', calculo: { modo: 'por_quantidade', quantidade: 'horas_extras', unidade: 'valor_hora' } },
  },
  {
    nome: 'Abono de dezembro',
    explicacao: 'Valor que só entra na folha de dezembro.',
    tipo: 'provento',
    valor: 300,
    definicao: { quem: 'todos', condicoes: [{ variavel: 'mes', op: 'igual', valor: 12 }], calculo: { modo: 'fixo' } },
  },
  {
    nome: 'Desconto por atraso',
    explicacao: 'Desconta um valor de quem passou de 5 horas de atraso no mês.',
    tipo: 'desconto',
    valor: 50,
    definicao: { quem: 'todos', condicoes: [{ variavel: 'horas_atraso', op: 'maior', valor: 5 }], calculo: { modo: 'fixo' } },
  },
  {
    nome: 'INSS (tabela progressiva)',
    explicacao: 'Desconto progressivo sobre o bruto do mês. ATENÇÃO: os valores são um exemplo (tabela de 2025); confira a tabela do ano antes de usar.',
    tipo: 'desconto',
    valor: 0,
    definicao: {
      quem: 'todos',
      calculo: {
        modo: 'faixas',
        variavel: 'bruto_mes',
        tipo_faixa: 'progressiva',
        faixas: [{ ate: 1518, valor: 7.5 }, { ate: 2793.88, valor: 9 }, { ate: 4190.83, valor: 12 }, { ate: 8157.41, valor: 14 }],
      },
    },
  },
];

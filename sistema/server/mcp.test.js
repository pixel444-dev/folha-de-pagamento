// Assistente de IA (MCP): liga o servidor de verdade (modo --rede, com senha) num banco temporário
// e confere o acesso, as permissões, o PIX escondido e o registro.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SISTEMA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'folha-mcp-teste-'));
const PORTA = 41000 + Math.floor(Math.random() * 2000);
const BASE = `http://127.0.0.1:${PORTA}`;
const SENHA = 'senha-de-teste-123';

let servidor;
let cookie;
let chaveLeitura;
let chaveLancamentos;

async function esperarServidor() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${BASE}/api/info`)).ok) return;
    } catch { /* ainda ligando */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('O servidor de teste não ligou.');
}

before(async () => {
  process.env.FOLHA_DADOS = PASTA;
  const { definirSenha } = await import('./acesso.js');
  const { db } = await import('./db.js');
  definirSenha(SENHA);
  db.close();
  servidor = spawn(process.execPath, ['server/index.js', '--rede'], {
    cwd: SISTEMA,
    env: { ...process.env, FOLHA_DADOS: PASTA, PORT: String(PORTA) },
    stdio: 'ignore',
  });
  await esperarServidor();
  const r = await fetch(`${BASE}/api/entrar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ senha: SENHA }) });
  cookie = r.headers.get('set-cookie').split(';')[0];
});

after(() => {
  servidor?.kill();
  try {
    fs.rmSync(PASTA, { recursive: true, force: true });
  } catch { /* Windows pode segurar o arquivo por um instante */ }
});

const tela = (metodo, url, corpo) => fetch(`${BASE}/api${url}`, {
  method: metodo,
  headers: { cookie, 'content-type': 'application/json' },
  body: corpo === undefined ? undefined : JSON.stringify(corpo),
}).then(async (r) => ({ status: r.status, dados: r.status === 204 ? null : await r.json() }));

let proximoId = 1;
async function rpc(chave, method, params, extras = {}) {
  const r = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(chave ? { authorization: `Bearer ${chave}` } : {}), ...extras },
    body: JSON.stringify({ jsonrpc: '2.0', id: proximoId++, method, params }),
  });
  return { status: r.status, cabecalhos: r.headers, dados: await r.json().catch(() => null) };
}
async function ferramenta(chave, name, args = {}) {
  const r = await rpc(chave, 'tools/call', { name, arguments: args });
  if (r.dados.error) return { erroRpc: r.dados.error };
  const { isError, content } = r.dados.result;
  return { isError, texto: content[0].text, dados: isError ? null : JSON.parse(content[0].text) };
}

test('sem chave (ou com chave errada) o /mcp não responde, e a API continua pedindo senha', async () => {
  const semChave = await rpc(null, 'tools/list');
  assert.equal(semChave.status, 401);
  assert.match(semChave.cabecalhos.get('www-authenticate'), /Bearer/);
  assert.equal((await rpc('folha_mcp_inventada', 'tools/list')).status, 401);
  // Segredo interno chutado, mesmo vindo deste computador: não abre a API.
  const r = await fetch(`${BASE}/api/oficinas`, { headers: { 'x-folha-interno': 'a'.repeat(64) } });
  assert.equal(r.status, 401);
  // Descoberta de OAuth dos clientes MCP: 404 em JSON (e não a tela do sistema).
  const wk = await fetch(`${BASE}/.well-known/oauth-protected-resource`);
  assert.equal(wk.status, 404);
});

test('criar chaves na tela: o segredo aparece uma vez só e não é guardado', async () => {
  const sem = await fetch(`${BASE}/api/assistente/chaves`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(sem.status, 401, 'sem senha não cria chave');
  const ruim = await tela('POST', '/assistente/chaves', { nome: 'x', permissao: 'tudo', validade_dias: 90 });
  assert.equal(ruim.status, 400);

  const a = await tela('POST', '/assistente/chaves', { nome: 'Só leitura', permissao: 'leitura', validade_dias: 90 });
  const b = await tela('POST', '/assistente/chaves', { nome: 'Lançamentos', permissao: 'lancamentos', validade_dias: 0 });
  assert.equal(a.status, 201);
  chaveLeitura = a.dados.token;
  chaveLancamentos = b.dados.token;
  assert.match(chaveLeitura, /^folha_mcp_/);
  assert.ok(a.dados.chave.expira_em);
  assert.equal(b.dados.chave.expira_em, null);

  const lista = await tela('GET', '/assistente');
  assert.equal(lista.dados.chaves.length, 2);
  assert.ok(!JSON.stringify(lista.dados).includes(chaveLeitura), 'a lista nunca mostra a chave inteira');
});

test('initialize e lista de ferramentas conforme a permissão', async () => {
  const init = await rpc(chaveLeitura, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'teste', version: '1' } });
  assert.equal(init.status, 200);
  assert.equal(init.dados.result.protocolVersion, '2025-06-18');
  assert.ok(init.dados.result.capabilities.tools);

  const notif = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${chaveLeitura}` },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  });
  assert.equal(notif.status, 202);

  const nomes = (r) => r.dados.result.tools.map((t) => t.name);
  const leitura = nomes(await rpc(chaveLeitura, 'tools/list'));
  const tudo = nomes(await rpc(chaveLancamentos, 'tools/list'));
  assert.ok(leitura.includes('listar_funcionarios'));
  assert.ok(!leitura.includes('lancar_na_folha') && !leitura.includes('cadastrar_funcionario'));
  assert.ok(tudo.includes('lancar_na_folha') && tudo.includes('fechar_folha_do_mes'));
  for (const proibida of ['excluir', 'apagar', 'reabrir', 'senha', 'copia', 'backup', 'pix']) {
    assert.ok(!tudo.some((n) => n.includes(proibida)), `nenhuma ferramenta de ${proibida}`);
  }

  const negada = await ferramenta(chaveLeitura, 'cadastrar_funcionario', { empresa_id: 1, folha: 1, nome: 'X', salario: 1 });
  assert.equal(negada.erroRpc.code, -32602, 'chave de leitura não lança');
});

test('lançar na folha, PIX escondido e PIX intocável pelo assistente', async () => {
  const [empresa] = (await ferramenta(chaveLeitura, 'listar_empresas')).dados;

  const comPix = await ferramenta(chaveLancamentos, 'cadastrar_funcionario', { empresa_id: empresa.id, folha: 1, nome: 'Ana', salario: 2200, pix_chave: 'x@y.com' });
  assert.ok(comPix.isError && /pix_chave/.test(comPix.texto), 'não aceita PIX');
  const extra = await ferramenta(chaveLancamentos, 'lancar_na_folha', { lancamento_id: 1, faltas: 1, sql: 'DROP TABLE x' });
  assert.ok(extra.isError && /sql/.test(extra.texto), 'argumento a mais é recusado');

  const cad = await ferramenta(chaveLancamentos, 'cadastrar_funcionario', { empresa_id: empresa.id, folha: 1, nome: 'Ana', salario: 2200 });
  assert.equal(cad.isError, false);
  const fid = cad.dados.funcionario.id;

  // Uma pessoa preenche o PIX na tela.
  const atual = (await tela('GET', `/funcionarios/${fid}`)).dados;
  await tela('PUT', `/funcionarios/${fid}`, { ...atual, pix_tipo: 'email', pix_chave: 'ana@exemplo.com', pix_titular: 'Ana', pix_banco: 'Banco' });

  const lista = (await ferramenta(chaveLeitura, 'listar_funcionarios', { empresa_id: empresa.id, busca: 'ana' })).dados;
  assert.equal(lista.length, 1);
  assert.equal(lista[0].pix_chave, '(oculto)');

  const alt = await ferramenta(chaveLancamentos, 'alterar_funcionario', { funcionario_id: fid, salario: 2500 });
  assert.deepEqual(alt.dados.mudou, { salario: { antes: 2200, depois: 2500 } });
  const depois = (await tela('GET', `/funcionarios/${fid}`)).dados;
  assert.equal(depois.pix_chave, 'ana@exemplo.com', 'alterar o salário não mexe no PIX');

  const folha = (await ferramenta(chaveLancamentos, 'abrir_folha_do_mes', { empresa_id: empresa.id, folha: 1, ano: 2026, mes: 10 })).dados;
  const linha = folha.lancamentos.find((l) => l.funcionario_id === fid);
  const lanc = await ferramenta(chaveLancamentos, 'lancar_na_folha', { lancamento_id: linha.lancamento_id, faltas: 1 });
  assert.equal(lanc.dados.lancamento.faltas, 1);
  assert.ok(lanc.dados.lancamento.liquido < linha.liquido);

  const fora = await ferramenta(chaveLancamentos, 'lancar_na_folha', { lancamento_id: linha.lancamento_id, faltas: -3 });
  assert.ok(fora.isError, 'valor fora do limite é recusado');
});

test('pedido de outro site é recusado; registro guarda o que foi feito; chave revogada para de funcionar', async () => {
  assert.equal((await rpc(chaveLeitura, 'tools/list', undefined, { origin: 'https://site-malicioso.example' })).status, 403);

  const { dados } = await tela('GET', '/assistente');
  assert.ok(dados.registro.some((r) => r.ferramenta === 'lancar_na_folha' && r.ok));
  assert.ok(dados.registro.some((r) => r.ferramenta === 'cadastrar_funcionario' && !r.ok));
  assert.ok(dados.chaves.every((c) => c.ultimo_uso));

  const id = dados.chaves.find((c) => c.nome === 'Só leitura').id;
  assert.equal((await tela('POST', `/assistente/chaves/${id}/revogar`)).status, 200);
  assert.equal((await rpc(chaveLeitura, 'tools/list')).status, 401);
  assert.equal((await rpc(chaveLancamentos, 'tools/list')).status, 200);
});

test('todas as ferramentas rodam sem erro', async () => {
  const k = chaveLancamentos;
  const ok = async (nome, args) => {
    const r = await ferramenta(k, nome, args);
    assert.ok(!r.erroRpc && !r.isError, `${nome}: ${r.texto || JSON.stringify(r.erroRpc)}`);
    return r.dados;
  };
  const [empresa] = await ok('listar_empresas');
  await ok('ver_empresa', { empresa_id: empresa.id });
  const [ana] = await ok('listar_funcionarios', { empresa_id: empresa.id, folha: 1 });
  await ok('ver_funcionario', { funcionario_id: ana.id });
  const vale = await ok('lancar_vale', { funcionario_id: ana.id, valor_total: 300, num_parcelas: 3, descontar_a_partir_de: '2026-11' });
  assert.equal(vale.vale.valor_parcela, 100);
  assert.equal((await ok('listar_vales', { empresa_id: empresa.id })).length, 1);
  const [situacao] = await ok('situacao_do_mes', { empresa_id: empresa.id, ano: 2026, mes: 11 });
  assert.equal(situacao.folha_do_mes, 'ainda não aberta');
  const folha = await ok('abrir_folha_do_mes', { empresa_id: empresa.id, folha: 1, ano: 2026, mes: 11 });
  await ok('incluir_na_folha', { folha_mensal_id: folha.folha_mensal_id });
  await ok('espelho_de_ponto', { empresa_id: empresa.id, folha: 1, ano: 2026, mes: 11 });
  await ok('passar_ponto_para_folha', { folha_mensal_id: folha.folha_mensal_id });
  const detalhe = await ok('ver_folha_do_mes', { folha_mensal_id: folha.folha_mensal_id, detalhado: true });
  assert.ok(detalhe.lancamentos[0].descontos_calculados.some((d) => d.valor === 100), 'parcela do vale entra na folha');
  const fechada = await ok('fechar_folha_do_mes', { folha_mensal_id: folha.folha_mensal_id });
  assert.equal(fechada.situacao, 'fechada');
  assert.ok((await ok('historico_de_folhas', { empresa_id: empresa.id })).some((h) => h.situacao === 'fechada'));
  const depois = await ferramenta(k, 'lancar_na_folha', { lancamento_id: detalhe.lancamentos[0].lancamento_id, faltas: 2 });
  assert.ok(depois.isError && /fechada/.test(depois.texto), 'folha fechada não aceita lançamento');
});

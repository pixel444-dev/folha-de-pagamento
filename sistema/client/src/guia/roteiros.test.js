import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GRUPOS_GUIA, ROTEIROS, roteirosDaTela, telaDoEndereco } from './roteiros.js';

// Todos os data-guia escritos nas telas (data-guia="x" ou data-guia={... 'x' ...}).
const PASTA = fileURLToPath(new URL('..', import.meta.url));
function telas(pasta) {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? telas(join(pasta, e.name)) : e.name.endsWith('.jsx') ? [join(pasta, e.name)] : []);
}
const MARCADOS = new Set(telas(PASTA).flatMap((arquivo) =>
  [...readFileSync(arquivo, 'utf8').matchAll(/data-guia=(?:"([^"]+)"|\{[^}]*?'([^']+)')/g)].map((m) => m[1] || m[2])));

const TELAS = ['inicio', 'copias', 'folha', 'ponto', 'funcionarios', 'vales', 'historico', 'regras', 'configuracoes'];

test('cada passo aponta para um lugar marcado com data-guia nas telas', () => {
  for (const r of ROTEIROS) {
    r.passos.forEach((p, i) => {
      for (const campo of ['alvo', 'abrir']) {
        if (p[campo]) assert.ok(MARCADOS.has(p[campo]), `${r.id}, passo ${i + 1}: nenhuma tela tem data-guia="${p[campo]}"`);
      }
    });
  }
});

test('roteiros completos e coerentes', () => {
  const ids = ROTEIROS.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'id de roteiro repetido');
  for (const r of ROTEIROS) {
    assert.ok(GRUPOS_GUIA.some((g) => g.id === r.grupo), `${r.id}: grupo ${r.grupo} não existe`);
    assert.ok(r.titulo && r.resumo && r.passos.length, `${r.id}: falta título, resumo ou passos`);
    assert.ok(r.telas.every((t) => TELAS.includes(t)), `${r.id}: tela desconhecida`);
    assert.ok(r.passos[0].rota, `${r.id}: o primeiro passo precisa dizer a tela (rota)`);
    r.passos.forEach((p, i) => {
      const onde = `${r.id}, passo ${i + 1}`;
      assert.ok(p.titulo && p.texto, `${onde}: falta título ou texto`);
      for (const t of [p.texto, p.seFaltar].filter(Boolean)) assert.equal(t.split('**').length % 2, 1, `${onde}: ** de negrito sem par`);
      if (p.rota) assert.match(p.rota, /^\/(empresa\/:empresa\/[a-z]+|copias)?$/, `${onde}: rota inválida`);
      if (p.lado) assert.ok(['baixo', 'cima', 'direita', 'esquerda'].includes(p.lado), `${onde}: lado inválido`);
      if (p.gaveta) assert.ok(r.passos.slice(0, i + 1).some((x) => x.abrir), `${onde}: painel lateral sem passo que o abra`);
      if (p.obrigatorio) assert.ok(p.alvo && p.seFaltar, `${onde}: passo obrigatório precisa de alvo e seFaltar`);
      if (p.sugerir) assert.ok(ids.includes(p.sugerir), `${onde}: roteiro sugerido não existe`);
    });
  }
  for (const t of TELAS) assert.ok(roteirosDaTela(t).length, `a tela ${t} não tem guia`);
});

test('telaDoEndereco reconhece cada tela pelo endereço', () => {
  assert.equal(telaDoEndereco('/'), 'inicio');
  assert.equal(telaDoEndereco('/copias'), 'copias');
  assert.equal(telaDoEndereco('/empresa/loja-centro/folha'), 'folha');
  assert.equal(telaDoEndereco('/empresa/loja-centro/vales'), 'vales');
  assert.equal(telaDoEndereco('/empresa/loja-centro'), null);
  assert.equal(telaDoEndereco('/imprimir'), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { escolherMes, VALIDADE_MS } from './mesEscolhido.js';

const agora = new Date(2026, 10, 16, 10, 0); // 16/11/2026
const p = (s = '') => new URLSearchParams(s);
const folhas = [1, 2];

test('sem endereço e sem lembrança: mês atual e primeira folha', () => {
  assert.deepEqual(escolherMes({ params: p(), guardado: null, numerosFolhas: folhas, agora }), { ano: 2026, mes: 11, folha: 1 });
});

test('volta para o mês e a folha lembrados', () => {
  const guardado = { ano: 2026, mes: 10, folha: 2, em: agora.getTime() - 60 * 60 * 1000 };
  assert.deepEqual(escolherMes({ params: p(), guardado, numerosFolhas: folhas, agora }), { ano: 2026, mes: 10, folha: 2 });
});

test('o endereço vale mais que a lembrança', () => {
  const guardado = { ano: 2026, mes: 10, folha: 2, em: agora.getTime() };
  assert.deepEqual(escolherMes({ params: p('ano=2026&mes=9&folha=1'), guardado, numerosFolhas: folhas, agora }), { ano: 2026, mes: 9, folha: 1 });
});

test('lembrança antiga é esquecida', () => {
  const guardado = { ano: 2026, mes: 10, folha: 2, em: agora.getTime() - VALIDADE_MS - 1 };
  assert.deepEqual(escolherMes({ params: p(), guardado, numerosFolhas: folhas, agora }), { ano: 2026, mes: 11, folha: 1 });
});

test('folha que não existe mais e dados estragados são ignorados', () => {
  const guardado = { ano: 'x', mes: 13, folha: 3, em: agora.getTime() };
  assert.deepEqual(escolherMes({ params: p('mes=99&folha=7'), guardado, numerosFolhas: folhas, agora }), { ano: 2026, mes: 11, folha: 1 });
});

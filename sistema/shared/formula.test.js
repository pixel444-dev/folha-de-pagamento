// Testes das fórmulas das regras (formula.js).
// Rodar com: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avaliarFormula, compilarFormula, dadosDaFormula, paraChaves, paraNomes } from './formula.js';

const dados = [
  { chave: 'faltas', rotulo: 'Faltas' },
  { chave: 'salario', rotulo: 'Salário' },
  { chave: 'horas_atraso', rotulo: 'Horas de atraso' },
  { chave: 'campo:3', rotulo: 'Peças produzidas' },
  { chave: 'regra:7', rotulo: 'Regra: Prêmio assiduidade' },
];
const valores = { faltas: 1, salario: 1500, horas_atraso: 0.5, 'campo:3': 340, 'regra:7': 100 };

const conta = (texto, v = valores) => {
  const f = compilarFormula(texto, dados);
  assert.equal(f.erro, undefined, `${texto}: ${f.erro}`);
  return avaliarFormula(f.ast, v);
};
const erro = (texto) => compilarFormula(texto, dados).erro;

test('contas com precedência, parênteses, vírgula decimal e porcentagem', () => {
  assert.equal(conta('1 + 2 * 3'), 7);
  assert.equal(conta('(1 + 2) * 3'), 9);
  assert.equal(conta('10 - 2 - 3'), 5);
  assert.equal(conta('2 ^ 3 ^ 2'), 512);
  assert.equal(conta('-2 + 5'), 3);
  assert.equal(conta('1,5 * 2'), 3);
  assert.equal(conta('MAX(140000 - 100000; 0) * 1%'), 400);
  assert.equal(conta('[Salário] * 10%'), 150);
  assert.equal(conta('200 × 2 ÷ 4 − 1'), 99);
  assert.equal(conta('10 / 0'), 0);
});

test('dados pelo nome (sem diferença de acento e maiúsculas) ou pela chave', () => {
  assert.equal(conta('[Peças produzidas] * 0,5'), 170);
  assert.equal(conta('[pecas   PRODUZIDAS] * 0,5'), 170);
  assert.equal(conta('[campo:3] * 0,5'), 170);
  assert.equal(conta('[Regra: Prêmio assiduidade] / 2'), 50);
  assert.equal(conta('[Faltas]', {}), 0);
});

test('SE, E, OU, NÃO, MIN, MAX, ARRED, TRUNCAR e ABS', () => {
  assert.equal(conta('SE([Faltas] = 0; 150; 50)'), 50);
  assert.equal(conta('SE([Faltas] = 0; 150)'), 0);
  assert.equal(conta('se([faltas] <= 1; 150; 0)'), 150);
  assert.equal(conta('SE(E([Faltas] = 0; [Horas de atraso] <= 1); 100; 0)'), 0);
  assert.equal(conta('SE(OU([Faltas] = 0; [Horas de atraso] <= 1); 100; 0)'), 100);
  assert.equal(conta('NÃO([Faltas] = 0)'), 1);
  assert.equal(conta('nao([Faltas] <> 0)'), 0);
  assert.equal(conta('MIN([Salário] * 30%; 300)'), 300);
  assert.equal(conta('MAX([Peças produzidas] - 400; 0)'), 0);
  assert.equal(conta('ARRED(10 / 3)'), 3.33);
  assert.equal(conta('ARRED(2,345; 2)'), 2.35);
  assert.equal(conta('ARRED(1234; -2)'), 1234);
  assert.equal(conta('TRUNCAR(9,99)'), 9);
  assert.equal(conta('TRUNCAR(9,999; 2)'), 9.99);
  assert.equal(conta('ABS(5 - 8)'), 3);
  assert.equal(conta('[Faltas] ≥ 1'), 1);
  assert.equal(conta('[Faltas] ≠ 1'), 0);
});

test('erros explicados para quem não programa', () => {
  assert.match(erro(''), /Escreva a fórmula/);
  assert.match(erro('[Salário * 2'), /fechar o colchete/);
  assert.match(erro('[Bônus] * 2'), /Não existe o dado \[Bônus\]/);
  assert.match(erro('Salário * 2'), /entre colchetes: \[Salário\]/);
  assert.match(erro('SOMA(1; 2)'), /Não existe a função SOMA/);
  assert.match(erro('MIN(1, 2)'), /Use ";"/);
  // ponto num número: no Brasil 100.000 é cem mil; ler como 100 pagaria errado sem ninguém perceber
  assert.match(erro('1.500,00 * 2'), /Não use ponto nos números/);
  assert.match(erro('MAX([Faltas] - 100.000; 0)'), /escreva os milhares juntos \(100000\)/);
  assert.match(erro('1.5 * 2'), /vírgula para os centavos/);
  assert.match(erro('2 * .5'), /Não use ponto/);
  assert.match(erro('SE([Faltas] = 0; 1; 2; 3)'), /SE\(condição; valor se sim; valor se não\)/);
  assert.match(erro('(1 + 2'), /fechar um parêntese/);
  assert.match(erro('1 + 2)'), /Sobrou um parêntese/);
  assert.match(erro('[Faltas] 2'), /Falta uma conta/);
  assert.match(erro('2 *'), /termina antes da hora/);
  assert.match(erro('2 $ 3'), /Não entendi o símbolo "\$"/);
  assert.match(erro('x'.repeat(501)), /no máximo 500/);
  assert.match(erro('('.repeat(60) + '1' + ')'.repeat(60)), /parênteses demais/);
});

test('guarda pela chave e mostra pelo nome (renomear um campo não quebra a fórmula)', () => {
  const guardada = paraChaves('SE([peças produzidas] >= 300;  [Regra: Prêmio assiduidade]; 0)', dados);
  assert.equal(guardada, 'SE([campo:3] >= 300;  [regra:7]; 0)');
  assert.deepEqual([...dadosDaFormula(guardada)], ['campo:3', 'regra:7']);
  const renomeado = dados.map((d) => (d.chave === 'campo:3' ? { ...d, rotulo: 'Peças boas' } : d));
  assert.equal(paraNomes(guardada, renomeado), 'SE([Peças boas] >= 300;  [Regra: Prêmio assiduidade]; 0)');
  assert.equal(paraChaves('[Bônus] * 2', dados), '[Bônus] * 2');
});

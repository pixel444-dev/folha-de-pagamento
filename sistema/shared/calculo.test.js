// Testes das regras de cálculo, usando casos tirados das planilhas originais.
// Rodar com: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularLancamento, parcelasDoMes, somarResultados, valorDoDia } from './calculo.js';
import { parseHoras, parseNum, fmtHoras, porExtenso } from './formato.js';

const sitio = { divisor_dias: 22, arredondar_dia: true, horas_por_dia: 9, valor_hora_extra: 7, sabado_modo: 'diaria', sabado_valor: 0 };
const empresaTeste = { divisor_dias: 22, arredondar_dia: true, horas_por_dia: 8, valor_hora_extra: 7, sabado_modo: 'fixo', sabado_valor: 20 };
const bonsSitio = [
  { id: 1, nome: 'Vale almoço', valor: 100, regra: 'atribuida', ativo: true },
  { id: 2, nome: 'Polivalência', valor: 70, regra: 'atribuida', ativo: true },
  { id: 3, nome: 'Zero falta', valor: 70, regra: 'zero_falta', ativo: true },
];

test('valor do dia usa o quociente inteiro de salário ÷ 22', () => {
  assert.equal(valorDoDia(900, sitio), 40);
  assert.equal(valorDoDia(1600, sitio), 72);
  assert.equal(valorDoDia(1518, sitio), 69);
  assert.equal(valorDoDia(1100, sitio), 50);
  assert.ok(Math.abs(valorDoDia(1500, { ...sitio, arredondar_dia: false }) - 68.1818) < 0.001);
});

test('Vendedora (Sítio Alegre): comissão, meta, zero falta, meio sábado, 1h30 extra e compra', () => {
  const r = calcularLancamento(
    { oficina: sitio, bonificacoes: bonsSitio, funcionario: { salario: 1500, bonificacoes: [] }, ano: 2026, mes: 9 },
    { faltas: 0, sabados: 0.5, horas_extras: 1.5, comissao: 1805.75, acrescimos: [{ descricao: 'Meta', valor: 200 }], descontos: [{ tipo: 'compra', descricao: 'Comprinha', valor: 74 }] },
  );
  // Planilha: 1500 + 1805,75 + 200 + 70 + 34 + 10,50 − 74 = 3546,25
  assert.equal(r.total_proventos, 3620.25);
  assert.equal(r.total_descontos, 74);
  assert.equal(r.liquido, 3546.25);
  assert.equal(r.zero_falta, true);
  assert.equal(r.resumo.compras, 74);
});

test('Sítio Alegre: almoço + polivalência personalizada de 100, sem faltas', () => {
  const r = calcularLancamento(
    { oficina: sitio, bonificacoes: bonsSitio, funcionario: { salario: 1500, bonificacoes: [{ bonificacao_id: 1, valor: null }, { bonificacao_id: 2, valor: 100 }] }, ano: 2026, mes: 9 },
    { faltas: 0 },
  );
  // Planilha: 1500 + 100 + 100 + 70 = 1770
  assert.equal(r.liquido, 1770);
  assert.deepEqual(r.resumo.bonificacoes, { 'Vale almoço': 100, 'Polivalência': 100, 'Zero falta': 70 });
});

test('quem faltou perde o zero falta, a não ser que o gestor marque manualmente', () => {
  const ctx = { oficina: sitio, bonificacoes: bonsSitio, funcionario: { salario: 1100, bonificacoes: [{ bonificacao_id: 1 }] }, ano: 2026, mes: 9 };
  // 1100 + 100 almoço − 1 falta (50) = 1150
  const r = calcularLancamento(ctx, { faltas: 1 });
  assert.equal(r.zero_falta, false);
  assert.equal(r.resumo.faltas, 50);
  assert.equal(r.liquido, 1150);
  assert.equal(calcularLancamento(ctx, { faltas: 1, zero_falta: 'sim' }).liquido, 1220);
  assert.equal(calcularLancamento(ctx, { faltas: 0, zero_falta: 'nao' }).liquido, 1200);
});

test('Moraújo: 4 faltas = 72 × 4 = 288', () => {
  const r = calcularLancamento({ oficina: empresaTeste, bonificacoes: [], funcionario: { salario: 1600 }, ano: 2026, mes: 10 }, { faltas: 4 });
  assert.equal(r.resumo.faltas, 288);
  assert.equal(r.liquido, 1312);
});

test('Moraújo: sábado com valor fixo e hora extra a 7 reais', () => {
  // 900 + sábado 20 + 3h30 extra (24,50) − 1 falta (40)
  const r = calcularLancamento({ oficina: empresaTeste, bonificacoes: [], funcionario: { salario: 900 }, ano: 2026, mes: 10 }, { faltas: 1, sabados: 1, horas_extras: 3.5 });
  assert.equal(r.resumo.sabado, 20);
  assert.equal(r.resumo.hora_extra, 24.5);
  assert.equal(r.liquido, 904.5);
});

test('Baía: hora extra a 4 reais e zero falta de 50', () => {
  const baia = { ...empresaTeste, valor_hora_extra: 4, sabado_modo: 'diaria' };
  const bons = [{ id: 9, nome: 'Zero falta', valor: 50, regra: 'zero_falta', ativo: true }];
  // 750 + 50 + 4h extra (16) = 816
  const r = calcularLancamento({ oficina: baia, bonificacoes: bons, funcionario: { salario: 750 }, ano: 2026, mes: 10 }, { horas_extras: 4 });
  assert.equal(r.liquido, 816);
});

test('atrasos usam o valor da hora (valor do dia ÷ horas por dia)', () => {
  // 900 → dia 40 → hora 5 (8h/dia). 2 horas pendentes = 10 (igual à planilha da Moraújo)
  const r = calcularLancamento({ oficina: empresaTeste, bonificacoes: [], funcionario: { salario: 900 }, ano: 2026, mes: 10 }, { horas_atraso: 2 });
  assert.equal(r.resumo.atrasos, 10);
});

test('vale só começa a descontar no mês de início', () => {
  const vale = [{ id: 7, tipo: 'vale', valor_total: 4000, num_parcelas: 8, inicio: '2026-03', descontado: 0, vezes: 0 }];
  assert.equal(parcelasDoMes(vale, 2026, 2).length, 0);
  assert.deepEqual(parcelasDoMes(vale, 2026, 3)[0], { tipo: 'vale', descricao: 'Vale (1/8)', valor: 500, parcelamento_id: 7 });
});

test('vale segue o saldo: 8ª parcela, depois quitado', () => {
  const base = { id: 7, tipo: 'vale', valor_total: 4000, num_parcelas: 8, inicio: '2026-03' };
  assert.equal(parcelasDoMes([{ ...base, descontado: 3500, vezes: 7 }], 2026, 10)[0].descricao, 'Vale (8/8)');
  assert.equal(parcelasDoMes([{ ...base, descontado: 4000, vezes: 8 }], 2026, 11).length, 0);
});

test('se uma folha pulou o vale, a parcela passa para a próxima (não se perde)', () => {
  // 3 meses depois do início, mas só 1 parcela foi descontada: continua na 2ª
  const v = { id: 1, tipo: 'vale', valor_total: 300, num_parcelas: 3, inicio: '2026-07', descontado: 100, vezes: 1 };
  assert.deepEqual(parcelasDoMes([v], 2026, 10).map((p) => [p.descricao, p.valor]), [['Vale (2/3)', 100]]);
});

test('última parcela leva o resto e nunca desconta mais que o saldo', () => {
  const v = { id: 2, tipo: 'vale', valor_total: 500, num_parcelas: 3, inicio: '2026-10' };
  assert.equal(parcelasDoMes([{ ...v, descontado: 0, vezes: 0 }], 2026, 10)[0].valor, 166.67);
  assert.equal(parcelasDoMes([{ ...v, descontado: 333.34, vezes: 2 }], 2026, 12)[0].valor, 166.66);
  // saldo menor que a parcela (ex.: valor do vale foi diminuído)
  assert.equal(parcelasDoMes([{ ...v, valor_total: 200, descontado: 166.67, vezes: 1 }], 2026, 11)[0].valor, 33.33);
});

test('vale sem descrição aparece no card com a data', () => {
  const v = { id: 3, tipo: 'vale', data: '2026-10-15', valor_total: 200, num_parcelas: 1, inicio: '2026-10' };
  assert.equal(parcelasDoMes([v], 2026, 10)[0].descricao, 'Vale 15/10');
});

test('vale entra no cálculo da folha e pode ser pulado no mês', () => {
  const vales = [{ id: 7, tipo: 'vale', valor_total: 500, num_parcelas: 1, inicio: '2026-10' }];
  const ctx = { oficina: sitio, bonificacoes: [], funcionario: { salario: 1600 }, parcelamentos: vales, ano: 2026, mes: 10 };
  const r = calcularLancamento(ctx, {});
  assert.equal(r.resumo.vales, 500);
  assert.equal(r.descontos[0].parcelamento_id, 7);
  assert.equal(calcularLancamento(ctx, { pular_parcelas: true }).resumo.vales, 0);
});

test('valor por extenso (recibo de vale)', () => {
  assert.equal(porExtenso(500), 'quinhentos reais');
  assert.equal(porExtenso(100), 'cem reais');
  assert.equal(porExtenso(101), 'cento e um reais');
  assert.equal(porExtenso(1), 'um real');
  assert.equal(porExtenso(1200), 'mil e duzentos reais');
  assert.equal(porExtenso(1250.5), 'mil duzentos e cinquenta reais e cinquenta centavos');
  assert.equal(porExtenso(2021), 'dois mil e vinte e um reais');
  assert.equal(porExtenso(166.67), 'cento e sessenta e seis reais e sessenta e sete centavos');
  assert.equal(porExtenso(0.01), 'um centavo');
  assert.equal(porExtenso(15000), 'quinze mil reais');
});

test('soma dos resultados da folha', () => {
  const ctx = { oficina: empresaTeste, bonificacoes: [], funcionario: { salario: 900 }, ano: 2026, mes: 10 };
  const t = somarResultados([calcularLancamento(ctx, { faltas: 1 }), calcularLancamento(ctx, { faltas: 2 })]);
  assert.equal(t.funcionarios, 2);
  assert.equal(t.salario, 1800);
  assert.equal(t.faltas, 120);
  assert.equal(t.liquido, 1680);
});

test('leitura de números e horas', () => {
  assert.equal(parseNum('1.500,50'), 1500.5);
  assert.equal(parseNum('1,5'), 1.5);
  assert.equal(parseNum('2.5'), 2.5);
  assert.equal(parseNum(''), 0);
  assert.equal(parseNum('abc'), null);
  assert.equal(parseHoras('1:30'), 1.5);
  assert.equal(parseHoras('4h10'), 4 + 10 / 60);
  assert.equal(parseHoras('45min'), 0.75);
  assert.equal(parseHoras('2,5'), 2.5);
  assert.equal(fmtHoras(1.5), '1h30');
  assert.equal(fmtHoras(67), '67h');
  assert.equal(fmtHoras(0.5), '30min');
});

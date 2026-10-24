// Testes das regras de pagamento montadas pela empresa (regras.js).
// Rodar com: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularLancamento, mesesDeCasa, somarResultados, somarTotais } from './calculo.js';
import { brl } from './formato.js';
import { avaliarRegra, definicaoDaRegra, descreverRegra, limparDefinicao, MODELOS, regraLegada, variaveisDa, variaveisUsadas } from './regras.js';

const sitio = { divisor_dias: 22, arredondar_dia: true, horas_por_dia: 9, valor_hora_extra: 7, sabado_modo: 'diaria', sabado_valor: 0 };
const empresaTeste = { divisor_dias: 22, arredondar_dia: true, horas_por_dia: 8, valor_hora_extra: 7, sabado_modo: 'fixo', sabado_valor: 20 };
const bonsSitio = [
  { id: 1, nome: 'Vale almoço', valor: 100, regra: 'atribuida', ativo: true },
  { id: 2, nome: 'Polivalência', valor: 70, regra: 'atribuida', ativo: true },
  { id: 3, nome: 'Zero falta', valor: 70, regra: 'zero_falta', ativo: true },
];

const regra = (id, nome, valor, definicao, extra = {}) => ({ id, nome, valor, ativo: true, tipo: 'provento', definicao, ...extra });
const calc = (oficina, bonificacoes, funcionario, l = {}, mes = 10) => calcularLancamento({ oficina, bonificacoes, funcionario, ano: 2026, mes }, l);

test('bonificações antigas viram regras sem mudar nenhum valor', () => {
  const convertidas = bonsSitio.map((b) => {
    const definicao = definicaoDaRegra(b);
    return { ...b, definicao, regra: regraLegada(definicao) };
  });
  assert.deepEqual(convertidas.map((b) => b.regra), ['atribuida', 'atribuida', 'zero_falta']);
  const casos = [
    [{ salario: 1500, bonificacoes: [] }, { faltas: 0, sabados: 0.5, horas_extras: 1.5, comissao: 1805.75 }],
    [{ salario: 1500, bonificacoes: [{ bonificacao_id: 1, valor: null }, { bonificacao_id: 2, valor: 100 }] }, { faltas: 0 }],
    [{ salario: 1100, bonificacoes: [{ bonificacao_id: 1 }] }, { faltas: 1 }],
    [{ salario: 1100, bonificacoes: [{ bonificacao_id: 1 }] }, { faltas: 1, zero_falta: 'sim' }],
    [{ salario: 1100, bonificacoes: [] }, { faltas: 0, zero_falta: 'nao' }],
  ];
  for (const [funcionario, l] of casos) {
    assert.deepEqual(calc(sitio, convertidas, funcionario, l, 9), calc(sitio, bonsSitio, funcionario, l, 9));
  }
});

test('ajuste manual na folha: regras_manuais vale mais que o zero falta antigo (null = automático)', () => {
  const f = { salario: 1100, bonificacoes: [] };
  assert.equal(calc(sitio, bonsSitio, f, { faltas: 1, regras_manuais: { 3: 'sim' } }).liquido, 1120);
  assert.equal(calc(sitio, bonsSitio, f, { faltas: 0, regras_manuais: { 3: 'nao' } }).liquido, 1100);
  // estava "sim" na coluna antiga, mas o gestor voltou para automático
  const r = calc(sitio, bonsSitio, f, { faltas: 1, zero_falta: 'sim', regras_manuais: { 3: null } });
  assert.equal(r.liquido, 1050);
  assert.deepEqual(r.regras[3], { automatico: false, aplicada: false, manual: null });
});

test('prêmio assiduidade com duas condições (E) e com "pelo menos uma" (OU)', () => {
  const def = { quem: 'todos', condicoes: [{ variavel: 'faltas', op: 'igual', valor: 0 }, { variavel: 'horas_atraso', op: 'ate', valor: 2 }] };
  const e = [regra(1, 'Assiduidade', 100, def)];
  const ou = [regra(1, 'Assiduidade', 100, { ...def, juntar: 'alguma' })];
  const f = { salario: 1000 };
  assert.equal(calc(empresaTeste, e, f, { faltas: 0, horas_atraso: 2 }).resumo.bonificacoes.Assiduidade, 100);
  assert.equal(calc(empresaTeste, e, f, { faltas: 0, horas_atraso: 2.5 }).resumo.bonificacoes.Assiduidade, undefined);
  assert.equal(calc(empresaTeste, ou, f, { faltas: 1, horas_atraso: 1 }).resumo.bonificacoes.Assiduidade, 100);
  assert.equal(calc(empresaTeste, ou, f, { faltas: 1, horas_atraso: 3 }).resumo.bonificacoes.Assiduidade, undefined);
});

test('só algumas funções (sem diferença de maiúsculas e acentos)', () => {
  const bons = [regra(1, 'Prêmio vendas', 80, { quem: 'funcoes', funcoes: ['Vendedor', 'Gerente'] })];
  assert.equal(calc(empresaTeste, bons, { salario: 1000, funcao: 'VENDEDOR ' }).liquido, 1080);
  assert.equal(calc(empresaTeste, bons, { salario: 1000, funcao: 'Auxiliar' }).liquido, 1000);
  assert.equal(calc(empresaTeste, bons, { salario: 1000 }).liquido, 1000);
});

test('porcentagem do salário e valor próprio de quem é marcado no cadastro', () => {
  const bons = [regra(1, 'Insalubridade', 10, { quem: 'marcados', calculo: { modo: 'percentual', base: 'salario' } })];
  const r = calc(empresaTeste, bons, { salario: 1518, bonificacoes: [{ bonificacao_id: 1, valor: null }] });
  assert.equal(r.resumo.bonificacoes.Insalubridade, 151.8);
  assert.equal(r.proventos[1].detalhe, '10%');
  // valor próprio = 20%
  assert.equal(calc(empresaTeste, bons, { salario: 1000, bonificacoes: [{ bonificacao_id: 1, valor: 20 }] }).resumo.bonificacoes.Insalubridade, 200);
  // não marcado: não recebe
  assert.equal(calc(empresaTeste, bons, { salario: 1000, bonificacoes: [] }).liquido, 1000);
});

test('hora extra 50%: 1,5 × o valor da hora por hora extra', () => {
  // 900 → dia 40 → hora 5 (8h/dia) → hora extra 7,50. 3h30 = 26,25
  const bons = [regra(1, 'Hora extra 50%', 1.5, { calculo: { modo: 'por_quantidade', quantidade: 'horas_extras', unidade: 'valor_hora' } })];
  const r = calc({ ...empresaTeste, valor_hora_extra: 0 }, bons, { salario: 900 }, { horas_extras: 3.5 });
  assert.equal(r.resumo.bonificacoes['Hora extra 50%'], 26.25);
  assert.equal(r.resumo.hora_extra, 0);
  assert.equal(r.proventos.find((p) => p.chave === 'bon:1').detalhe, '3h30');
});

test('campo criado pela empresa: R$ 0,50 por peça produzida e meta batida (sim/não)', () => {
  const oficina = { ...empresaTeste, campos: [{ id: 4, nome: 'Peças produzidas', tipo: 'numero' }, { id: 5, nome: 'Bateu a meta', tipo: 'sim_nao' }] };
  const bons = [
    regra(1, 'Produção', 0.5, { calculo: { modo: 'por_quantidade', quantidade: 'campo:4', unidade: 'reais' } }),
    regra(2, 'Meta', 200, { condicoes: [{ variavel: 'campo:5', op: 'igual', valor: 1 }] }),
  ];
  const r = calc(oficina, bons, { salario: 1000 }, { campos: { 4: 341, 5: 1 } });
  assert.deepEqual(r.resumo.bonificacoes, { 'Produção': 170.5, Meta: 200 });
  assert.equal(r.proventos.find((p) => p.chave === 'bon:1').detalhe, '341');
  assert.equal(calc(oficina, bons, { salario: 1000 }, { campos: { 4: 0, 5: 0 } }).liquido, 1000);
  assert.equal(calc(oficina, bons, { salario: 1000 }, {}).liquido, 1000);
});

test('tabela de faixas: adicional por anos de casa (usa a admissão)', () => {
  const bons = [regra(1, 'Tempo de casa', 0, MODELOS.find((m) => m.nome === 'Adicional por tempo de casa').definicao)];
  const pagar = (admissao) => calc(empresaTeste, bons, { salario: 1000, admissao }).resumo.bonificacoes['Tempo de casa'] || 0;
  assert.equal(pagar(null), 0);
  assert.equal(pagar('2026-01-10'), 0); // 9 meses
  assert.equal(pagar('2025-10-01'), 50); // 1 ano
  assert.equal(pagar('2024-10-31'), 50); // 2 anos
  assert.equal(pagar('2023-09-15'), 100); // 3 anos
  assert.equal(pagar('2010-01-01'), 150);
});

test('meses de casa contam até o fim do mês da folha', () => {
  assert.equal(mesesDeCasa('2025-10-20', 2026, 10), 12);
  assert.equal(mesesDeCasa('2025-10-20', 2026, 9), 11);
  assert.equal(mesesDeCasa('2026-11-01', 2026, 10), 0);
  assert.equal(mesesDeCasa('', 2026, 10), 0);
});

test('regra de desconto entra nos descontos, no resumo e nos totais', () => {
  const bons = [regra(1, 'Desconto por atraso', 50, { condicoes: [{ variavel: 'horas_atraso', op: 'maior', valor: 5 }] }, { tipo: 'desconto' })];
  const ctx = { oficina: empresaTeste, bonificacoes: bons, funcionario: { salario: 900 }, ano: 2026, mes: 10 };
  // 900 → hora 5. 6h de atraso = 30 + desconto 50
  const r = calcularLancamento(ctx, { horas_atraso: 6 });
  assert.deepEqual(r.descontos.map((d) => [d.rotulo, d.valor]), [['Atrasos/saídas', 30], ['Desconto por atraso', 50]]);
  assert.equal(r.liquido, 820);
  assert.deepEqual(r.resumo.descontos_regras, { 'Desconto por atraso': 50 });
  assert.equal(r.zero_falta, false);
  const t = somarResultados([r, r, calcularLancamento(ctx, { horas_atraso: 1 })]);
  assert.deepEqual(t.descontos_regras, { 'Desconto por atraso': 100 });
  assert.deepEqual(somarTotais([t, t]).descontos_regras, { 'Desconto por atraso': 200 });
  // totais guardados antes das regras (sem descontos_regras) continuam somando
  assert.equal(somarTotais([{ liquido: 10, bonificacoes: { A: 1 } }, t]).liquido, round(10 + t.liquido));
});

const round = (v) => Math.round(v * 100) / 100;

test('regra desativada não conta e ajuste manual não passa por cima de "quem recebe"', () => {
  const bons = [regra(1, 'Meta', 100, { quem: 'funcoes', funcoes: ['Vendedor'], condicoes: [{ variavel: 'faltas', op: 'igual', valor: 0 }] })];
  assert.equal(calc(empresaTeste, [{ ...bons[0], ativo: false }], { salario: 1000, funcao: 'Vendedor' }).liquido, 1000);
  const r = calc(empresaTeste, bons, { salario: 1000, funcao: 'Auxiliar' }, { regras_manuais: { 1: 'sim' } });
  assert.equal(r.liquido, 1000);
  assert.deepEqual(r.regras, {});
});

test('ao salvar, a definição é conferida e os erros explicados', () => {
  const chaves = variaveisDa([{ id: 4, nome: 'Peças', tipo: 'numero' }]);
  assert.throws(() => limparDefinicao({ condicoes: [{ variavel: 'campo:9', op: 'igual', valor: 1 }] }, chaves), /não existe/);
  assert.throws(() => limparDefinicao({ condicoes: [{ variavel: 'faltas', op: 'parecido', valor: 1 }] }, chaves), /incompleta/);
  assert.throws(() => limparDefinicao({ quem: 'funcoes', funcoes: [' '] }, chaves), /função/);
  assert.throws(() => limparDefinicao({ calculo: { modo: 'faixas', variavel: 'faltas', faixas: [{ ate: 1, valor: 1 }, { ate: 1, valor: 2 }] } }, chaves), /mesmo limite/);
  assert.throws(() => limparDefinicao({ calculo: { modo: 'faixas', variavel: 'faltas', faixas: [] } }, chaves), /pelo menos uma faixa/);
  const ok = limparDefinicao({ quem: 'todos', funcoes: ['x'], condicoes: [{ variavel: 'campo:4', op: 'minimo', valor: '10' }], calculo: { modo: 'faixas', variavel: 'faltas', faixas: [{ ate: null, valor: 5 }, { ate: 2, valor: 10 }] } }, chaves);
  assert.deepEqual(ok, {
    quem: 'todos',
    funcoes: [],
    juntar: 'todas',
    condicoes: [{ variavel: 'campo:4', op: 'minimo', valor: 10 }],
    calculo: { modo: 'faixas', variavel: 'faltas', tipo_faixa: 'fixo', faixas: [{ ate: 2, valor: 10 }, { ate: null, valor: 5 }] },
  });
  assert.deepEqual([...variaveisUsadas(ok)].sort(), ['campo:4', 'faltas']);
});

test('o código antigo continua entendendo o zero falta (coluna "regra")', () => {
  const zf = limparDefinicao({ quem: 'todos', condicoes: [{ variavel: 'faltas', op: 'igual', valor: 0 }] });
  assert.equal(regraLegada(zf), 'zero_falta');
  assert.equal(regraLegada(zf, 'desconto'), 'atribuida');
  assert.equal(regraLegada({ ...zf, condicoes: [...zf.condicoes, { variavel: 'horas_atraso', op: 'ate', valor: 1 }] }), 'atribuida');
});

test('explicação do teste da regra e frase da lista', () => {
  const b = regra(1, 'Assiduidade', 100, MODELOS[0].definicao);
  const a = avaliarRegra(b, { variaveis: { faltas: 1, horas_atraso: 0 } });
  assert.equal(a.aplicada, false);
  assert.deepEqual(a.falhas.map((c) => c.variavel), ['faltas']);
  assert.deepEqual(descreverRegra(b), { quem: 'Todos', quando: 'quando Faltas = 0 e Horas de atraso ≤ 2h', quanto: `soma ${brl(100)}` });
  assert.deepEqual(descreverRegra({ ...bonsSitio[0] }), { quem: 'Quem está marcado no cadastro', quando: 'sempre', quanto: `soma ${brl(100)}` });
  const he = regra(2, 'HE', 1.5, MODELOS.find((m) => m.nome === 'Hora extra 50%').definicao);
  assert.equal(descreverRegra(he).quanto, 'soma 1,5 × o valor da hora por horas extras');
});

test('todos os modelos de regra são válidos', () => {
  const chaves = variaveisDa([]);
  for (const m of MODELOS) assert.doesNotThrow(() => limparDefinicao(m.definicao, chaves), m.nome);
});

// ---------------------------------------------------------------- regras avançadas

const modelo = (nome, id = 1) => {
  const m = MODELOS.find((x) => x.nome === nome);
  return regra(id, m.nome, m.valor, m.definicao, { tipo: m.tipo });
};

test('INSS: tabela progressiva sobre o bruto do mês (proventos − faltas e atrasos), com teto', () => {
  const inss = [modelo('INSS (tabela progressiva)')];
  const desconto = (salario, l = {}) => calc({ ...empresaTeste, arredondar_dia: true }, inss, { salario }, l).resumo.descontos_regras['INSS (tabela progressiva)'];
  assert.equal(desconto(1000), 75);
  // 1518 × 7,5% + 1275,88 × 9% + 206,12 × 12% = 113,85 + 114,83 + 24,73
  assert.equal(desconto(3000), 253.41);
  // 1 falta: dia = 136 → bruto 2864
  assert.equal(desconto(3000, { faltas: 1 }), 237.09);
  // acima do teto (8.157,41) não desconta mais
  assert.equal(desconto(10000), 951.63);
  assert.equal(desconto(20000), 951.63);
});

test('faixas com porcentagem: comissão de 3% até R$ 5.000 e 5% acima', () => {
  const b = regra(1, 'Bônus vendas', 0, {
    calculo: { modo: 'faixas', variavel: 'comissao', tipo_faixa: 'percentual', faixas: [{ ate: 5000, valor: 3 }, { ate: null, valor: 5 }] },
  });
  assert.equal(calc(empresaTeste, [b], { salario: 1000 }, { comissao: 4000 }).resumo.bonificacoes['Bônus vendas'], 120);
  const r = calc(empresaTeste, [b], { salario: 1000 }, { comissao: 6000 });
  assert.equal(r.resumo.bonificacoes['Bônus vendas'], 300);
  assert.equal(r.proventos.find((p) => p.chave === 'bon:1').detalhe, '5%');
});

test('valor mínimo e máximo em qualquer regra', () => {
  const teto = regra(1, 'Bônus', 10, { calculo: { modo: 'percentual', base: 'salario', maximo: 120 } });
  assert.equal(calc(empresaTeste, [teto], { salario: 1500 }).resumo.bonificacoes.Bônus, 120);
  assert.equal(calc(empresaTeste, [teto], { salario: 1000 }).resumo.bonificacoes.Bônus, 100);
  const piso = regra(1, 'Produção', 0.5, { calculo: { modo: 'por_quantidade', quantidade: 'horas_extras', unidade: 'reais', minimo: 30 } });
  assert.equal(calc(empresaTeste, [piso], { salario: 1000 }, { horas_extras: 2 }).resumo.bonificacoes['Produção'], 30);
  assert.throws(() => limparDefinicao({ calculo: { modo: 'fixo', minimo: 50, maximo: 10 } }, variaveisDa([])), /mínimo não pode ser maior/);
});

test('fórmulas: prêmio que diminui com as faltas e benefício proporcional aos dias trabalhados', () => {
  const premio = [modelo('Prêmio que diminui com as faltas')];
  const pagar = (faltas) => calc(empresaTeste, premio, { salario: 1000 }, { faltas }).resumo.bonificacoes['Prêmio que diminui com as faltas'] || 0;
  assert.deepEqual([pagar(0), pagar(0.5), pagar(1), pagar(2)], [150, 75, 75, 0]);
  const proporcional = [modelo('Benefício proporcional aos dias trabalhados')];
  // 200 × (22 − 2) / 22
  assert.equal(calc(empresaTeste, proporcional, { salario: 1000 }, { faltas: 2 }).resumo.bonificacoes['Benefício proporcional aos dias trabalhados'], 181.82);
  // [Valor da regra] usa o valor próprio de quem é marcado no cadastro
  const marcada = regra(1, 'Cesta', 100, { quem: 'marcados', calculo: { modo: 'formula', formula: '[Valor da regra] * 2' } });
  assert.equal(calc(empresaTeste, [marcada], { salario: 1000, bonificacoes: [{ bonificacao_id: 1, valor: 80 }] }).resumo.bonificacoes.Cesta, 160);
  // fórmula com erro não paga nada (e o teste da tela mostra o erro)
  const errada = regra(1, 'X', 0, { calculo: { modo: 'formula', formula: '[Salário * 2' } });
  const a = calc(empresaTeste, [errada], { salario: 1000 }, {}).liquido;
  assert.equal(a, 1000);
});

test('regras usam os totais e o valor das regras de cima (a ordem da lista importa)', () => {
  const premio = regra(1, 'Prêmio', 100, {});
  const reflexo = regra(2, 'Reflexo', 0, { calculo: { modo: 'formula', formula: '[regra:1] * 10%' } });
  const contribuicao = regra(3, 'Contribuição', 1, { calculo: { modo: 'percentual', base: 'total_proventos' } }, { tipo: 'desconto' });
  const f = { salario: 1000 };
  const r = calc(empresaTeste, [premio, reflexo, contribuicao], f);
  assert.deepEqual(r.resumo.bonificacoes, { 'Prêmio': 100, Reflexo: 10 });
  assert.equal(r.resumo.descontos_regras['Contribuição'], 11.1); // 1% de 1.110
  // com a contribuição no topo, ela só vê o salário; o reflexo antes do prêmio vê 0
  const outra = calc(empresaTeste, [contribuicao, reflexo, premio], f);
  assert.equal(outra.resumo.descontos_regras['Contribuição'], 10);
  assert.equal(outra.resumo.bonificacoes.Reflexo, undefined);
  // regra de quem não é da função conta como 0 para as outras
  const soVendedor = regra(1, 'Prêmio', 100, { quem: 'funcoes', funcoes: ['Vendedor'] });
  assert.equal(calc(empresaTeste, [soVendedor, reflexo], { salario: 1000, funcao: 'Auxiliar' }).liquido, 1000);
});

test('valores da folha para as regras: horas extras, sábados, faltas, atrasos e acréscimos', () => {
  const dsr = regra(1, 'DSR', 0, { calculo: { modo: 'formula', formula: 'ARRED([Valor das horas extras] / 6)' } });
  // 4h extra × 7 = 28 → 28 / 6 = 4,67
  assert.equal(calc(empresaTeste, [dsr], { salario: 900 }, { horas_extras: 4 }).resumo.bonificacoes.DSR, 4.67);
  const base = regra(1, 'Base', 0, { calculo: { modo: 'formula', formula: '[Valor dos sábados] + [Acréscimos] - [Desconto das faltas] - [Desconto dos atrasos]' } });
  // sábado fixo 20 + acréscimo 50 − falta 40 − 2h de atraso 10
  assert.equal(calc(empresaTeste, [base], { salario: 900 }, { sabados: 1, faltas: 1, horas_atraso: 2, acrescimos: [{ valor: 50 }] }).resumo.bonificacoes.Base, 20);
});

test('campos do cadastro, mês da folha, dias trabalhados e "recebe comissão"', () => {
  const oficina = { ...empresaTeste, campos: [{ id: 9, nome: 'Filhos', tipo: 'numero', escopo: 'cadastro' }] };
  const familia = regra(1, 'Auxílio família', 50, { calculo: { modo: 'por_quantidade', quantidade: 'campo:9', unidade: 'reais' } });
  assert.equal(calc(oficina, [familia], { salario: 1000, campos: { 9: 2 } }).resumo.bonificacoes['Auxílio família'], 100);
  assert.equal(calc(oficina, [familia], { salario: 1000 }).liquido, 1000);
  const abono = [modelo('Abono de dezembro')];
  assert.equal(calc(empresaTeste, abono, { salario: 1000 }, {}, 11).liquido, 1000);
  assert.equal(calc(empresaTeste, abono, { salario: 1000 }, {}, 12).liquido, 1300);
  const so = regra(1, 'Ajuda', 30, { condicoes: [{ variavel: 'comissionado', op: 'igual', valor: 1 }, { variavel: 'dias_trabalhados', op: 'minimo', valor: 21 }] });
  assert.equal(calc(empresaTeste, [so], { salario: 1000, comissionado: true }, { faltas: 1 }).liquido, 1030 - 45);
  assert.equal(calc(empresaTeste, [so], { salario: 1000, comissionado: true }, { faltas: 2 }).liquido, 1000 - 90);
  assert.equal(calc(empresaTeste, [so], { salario: 1000 }, {}).liquido, 1000);
});

test('explicar: o teste da tela vê como cada regra foi avaliada', () => {
  const b = modelo('Prêmio assiduidade');
  const r = calcularLancamento({ oficina: empresaTeste, bonificacoes: [b], funcionario: { salario: 1000 }, ano: 2026, mes: 10, explicar: true }, { faltas: 1 });
  assert.equal(r.avaliacoes[1].aplicada, false);
  assert.equal(r.avaliacoes[1].valores.faltas, 1);
  assert.equal(r.avaliacoes[1].valores.total_proventos, 1000);
  assert.equal(calc(empresaTeste, [b], { salario: 1000 }).avaliacoes, undefined);
});

test('ao salvar, a fórmula é guardada pelas chaves e só pode usar regras que existem', () => {
  const lista = variaveisDa([{ id: 4, nome: 'Peças', tipo: 'numero' }], [{ id: 7, nome: 'Prêmio' }]);
  const def = limparDefinicao({ calculo: { modo: 'formula', formula: 'MIN([peças] * 0,5; [Regra: Prêmio] + [Valor da regra])' } }, lista);
  assert.equal(def.calculo.formula, 'MIN([campo:4] * 0,5; [regra:7] + [valor_regra])');
  assert.deepEqual([...variaveisUsadas(def)].sort(), ['campo:4', 'regra:7', 'valor_regra']);
  assert.throws(() => limparDefinicao({ calculo: { modo: 'formula', formula: '[Regra: Outra] * 2' } }, lista), /fórmula tem um erro: Não existe o dado/);
  assert.throws(() => limparDefinicao({ calculo: { modo: 'formula', formula: '' } }, lista), /Escreva a fórmula/);
  // "Valor da regra" só vale dentro da fórmula
  assert.throws(() => limparDefinicao({ condicoes: [{ variavel: 'valor_regra', op: 'igual', valor: 1 }] }, lista), /não existe/);
  assert.equal(descreverRegra({ id: 1, nome: 'X', valor: 0, definicao: def }, lista).quanto, 'soma pela fórmula MIN([Peças] * 0,5; [Regra: Prêmio] + [Valor da regra])');
});

test('frases das faixas e dos limites', () => {
  const inss = modelo('INSS (tabela progressiva)');
  assert.match(descreverRegra(inss).quanto, /^desconta tabela progressiva sobre bruto do mês .*: até R\$\s1\.518,00 → 7,5%; /);
  const teto = regra(1, 'Bônus', 10, { calculo: { modo: 'percentual', base: 'salario', minimo: 50, maximo: 120 } });
  assert.equal(descreverRegra(teto).quanto, `soma 10% de Salário (no mínimo ${brl(50)}, no máximo ${brl(120)})`);
});

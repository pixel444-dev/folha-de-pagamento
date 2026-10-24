// Testes da leitura do AFD e das regras do ponto.
// Rodar com: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularDia, calcularEspelho, lerAFD, lerHorario, limparBatidas, periodoDaFolha, sugerirFuncionario } from './ponto.js';

const turnos = lerHorario('07:00-11:00 12:10-17:00');

// Linhas no formato do relógio Henry (Portaria 1510, com CRC no fim).
const cabecalho = '0000000001112345678000195            ' + 'EMPRESA EXEMPLO LTDA ME'.padEnd(150)
  + '00001234567890123' + '14122021' + '21102026' + '211020261105' + 'DDD9';
const AFD = [
  cabecalho,
  '0000000035141220211110I012345678901' + 'MARIA DA SILVA'.padEnd(52) + '111444777351363718D',
  '0000000045141220211110I812345678902' + 'JOSE SOUZA'.padEnd(52) + '11144477735136335F9',
  '0000000055141220211110E012345678902' + 'JOSE SOUZA'.padEnd(52) + '11144477735136335F9',
  '0002359163211020261104012345678901E75C',
  '0002359173211020261105812345678902E75C',
  '9999999990000000020002333360000000060000015500000010269',
  '',
].join('\r\n');

test('lê o cabeçalho, as batidas e o cadastro do AFD (Portaria 1510)', () => {
  const r = lerAFD(AFD);
  assert.equal(r.cabecalho.numero_fabricacao, '00001234567890123');
  assert.equal(r.cabecalho.empresa, 'EMPRESA EXEMPLO LTDA ME');
  assert.equal(r.cabecalho.gerado_em, '2026-10-21 11:05');
  assert.deepEqual(r.batidas, [
    { nsr: 235916, codigo: '12345678901', data: '2026-10-21', hora: '11:04' },
    { nsr: 235917, codigo: '12345678902', data: '2026-10-21', hora: '11:05' },
  ]);
  assert.deepEqual(r.pessoas, [
    { codigo: '12345678901', nome: 'MARIA DA SILVA', excluido: false },
    { codigo: '12345678902', nome: 'JOSE SOUZA', excluido: true },
  ]);
});

test('lê batidas no leiaute da Portaria 671 (data com traços e CPF)', () => {
  const cab671 = '0000000001112345678000195' + ''.padEnd(14) + 'EMPRESA'.padEnd(150) + '00001234567890123'
    + '2026-01-01' + '2026-10-21' + '2026-10-21T11:05:00-0300' + '003' + '1' + '98765432000198' + 'MODELO'.padEnd(30) + 'ABCD';
  const r = lerAFD([cab671, '0000001233' + '2026-10-21T07:02:00-0300' + '012345678909' + 'ABCD'].join('\n'));
  assert.equal(r.cabecalho.numero_fabricacao, '00001234567890123');
  assert.equal(r.cabecalho.gerado_em, '2026-10-21 11:05');
  assert.deepEqual(r.batidas, [{ nsr: 123, codigo: '12345678909', data: '2026-10-21', hora: '07:02' }]);
});

test('recusa arquivo que não é AFD', () => {
  assert.throws(() => lerAFD('nome;valor\nmaria;10'), /não parece ser um AFD/);
});

test('horário de trabalho', () => {
  assert.deepEqual(turnos, [[420, 660], [730, 1020]]);
  assert.deepEqual(lerHorario('7:00-11:00'), [[420, 660]]);
  assert.equal(lerHorario('7h-11h'), null);
  assert.equal(lerHorario('11:00-07:00'), null);
  assert.equal(lerHorario('07:00-11:00 10:00-17:00'), null);
});

test('período da folha pelo dia de fechamento', () => {
  assert.deepEqual(periodoDaFolha(2026, 10, 10), { inicio: '2026-09-11', fim: '2026-10-10' });
  assert.deepEqual(periodoDaFolha(2026, 10, 20), { inicio: '2026-09-21', fim: '2026-10-20' });
  assert.deepEqual(periodoDaFolha(2026, 10, 30), { inicio: '2026-10-01', fim: '2026-10-30' });
  assert.deepEqual(periodoDaFolha(2026, 1, 10), { inicio: '2025-12-11', fim: '2026-01-10' });
  assert.deepEqual(periodoDaFolha(2026, 3, 30), { inicio: '2026-03-01', fim: '2026-03-30' });
  assert.deepEqual(periodoDaFolha(2026, 10, null), { inicio: '2026-10-01', fim: '2026-10-31' });
});

test('batidas repetidas no mesmo minuto (ou até 4 minutos depois) contam uma vez só', () => {
  assert.deepEqual(limparBatidas(['07:08', '07:09', '11:00', '12:16', '12:16', '17:00']), ['07:08', '11:00', '12:16', '17:00']);
  assert.deepEqual(limparBatidas(['16:56', '17:02']), ['16:56', '17:02']);
});

test('dentro da tolerância da lei (até 5 min por batida e 10 no dia) não conta nada', () => {
  const d = calcularDia(['06:56', '11:00', '12:12', '16:59'], turnos);
  assert.equal(d.situacao, 'ok');
  assert.equal(d.trabalhado, 244 + 287);
  assert.equal(d.extra, 0);
  assert.equal(d.atraso, 0);
});

test('passou da tolerância: conta a diferença inteira do dia', () => {
  // Chegou 07:20: 20 min de atraso.
  assert.deepEqual([calcularDia(['07:20', '11:00', '12:10', '17:00'], turnos)].map((d) => [d.extra, d.atraso]), [[0, 20]]);
  // Saiu 17:40: 40 min de hora extra.
  assert.deepEqual([calcularDia(['07:00', '11:00', '12:10', '17:40'], turnos)].map((d) => [d.extra, d.atraso]), [[40, 0]]);
  // 4 min em cada uma das 4 batidas: nenhuma passa de 5, mas o dia soma 16 → conta (atraso de 16).
  assert.deepEqual([calcularDia(['07:04', '10:56', '12:14', '16:56'], turnos)].map((d) => [d.extra, d.atraso]), [[0, 16]]);
  // Uma batida 6 min fora: passa da tolerância por batida.
  assert.deepEqual([calcularDia(['07:00', '11:00', '12:10', '17:06'], turnos)].map((d) => [d.extra, d.atraso]), [[6, 0]]);
});

test('batidas faltando: dia para conferir, sem horas calculadas', () => {
  const d = calcularDia(['07:00', '17:02'], turnos);
  assert.equal(d.situacao, 'conferir');
  assert.equal(d.extra, 0);
  assert.equal(d.atraso, 0);
});

test('espelho: faltas só em dias com expediente, sábado trabalhado e dias sem dados', () => {
  // 05/10/2026 é segunda-feira.
  const batidasPorDia = new Map([
    ['2026-10-05', ['06:58', '11:00', '12:10', '17:00']],
    ['2026-10-06', ['07:30', '11:00', '12:10', '17:00']],
    ['2026-10-08', ['07:00', '17:00']],
    ['2026-10-10', ['07:00', '11:00']],
  ]);
  // 07/10: alguém bateu (falta); 09/10: ninguém bateu (feriado/folga geral).
  const diasComExpediente = new Set(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']);
  const r = calcularEspelho({
    inicio: '2026-10-04', fim: '2026-10-13', turnos, batidasPorDia, diasComExpediente, ultimoDia: '2026-10-11', admissao: null,
  });
  assert.deepEqual(r.dias.map((d) => d.situacao), [
    'folga', 'ok', 'ok', 'falta', 'conferir', 'sem_expediente', 'sabado', 'folga', 'sem_dados', 'sem_dados',
  ]);
  assert.equal(r.faltas, 1);
  assert.equal(r.sabados, 1);
  assert.equal(r.horas_atraso, 0.5);
  assert.equal(r.horas_extras, 0);
  assert.equal(r.conferir, 1);
});

test('espelho: antes da admissão não é falta', () => {
  const r = calcularEspelho({
    inicio: '2026-10-05', fim: '2026-10-06', turnos, batidasPorDia: new Map(), diasComExpediente: new Set(['2026-10-05', '2026-10-06']),
    ultimoDia: '2026-10-20', admissao: '2026-10-06',
  });
  assert.deepEqual(r.dias.map((d) => d.situacao), ['antes_admissao', 'falta']);
});

test('sugere o funcionário pelo nome do relógio', () => {
  const funcionarios = [
    { id: 1, nome: 'MARIA', nome_completo: null },
    { id: 2, nome: 'JOSÉ CARLOS', nome_completo: 'José Carlos de Souza' },
    { id: 3, nome: 'ANA', nome_completo: null },
    { id: 4, nome: 'ANA PAULA', nome_completo: null },
  ];
  assert.equal(sugerirFuncionario('JOSE CARLOS DE SOUZA', funcionarios).funcionario_id, 2);
  assert.equal(sugerirFuncionario('MARIA APARECIDA', funcionarios).funcionario_id, 1);
  assert.equal(sugerirFuncionario('ANA PAULA LIMA', funcionarios).funcionario_id, 4);
  assert.equal(sugerirFuncionario('PEDRO', funcionarios), null);
});

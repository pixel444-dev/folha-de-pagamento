// Regras de cálculo da folha de pagamento.
// Usado pelo servidor (ao fechar a folha e no histórico) e pela tela (prévia ao vivo),
// para que os dois sempre cheguem no mesmo valor.

import { fmtHoras, fmtQtd } from './formato.js';
import { avaliarRegra, variaveisDa } from './regras.js';

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** Arredonda para centavos, corrigindo imprecisões de ponto flutuante (ex.: 1,005 → 1,01). */
export const round2 = (v) => {
  const x = n(v);
  return Math.round(x * 100 + (x >= 0 ? 1e-7 : -1e-7)) / 100;
};

export const TIPOS_DESCONTO = { vale: 'Vale', compra: 'Compra', outro: 'Outro' };

/**
 * Valor de um dia de trabalho: salário ÷ divisor (22).
 * Com "arredondar_dia" ligado usa só o quociente inteiro da divisão (900 ÷ 22 = 40).
 */
export function valorDoDia(salario, oficina) {
  const divisor = n(oficina.divisor_dias) || 22;
  const v = n(salario) / divisor;
  return oficina.arredondar_dia ? Math.floor(v + 1e-9) : v;
}

/** Valor de uma hora de trabalho (para atrasos e saídas antecipadas). */
export function valorDaHora(salario, oficina) {
  return valorDoDia(salario, oficina) / (n(oficina.horas_por_dia) || 8);
}

/** Quantos meses se passaram desde o início do parcelamento ("2026-03") até ano/mes. 0 = primeira parcela. */
export function indiceParcela(inicio, ano, mes) {
  const [a, m] = String(inicio).split('-').map(Number);
  return (ano - a) * 12 + (mes - m);
}

/** Valor total, parcelas e saldo de um vale. `descontado` e `vezes` vêm das folhas já fechadas. */
export function saldoVale(v) {
  const parcelas = Math.max(1, Math.round(n(v.num_parcelas)) || 1);
  const total = round2(v.valor_total != null ? v.valor_total : n(v.valor_parcela) * parcelas);
  const descontado = round2(v.descontado);
  return { total, parcelas, descontado, vezes: n(v.vezes), saldo: round2(total - descontado) };
}

/** Nome do vale no card: a descrição, ou o tipo com a data ("Vale 15/10"), e a parcela ("(2/3)"). */
export function rotuloVale(v, parcela, parcelas) {
  let nome = v.descricao || TIPOS_DESCONTO[v.tipo] || 'Vale';
  if (!v.descricao && /^\d{4}-\d{2}-\d{2}$/.test(v.data || '')) nome += ` ${v.data.slice(8, 10)}/${v.data.slice(5, 7)}`;
  return parcelas > 1 ? `${nome} (${parcela}/${parcelas})` : nome;
}

/**
 * Vales (e compras parceladas) a descontar na folha do mês informado.
 * O desconto segue o saldo real: começa no mês de início e continua até quitar.
 * Se uma folha não descontar, a parcela passa para a próxima; nunca desconta mais que o saldo.
 * A última parcela leva o que sobrar (ex.: 500 em 3× = 166,67 + 166,67 + 166,66).
 */
export function parcelasDoMes(vales = [], ano, mes) {
  const saida = [];
  for (const v of vales) {
    if (!v.inicio || indiceParcela(v.inicio, ano, mes) < 0) continue;
    const { total, parcelas, saldo, vezes } = saldoVale(v);
    if (saldo <= 0) continue;
    const valor = vezes >= parcelas - 1 ? saldo : Math.min(round2(total / parcelas), saldo);
    saida.push({
      tipo: v.tipo || 'vale',
      descricao: rotuloVale(v, Math.min(vezes + 1, parcelas), parcelas),
      valor,
      parcelamento_id: v.id,
    });
  }
  return saida;
}

const CATEGORIA_DESCONTO = { vale: 'vales', compra: 'compras' };

/** Meses completos de empresa no fim do mês da folha (admissão "2025-03-10"). Sem admissão = 0. */
export function mesesDeCasa(admissao, ano, mes) {
  const m = /^(\d{4})-(\d{2})/.exec(admissao || '');
  if (!m || !ano || !mes) return 0;
  return Math.max(0, (ano - Number(m[1])) * 12 + (mes - Number(m[2])));
}

/**
 * Dados do funcionário no mês que o cálculo e as regras usam (ver VARIAVEIS em regras.js).
 * Os campos criados pela empresa entram como "campo:<id>" (os do cadastro e os lançados no mês).
 */
export function variaveisDoLancamento(ctx, l = {}) {
  const { oficina, funcionario, ano, mes } = ctx;
  const salario = round2(funcionario.salario);
  const vDia = valorDoDia(salario, oficina);
  const divisor = n(oficina.divisor_dias) || 22;
  const meses = mesesDeCasa(funcionario.admissao, ano, mes);
  const faltas = Math.max(0, n(l.faltas));
  const v = {
    salario,
    valor_dia: vDia,
    valor_hora: vDia / (n(oficina.horas_por_dia) || 8),
    faltas,
    sabados: Math.max(0, n(l.sabados)),
    horas_extras: Math.max(0, n(l.horas_extras)),
    horas_atraso: Math.max(0, n(l.horas_atraso)),
    comissao: round2(l.comissao),
    meses_de_casa: meses,
    anos_de_casa: Math.floor(meses / 12),
    comissionado: funcionario.comissionado ? 1 : 0,
    dias_mes: divisor,
    dias_trabalhados: Math.max(0, divisor - faltas),
    mes: n(mes),
  };
  for (const fonte of [funcionario.campos, l.campos]) {
    for (const [campoId, x] of Object.entries(fonte || {})) v[`campo:${campoId}`] = n(x);
  }
  return v;
}

/**
 * Calcula o pagamento de um funcionário em uma folha.
 *
 * ctx = { oficina, bonificacoes, funcionario, parcelamentos, ano, mes, explicar }
 *       (bonificacoes = regras de pagamento da empresa, na ordem da lista; ver regras.js.
 *        explicar = true devolve também como cada regra foi avaliada, para o teste da tela de regras)
 * l   = lançamento do mês { faltas, sabados, horas_extras, horas_atraso, comissao, campos {},
 *                           regras_manuais { [regraId]: 'sim' | 'nao' | null }, acrescimos[], descontos[], pular_parcelas }
 */
export function calcularLancamento(ctx, l = {}) {
  const { oficina, bonificacoes = [], funcionario, parcelamentos = [], ano, mes } = ctx;

  const variaveis = variaveisDoLancamento(ctx, l);
  const {
    salario, valor_dia: vDia, valor_hora: vHora, faltas, sabados, horas_extras: horasExtras, horas_atraso: horasAtraso, comissao,
  } = variaveis;

  const resumo = {
    salario,
    bonificacoes: {},
    descontos_regras: {},
    sabado: 0,
    hora_extra: 0,
    comissao: 0,
    acrescimos: 0,
    faltas: 0,
    atrasos: 0,
    vales: 0,
    compras: 0,
    outros_descontos: 0,
  };

  // Itens fixos primeiro: as regras podem usar os valores deles (ex.: 8% do bruto do mês).
  const sabado = sabados > 0 ? round2(sabados * (oficina.sabado_modo === 'fixo' ? n(oficina.sabado_valor) : vDia)) : 0;
  const horaExtra = horasExtras > 0 ? round2(horasExtras * n(oficina.valor_hora_extra)) : 0;
  const acrescimos = (l.acrescimos || []).map((a) => ({ rotulo: a.descricao || 'Acréscimo', valor: round2(a.valor) })).filter((a) => a.valor);
  const valorFaltas = faltas > 0 ? round2(faltas * vDia) : 0;
  const valorAtrasos = horasAtraso > 0 ? round2(horasAtraso * vHora) : 0;
  const itens = [...(l.pular_parcelas ? [] : parcelasDoMes(parcelamentos, ano, mes)), ...(l.descontos || [])]
    .map((d) => ({ ...d, valor: round2(d.valor) }))
    .filter((d) => d.valor);
  const somaAcrescimos = round2(acrescimos.reduce((s, a) => s + a.valor, 0));
  Object.assign(variaveis, {
    valor_sabados: sabado, valor_horas_extras: horaExtra, acrescimos: somaAcrescimos, valor_faltas: valorFaltas, valor_atrasos: valorAtrasos,
  });
  let somaProventos = salario + sabado + horaExtra + comissao + somaAcrescimos;
  let somaDescontos = valorFaltas + valorAtrasos + itens.reduce((s, d) => s + d.valor, 0);

  // Regras de pagamento da empresa (regras.js), de cima para baixo: cada uma vê os totais "até aqui"
  // e o valor das que vieram antes ("regra:<id>"). As que têm condição podem ser ajustadas na folha
  // ("recebe" / "não recebe"); folhas de antes das regras guardavam só o ajuste do zero falta.
  const lista = variaveisDa(oficina.campos, bonificacoes);
  const manuais = l.regras_manuais || {};
  const regras = {};
  const avaliacoes = {};
  const proventosRegras = [];
  const descontosRegras = [];
  let zeroFaltaAplicado = false;
  for (const b of bonificacoes) {
    if (!b.ativo) continue;
    variaveis.total_proventos = round2(somaProventos);
    variaveis.total_descontos = round2(somaDescontos);
    variaveis.bruto_mes = round2(somaProventos - valorFaltas - valorAtrasos);
    const manual = b.id in manuais ? manuais[b.id] : b.regra === 'zero_falta' ? l.zero_falta : null;
    const a = avaliarRegra(b, { funcionario, variaveis, manual, lista });
    const v = a.elegivel ? round2(a.valor) : 0;
    if (ctx.explicar) avaliacoes[b.id] = { ...a, valor: v, valores: { ...variaveis } };
    variaveis[`regra:${b.id}`] = v;
    if (!a.elegivel) continue;
    if (a.condicional) regras[b.id] = { automatico: a.automatico, aplicada: a.aplicada, manual: a.manual };
    if (!v) continue;
    const item = { chave: `bon:${b.id}`, rotulo: b.nome, ...(a.detalhe ? { detalhe: a.detalhe } : {}), valor: v };
    if (b.tipo === 'desconto') {
      descontosRegras.push(item);
      resumo.descontos_regras[b.nome] = round2((resumo.descontos_regras[b.nome] || 0) + v);
      somaDescontos += v;
      continue;
    }
    if (b.regra === 'zero_falta') zeroFaltaAplicado = true;
    proventosRegras.push(item);
    resumo.bonificacoes[b.nome] = round2((resumo.bonificacoes[b.nome] || 0) + v);
    somaProventos += v;
  }

  // Ordem no card: salário, regras que somam, sábados, hora extra, comissão, acréscimos;
  // faltas, atrasos, regras que descontam, vales e outros descontos.
  const proventos = [{ chave: 'salario', rotulo: 'Salário', valor: salario }, ...proventosRegras];
  if (sabado) {
    proventos.push({ chave: 'sabado', rotulo: sabados <= 1 ? 'Sábado' : 'Sábados', detalhe: fmtQtd(sabados), valor: sabado });
    resumo.sabado = sabado;
  }
  if (horaExtra) {
    proventos.push({ chave: 'hora_extra', rotulo: 'Hora extra', detalhe: fmtHoras(horasExtras), valor: horaExtra });
    resumo.hora_extra = horaExtra;
  }
  if (comissao) {
    proventos.push({ chave: 'comissao', rotulo: 'Comissão', valor: comissao });
    resumo.comissao = comissao;
  }
  for (const a of acrescimos) proventos.push({ chave: 'acrescimo', rotulo: a.rotulo, valor: a.valor });
  resumo.acrescimos = somaAcrescimos;

  const descontos = [];
  if (valorFaltas) {
    descontos.push({ chave: 'faltas', rotulo: 'Faltas', detalhe: `${fmtQtd(faltas)} ${faltas === 1 ? 'dia' : 'dias'}`, valor: valorFaltas });
    resumo.faltas = valorFaltas;
  }
  if (valorAtrasos) {
    descontos.push({ chave: 'atrasos', rotulo: 'Atrasos/saídas', detalhe: fmtHoras(horasAtraso), valor: valorAtrasos });
    resumo.atrasos = valorAtrasos;
  }
  descontos.push(...descontosRegras);
  for (const d of itens) {
    descontos.push({
      chave: d.parcelamento_id ? `parcela:${d.parcelamento_id}` : 'desconto',
      rotulo: d.descricao || TIPOS_DESCONTO[d.tipo] || 'Desconto',
      valor: d.valor,
      ...(d.parcelamento_id ? { parcelamento_id: d.parcelamento_id } : {}),
    });
    const cat = CATEGORIA_DESCONTO[d.tipo] || 'outros_descontos';
    resumo[cat] = round2(resumo[cat] + d.valor);
  }

  const totalProventos = round2(proventos.reduce((s, p) => s + p.valor, 0));
  const totalDescontos = round2(descontos.reduce((s, d) => s + d.valor, 0));

  return {
    salario,
    valor_dia: round2(vDia),
    valor_hora: round2(vHora),
    proventos,
    descontos,
    total_proventos: totalProventos,
    total_descontos: totalDescontos,
    liquido: round2(totalProventos - totalDescontos),
    zero_falta: zeroFaltaAplicado,
    regras,
    ...(ctx.explicar ? { avaliacoes } : {}),
    resumo,
  };
}

// Partes do resumo que são "nome → valor" (uma linha por regra no histórico).
const somarNomes = (destino, origem) => {
  for (const [nome, v] of Object.entries(origem)) destino[nome] = round2((destino[nome] || 0) + v);
};

/** Soma os resultados de vários funcionários (totais de uma folha). */
export function somarResultados(resultados) {
  const t = {
    funcionarios: resultados.length,
    total_proventos: 0,
    total_descontos: 0,
    liquido: 0,
    salario: 0,
    bonificacoes: {},
    descontos_regras: {},
    sabado: 0,
    hora_extra: 0,
    comissao: 0,
    acrescimos: 0,
    faltas: 0,
    atrasos: 0,
    vales: 0,
    compras: 0,
    outros_descontos: 0,
  };
  for (const r of resultados) {
    t.total_proventos += r.total_proventos;
    t.total_descontos += r.total_descontos;
    t.liquido += r.liquido;
    for (const [k, v] of Object.entries(r.resumo)) {
      if (v && typeof v === 'object') somarNomes((t[k] ||= {}), v);
      else t[k] = (t[k] || 0) + v;
    }
  }
  for (const k of Object.keys(t)) if (typeof t[k] === 'number' && k !== 'funcionarios') t[k] = round2(t[k]);
  return t;
}

/** Soma totais de várias folhas (ex.: total do mês com as 3 folhas). */
export function somarTotais(lista) {
  const validos = lista.filter(Boolean);
  const t = somarResultados([]);
  for (const x of validos) {
    for (const [k, v] of Object.entries(x)) {
      if (v && typeof v === 'object') {
        somarNomes((t[k] ||= {}), v);
      } else if (typeof v === 'number') {
        t[k] = k === 'funcionarios' ? t[k] + v : round2((t[k] || 0) + v);
      }
    }
  }
  return t;
}

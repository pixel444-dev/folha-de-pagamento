// Relógio de ponto: leitura do arquivo AFD e regras para transformar batidas em
// faltas, sábados, horas extras e atrasos da folha.

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** Batidas a menos de 5 minutos da anterior são o mesmo registro repetido (dedo apertado duas vezes). */
const REPETIDA_MIN = 5;
/** CLT art. 58 §1º: variações de até 5 minutos por batida, no máximo 10 no dia, não contam. */
const TOLERANCIA_BATIDA = 5;
const TOLERANCIA_DIA = 10;

// ---------------------------------------------------------------- datas e horas

const dataIso = (ddmmaaaa) => `${ddmmaaaa.slice(4, 8)}-${ddmmaaaa.slice(2, 4)}-${ddmmaaaa.slice(0, 2)}`;
const minutos = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** "2026-10-20" → Date ao meio-dia (evita problemas de fuso/horário de verão). */
const comoData = (iso) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)), 12);
const paraIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function somarDias(iso, dias) {
  const d = comoData(iso);
  d.setDate(d.getDate() + dias);
  return paraIso(d);
}

export const diaDaSemana = (iso) => comoData(iso).getDay();
export const nomeDiaSemana = (iso) => DIAS_SEMANA[diaDaSemana(iso)];

const ultimoDiaDoMes = (ano, mes) => new Date(ano, mes, 0).getDate();

/**
 * Período de uma folha. Fechando no dia 10, a folha de outubro vai de 11/09 a 10/10.
 * Sem dia de fechamento (ou dia maior que o mês) vale o mês inteiro.
 */
export function periodoDaFolha(ano, mes, diaFechamento) {
  const fimDoMes = (a, m) => (diaFechamento ? Math.min(Number(diaFechamento), ultimoDiaDoMes(a, m)) : ultimoDiaDoMes(a, m));
  const anoAnt = mes === 1 ? ano - 1 : ano;
  const mesAnt = mes === 1 ? 12 : mes - 1;
  const fimAnterior = `${anoAnt}-${String(mesAnt).padStart(2, '0')}-${String(fimDoMes(anoAnt, mesAnt)).padStart(2, '0')}`;
  return {
    inicio: somarDias(fimAnterior, 1),
    fim: `${ano}-${String(mes).padStart(2, '0')}-${String(fimDoMes(ano, mes)).padStart(2, '0')}`,
  };
}

// ---------------------------------------------------------------- horário de trabalho

/** "07:00-11:00 12:10-17:00" → [[420, 660], [730, 1020]] (minutos). Inválido → null. */
export function lerHorario(texto) {
  const partes = String(texto || '').trim().split(/[\s,;]+/).filter(Boolean);
  if (!partes.length || partes.length > 3) return null;
  const turnos = [];
  for (const p of partes) {
    const m = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(p);
    if (!m) return null;
    const ini = Number(m[1]) * 60 + Number(m[2]);
    const fim = Number(m[3]) * 60 + Number(m[4]);
    if (Number(m[2]) > 59 || Number(m[4]) > 59 || fim <= ini || fim > 24 * 60) return null;
    if (turnos.length && ini <= turnos.at(-1)[1]) return null;
    turnos.push([ini, fim]);
  }
  return turnos;
}

export const formatarHorario = (turnos) => turnos.map(([a, b]) => `${hhmm(a)}-${hhmm(b)}`).join(' ');

// ---------------------------------------------------------------- arquivo AFD

const tipoDoRegistro = (linha) => linha[9];
// No leiaute da Portaria 671 a data vem como "2026-10-21T11:04:00-0300" logo depois do tipo.
const leiaute671 = (linha) => linha[14] === '-' && linha[17] === '-';
// PIS/CPF vem com 12 posições; o código fica com os 11 números do documento.
const codigoDe = (campo) => campo.trim().slice(-11);

/**
 * Lê o arquivo AFD do relógio (Portaria 1510 ou 671).
 * Devolve o cabeçalho, as batidas e o cadastro de pessoas que estava no relógio.
 */
export function lerAFD(texto) {
  const linhas = String(texto || '').split(/\r?\n/);
  const cab = linhas[0] || '';
  if (!/^0{9}1/.test(cab) || cab.length < 200) {
    throw new Error('Este arquivo não parece ser um AFD do relógio de ponto. Use o arquivo .txt tirado no pendrive, sem abrir nem alterar.');
  }
  const novo = cab.length >= 290;
  const cabecalho = {
    cnpj: cab.slice(11, 25).trim(),
    empresa: (novo ? cab.slice(39, 189) : cab.slice(37, 187)).trim(),
    numero_fabricacao: (novo ? cab.slice(189, 206) : cab.slice(187, 204)).trim(),
    gerado_em: novo
      ? `${cab.slice(226, 236)} ${cab.slice(237, 242)}`
      : `${dataIso(cab.slice(220, 228))} ${cab.slice(228, 230)}:${cab.slice(230, 232)}`,
  };
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(cabecalho.gerado_em) || !cabecalho.numero_fabricacao) {
    throw new Error('O cabeçalho do arquivo AFD está diferente do esperado. Tire o arquivo de novo no relógio.');
  }

  const batidas = [];
  const pessoas = new Map();
  for (const bruta of linhas.slice(1)) {
    const linha = bruta.replace(/\s+$/, '');
    const tipo = tipoDoRegistro(linha);
    const nsr = Number(linha.slice(0, 9));
    if (!/^\d{9}$/.test(linha.slice(0, 9))) continue;
    if (tipo === '3') {
      const [data, hora, codigo] = leiaute671(linha)
        ? [linha.slice(10, 20), linha.slice(21, 26), codigoDe(linha.slice(34, 46))]
        : [dataIso(linha.slice(10, 18)), `${linha.slice(18, 20)}:${linha.slice(20, 22)}`, codigoDe(linha.slice(22, 34))];
      if (/^\d{4}-\d{2}-\d{2}$/.test(data) && /^\d{2}:\d{2}$/.test(hora) && /^\d{11}$/.test(codigo)) {
        batidas.push({ nsr, codigo, data, hora });
      }
    } else if (tipo === '5') {
      const [operacao, codigo, nome] = leiaute671(linha)
        ? [linha[34], codigoDe(linha.slice(35, 47)), linha.slice(47, 99)]
        : [linha[22], codigoDe(linha.slice(23, 35)), linha.slice(35, 87)];
      if (/^\d{11}$/.test(codigo)) pessoas.set(codigo, { codigo, nome: nome.trim(), excluido: operacao === 'E' });
    }
  }
  return { cabecalho, batidas, pessoas: [...pessoas.values()] };
}

// ---------------------------------------------------------------- cálculo

/** Tira batidas repetidas (menos de 5 minutos depois da anterior) e ordena. */
export function limparBatidas(horas) {
  const saida = [];
  for (const h of [...horas].sort()) {
    if (saida.length && minutos(h) - minutos(saida.at(-1)) < REPETIDA_MIN) continue;
    saida.push(h);
  }
  return saida;
}

/**
 * Um dia normal de trabalho.
 * Com as batidas completas compara o tempo trabalhado com o previsto. Pela lei, se nenhuma
 * batida passou 5 minutos do horário e a soma do dia não passou de 10, não conta nada;
 * passando disso, conta a diferença inteira (hora extra ou atraso).
 * Batidas faltando: o dia fica para conferir e não entra na conta de horas.
 */
export function calcularDia(horas, turnos) {
  const marcas = limparBatidas(horas);
  const previsto = turnos.reduce((s, [a, b]) => s + b - a, 0);
  if (marcas.length !== turnos.length * 2) {
    return { situacao: 'conferir', marcas, previsto, trabalhado: null, extra: 0, atraso: 0 };
  }
  const m = marcas.map(minutos);
  const esperado = turnos.flat();
  let trabalhado = 0;
  for (let i = 0; i < m.length; i += 2) trabalhado += m[i + 1] - m[i];
  const variacoes = m.map((x, i) => Math.abs(x - esperado[i]));
  const dentroDaTolerancia = variacoes.every((v) => v <= TOLERANCIA_BATIDA)
    && variacoes.reduce((s, v) => s + v, 0) <= TOLERANCIA_DIA;
  const saldo = dentroDaTolerancia ? 0 : trabalhado - previsto;
  return {
    situacao: 'ok',
    marcas,
    previsto,
    trabalhado,
    extra: Math.max(0, saldo),
    atraso: Math.max(0, -saldo),
  };
}

/**
 * Espelho de ponto de um funcionário em um período.
 *
 * batidasPorDia     = Map("2026-10-01" → ["06:58", "11:00", ...])
 * diasComExpediente = Set de dias em que alguém bateu ponto no relógio (dia sem ninguém = feriado/folga geral)
 * ultimoDia         = último dia completo que veio do relógio (depois dele ainda não há dados)
 * admissao          = dia de admissão (antes dele não conta falta)
 */
export function calcularEspelho({ inicio, fim, turnos, batidasPorDia, diasComExpediente, ultimoDia, admissao }) {
  const dias = [];
  const total = { faltas: 0, sabados: 0, extra: 0, atraso: 0, conferir: 0, trabalhados: 0 };
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) {
    const semana = diaDaSemana(d);
    const horas = batidasPorDia.get(d) || [];
    const dia = { data: d, semana: DIAS_SEMANA[semana], marcas: limparBatidas(horas) };
    if (ultimoDia && d > ultimoDia) {
      dia.situacao = 'sem_dados';
    } else if (semana === 0) {
      dia.situacao = horas.length ? 'conferir' : 'folga';
      if (horas.length) dia.nota = 'Bateu ponto no domingo';
    } else if (semana === 6) {
      dia.situacao = horas.length ? 'sabado' : 'folga';
    } else if (horas.length) {
      Object.assign(dia, calcularDia(horas, turnos));
      if (dia.situacao === 'conferir') dia.nota = `${dia.marcas.length} ${dia.marcas.length === 1 ? 'batida' : 'batidas'} (esperado ${turnos.length * 2})`;
    } else if (admissao && d < admissao) {
      dia.situacao = 'antes_admissao';
    } else if (diasComExpediente.has(d)) {
      dia.situacao = 'falta';
    } else {
      dia.situacao = 'sem_expediente';
    }

    if (dia.situacao === 'falta') total.faltas += 1;
    if (dia.situacao === 'sabado') total.sabados += 1;
    if (dia.situacao === 'conferir') total.conferir += 1;
    if (dia.situacao === 'ok' || dia.situacao === 'conferir') total.trabalhados += dia.marcas.length ? 1 : 0;
    total.extra += dia.extra || 0;
    total.atraso += dia.atraso || 0;
    dias.push(dia);
  }
  // Na folha as horas são decimais (1,5 = 1h30).
  return {
    dias,
    faltas: total.faltas,
    sabados: total.sabados,
    horas_extras: Math.round((total.extra / 60) * 10000) / 10000,
    horas_atraso: Math.round((total.atraso / 60) * 10000) / 10000,
    conferir: total.conferir,
    trabalhados: total.trabalhados,
  };
}

// ---------------------------------------------------------------- nomes

const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  .replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Funcionário mais provável para um nome do relógio: nome igual vale 3, todas as palavras do
 * nome curto dentro do nome do relógio vale 2, só o primeiro nome igual vale 1.
 */
export function sugerirFuncionario(nomeRelogio, funcionarios) {
  const alvo = normalizar(nomeRelogio);
  const palavras = new Set(alvo.split(' '));
  let melhor = null;
  let empate = false;
  for (const f of funcionarios) {
    let pontos = 0;
    for (const nome of [f.nome_completo, f.nome].map(normalizar).filter(Boolean)) {
      const p = nome.split(' ');
      if (nome === alvo) pontos = Math.max(pontos, 3);
      else if (p.every((x) => palavras.has(x))) pontos = Math.max(pontos, p.length > 1 ? 2 : 1);
      else if (p[0] === alvo.split(' ')[0]) pontos = Math.max(pontos, 1);
    }
    if (!pontos) continue;
    if (!melhor || pontos > melhor.pontos) {
      melhor = { funcionario_id: f.id, pontos };
      empate = false;
    } else if (pontos === melhor.pontos) {
      empate = true;
    }
  }
  return melhor && !empate ? melhor : null;
}

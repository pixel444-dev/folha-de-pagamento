// Formatação e leitura de números no padrão brasileiro.

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
export const MESES_CURTOS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtValor = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQuantidade = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** "R$ 1.234,56" */
export const brl = (v) => fmtMoeda.format(Number(v) || 0);
/** "1.234,56" */
export const valor = (v) => fmtValor.format(Number(v) || 0);
/** "1,5" */
export const fmtQtd = (q) => fmtQuantidade.format(Number(q) || 0);

/** 1.5 → "1h30", 2 → "2h", 0.5 → "30min" */
export function fmtHoras(h) {
  const minutos = Math.round((Number(h) || 0) * 60);
  const hh = Math.floor(minutos / 60);
  const mm = minutos % 60;
  if (hh === 0) return `${mm}min`;
  return mm ? `${hh}h${String(mm).padStart(2, '0')}` : `${hh}h`;
}

/** 1.5 → "1:30" (formato usado nos campos de hora) */
export function fmtHorasCampo(h) {
  const minutos = Math.round((Number(h) || 0) * 60);
  if (!minutos) return '';
  return `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, '0')}`;
}

/** Lê "1.500,50", "1500.5", "1,5" → número. Vazio → 0. Inválido → null. */
export function parseNum(s) {
  let t = String(s ?? '').trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (t === '' || t === '-') return 0;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d*\.?\d*$/.test(t) || t === '.' || t === '-.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Lê "1:30", "1h30", "1h", "45min", "1,5" → horas em decimal. Vazio → 0. Inválido → null. */
export function parseHoras(s) {
  const t = String(s ?? '').trim().toLowerCase().replace(/\s/g, '');
  if (t === '') return 0;
  let m = t.match(/^(\d+):(\d{0,2})$/);
  if (m) return Number(m[1]) + (Number(m[2] || 0) / 60);
  m = t.match(/^(\d+)h(\d{0,2})(min|m)?$/);
  if (m) return Number(m[1]) + (Number(m[2] || 0) / 60);
  m = t.match(/^(\d+)(min|m)$/);
  if (m) return Number(m[1]) / 60;
  return parseNum(t);
}

/** "2026-10-15" → "15/10/2026" */
export const fmtData = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(iso || '') ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze',
  'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function ate999(x) {
  if (x === 100) return 'cem';
  const partes = [];
  if (x >= 100) partes.push(CENTENAS[Math.floor(x / 100)]);
  const r = x % 100;
  if (r) partes.push(r < 20 ? UNIDADES[r] : DEZENAS[Math.floor(r / 10)] + (r % 10 ? ` e ${UNIDADES[r % 10]}` : ''));
  return partes.join(' e ');
}

function inteiroPorExtenso(x) {
  if (x === 0) return 'zero';
  const grupos = [];
  const milhoes = Math.floor(x / 1e6);
  const milhares = Math.floor((x % 1e6) / 1000);
  const resto = x % 1000;
  if (milhoes) grupos.push(milhoes === 1 ? 'um milhão' : `${ate999(milhoes)} milhões`);
  if (milhares) grupos.push(milhares === 1 ? 'mil' : `${ate999(milhares)} mil`);
  if (resto) grupos.push(ate999(resto));
  if (grupos.length === 1) return grupos[0];
  // "mil e duzentos", "mil e cinquenta", mas "mil duzentos e cinquenta"
  const ultimo = grupos.pop();
  const liga = resto && (resto < 100 || resto % 100 === 0) ? ' e ' : ' ';
  return grupos.join(' ') + liga + ultimo;
}

/** Valor em reais por extenso, para recibos: 1250.5 → "mil duzentos e cinquenta reais e cinquenta centavos". */
export function porExtenso(v) {
  const centavosTotais = Math.round(Math.abs(Number(v) || 0) * 100);
  const reais = Math.floor(centavosTotais / 100);
  const centavos = centavosTotais % 100;
  const partes = [];
  if (reais) {
    const deReais = reais >= 1e6 && reais % 1e6 === 0 ? ' de' : '';
    partes.push(`${inteiroPorExtenso(reais)}${deReais} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (centavos) partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  return partes.length ? partes.join(' e ') : 'zero reais';
}

export const competencia = (ano, mes) => `${MESES[mes - 1]} de ${ano}`;
export const competenciaCurta = (ano, mes) => `${MESES_CURTOS[mes - 1]}/${ano}`;

export function rotuloFolha(folha) {
  if (!folha) return '';
  return `${folha.numero}ª Folha${folha.apelido ? ` · ${folha.apelido}` : ''}`;
}

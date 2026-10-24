// Fórmulas no estilo do Excel para as regras de pagamento, ex.:  [Salário] * 10%   ou   SE([Faltas] = 0; 100; 0)
// Lidas por um tradutor feito aqui (nada de eval): só existem números, dados entre colchetes, + - * / ^,
// comparações e as funções da lista abaixo. Uma fórmula não consegue fazer nada além de dar um número.
//
// Os dados ficam guardados pela chave ([campo:3]) e aparecem para o usuário pelo nome ([Peças produzidas]):
// assim, renomear um campo não quebra a fórmula.

const PERTO = 1e-9;
const MAX_TEXTO = 500;
const MAX_PROFUNDIDADE = 40;

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Funções aceitas (o nome é lido sem acento e sem diferença de maiúsculas: NÃO = nao). */
export const FUNCOES = {
  SE: { args: [2, 3], uso: 'SE(condição; valor se sim; valor se não)', explica: 'Escolhe um valor conforme a condição.' },
  E: { args: [1, 20], uso: 'E(condição; condição; …)', explica: 'Vale quando todas as condições valem.' },
  OU: { args: [1, 20], uso: 'OU(condição; condição; …)', explica: 'Vale quando pelo menos uma condição vale.' },
  NAO: { args: [1, 1], uso: 'NÃO(condição)', explica: 'Inverte a condição.' },
  MIN: { args: [1, 20], uso: 'MIN(valor; valor; …)', explica: 'O menor dos valores (bom para pôr um teto).' },
  MAX: { args: [1, 20], uso: 'MAX(valor; valor; …)', explica: 'O maior dos valores (bom para pôr um piso).' },
  ARRED: { args: [1, 2], uso: 'ARRED(valor; casas)', explica: 'Arredonda (2 casas se não disser quantas).' },
  TRUNCAR: { args: [1, 2], uso: 'TRUNCAR(valor; casas)', explica: 'Corta as casas sem arredondar (nenhuma casa se não disser).' },
  ABS: { args: [1, 1], uso: 'ABS(valor)', explica: 'Tira o sinal de menos.' },
};

// Símbolos que dá para digitar; os "bonitos" (≤ × …) viram os do teclado.
const SIMBOLOS = ['<=', '>=', '<>', '≤', '≥', '≠', '=', '<', '>', '+', '-', '−', '*', '×', '/', '÷', '^', '(', ')', ';'];
const IGUAL_A = { '≤': '<=', '≥': '>=', '≠': '<>', '×': '*', '÷': '/', '−': '-' };
const COMPARACOES = ['=', '<>', '<', '<=', '>', '>='];

class ErroFormula extends Error {}
const PONTO = 'Não use ponto nos números: escreva os milhares juntos (100000) e use vírgula para os centavos (1500,50).';

function lerTokens(texto) {
  const tokens = [];
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const resto = texto.slice(i);
    if (c === '[') {
      const fim = texto.indexOf(']', i + 1);
      if (fim < 0) throw new ErroFormula('Falta fechar o colchete "]".');
      const nome = texto.slice(i + 1, fim).trim();
      if (!nome) throw new ErroFormula('Tem um colchete vazio "[ ]".');
      tokens.push({ t: 'ref', nome, inicio: i, fim: fim + 1 });
      i = fim + 1;
      continue;
    }
    let m = /^\d+(?:[.,]\d+)?%?/.exec(resto);
    // Ponto num número é ambíguo no Brasil (100.000 = cem mil, mas no Excel em inglês = cem): melhor recusar.
    if (m && m[0].includes('.')) throw new ErroFormula(PONTO);
    if (m) {
      const pct = m[0].endsWith('%');
      const v = Number(m[0].replace('%', '').replace(',', '.'));
      tokens.push({ t: 'num', v: pct ? v / 100 : v, inicio: i, fim: i + m[0].length });
      i += m[0].length;
      continue;
    }
    m = /^[A-Za-zÀ-ÖØ-öø-ÿ_][A-Za-zÀ-ÖØ-öø-ÿ0-9_]*/.exec(resto); // letras com acento, menos × e ÷
    if (m) {
      tokens.push({ t: 'nome', nome: m[0], inicio: i, fim: i + m[0].length });
      i += m[0].length;
      continue;
    }
    const s = SIMBOLOS.find((x) => texto.startsWith(x, i));
    if (s) {
      tokens.push({ t: 'op', op: IGUAL_A[s] || s, inicio: i, fim: i + s.length });
      i += s.length;
      continue;
    }
    if (c === '.') throw new ErroFormula(PONTO);
    if (c === ',') throw new ErroFormula('Use ";" para separar os valores das funções, como no Excel: MIN(1; 2).');
    throw new ErroFormula(`Não entendi o símbolo "${c}".`);
  }
  return tokens;
}

function analisar(tokens, texto, resolver) {
  let p = 0;
  let profundidade = 0;
  const refs = new Set();
  const ehOp = (op, i = p) => tokens[i]?.t === 'op' && tokens[i].op === op;
  const perto = (tk = tokens[p]) => (tk ? ` (perto de "${texto.slice(tk.inicio, tk.inicio + 20)}")` : '');

  function expressao() {
    if (++profundidade > MAX_PROFUNDIDADE) throw new ErroFormula('A fórmula tem parênteses demais, um dentro do outro.');
    let a = soma();
    while (tokens[p]?.t === 'op' && COMPARACOES.includes(tokens[p].op)) {
      const op = tokens[p++].op;
      a = { t: 'op', op, a, b: soma() };
    }
    profundidade--;
    return a;
  }
  function soma() {
    let a = produto();
    while (ehOp('+') || ehOp('-')) {
      const op = tokens[p++].op;
      a = { t: 'op', op, a, b: produto() };
    }
    return a;
  }
  function produto() {
    let a = unario();
    while (ehOp('*') || ehOp('/')) {
      const op = tokens[p++].op;
      a = { t: 'op', op, a, b: unario() };
    }
    return a;
  }
  function unario() {
    if (ehOp('-')) {
      p++;
      return { t: 'neg', a: unario() };
    }
    if (ehOp('+')) {
      p++;
      return unario();
    }
    const a = primario();
    if (ehOp('^')) {
      p++;
      return { t: 'op', op: '^', a, b: unario() };
    }
    return a;
  }
  function primario() {
    const tk = tokens[p];
    if (!tk) throw new ErroFormula('A fórmula termina antes da hora: falta um valor no fim.');
    if (tk.t === 'num') {
      p++;
      return { t: 'num', v: tk.v };
    }
    if (tk.t === 'ref') {
      p++;
      const chave = resolver(tk.nome);
      if (!chave) throw new ErroFormula(`Não existe o dado [${tk.nome}]. Use o botão "Inserir dado" para escolher da lista.`);
      tk.chave = chave;
      refs.add(chave);
      return { t: 'ref', chave };
    }
    if (tk.t === 'nome') {
      if (!ehOp('(', p + 1)) {
        throw new ErroFormula(`"${tk.nome}" não é uma função. Se for um dado, escreva entre colchetes: [${tk.nome}].`);
      }
      const nome = semAcento(tk.nome).toUpperCase();
      const f = FUNCOES[nome];
      if (!f) throw new ErroFormula(`Não existe a função ${tk.nome}. As funções são: ${Object.values(FUNCOES).map((x) => x.uso.split('(')[0]).join(', ')}.`);
      p += 2;
      const args = [];
      if (!ehOp(')')) {
        args.push(expressao());
        while (ehOp(';')) {
          p++;
          args.push(expressao());
        }
      }
      if (!ehOp(')')) throw new ErroFormula(`Falta fechar o parêntese de ${tk.nome}${perto()}.`);
      p++;
      if (args.length < f.args[0] || args.length > f.args[1]) throw new ErroFormula(`Quantidade de valores errada. O certo é ${f.uso}.`);
      return { t: 'fn', nome, args };
    }
    if (ehOp('(')) {
      p++;
      const a = expressao();
      if (!ehOp(')')) throw new ErroFormula(`Falta fechar um parêntese ")"${perto()}.`);
      p++;
      return a;
    }
    throw new ErroFormula(`Esperava um número, um [dado] ou uma função${perto(tk)}.`);
  }

  const ast = expressao();
  if (p < tokens.length) {
    throw new ErroFormula(ehOp(')') ? `Sobrou um parêntese ")"${perto()}.` : `Falta uma conta (+, -, *, /) entre os valores${perto()}.`);
  }
  return { ast, refs };
}

/** Acha a chave de um dado pelo que está entre colchetes: a própria chave ou o nome (sem diferença de acento). */
function resolvedor(variaveis) {
  const chaves = new Set(variaveis.map((v) => v.chave));
  const porNome = new Map();
  for (const v of variaveis) if (!porNome.has(semAcento(v.rotulo))) porNome.set(semAcento(v.rotulo), v.chave);
  return (nome) => (chaves.has(nome) ? nome : porNome.get(semAcento(nome)) || null);
}

/**
 * Lê uma fórmula. variaveis = [{ chave, rotulo }] que ela pode usar.
 * Devolve { ast, refs } ou { erro } com uma explicação para o usuário.
 */
export function compilarFormula(texto, variaveis) {
  const s = String(texto ?? '');
  if (!s.trim()) return { erro: 'Escreva a fórmula.' };
  if (s.length > MAX_TEXTO) return { erro: `A fórmula pode ter no máximo ${MAX_TEXTO} letras.` };
  try {
    const tokens = lerTokens(s);
    return { ...analisar(tokens, s, resolvedor(variaveis)), tokens };
  } catch (e) {
    if (e instanceof ErroFormula) return { erro: e.message };
    throw e;
  }
}

const verdade = (x) => Math.abs(x) >= PERTO;
const casas = (x) => Math.min(6, Math.max(0, Math.round(x)));

function calc(no, valores) {
  switch (no.t) {
    case 'num':
      return no.v;
    case 'ref': {
      const x = Number(valores[no.chave]);
      return Number.isFinite(x) ? x : 0;
    }
    case 'neg':
      return -calc(no.a, valores);
    case 'op': {
      const a = calc(no.a, valores);
      const b = calc(no.b, valores);
      switch (no.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return Math.abs(b) < PERTO ? 0 : a / b; // dividir por zero dá zero (e não erro) na folha
        case '^': return a ** b;
        case '=': return Math.abs(a - b) < PERTO ? 1 : 0;
        case '<>': return Math.abs(a - b) >= PERTO ? 1 : 0;
        case '<': return a < b - PERTO ? 1 : 0;
        case '<=': return a <= b + PERTO ? 1 : 0;
        case '>': return a > b + PERTO ? 1 : 0;
        case '>=': return a >= b - PERTO ? 1 : 0;
        default: return 0;
      }
    }
    case 'fn': {
      const arg = (i) => calc(no.args[i], valores);
      const todos = () => no.args.map((_, i) => arg(i));
      switch (no.nome) {
        case 'SE': return verdade(arg(0)) ? arg(1) : no.args.length > 2 ? arg(2) : 0;
        case 'E': return todos().every(verdade) ? 1 : 0;
        case 'OU': return todos().some(verdade) ? 1 : 0;
        case 'NAO': return verdade(arg(0)) ? 0 : 1;
        case 'MIN': return Math.min(...todos());
        case 'MAX': return Math.max(...todos());
        case 'ABS': return Math.abs(arg(0));
        case 'ARRED': {
          const f = 10 ** casas(no.args.length > 1 ? arg(1) : 2);
          const x = arg(0);
          return Math.round(x * f + (x >= 0 ? 1e-7 : -1e-7)) / f;
        }
        case 'TRUNCAR': {
          const f = 10 ** casas(no.args.length > 1 ? arg(1) : 0);
          const x = arg(0);
          return Math.trunc(x * f + (x >= 0 ? 1e-7 : -1e-7)) / f;
        }
        default: return 0;
      }
    }
    default:
      return 0;
  }
}

/** Resultado da fórmula com os valores do mês ({ chave: número }). Conta impossível dá 0. */
export function avaliarFormula(ast, valores) {
  const v = calc(ast, valores);
  return Number.isFinite(v) ? v : 0;
}

/** Troca cada [dado] pelo que `trocar(token)` devolver, mantendo o resto do texto como foi digitado. */
function trocarDados(texto, tokens, trocar) {
  let saida = '';
  let ultimo = 0;
  for (const tk of tokens) {
    if (tk.t !== 'ref') continue;
    saida += texto.slice(ultimo, tk.inicio) + trocar(tk);
    ultimo = tk.fim;
  }
  return saida + texto.slice(ultimo);
}

/** Texto para guardar: [Peças produzidas] → [campo:3]. Fórmula com erro volta como está. */
export function paraChaves(texto, variaveis) {
  const f = compilarFormula(texto, variaveis);
  return f.erro ? String(texto ?? '') : trocarDados(String(texto), f.tokens, (tk) => `[${tk.chave}]`);
}

/** Texto para mostrar: [campo:3] → [Peças produzidas]. */
export function paraNomes(texto, variaveis) {
  const s = String(texto ?? '');
  const nomes = new Map(variaveis.map((v) => [v.chave, v.rotulo]));
  try {
    return trocarDados(s, lerTokens(s), (tk) => `[${nomes.get(tk.nome) ?? tk.nome}]`);
  } catch {
    return s;
  }
}

/** Dados que uma fórmula guardada usa (as chaves entre colchetes), sem precisar da lista de dados. */
export function dadosDaFormula(texto) {
  try {
    return new Set(lerTokens(String(texto ?? '')).filter((tk) => tk.t === 'ref').map((tk) => tk.nome));
  } catch {
    return new Set();
  }
}

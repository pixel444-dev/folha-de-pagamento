// Lembra o mês e a folha que a pessoa estava usando em cada empresa (Folha do mês e Ponto).
// Sem isso, ao sair da aba e voltar, a tela abria sempre no mês atual, o que atrapalha quem
// está fechando a folha do mês anterior. A lembrança vale por alguns dias desde o último uso:
// depois disso a tela volta a abrir no mês atual.

export const VALIDADE_MS = 4 * 24 * 60 * 60 * 1000;

const chave = (oficinaId) => `folha:mes-escolhido:${oficinaId}`;
const valido = (a, m) => Number.isInteger(a) && a >= 2000 && a <= 2100 && Number.isInteger(m) && m >= 1 && m <= 12;

/**
 * Qual mês e folha mostrar: o do endereço (?ano=&mes=&folha=), senão o lembrado, senão o mês atual
 * e a primeira folha. numerosFolhas = números das folhas que a empresa tem.
 */
export function escolherMes({ params, guardado, numerosFolhas, agora = new Date() }) {
  const g = guardado && typeof guardado.em === 'number' && agora.getTime() - guardado.em <= VALIDADE_MS ? guardado : null;
  const pAno = Number(params.get('ano'));
  const pMes = Number(params.get('mes'));
  let ano;
  let mes;
  if (valido(pAno, pMes)) [ano, mes] = [pAno, pMes];
  else if (g && valido(g.ano, g.mes)) [ano, mes] = [g.ano, g.mes];
  else [ano, mes] = [agora.getFullYear(), agora.getMonth() + 1];
  const pFolha = Number(params.get('folha'));
  let folha = numerosFolhas[0];
  if (numerosFolhas.includes(pFolha)) folha = pFolha;
  else if (g && numerosFolhas.includes(g.folha)) folha = g.folha;
  return { ano, mes, folha };
}

export function lerMesGuardado(oficinaId) {
  try {
    return JSON.parse(localStorage.getItem(chave(oficinaId)) || 'null');
  } catch {
    return null;
  }
}

export function guardarMes(oficinaId, { ano, mes, folha }) {
  try {
    localStorage.setItem(chave(oficinaId), JSON.stringify({ ano, mes, folha, em: Date.now() }));
  } catch {
    // sem armazenamento no navegador: só não lembra
  }
}

/** Para as telas: o mês e a folha escolhidos, já lendo o que foi lembrado. */
export function mesDaTela(params, oficina) {
  return escolherMes({ params, guardado: lerMesGuardado(oficina.id), numerosFolhas: oficina.folhas.map((f) => f.numero) });
}

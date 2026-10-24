async function requisicao(metodo, url, corpo, texto = false) {
  let resposta;
  try {
    resposta = await fetch(`/api${url}`, {
      method: metodo,
      headers: corpo !== undefined ? { 'Content-Type': texto ? 'text/plain' : 'application/json' } : undefined,
      body: corpo !== undefined ? (texto ? corpo : JSON.stringify(corpo)) : undefined,
    });
  } catch {
    throw new Error('Não foi possível falar com o sistema. Verifique se ele está ligado e tente de novo.');
  }
  const dados = resposta.status === 204 ? null : await resposta.json().catch(() => null);
  if (dados?.exigeLogin) window.dispatchEvent(new Event('folha:sessao-expirada'));
  if (!resposta.ok) throw new Error(dados?.erro || `Erro ${resposta.status}`);
  return dados;
}

export const api = {
  get: (url) => requisicao('GET', url),
  post: (url, corpo = {}) => requisicao('POST', url, corpo),
  /** Envia um arquivo de texto (ex.: AFD do relógio de ponto). */
  postTexto: (url, texto) => requisicao('POST', url, texto, true),
  put: (url, corpo) => requisicao('PUT', url, corpo),
  patch: (url, corpo) => requisicao('PATCH', url, corpo),
  del: (url) => requisicao('DELETE', url),
};

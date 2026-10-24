// Código Pix "copia e cola" (BR Code estático, padrão do Banco Central) para o QR Code do card.
// Vai SEM valor: quem paga lê o QR e digita o valor no banco (pode pagar mais ou menos que o líquido).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Chave no formato que o Pix exige (CPF só números, telefone +55..., e-mail minúsculo) ou null se não der. */
export function chaveParaQr(tipo, chave) {
  const c = (chave || '').trim();
  if (!c) return null;
  const d = c.replace(/\D/g, '');
  switch (tipo) {
    case 'CPF': return d.length === 11 ? d : null;
    case 'CNPJ': return d.length === 14 ? d : null;
    case 'Telefone':
      if (d.length === 10 || d.length === 11) return `+55${d}`;
      if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return `+${d}`;
      return null;
    case 'E-mail': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c) ? c.toLowerCase() : null;
    case 'Aleatória': return UUID.test(c.toLowerCase()) ? c.toLowerCase() : null;
    default: return null;
  }
}

/**
 * O que falta no cadastro para o card sair com QR Code (lista vazia = pode gerar).
 * Titular e banco são obrigatórios para quem paga ter com o que conferir o nome que o banco mostra.
 */
export function faltaParaQr(f) {
  const falta = [];
  if (!(f.pix_chave || '').trim()) falta.push('chave');
  else if (!chaveParaQr(f.pix_tipo, f.pix_chave)) falta.push('chave válida');
  if (!(f.pix_titular || '').trim()) falta.push('titular');
  if (!(f.pix_banco || '').trim()) falta.push('banco');
  return falta;
}

// Nome e cidade só aceitam letras sem acento no padrão do Pix.
function semAcento(texto, max) {
  return (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

const campo = (id, valor) => `${id}${String(valor.length).padStart(2, '0')}${valor}`;

function crc16(texto) {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Código Pix sem valor para o funcionário, ou null se a chave não estiver num formato válido.
 * O nome que o banco mostra para quem paga vem do cadastro da chave no banco, não daqui.
 */
export function codigoPix({ tipo, chave, nome, cidade = 'BRASIL' }) {
  const k = chaveParaQr(tipo, chave);
  if (!k) return null;
  const corpo = [
    campo('00', '01'),
    campo('26', campo('00', 'br.gov.bcb.pix') + campo('01', k)),
    campo('52', '0000'),
    campo('53', '986'),
    campo('58', 'BR'),
    campo('59', semAcento(nome, 25) || 'RECEBEDOR'),
    campo('60', semAcento(cidade, 15) || 'BRASIL'),
    campo('62', campo('05', '***')),
  ].join('') + '6304';
  return corpo + crc16(corpo);
}

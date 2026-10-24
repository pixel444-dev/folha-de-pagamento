import qrcode from 'qrcode-generator';
import { valor, brl } from '@shared/formato.js';
import { codigoPix, faltaParaQr } from '@shared/pix.js';

// Medidas do card em milímetros. As mesmas medidas estão no CSS (.pc-*);
// com elas calculamos quantos cards cabem em cada folha A4.
export const CARD = {
  largura: 97, // dois cards encostados = 194 mm (largura útil da folha A4)
  moldura: 8, // espaço interno em cima e embaixo (4 + 4), para a tesoura não pegar no texto
  cabecalho: 13,
  linha: 4.3,
  subtotal: 5,
  espaco: 1.5,
  liquido: 10,
  pix: 10.5,
  obs: 4.3,
  folga: 1.5,
};

export function alturaCard({ resultado, observacao }) {
  let h = CARD.moldura + CARD.cabecalho + resultado.proventos.length * CARD.linha + CARD.subtotal;
  if (resultado.descontos.length) h += CARD.espaco + resultado.descontos.length * CARD.linha + CARD.subtotal;
  h += CARD.espaco + CARD.liquido + CARD.pix;
  if (observacao) h += CARD.obs;
  return h + CARD.folga;
}

// cor: '' (preto, salário), 'acrescimo' (azul) ou 'desconto' (vermelho)
function Linha({ rotulo, detalhe, v, negativo, cor = '' }) {
  return (
    <div className={`pc-linha ${cor}`}>
      <span className="pc-rotulo">
        {negativo && <span className="pc-menos">−</span>}
        {rotulo}
        {detalhe && <span className="pc-detalhe"> · {detalhe}</span>}
      </span>
      <span className="pc-valor">{valor(v)}</span>
    </div>
  );
}

// Com o QR ao lado sobra menos espaço: chaves compridas (e-mail) ganham letra menor para não cortar.
function tamanhoChave(chave, tipo) {
  const letras = chave.length + (tipo || '').length;
  return letras > 33 ? 'menor' : letras > 27 ? 'menos' : '';
}

// QR Code do Pix (sem valor) desenhado em SVG, para sair nítido na impressão.
function QrPix({ codigo }) {
  const qr = qrcode(0, 'M');
  qr.addData(codigo);
  qr.make();
  const n = qr.getModuleCount();
  const margem = 2;
  let d = '';
  for (let l = 0; l < n; l++) {
    for (let c = 0; c < n; c++) if (qr.isDark(l, c)) d += `M${c + margem} ${l + margem}h1v1h-1z`;
  }
  const lado = n + margem * 2;
  return (
    <svg className="pc-qr" viewBox={`0 0 ${lado} ${lado}`} shapeRendering="crispEdges" role="img" aria-label="QR Code do Pix">
      <rect width={lado} height={lado} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

/**
 * Card de pagamento de um funcionário (tela e impressão).
 * dados = { oficina, folha, competencia, funcionario, resultado, observacao, logo }
 */
export default function CardPagamento({ dados, altura }) {
  const { oficina, folha, competencia, funcionario: f, resultado: r, observacao, logo } = dados;
  const temPix = !!f.pix_chave;
  const titular = [f.pix_titular, f.pix_banco].filter(Boolean).join(' · ');
  // Sem titular e banco cadastrados não sai QR: quem paga precisa ter com o que conferir.
  const pix = faltaParaQr(f).length === 0 && codigoPix({ tipo: f.pix_tipo, chave: f.pix_chave, nome: f.pix_titular });

  return (
    <article className="pc" style={altura ? { height: `${altura}mm` } : undefined}>
      <header className="pc-cab">
        {logo && <img className="pc-logo" src={logo} alt="" />}
        <div className="pc-cab-texto">
          <div className="pc-topo">
            <span>{oficina} · {folha}</span>
            <span>{competencia}</span>
          </div>
          <div className="pc-nome">
            <strong>{f.nome}</strong>
            {f.funcao && <span>{f.funcao}</span>}
          </div>
        </div>
      </header>

      {r.proventos.map((p, i) => (
        <Linha key={`p${i}`} rotulo={p.rotulo} detalhe={p.detalhe} v={p.valor} cor={p.chave === 'salario' ? '' : 'acrescimo'} />
      ))}
      <div className="pc-sub">
        <span>Total de proventos</span>
        <span>{valor(r.total_proventos)}</span>
      </div>

      {r.descontos.length > 0 && (
        <>
          <div className="pc-espaco" />
          {r.descontos.map((d, i) => (
            <Linha key={`d${i}`} rotulo={d.rotulo} detalhe={d.detalhe} v={d.valor} negativo cor="desconto" />
          ))}
          <div className="pc-sub">
            <span>Total de descontos</span>
            <span>− {valor(r.total_descontos)}</span>
          </div>
        </>
      )}

      <div className="pc-espaco" />
      <div className="pc-final">
        <div className="pc-pagto">
          <div className="pc-pagto-texto">
            <div className={`pc-liquido ${r.liquido < 0 ? 'negativo' : r.liquido > 0 ? 'positivo' : ''}`}>
              <span>Líquido a receber</span>
              <strong>{brl(r.liquido)}</strong>
            </div>
            <div className="pc-pix">
              {temPix ? (
                <>
                  <div className="pc-pix-chave">
                    <span className="pc-pix-tipo">PIX{f.pix_tipo ? ` · ${f.pix_tipo}` : ''}</span>
                    <strong className={tamanhoChave(f.pix_chave, f.pix_tipo)}>{f.pix_chave}</strong>
                  </div>
                  <div className="pc-pix-titular">{titular ? `Titular: ${titular}` : ' '}</div>
                </>
              ) : (
                <>
                  <div className="pc-pix-chave"><span className="pc-pix-tipo">PIX</span><strong>Sem chave cadastrada</strong></div>
                  <div className="pc-pix-titular">&nbsp;</div>
                </>
              )}
            </div>
          </div>
          {pix && <QrPix codigo={pix} />}
        </div>
        {observacao && <div className="pc-obs">Obs.: {observacao}</div>}
      </div>
    </article>
  );
}

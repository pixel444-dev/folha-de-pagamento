import { useEffect } from 'react';

/** Painel lateral que desliza da direita (usado para detalhes e formulários). */
export default function Gaveta({ aberta, aoFechar, titulo, subtitulo, children, rodape, largura = 560 }) {
  useEffect(() => {
    if (!aberta) return undefined;
    const tecla = (e) => {
      if (e.key === 'Escape') aoFechar();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aberta, aoFechar]);

  if (!aberta) return null;
  return (
    <div className="gaveta-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <section className="gaveta" style={{ width: `min(${largura}px, 100vw)` }} role="dialog" aria-modal="true">
        <header className="gaveta-cabecalho">
          <div>
            <h2>{titulo}</h2>
            {subtitulo && <p>{subtitulo}</p>}
          </div>
          <button className="btn-icone" onClick={aoFechar} aria-label="Fechar">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <div className="gaveta-corpo">{children}</div>
        {rodape && <footer className="gaveta-rodape">{rodape}</footer>}
      </section>
    </div>
  );
}

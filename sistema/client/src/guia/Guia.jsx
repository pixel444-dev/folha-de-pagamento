// Guia passo a passo (botão "Ajuda"): balões que destacam onde clicar em cada tela.
// Os roteiros ficam em roteiros.js. O guia só troca de tela e abre painéis: nunca salva nem apaga nada.

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useOficinas } from '../App.jsx';
import { GRUPOS_GUIA, ROTEIROS, roteirosDaTela, telaDoEndereco } from './roteiros.js';

const GuiaCtx = createContext(null);
export const useGuia = () => useContext(GuiaCtx);

const XIS = <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>;

// O convite para o primeiro guia aparece uma vez em cada computador (fica guardado no navegador).
const CHAVE_VISTO = 'folha:guia-visto';
const jaViuOGuia = () => {
  try {
    return !!localStorage.getItem(CHAVE_VISTO);
  } catch {
    return true; // navegador sem armazenamento: melhor não insistir com o convite a cada vez
  }
};
const marcarVisto = () => {
  try {
    localStorage.setItem(CHAVE_VISTO, '1');
  } catch {
    // sem armazenamento, o convite volta na próxima vez
  }
};

// ---------------------------------------------------------------- achar e esperar as coisas na tela

const acharVisivel = (nome) => [...document.querySelectorAll(`[data-guia="${nome}"]`)].find((el) => el.getClientRects().length > 0) || null;
const gavetaAberta = () => !!document.querySelector('.gaveta');
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function esperarQue(condicao, cancelado, max = 1500) {
  const fim = Date.now() + max;
  while (!condicao() && Date.now() < fim && !cancelado()) await pausa(50);
  return condicao();
}

/** Espera o elemento aparecer. Desiste quando a tela para de mudar sem ele (já carregou e ele não existe) ou depois de `max`. */
function esperarElemento(nome, cancelado, max = 4000) {
  return new Promise((ok) => {
    const raiz = document.getElementById('root');
    const inicio = Date.now();
    let ultimaMudanca = inicio;
    const observador = new MutationObserver(() => {
      ultimaMudanca = Date.now();
    });
    observador.observe(raiz, { childList: true, subtree: true, attributes: true, characterData: true });
    const terminar = (el) => {
      observador.disconnect();
      ok(el);
    };
    const tentar = () => {
      if (cancelado()) return terminar(null);
      const el = acharVisivel(nome);
      if (el) return terminar(el);
      const agora = Date.now();
      const carregando = raiz.textContent.includes('Carregando…');
      if (agora - inicio > max || (!carregando && agora - inicio > 250 && agora - ultimaMudanca > 450)) return terminar(null);
      setTimeout(tentar, 60);
    };
    tentar();
  });
}

async function fecharGaveta(cancelado) {
  const botao = document.querySelector('.gaveta-cabecalho [aria-label="Fechar"]');
  if (!botao) return;
  botao.click();
  await esperarQue(() => !gavetaAberta(), cancelado, 1000);
}

function trazerParaTela(el) {
  const r = el.getBoundingClientRect();
  if (r.top >= 8 && r.bottom <= window.innerHeight - 8) return;
  el.scrollIntoView({ block: r.height > window.innerHeight * 0.7 ? 'start' : 'center' });
}

// ---------------------------------------------------------------- posição do destaque e do balão

const MARGEM = 16; // distância mínima entre o balão e a borda da tela
const DISTANCIA = 12; // espaço entre o destaque e o balão

/** Retângulo do destaque: o elemento com uma folga em volta, sem passar da tela. */
function recorte(r) {
  const top = Math.max(r.top - 6, 4);
  const left = Math.max(r.left - 6, 4);
  const bottom = Math.min(r.bottom + 6, window.innerHeight - 4);
  const right = Math.min(r.right + 6, window.innerWidth - 4);
  if (bottom <= top || right <= left) return null;
  return { top, left, width: right - left, height: bottom - top };
}

/**
 * Põe o balão do lado preferido do destaque; se não couber, tenta os outros lados.
 * Destaque grande demais (ex.: uma tabela comprida) fica só com o começo, e o balão vai embaixo.
 */
function posicionar(luz, largura, altura, preferido) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const limitar = (v, min, max) => Math.max(min, Math.min(v, max));
  if (!luz) return { luz, balao: { top: Math.max(MARGEM, (H - altura) / 2), left: Math.max(MARGEM, (W - largura) / 2) } };
  const x = limitar(luz.left + luz.width / 2 - largura / 2, MARGEM, W - largura - MARGEM);
  const y = limitar(luz.top + luz.height / 2 - altura / 2, MARGEM, H - altura - MARGEM);
  const lados = {
    baixo: { top: luz.top + luz.height + DISTANCIA, left: x },
    cima: { top: luz.top - DISTANCIA - altura, left: x },
    direita: { top: y, left: luz.left + luz.width + DISTANCIA },
    esquerda: { top: y, left: luz.left - DISTANCIA - largura },
  };
  const cabe = (p) => p.top >= MARGEM && p.left >= MARGEM && p.top + altura <= H - MARGEM && p.left + largura <= W - MARGEM;
  for (const lado of [preferido, 'baixo', 'cima', 'direita', 'esquerda']) {
    if (lado && cabe(lados[lado])) return { luz, balao: lados[lado] };
  }
  const corte = H - MARGEM - altura - DISTANCIA - luz.top;
  if (corte >= 60) {
    const comeco = { ...luz, height: corte };
    return { luz: comeco, balao: { top: luz.top + corte + DISTANCIA, left: x } };
  }
  return { luz, balao: { top: H - altura - MARGEM, left: W - largura - MARGEM } };
}

const mesmo = (a, b) => (!a || !b ? a === b : Object.keys(a).every((k) => Math.round(a[k]) === Math.round(b[k])));

/** Texto do roteiro com **negrito**. */
function Negrito({ texto }) {
  return texto.split(/\*\*(.+?)\*\*/g).map((parte, i) => (i % 2 ? <strong key={i}>{parte}</strong> : parte));
}

// ---------------------------------------------------------------- o passeio (balões passo a passo)

function Passeio({ roteiro, aoSair, aoIniciar }) {
  const navegar = useNavigate();
  const { oficinas } = useOficinas();
  const [indice, setIndice] = useState(0);
  const [pronto, setPronto] = useState(false);
  const [faltou, setFaltou] = useState(false);
  const [quadro, setQuadro] = useState({ luz: null, balao: null });
  const [alvo, setAlvo] = useState(null);
  const balaoRef = useRef(null);
  const principalRef = useRef(null);

  // Empresa usada nos passos: a que está aberta agora, ou a primeira da lista.
  const [empresa] = useState(() => {
    const slug = /^\/empresa\/([^/]+)/.exec(window.location.pathname)?.[1];
    return (oficinas.find((o) => o.slug === slug) || oficinas[0])?.slug;
  });

  const passo = roteiro.passos[indice];
  const total = roteiro.passos.length;
  const ultimo = indice === total - 1;
  const parado = faltou && passo.obrigatorio;
  const sugerido = parado && ROTEIROS.find((r) => r.id === passo.sugerir);

  // Prepara a tela do passo: troca de tela, fecha ou abre o painel lateral e espera o alvo aparecer.
  useEffect(() => {
    let vivo = true;
    const cancelado = () => !vivo;
    setPronto(false);
    (async () => {
      const caminho = passo.rota?.replace(':empresa', empresa);
      if (caminho && window.location.pathname !== caminho) {
        await fecharGaveta(cancelado);
        if (cancelado()) return;
        navegar(caminho);
      }
      if (!passo.gaveta && gavetaAberta()) await fecharGaveta(cancelado);
      // Passo dentro de um painel que está fechado (ex.: voltou um passo): abre pelo botão do passo que abriu.
      let abrir = passo.abrir;
      if (passo.gaveta) abrir = gavetaAberta() ? null : abrir || roteiro.passos.slice(0, indice).reverse().find((p) => p.abrir)?.abrir;
      if (abrir) {
        const botao = await esperarElemento(abrir, cancelado);
        if (cancelado()) return;
        if (botao) {
          botao.click();
          if (passo.gaveta) await esperarQue(gavetaAberta, cancelado);
        }
      }
      const el = passo.alvo ? await esperarElemento(passo.alvo, cancelado) : null;
      if (cancelado()) return;
      if (el) trazerParaTela(el);
      setAlvo(el);
      setFaltou(!!passo.alvo && !el);
      setPronto(true);
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indice]);

  const medir = useCallback(() => {
    const balao = balaoRef.current;
    if (!balao) return;
    let el = alvo;
    // A tela redesenhou o alvo (ex.: os dados recarregaram): procura de novo.
    if (el && !el.isConnected) {
      el = pronto && passo.alvo ? acharVisivel(passo.alvo) : null;
      if (el) setAlvo(el);
    }
    const r = el?.getBoundingClientRect();
    const novo = posicionar(r && r.width + r.height > 0 ? recorte(r) : null, balao.offsetWidth, balao.offsetHeight, passo.lado);
    setQuadro((q) => (mesmo(q.luz, novo.luz) && mesmo(q.balao, novo.balao) ? q : novo));
  }, [alvo, passo, pronto]);

  useLayoutEffect(() => {
    medir();
  }, [medir, faltou]);

  // Acompanha rolagem, mudança de tamanho da janela e telas que ainda estão carregando.
  useEffect(() => {
    let pedido = 0;
    const aoMudar = () => {
      cancelAnimationFrame(pedido);
      pedido = requestAnimationFrame(medir);
    };
    window.addEventListener('resize', aoMudar);
    window.addEventListener('scroll', aoMudar, true);
    const relogio = setInterval(medir, 250);
    return () => {
      cancelAnimationFrame(pedido);
      clearInterval(relogio);
      window.removeEventListener('resize', aoMudar);
      window.removeEventListener('scroll', aoMudar, true);
    };
  }, [medir]);

  useEffect(() => {
    if (pronto) principalRef.current?.focus({ preventScroll: true });
  }, [pronto, indice]);

  const avancar = () => (ultimo ? aoSair() : setIndice(indice + 1));
  const voltar = () => indice > 0 && setIndice(indice - 1);

  // Teclado: setas avançam e voltam, Esc sai. Pega antes da tela (o Esc não fecha o painel lateral por baixo).
  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'Escape') aoSair();
      else if (e.key === 'ArrowRight' && pronto && !parado) avancar();
      else if (e.key === 'ArrowLeft') voltar();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  });

  const { luz, balao } = quadro;
  return createPortal(
    <div className="guia-camada">
      <div className="guia-bloqueio" />
      {luz ? <div className="guia-luz" style={luz} /> : <div className="guia-escuro" />}
      <section
        ref={balaoRef}
        className={`guia-balao ${pronto ? '' : 'preparando'}`}
        style={balao || { visibility: 'hidden' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guia-titulo"
        aria-describedby="guia-texto"
      >
        <div className="guia-progresso" aria-hidden="true">
          <span style={{ width: `${((indice + 1) / total) * 100}%` }} />
        </div>
        <div className="guia-topo">
          <span>{roteiro.titulo} · passo {indice + 1} de {total}</span>
          <button type="button" className="btn-icone" onClick={aoSair} aria-label="Sair do guia" title="Sair do guia (Esc)">{XIS}</button>
        </div>
        <h3 id="guia-titulo">{passo.titulo}</h3>
        <p id="guia-texto" aria-live="polite"><Negrito texto={passo.texto} /></p>
        {faltou && (
          <p className="guia-nota"><Negrito texto={passo.seFaltar || 'Esta parte não está aparecendo na tela agora.'} /></p>
        )}
        <div className="guia-botoes">
          {indice > 0 && <button type="button" className="btn btn-texto esquerda" onClick={voltar}>Voltar</button>}
          {parado ? (
            <>
              {sugerido && <button type="button" className="btn" onClick={() => aoIniciar(sugerido.id)}>Ver o guia “{sugerido.titulo}”</button>}
              <button type="button" ref={principalRef} className="btn btn-primario" onClick={aoSair}>Fechar o guia</button>
            </>
          ) : (
            <button type="button" ref={principalRef} className="btn btn-primario" onClick={avancar} disabled={!pronto}>
              {ultimo ? 'Concluir' : 'Próximo'}
            </button>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- menu de ajuda e convite

function useEsc(aoApertar) {
  useEffect(() => {
    const tecla = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      aoApertar();
    };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [aoApertar]);
}

function Opcao({ roteiro: r, aoEscolher, destaque, ...resto }) {
  return (
    <button type="button" className={`guia-opcao ${destaque ? 'destaque' : ''}`} onClick={() => aoEscolher(r.id)} {...resto}>
      <strong>{r.titulo}</strong>
      <span>{r.resumo}</span>
      <small>{r.passos.length} passos →</small>
    </button>
  );
}

function MenuAjuda({ aoEscolher, aoFechar }) {
  const { pathname } = useLocation();
  const daTela = roteirosDaTela(telaDoEndereco(pathname));
  useEsc(aoFechar);

  return createPortal(
    <div className="guia-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <section className="guia-menu" role="dialog" aria-modal="true" aria-labelledby="guia-menu-titulo">
        <header className="guia-menu-cab">
          <div>
            <h2 id="guia-menu-titulo">Ajuda</h2>
            <p>Escolha a parte do sistema em que tem dúvida. O guia mostra, passo a passo, onde clicar e o que fazer.</p>
          </div>
          <button type="button" className="btn-icone" onClick={aoFechar} aria-label="Fechar">{XIS}</button>
        </header>
        <div className="guia-menu-corpo">
          {daTela.length > 0 && (
            <div>
              <h3 className="guia-rotulo">Nesta tela</h3>
              <div className="guia-opcoes">
                {daTela.map((r, i) => <Opcao key={r.id} roteiro={r} aoEscolher={aoEscolher} destaque autoFocus={i === 0} />)}
              </div>
            </div>
          )}
          {GRUPOS_GUIA.map((g) => (
            <div key={g.id}>
              <h3 className="guia-rotulo">{g.titulo}</h3>
              <div className="guia-opcoes">
                {ROTEIROS.filter((r) => r.grupo === g.id).map((r) => <Opcao key={r.id} roteiro={r} aoEscolher={aoEscolher} />)}
              </div>
            </div>
          ))}
        </div>
        <footer className="guia-menu-rodape">
          O guia não muda nada nos seus dados: ele só mostra onde clicar. Para sair dele a qualquer momento, aperte Esc.
        </footer>
      </section>
    </div>,
    document.body,
  );
}

/** Convite para o guia geral na primeira vez que o sistema é aberto neste computador. */
export function BoasVindas() {
  const { iniciar, ocupado } = useGuia();
  const [aberto, setAberto] = useState(() => !jaViuOGuia());
  const responder = useCallback((comecar) => {
    marcarVisto();
    setAberto(false);
    if (comecar) iniciar('visao-geral');
  }, [iniciar]);
  const agoraNao = useCallback(() => responder(false), [responder]);

  if (!aberto || ocupado) return null;
  return <Convite aoComecar={() => responder(true)} aoRecusar={agoraNao} />;
}

function Convite({ aoComecar, aoRecusar }) {
  useEsc(aoRecusar);
  return createPortal(
    <div className="guia-fundo">
      <section className="guia-convite" role="dialog" aria-modal="true" aria-labelledby="guia-convite-titulo">
        <span className="guia-convite-icone" aria-hidden="true">?</span>
        <h2 id="guia-convite-titulo">Bem-vindo à Folha de Pagamento!</h2>
        <p>
          Quer conhecer o sistema? Um guia rápido mostra, passo a passo, onde fica cada coisa.
          Leva uns 2 minutos e não muda nada nos seus dados.
        </p>
        <div className="guia-convite-botoes">
          <button type="button" className="btn btn-texto" onClick={aoRecusar}>Agora não</button>
          <button type="button" className="btn btn-primario" onClick={aoComecar} autoFocus>Começar o guia</button>
        </div>
        <p className="mini">Depois, quando quiser, é só clicar em <strong>Ajuda</strong>, no menu da esquerda.</p>
      </section>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- provedor

export function GuiaProvider({ children }) {
  const [menu, setMenu] = useState(false);
  const [ativo, setAtivo] = useState(null); // { roteiro, vez }

  const iniciar = useCallback((id) => {
    const roteiro = ROTEIROS.find((r) => r.id === id);
    if (!roteiro) return;
    marcarVisto();
    setMenu(false);
    setAtivo((a) => ({ roteiro, vez: (a?.vez || 0) + 1 }));
  }, []);
  const abrirAjuda = useCallback(() => setMenu(true), []);
  const fecharAjuda = useCallback(() => setMenu(false), []);
  const sair = useCallback(() => setAtivo(null), []);
  const valor = useMemo(() => ({ abrirAjuda, iniciar, ocupado: menu || !!ativo }), [abrirAjuda, iniciar, menu, ativo]);

  return (
    <GuiaCtx.Provider value={valor}>
      {children}
      {menu && <MenuAjuda aoEscolher={iniciar} aoFechar={fecharAjuda} />}
      {ativo && <Passeio key={ativo.vez} roteiro={ativo.roteiro} aoSair={sair} aoIniciar={iniciar} />}
    </GuiaCtx.Provider>
  );
}

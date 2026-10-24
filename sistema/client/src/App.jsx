import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api.js';
import Inicio from './paginas/Inicio.jsx';
import Oficina from './paginas/Oficina.jsx';
import FolhaMes from './paginas/FolhaMes.jsx';
import Ponto from './paginas/Ponto.jsx';
import Funcionarios from './paginas/Funcionarios.jsx';
import Historico from './paginas/Historico.jsx';
import Configuracoes from './paginas/Configuracoes.jsx';
import Regras from './paginas/Regras.jsx';
import Imprimir from './paginas/Imprimir.jsx';
import Vales from './paginas/Vales.jsx';
import ReciboVale from './paginas/ReciboVale.jsx';
import EspelhoPonto from './paginas/EspelhoPonto.jsx';
import Entrar from './paginas/Entrar.jsx';
import CopiasSeguranca from './paginas/CopiasSeguranca.jsx';

const OficinasCtx = createContext(null);
export const useOficinas = () => useContext(OficinasCtx);

/** Endereços de antes (/oficina/...) levam para o novo (/empresa/...), para favoritos salvos continuarem valendo. */
function EnderecoAntigo() {
  const { pathname, search } = useLocation();
  return <Navigate to={pathname.replace(/^\/oficina\//, '/empresa/') + search} replace />;
}

export default function App() {
  const [sessao, setSessao] = useState(null);
  const [oficinas, setOficinas] = useState(null);
  const [erro, setErro] = useState(null);

  const recarregar = useCallback(async () => {
    try {
      setOficinas(await api.get('/oficinas'));
      setErro(null);
    } catch (e) {
      setErro(e.message);
    }
  }, []);

  const iniciar = useCallback(async () => {
    try {
      const s = await api.get('/sessao');
      setSessao(s);
      if (s.logado) await recarregar();
    } catch (e) {
      setErro(e.message);
    }
  }, [recarregar]);

  const sair = useCallback(async () => {
    await api.post('/sair').catch(() => {});
    setSessao((s) => ({ ...s, logado: false }));
  }, []);

  useEffect(() => {
    iniciar();
  }, [iniciar]);

  // Versão de testes (este computador) ou produção (servidor da empresa).
  const [info, setInfo] = useState(null);
  useEffect(() => {
    api.get('/info').then((i) => {
      setInfo(i);
      if (i.ambiente === 'testes') document.title = 'TESTES · Folha de Pagamento';
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const expirou = () => setSessao((s) => s && { ...s, logado: false });
    window.addEventListener('folha:sessao-expirada', expirou);
    return () => window.removeEventListener('folha:sessao-expirada', expirou);
  }, []);

  if (sessao && !sessao.logado) return <Entrar aoEntrar={iniciar} />;
  if (erro && !oficinas) {
    return (
      <div className="tela-cheia">
        <div className="aviso aviso-erro">
          <strong>Não foi possível abrir o sistema.</strong>
          <p>{erro}</p>
          <button className="btn" onClick={iniciar}>Tentar de novo</button>
        </div>
      </div>
    );
  }
  if (!oficinas) return <div className="tela-cheia carregando">Carregando…</div>;

  return (
    <OficinasCtx.Provider value={{ oficinas, recarregar, sair: sessao?.exigeSenha ? sair : null, info }}>
      {info?.ambiente === 'testes' && (
        <div className="marca-testes-impressao" aria-hidden="true">VERSÃO DE TESTES · NÃO USAR PARA PAGAMENTO</div>
      )}
      <Routes>
        <Route path="/imprimir" element={<Imprimir />} />
        <Route path="/recibo-vale" element={<ReciboVale />} />
        <Route path="/espelho-ponto" element={<EspelhoPonto />} />
        <Route element={<Estrutura />}>
          <Route index element={<Inicio />} />
          <Route path="oficina/*" element={<EnderecoAntigo />} />
          <Route path="empresa/:slug" element={<Oficina />}>
            <Route index element={<Navigate to="folha" replace />} />
            <Route path="folha" element={<FolhaMes />} />
            <Route path="ponto" element={<Ponto />} />
            <Route path="funcionarios" element={<Funcionarios />} />
            <Route path="vales" element={<Vales />} />
            <Route path="historico" element={<Historico />} />
            <Route path="regras" element={<Regras />} />
            <Route path="configuracoes" element={<Configuracoes />} />
          </Route>
          <Route path="copias" element={<CopiasSeguranca />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </OficinasCtx.Provider>
  );
}

function Estrutura() {
  const { oficinas, sair, info } = useOficinas();
  return (
    <div className="estrutura">
      <aside className="lateral">
        {info?.ambiente === 'testes' && (
          <div className="faixa-testes" role="note">
            <strong>Versão de testes</strong>
            <span>Os dados daqui não vão para o servidor.</span>
          </div>
        )}
        <NavLink to="/" className="marca">
          <span className="marca-icone" aria-hidden="true">
            <svg viewBox="0 0 32 32"><path d="M9 9h14M9 15h14M9 21h8" /></svg>
          </span>
          <span>
            <strong>Folha de Pagamento</strong>
            <small>Folha, ponto e vales</small>
          </span>
        </NavLink>

        <nav className="menu">
          <NavLink to="/" end className="menu-item">Início</NavLink>
          <div className="menu-titulo">Empresas</div>
          {oficinas.map((o) => (
            <NavLink key={o.id} to={`/empresa/${o.slug}`} className="menu-item" style={{ '--cor': o.cor }}>
              <span className="ponto" />
              <span className="menu-nome">{o.nome}</span>
              <span className="menu-contagem">{o.ativos}</span>
            </NavLink>
          ))}
          <Link to="/?nova" className="menu-item menu-nova">+ Nova empresa</Link>
        </nav>

        <div className="lateral-rodape">
          <NavLink to="/copias" className="menu-item">Cópias de segurança</NavLink>
          {sair && <button type="button" className="menu-item" onClick={sair}>Sair</button>}
          {info && <div className="versao">Versão {info.versao}</div>}
        </div>
      </aside>
      <main className="conteudo">
        <Outlet />
      </main>
    </div>
  );
}

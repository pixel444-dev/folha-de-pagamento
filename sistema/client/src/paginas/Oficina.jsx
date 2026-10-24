import { Navigate, NavLink, Outlet, useParams } from 'react-router-dom';
import { useOficinas } from '../App.jsx';

export default function Oficina() {
  const { slug } = useParams();
  const { oficinas, recarregar } = useOficinas();
  const oficina = oficinas.find((o) => o.slug === slug);
  if (!oficina) return <Navigate to="/" replace />;

  const base = `/empresa/${oficina.slug}`;
  return (
    <div style={{ '--cor': oficina.cor }}>
      <div className="cab-oficina">
        {oficina.logo_url ? (
          <img className="selo-logo" src={oficina.logo_url} alt={`Logo ${oficina.nome}`} />
        ) : (
          <div className="selo-oficina" aria-hidden="true">{oficina.nome[0]}</div>
        )}
        <div>
          <h1>{oficina.nome}</h1>
          <p>
            {oficina.ativos} funcionários ativos ·{' '}
            {oficina.folhas.map((f) => `${f.numero}ª: ${oficina.ativos_por_folha[f.numero]}`).join(' · ')}
          </p>
        </div>
      </div>
      <nav className="abas">
        <NavLink className="aba" to={`${base}/folha`}>Folha do mês</NavLink>
        <NavLink className="aba" to={`${base}/ponto`}>Ponto</NavLink>
        <NavLink className="aba" to={`${base}/funcionarios`}>Funcionários</NavLink>
        <NavLink className="aba" to={`${base}/vales`}>Vales</NavLink>
        <NavLink className="aba" to={`${base}/historico`}>Histórico</NavLink>
        <NavLink className="aba" to={`${base}/regras`}>Regras</NavLink>
        <NavLink className="aba" to={`${base}/configuracoes`}>Configurações</NavLink>
      </nav>
      <Outlet context={{ oficina, recarregar }} key={oficina.id} />
    </div>
  );
}

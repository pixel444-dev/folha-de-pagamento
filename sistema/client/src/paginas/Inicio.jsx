import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useOficinas } from '../App.jsx';
import Gaveta from '../componentes/Gaveta.jsx';
import { Campo } from '../componentes/Campos.jsx';
import EscolherCor, { CORES_OFICINA } from '../componentes/EscolherCor.jsx';
import { brl, competencia, rotuloFolha } from '@shared/formato.js';

export default function Inicio() {
  const { oficinas } = useOficinas();
  const [params, setParams] = useSearchParams();
  const criando = params.has('nova');
  const fecharNova = () => setParams((p) => {
    p.delete('nova');
    return p;
  });
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;
  const [situacao, setSituacao] = useState({});

  useEffect(() => {
    let vivo = true;
    Promise.all(oficinas.map((o) => api.get(`/oficinas/${o.id}/folhas-mensais?ano=${ano}&mes=${mes}`).then((s) => [o.id, s])))
      .then((pares) => vivo && setSituacao(Object.fromEntries(pares)))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [oficinas, ano, mes]);

  const [falhaCopia, setFalhaCopia] = useState(null);
  useEffect(() => {
    api.get('/copias')
      .then((s) => setFalhaCopia(s.statusExtra && !s.statusExtra.ok ? s.statusExtra.erro : null))
      .catch(() => {});
  }, []);

  return (
    <>
      {falhaCopia && (
        <div className="aviso aviso-erro aviso-copia">
          <strong>A cópia de segurança na segunda pasta está falhando.</strong>
          <p>{falhaCopia} <Link to="/copias">Ver cópias de segurança</Link></p>
        </div>
      )}
      <div className="cab-pagina">
        <div>
          <h1>Folha de Pagamento</h1>
          <p>Folhas de {competencia(ano, mes).toLowerCase()}</p>
        </div>
        <Link className="btn" to="/?nova" data-guia="inicio-nova-empresa">+ Nova empresa</Link>
      </div>
      {criando && <NovaOficina aoFechar={fecharNova} />}

      <div className="grade-oficinas">
        {oficinas.map((o) => (
          <section key={o.id} className="bloco cartao-oficina" style={{ '--cor': o.cor }} data-guia="inicio-empresa">
            <div className="titulo-oficina">
              <div>
                <h2>{o.nome}</h2>
                <p className="sub">
                  {o.ativos} funcionários ativos · hora extra {brl(o.valor_hora_extra)}
                </p>
              </div>
              {o.logo_url && <img src={o.logo_url} alt={`Logo ${o.nome}`} />}
            </div>
            <div className="lista-folhas">
              {o.folhas.map((f) => {
                const s = situacao[o.id]?.find((x) => x.numero === f.numero);
                const fm = s?.folha_mensal;
                return (
                  <Link key={f.numero} to={`/empresa/${o.slug}/folha?ano=${ano}&mes=${mes}&folha=${f.numero}`}>
                    <span className="nome-folha">{rotuloFolha(f)}</span>
                    <span className="valor-folha">{fm ? brl(fm.totais?.liquido) : ''}</span>
                    <span className="info-folha">
                      {o.ativos_por_folha[f.numero]} pessoas{f.dia_fechamento ? ` · fecha dia ${f.dia_fechamento}` : ''}
                    </span>
                    <span>
                      {!s ? null : !fm ? (
                        <span className="chip chip-cinza">Não iniciada</span>
                      ) : fm.status === 'fechada' ? (
                        <span className="chip chip-verde"><span className="bolinha" />Fechada</span>
                      ) : (
                        <span className="chip chip-ambar"><span className="bolinha" />Em andamento</span>
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
            <div className="acoes" data-guia="inicio-atalhos">
              <Link className="btn btn-primario" to={`/empresa/${o.slug}/folha`}>Folha do mês</Link>
              <Link className="btn" to={`/empresa/${o.slug}/funcionarios`}>Funcionários</Link>
              <Link className="btn btn-texto" to={`/empresa/${o.slug}/historico`}>Histórico</Link>
            </div>
          </section>
        ))}
      </div>

      <div className="dicas" data-guia="inicio-dicas">
        <div className="bloco dica-item">
          <strong>1. Abra a folha do mês</strong>
          Todos os funcionários ativos daquela folha entram automaticamente, com salário e bonificações do cadastro.
        </div>
        <div className="bloco dica-item">
          <strong>2. Lance faltas, sábados e horas extras</strong>
          O sistema calcula tudo na hora: valor do dia, zero falta, descontos e parcelas de vales.
        </div>
        <div className="bloco dica-item">
          <strong>3. Imprima os cards e feche a folha</strong>
          Cards prontos em folha A4 com a chave PIX. Ao fechar, os valores ficam guardados no histórico.
        </div>
      </div>
    </>
  );
}

function NovaOficina({ aoFechar }) {
  const { oficinas, recarregar } = useOficinas();
  const navegar = useNavigate();
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState(CORES_OFICINA[oficinas.length % CORES_OFICINA.length]);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const criar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const nova = await api.post('/oficinas', { nome, cor });
      await recarregar();
      navegar(`/empresa/${nova.slug}/configuracoes`);
    } catch (err) {
      setErro(err.message);
      setSalvando(false);
    }
  };

  return (
    <Gaveta
      aberta
      aoFechar={aoFechar}
      titulo="Nova empresa"
      subtitulo="Depois de criar, ajuste as folhas em Configurações e as regras de pagamento na aba Regras."
      largura={460}
      rodape={(
        <>
          {erro && <span className="mini negativo" style={{ marginRight: 'auto' }}>{erro}</span>}
          <button type="button" className="btn btn-texto" onClick={aoFechar}>Cancelar</button>
          <button type="submit" form="form-nova-oficina" className="btn btn-primario" disabled={salvando || !nome.trim()} data-guia="nova-empresa-criar">Criar empresa</button>
        </>
      )}
    >
      <form id="form-nova-oficina" onSubmit={criar} className="grade-form" style={{ '--cor': cor }}>
        <Campo rotulo="Nome da empresa" className="inteiro" data-guia="nova-empresa-nome">
          <input className="campo" value={nome} maxLength={60} autoFocus onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Loja Centro" />
        </Campo>
        <Campo rotulo="Cor" className="inteiro" data-guia="nova-empresa-cor">
          <EscolherCor valor={cor} aoMudar={setCor} />
        </Campo>
        <p className="mini inteiro">
          A empresa começa com uma folha e as regras padrão (salário ÷ 22, 8 horas por dia, hora extra R$ 7,00, sábado = um dia).
        </p>
      </form>
    </Gaveta>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import Gaveta from '../componentes/Gaveta.jsx';
import { competencia, fmtData, fmtHoras, fmtQtd, rotuloFolha } from '@shared/formato.js';

const horas = (h) => (h ? fmtHoras(h) : '—');
const minutosEmHoras = (m) => (m ? fmtHoras(m / 60) : '0min');
const formatarCodigo = (c) => (c ? `${c.slice(0, 3)}.${c.slice(3, 8)}.${c.slice(8, 10)}-${c.slice(10)}` : '');

export default function Ponto() {
  const { oficina } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const visao = params.get('ver') === 'pessoas' ? 'pessoas' : 'espelho';
  const [info, setInfo] = useState(null);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    try {
      setInfo(await api.get(`/oficinas/${oficina.id}/ponto`));
      setErro(null);
    } catch (e) {
      setErro(e.message);
    }
  }, [oficina.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const verPessoas = () => setParams((p) => {
    p.set('ver', 'pessoas');
    return p;
  });

  if (!info) return <div className="bloco vazio">{erro || 'Carregando…'}</div>;

  const semLigacao = info.pessoas.filter((p) => p.recente && !p.ligado).length;
  return (
    <>
      <div className="grade-ponto">
        <Importar oficina={oficina} info={info} aoImportar={carregar} />
        <HorarioOficina oficina={oficina} horario={info.horario} aoSalvar={carregar} />
      </div>

      <div className="filtros">
        <div className="segmentos">
          <button className={visao === 'espelho' ? 'ativo' : ''} onClick={() => setParams((p) => { p.delete('ver'); return p; })} data-guia="ponto-ver-espelho">
            Espelho da folha
          </button>
          <button className={visao === 'pessoas' ? 'ativo' : ''} onClick={verPessoas} data-guia="ponto-ver-pessoas">
            Pessoas do relógio{semLigacao ? ` (${semLigacao} sem ligação)` : ''}
          </button>
        </div>
      </div>

      {erro && <div className="faixa faixa-erro">{erro}</div>}
      {visao === 'espelho'
        ? <Espelho oficina={oficina} info={info} aoVerPessoas={verPessoas} />
        : <Pessoas info={info} aoMudar={carregar} />}
    </>
  );
}

// ---------------------------------------------------------------- importar o arquivo

function Importar({ oficina, info, aoImportar }) {
  const seletor = useRef(null);
  const [estado, setEstado] = useState({ enviando: false, erro: null, resultado: null });

  const escolher = async (e) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setEstado({ enviando: true, erro: null, resultado: null });
    try {
      // O AFD é texto simples; nomes com acento vêm no padrão do Windows.
      const texto = new TextDecoder('windows-1252').decode(await arquivo.arrayBuffer());
      const resultado = await api.postTexto(`/oficinas/${oficina.id}/ponto/importar`, texto);
      setEstado({ enviando: false, erro: null, resultado });
      await aoImportar();
    } catch (err) {
      setEstado({ enviando: false, erro: err.message, resultado: null });
    }
  };

  const r = estado.resultado;
  return (
    <section className="bloco bloco-corpo" data-guia="ponto-importar">
      <h2 className="secao-titulo">Arquivo do relógio</h2>
      <p className="secao-desc">
        No relógio, encaixe o pendrive na porta fiscal e espere gerar o arquivo AFD (um .txt). Depois escolha o arquivo aqui.
        Pode importar o arquivo inteiro sempre: as batidas que já estão no sistema são ignoradas.
      </p>
      {info.relogios.length ? info.relogios.map((rel) => (
        <p key={rel.id} className="mini" style={{ marginBottom: 10 }}>
          Relógio nº {rel.numero_fabricacao} · {Number(rel.batidas).toLocaleString('pt-BR')} batidas de {fmtData(rel.primeira)} a {fmtData(rel.ultima)}
          {' '}· arquivo tirado em {fmtData(rel.gerado_em)} às {rel.gerado_em?.slice(11, 16)}
        </p>
      )) : (
        <p className="mini" style={{ marginBottom: 10 }}>Nenhum arquivo importado ainda nesta empresa.</p>
      )}
      <input ref={seletor} type="file" accept=".txt,text/plain" hidden onChange={escolher} />
      <div className="acoes-form" style={{ justifyContent: 'flex-start' }}>
        <button className="btn btn-primario" disabled={estado.enviando} onClick={() => seletor.current.click()}>
          {estado.enviando ? 'Importando…' : 'Importar arquivo do relógio'}
        </button>
      </div>
      {estado.erro && <p className="mini negativo" style={{ marginTop: 8 }}>{estado.erro}</p>}
      {r && (
        <p className="mini" style={{ marginTop: 8 }}>
          ✓ {r.novas ? `${r.novas.toLocaleString('pt-BR')} batidas novas importadas` : 'Nenhuma batida nova'}
          {r.repetidas ? ` (${r.repetidas.toLocaleString('pt-BR')} já estavam no sistema)` : ''}. O arquivo vai de {fmtData(r.primeira)} a {fmtData(r.ultima)}.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- horário de trabalho

function HorarioOficina({ oficina, horario, aoSalvar }) {
  const [texto, setTexto] = useState(horario);
  const [estado, setEstado] = useState({ salvando: false, erro: null, ok: false });
  useEffect(() => setTexto(horario), [horario]);

  const salvar = async () => {
    setEstado({ salvando: true, erro: null, ok: false });
    try {
      await api.put(`/oficinas/${oficina.id}/ponto/horario`, { horario: texto });
      await aoSalvar();
      setEstado({ salvando: false, erro: null, ok: true });
    } catch (e) {
      setEstado({ salvando: false, erro: e.message, ok: false });
    }
  };

  return (
    <section className="bloco bloco-corpo" data-guia="ponto-horario">
      <h2 className="secao-titulo">Horário de trabalho</h2>
      <p className="secao-desc">
        Vale para todos da oficina, menos quem tiver horário próprio (em “Pessoas do relógio”).
        Pela lei, diferenças de até 5 minutos em cada batida, somando no máximo 10 no dia, não contam.
      </p>
      <div className="acoes-form" style={{ justifyContent: 'flex-start' }}>
        <input
          className={`campo ${estado.erro ? 'invalido' : ''}`}
          style={{ maxWidth: 240 }}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && salvar()}
          aria-label="Horário de trabalho da empresa"
        />
        <button className="btn" disabled={estado.salvando || texto === horario} onClick={salvar}>Salvar horário</button>
      </div>
      <p className={`mini ${estado.erro ? 'negativo' : ''}`} style={{ marginTop: 8 }}>
        {estado.erro || (estado.ok ? '✓ Salvo' : 'Escreva entrada-saída de cada turno, ex.: 07:00-11:00 12:10-17:00')}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- espelho da folha

function Espelho({ oficina, info, aoVerPessoas }) {
  const [params, setParams] = useSearchParams();
  const hoje = new Date();
  const ano = Number(params.get('ano')) || hoje.getFullYear();
  const mes = Number(params.get('mes')) || hoje.getMonth() + 1;
  const folhaNum = oficina.folhas.some((f) => f.numero === Number(params.get('folha'))) ? Number(params.get('folha')) : oficina.folhas[0].numero;
  const [periodo, setPeriodo] = useState(null); // período escolhido à mão (null = o da folha)
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [detalhe, setDetalhe] = useState(null);

  const carregar = useCallback(async () => {
    const extra = periodo ? `&inicio=${periodo.inicio}&fim=${periodo.fim}` : '';
    try {
      setDados(await api.get(`/oficinas/${oficina.id}/ponto/espelho?folha=${folhaNum}&ano=${ano}&mes=${mes}${extra}`));
      setErro(null);
    } catch (e) {
      setErro(e.message);
    }
  }, [oficina.id, folhaNum, ano, mes, periodo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const irPara = (novo) => {
    setPeriodo(null);
    setAviso(null);
    setParams((p) => {
      const v = { ano, mes, folha: folhaNum, ...novo };
      p.set('ano', String(v.ano));
      p.set('mes', String(v.mes));
      p.set('folha', String(v.folha));
      return p;
    });
  };
  const mudarMes = (delta) => {
    const d = new Date(ano, mes - 1 + delta, 1);
    irPara({ ano: d.getFullYear(), mes: d.getMonth() + 1 });
  };
  const mudarData = (campo, valor) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return;
    setPeriodo({ ...(periodo || dados.periodo), [campo]: valor });
  };

  const folha = oficina.folhas.find((f) => f.numero === folhaNum);
  const fm = dados?.folha_mensal;
  const comPonto = dados?.funcionarios.filter((f) => f.espelho) || [];
  // Página de impressão do espelho (todos, ou só um funcionário).
  const imprimir = (funcionarioId) => window.open(`/espelho-ponto?o=${oficina.id}&folha=${folhaNum}&ano=${ano}&mes=${mes}`
    + `&inicio=${dados.periodo.inicio}&fim=${dados.periodo.fim}${funcionarioId ? `&f=${funcionarioId}` : ''}`, '_blank');

  const levarParaFolha = async () => {
    const texto = `Levar o ponto de ${fmtData(dados.periodo.inicio)} a ${fmtData(dados.periodo.fim)} para a ${rotuloFolha(folha)} de ${competencia(ano, mes)}?\n\n`
      + `As faltas, sábados, horas extras e atrasos de ${comPonto.length} funcionário(s) serão trocados pelos valores do ponto. `
      + 'Comissões, vales e outros ajustes não mudam.';
    if (!window.confirm(texto)) return;
    setOcupado(true);
    try {
      const r = await api.post(`/folhas-mensais/${fm.id}/ponto`, periodo || {});
      setAviso(`✓ Pronto: ${r.atualizados} funcionário(s) atualizados na folha.`);
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <>
      <div className="barra-mes">
        <div className="seletor-mes">
          <button className="btn-icone" onClick={() => mudarMes(-1)} aria-label="Mês anterior">
            <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <span className="rotulo-mes">{competencia(ano, mes)}</span>
          <button className="btn-icone" onClick={() => mudarMes(1)} aria-label="Próximo mês">
            <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
        <div className="segmentos">
          {oficina.folhas.map((f) => (
            <button key={f.numero} className={f.numero === folhaNum ? 'ativo' : ''} onClick={() => irPara({ folha: f.numero })}>
              {rotuloFolha(f)}{f.dia_fechamento ? ` · fecha dia ${f.dia_fechamento}` : ''}
            </button>
          ))}
        </div>
      </div>

      {erro && <div className="faixa faixa-erro">{erro}</div>}
      {!info.relogios.length ? (
        <div className="bloco vazio">
          <h3>Nenhum arquivo do relógio ainda</h3>
          <p>Importe o arquivo AFD tirado no pendrive (botão acima) para ver o ponto de cada funcionário.</p>
        </div>
      ) : !dados ? (
        <div className="bloco vazio">Carregando…</div>
      ) : (
        <>
          <div className="barra-folha" data-guia="ponto-periodo">
            <span className="estado-salvo">Período:</span>
            <input type="date" className="campo" style={{ width: 'auto' }} value={dados.periodo.inicio} onChange={(e) => mudarData('inicio', e.target.value)} aria-label="Início do período" />
            <span className="estado-salvo">a</span>
            <input type="date" className="campo" style={{ width: 'auto' }} value={dados.periodo.fim} onChange={(e) => mudarData('fim', e.target.value)} aria-label="Fim do período" />
            {periodo && <button className="btn btn-texto btn-p" onClick={() => setPeriodo(null)}>Voltar ao período da folha</button>}
            <span className="espaco" />
            <button className="btn" disabled={!comPonto.length} onClick={() => imprimir()} data-guia="ponto-imprimir">
              <svg viewBox="0 0 24 24"><path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z" /></svg>
              Imprimir espelhos
            </button>
            {fm?.status === 'aberta' && (
              <button className="btn btn-primario" disabled={ocupado || !comPonto.length} onClick={levarParaFolha} data-guia="ponto-levar">
                Levar para a folha
              </button>
            )}
          </div>

          {!folha.dia_fechamento && !periodo && (
            <div className="faixa faixa-info">Esta folha não tem dia de fechamento (Configurações), então o período é o mês inteiro.</div>
          )}
          {dados.ultimo_dia && dados.ultimo_dia < dados.periodo.fim && (
            <div className="faixa faixa-alerta">
              O relógio só tem dados até {fmtData(dados.ultimo_dia)}. Os dias depois disso ainda não contam: antes de fechar a folha, importe um arquivo mais novo.
            </div>
          )}
          {!fm && (
            <div className="faixa faixa-info">
              <span>A {rotuloFolha(folha)} de {competencia(ano, mes).toLowerCase()} ainda não foi aberta. Abra a folha para poder levar o ponto para ela.</span>
              <Link className="btn btn-p" to={`../folha?ano=${ano}&mes=${mes}&folha=${folhaNum}`}>Ir para a folha</Link>
            </div>
          )}
          {fm?.status === 'fechada' && <div className="faixa faixa-info">Esta folha já está fechada. Para mudar os valores, reabra a folha.</div>}
          {aviso && (
            <div className="faixa faixa-info">
              <span>{aviso}</span>
              <Link className="btn btn-p" to={`../folha?ano=${ano}&mes=${mes}&folha=${folhaNum}`}>Ver a folha</Link>
            </div>
          )}

          <div className="bloco tabela-moldura" data-guia="ponto-espelho">
            <table className="tabela">
              <thead>
                <tr>
                  <th className="col-nome">Funcionário</th>
                  <th className="dir">Dias<span className="th-dica">trabalhados</span></th>
                  <th className="dir">Faltas</th>
                  <th className="dir">Sábados</th>
                  <th className="dir">Hora extra</th>
                  <th className="dir">Atrasos</th>
                  <th className="centro">Para conferir</th>
                  {fm && <th className="dir">Na folha agora<span className="th-dica">faltas · extra · atraso</span></th>}
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {dados.funcionarios.map((f) => {
                  const e = f.espelho;
                  const l = f.lancamento;
                  return (
                    <tr key={f.id}>
                      <td className="col-nome">
                        <span className="nome-func">{f.nome}</span>
                        <span className="sub-func">{f.ponto_codigo ? `${f.horario}${f.horario_proprio ? ' (horário próprio)' : ''}` : ' '}</span>
                      </td>
                      {e ? (
                        <>
                          <td className="dir num">{e.trabalhados}</td>
                          <td className="dir num">{e.faltas ? <span className="negativo">{fmtQtd(e.faltas)}</span> : '—'}</td>
                          <td className="dir num">{e.sabados ? fmtQtd(e.sabados) : '—'}</td>
                          <td className="dir num">{horas(e.horas_extras)}</td>
                          <td className="dir num">{horas(e.horas_atraso)}</td>
                          <td className="centro">{e.conferir ? <span className="chip chip-ambar">{e.conferir} {e.conferir === 1 ? 'dia' : 'dias'}</span> : <span className="sem-valor">—</span>}</td>
                        </>
                      ) : (
                        <td colSpan={6} className="sem-valor">
                          Não está ligado ao relógio.{' '}
                          <button className="btn btn-texto btn-p" onClick={aoVerPessoas}>Ligar</button>
                        </td>
                      )}
                      {fm && (
                        <td className="dir num sem-valor" style={{ whiteSpace: 'nowrap' }}>
                          {l ? `${fmtQtd(l.faltas)} · ${horas(l.horas_extras)} · ${horas(l.horas_atraso)}` : ''}
                        </td>
                      )}
                      <td className="dir">
                        {e && <button className="btn btn-p" onClick={() => setDetalhe(f)} data-guia="ponto-ver-dias">Ver dias</button>}
                      </td>
                    </tr>
                  );
                })}
                {!dados.funcionarios.length && (
                  <tr><td colSpan={9} className="vazio">Nenhum funcionário nesta folha.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mini" style={{ marginTop: 10 }}>
            Falta = dia de semana sem batida em que outras pessoas bateram ponto (dia em que ninguém bateu conta como feriado ou folga geral).
            “Para conferir” são dias com batida faltando ou sobrando, ou ponto batido no domingo: esses dias não entram na conta de horas. Veja os dias e ajuste na folha se precisar.
          </p>
        </>
      )}

      {detalhe && (
        <DiasDoFuncionario funcionario={detalhe} periodo={dados.periodo} aoImprimir={() => imprimir(detalhe.id)} aoFechar={() => setDetalhe(null)} />
      )}
    </>
  );
}

const SITUACOES = {
  ok: ['chip-verde', 'Normal'],
  falta: ['chip-vermelho', 'Falta'],
  conferir: ['chip-ambar', 'Conferir'],
  sabado: ['chip-verde', 'Sábado trabalhado'],
  folga: ['chip-cinza', 'Folga'],
  sem_expediente: ['chip-cinza', 'Ninguém bateu ponto'],
  antes_admissao: ['chip-cinza', 'Antes da admissão'],
  sem_dados: ['chip-cinza', 'Sem dados do relógio'],
};

function DiasDoFuncionario({ funcionario: f, periodo, aoImprimir, aoFechar }) {
  const e = f.espelho;
  return (
    <Gaveta
      aberta
      aoFechar={aoFechar}
      largura={680}
      titulo={f.nome}
      subtitulo={`${fmtData(periodo.inicio)} a ${fmtData(periodo.fim)} · horário ${f.horario}`}
      rodape={(
        <>
          <span className="mini esquerda">Para entregar ao funcionário, com espaço para assinatura.</span>
          <button className="btn btn-primario" onClick={aoImprimir}>
            <svg viewBox="0 0 24 24"><path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z" /></svg>
            Imprimir
          </button>
        </>
      )}
    >
      <div className="tabela-moldura">
        <table className="tabela tabela-dias">
          <thead>
            <tr>
              <th>Dia</th>
              <th>Batidas</th>
              <th>Situação</th>
              <th className="dir">Trabalhou</th>
              <th className="dir">Extra / atraso</th>
            </tr>
          </thead>
          <tbody>
            {e.dias.map((d) => {
              const [cor, rotulo] = SITUACOES[d.situacao] || ['chip-cinza', d.situacao];
              const apagado = ['folga', 'sem_expediente', 'antes_admissao', 'sem_dados'].includes(d.situacao);
              return (
                <tr key={d.data} className={apagado ? 'linha-inativa' : ''}>
                  <td className="num">{fmtData(d.data).slice(0, 5)} <span className="sub-func" style={{ display: 'inline' }}>{d.semana.slice(0, 3)}</span></td>
                  <td className="num marcas">{d.marcas.join('  ') || '—'}</td>
                  <td>
                    <span className={`chip ${cor}`}>{rotulo}</span>
                    {d.nota && <span className="sub-func">{d.nota}</span>}
                  </td>
                  <td className="dir num">{d.trabalhado != null ? minutosEmHoras(d.trabalhado) : ''}</td>
                  <td className="dir num">
                    {d.extra ? `+${minutosEmHoras(d.extra)}` : ''}
                    {d.atraso ? <span className="negativo">−{minutosEmHoras(d.atraso)}</span> : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mini" style={{ marginTop: 10 }}>
        Total: {e.trabalhados} dias trabalhados · {fmtQtd(e.faltas)} falta(s) · {fmtQtd(e.sabados)} sábado(s) · extra {horas(e.horas_extras)} · atrasos {horas(e.horas_atraso)}
      </p>
    </Gaveta>
  );
}

// ---------------------------------------------------------------- pessoas do relógio

function Pessoas({ info, aoMudar }) {
  const [todas, setTodas] = useState(false);
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const porId = new Map(info.funcionarios.map((f) => [f.id, f]));
  const lista = info.pessoas.filter((p) => todas || p.recente || p.ligado);
  const sugestoes = lista.filter((p) => !p.ligado && p.sugestao);
  const codigosLigados = new Set(info.pessoas.filter((p) => p.ligado).map((p) => p.codigo));
  const ativosSemLigacao = info.funcionarios.filter((f) => f.ativo && (!f.ponto_codigo || !codigosLigados.has(f.ponto_codigo)));

  const executar = async (fn) => {
    setOcupado(true);
    setErro(null);
    try {
      await fn();
      await aoMudar();
    } catch (e) {
      setErro(e.message);
      await aoMudar();
    } finally {
      setOcupado(false);
    }
  };
  const ligar = (codigo, funcionarioId) => executar(() => api.put(`/ponto/pessoas/${codigo}`, { funcionario_id: funcionarioId || null }));
  const ligarSugestoes = () => executar(async () => {
    for (const p of sugestoes) await api.put(`/ponto/pessoas/${p.codigo}`, { funcionario_id: p.sugestao });
  });

  return (
    <>
      <div className="filtros">
        <div className="segmentos">
          <button className={!todas ? 'ativo' : ''} onClick={() => setTodas(false)}>Batendo ponto (últimos 60 dias)</button>
          <button className={todas ? 'ativo' : ''} onClick={() => setTodas(true)}>Todas ({info.pessoas.length})</button>
        </div>
      </div>

      {erro && <div className="faixa faixa-erro">{erro}</div>}
      {sugestoes.length > 0 && (
        <div className="faixa faixa-info">
          <span>O sistema achou {sugestoes.length} ligação(ões) pelo nome. Confira na lista abaixo antes de aceitar.</span>
          <button className="btn btn-p btn-primario" disabled={ocupado} onClick={ligarSugestoes}>Ligar todas as sugestões</button>
        </div>
      )}
      {ativosSemLigacao.length > 0 && (
        <div className="faixa faixa-alerta">
          <span>
            <strong>{ativosSemLigacao.length} funcionário(s) ativo(s) sem ligação com o relógio</strong> (o ponto deles não é calculado):{' '}
            {ativosSemLigacao.map((f) => f.nome).join(', ')}
          </span>
        </div>
      )}

      <div className="bloco tabela-moldura" data-guia="ponto-pessoas">
        <table className="tabela">
          <thead>
            <tr>
              <th>Nome no relógio</th>
              <th>Última batida</th>
              <th>Funcionário da folha</th>
              <th>Horário próprio<span className="th-dica">vazio = da empresa</span></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => {
              const sugerido = !p.ligado && p.sugestao ? porId.get(p.sugestao) : null;
              const daqui = p.ligado && porId.get(p.ligado.id);
              return (
                <tr key={p.codigo} className={p.recente ? '' : 'linha-inativa'}>
                  <td>
                    <span className="nome-func">{p.nome}</span>
                    <span className="sub-func">PIS/CPF {formatarCodigo(p.codigo)}{p.excluido ? ' · excluído do relógio' : ''}</span>
                  </td>
                  <td className="num">{fmtData(p.ultima)}</td>
                  <td>
                    {p.ligado && !daqui ? (
                      <span className="mini">Ligado a {p.ligado.nome} ({p.ligado.oficina})</span>
                    ) : (
                      <select
                        className="campo"
                        value={p.ligado?.id || ''}
                        disabled={ocupado}
                        onChange={(e) => ligar(p.codigo, Number(e.target.value))}
                        aria-label={`Funcionário ligado a ${p.nome}`}
                      >
                        <option value="">— não ligado —</option>
                        {info.funcionarios.filter((f) => f.ativo || f.id === p.ligado?.id).map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.nome}{f.funcao ? ` · ${f.funcao}` : ''}{f.ponto_codigo && f.ponto_codigo !== p.codigo ? ' (já ligado)' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    {sugerido && (
                      <span className="sub-func">
                        Sugestão: <strong>{sugerido.nome}</strong>{' '}
                        <button className="btn btn-texto btn-p" disabled={ocupado} onClick={() => ligar(p.codigo, sugerido.id)}>Ligar</button>
                      </span>
                    )}
                  </td>
                  <td>
                    {daqui && <CampoHorario funcionario={daqui} padrao={info.horario} aoSalvar={aoMudar} />}
                  </td>
                </tr>
              );
            })}
            {!lista.length && (
              <tr><td colSpan={4} className="vazio">Nenhuma pessoa. Importe o arquivo do relógio primeiro.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mini" style={{ marginTop: 10 }}>
        O relógio identifica cada pessoa pelo PIS/CPF. Ligue cada pessoa ao funcionário da folha uma vez só; quem for contratado depois é só ligar aqui.
        Use “Horário próprio” para quem trabalha em outro horário, ex.: 07:00-13:00 (meio período) ou 07:00-17:00 (quem não bate o almoço).
      </p>
    </>
  );
}

function CampoHorario({ funcionario, padrao, aoSalvar }) {
  const [texto, setTexto] = useState(funcionario.ponto_horario || '');
  const [erro, setErro] = useState(null);
  useEffect(() => setTexto(funcionario.ponto_horario || ''), [funcionario.ponto_horario]);

  const salvar = async () => {
    if (texto.trim() === (funcionario.ponto_horario || '')) return;
    try {
      await api.put(`/funcionarios/${funcionario.id}/ponto-horario`, { horario: texto });
      setErro(null);
      await aoSalvar();
    } catch (e) {
      setErro(e.message);
    }
  };

  return (
    <>
      <input
        className={`campo ${erro ? 'invalido' : ''}`}
        value={texto}
        placeholder={padrao}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={salvar}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        aria-label={`Horário próprio de ${funcionario.nome}`}
      />
      {erro && <span className="sub-func negativo">{erro}</span>}
    </>
  );
}

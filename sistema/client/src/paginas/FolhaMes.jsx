import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { CampoNumero } from '../componentes/Campos.jsx';
import DetalheLancamento from './DetalheLancamento.jsx';
import { calcularLancamento, somarResultados } from '@shared/calculo.js';
import { brl, competencia, fmtHoras, fmtQtd, rotuloFolha, valor } from '@shared/formato.js';
import { formatarDado, situacaoDaRegra, temCondicoes } from '@shared/regras.js';

/** Fila de salvamento automático: junta as alterações e envia ao servidor em sequência. */
function useSalvamento(aoErro) {
  const pendentes = useRef(new Map());
  const timer = useRef(null);
  const fila = useRef(Promise.resolve());
  const [estado, setEstado] = useState('ok');

  const enviar = useCallback(() => {
    clearTimeout(timer.current);
    fila.current = fila.current.then(async () => {
      const lote = [...pendentes.current.entries()];
      pendentes.current.clear();
      if (!lote.length) return;
      setEstado('salvando');
      try {
        for (const [id, patch] of lote) await api.patch(`/lancamentos/${id}`, patch);
        setEstado(pendentes.current.size ? 'pendente' : 'ok');
      } catch (e) {
        for (const [id, patch] of lote) pendentes.current.set(id, { ...patch, ...(pendentes.current.get(id) || {}) });
        setEstado('erro');
        aoErro(e.message);
      }
    });
    return fila.current;
  }, [aoErro]);

  const agendar = useCallback((id, patch) => {
    pendentes.current.set(id, { ...(pendentes.current.get(id) || {}), ...patch });
    setEstado('pendente');
    clearTimeout(timer.current);
    timer.current = setTimeout(enviar, 600);
  }, [enviar]);

  useEffect(() => {
    const antesDeSair = (e) => {
      if (pendentes.current.size) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', antesDeSair);
    return () => {
      window.removeEventListener('beforeunload', antesDeSair);
      enviar();
    };
  }, [enviar]);

  return { estado, agendar, enviar };
}

const COLUNAS_EDITAVEIS = ['faltas', 'sabados', 'horas_extras', 'horas_atraso', 'comissao'];
const NOMES_COLUNAS = { faltas: 'Faltas', sabados: 'Sábados', horas_extras: 'Horas extras', horas_atraso: 'Atrasos', comissao: 'Comissão' };
const DICA_CAMPO = { numero: 'qtd.', horas: 'h:mm', moeda: 'R$' };

const mostrar = (coluna, v) => {
  if (coluna === 'horas_extras' || coluna === 'horas_atraso') return fmtHoras(v);
  if (coluna === 'comissao') return valor(v);
  return fmtQtd(v);
};

export default function FolhaMes() {
  const { oficina } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const hoje = new Date();
  const ano = Number(params.get('ano')) || hoje.getFullYear();
  const mes = Number(params.get('mes')) || hoje.getMonth() + 1;
  const folhaNum = oficina.folhas.some((f) => f.numero === Number(params.get('folha'))) ? Number(params.get('folha')) : oficina.folhas[0].numero;

  const [situacao, setSituacao] = useState(null);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [detalheId, setDetalheId] = useState(null);
  const salvamento = useSalvamento(setErro);

  const fmAtual = situacao?.find((s) => s.numero === folhaNum)?.folha_mensal;

  const carregarSituacao = useCallback(async () => {
    const s = await api.get(`/oficinas/${oficina.id}/folhas-mensais?ano=${ano}&mes=${mes}`);
    setSituacao(s);
    return s;
  }, [oficina.id, ano, mes]);

  // Ao trocar de mês ou de folha: salva o que estiver pendente e carrega a nova.
  useEffect(() => {
    let vivo = true;
    (async () => {
      setCarregando(true);
      setErro(null);
      setDetalheId(null);
      try {
        await salvamento.enviar();
        const s = await carregarSituacao();
        const fm = s.find((x) => x.numero === folhaNum)?.folha_mensal;
        const d = fm ? await api.get(`/folhas-mensais/${fm.id}`) : null;
        if (vivo) setDados(d);
      } catch (e) {
        if (vivo) setErro(e.message);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oficina.id, ano, mes, folhaNum]);

  const irPara = (novo) => {
    const p = { ano, mes, folha: folhaNum, ...novo };
    setParams({ ano: String(p.ano), mes: String(p.mes), folha: String(p.folha) });
  };
  const mudarMes = (delta) => {
    const d = new Date(ano, mes - 1 + delta, 1);
    irPara({ ano: d.getFullYear(), mes: d.getMonth() + 1 });
  };

  const aberta = dados?.folha_mensal.status === 'aberta';

  // Recalcula na hora (folha aberta) usando as mesmas regras do servidor.
  const linhas = useMemo(() => {
    if (!dados) return [];
    return dados.lancamentos.map((l) => {
      if (!aberta) return l;
      const ctx = {
        oficina: dados.oficina,
        bonificacoes: dados.oficina.bonificacoes,
        funcionario: l.funcionario,
        parcelamentos: l.funcionario.parcelamentos,
        ano: dados.folha_mensal.ano,
        mes: dados.folha_mensal.mes,
      };
      return { ...l, resultado: calcularLancamento(ctx, l) };
    });
  }, [dados, aberta]);

  const totais = useMemo(() => somarResultados(linhas.map((l) => l.resultado)), [linhas]);

  // Soma das folhas já abertas no mês; a folha na tela entra com os valores recalculados na hora.
  const totaisMes = useMemo(() => {
    const abertas = (situacao || []).map((s) => s.folha_mensal).filter(Boolean);
    if (!abertas.length) return null;
    const t = { folhas: abertas.length, funcionarios: 0, total_proventos: 0, total_descontos: 0, liquido: 0 };
    for (const fm of abertas) {
      const f = dados?.folha_mensal.id === fm.id ? totais : fm.totais || {};
      for (const k of ['funcionarios', 'total_proventos', 'total_descontos', 'liquido']) t[k] += f[k] || 0;
    }
    for (const k of ['total_proventos', 'total_descontos', 'liquido']) t[k] = Math.round(t[k] * 100) / 100;
    return t;
  }, [situacao, dados, totais]);
  // Cada campo do mês criado pela empresa e cada regra com condição (ex.: zero falta) ganham uma coluna.
  const campos = (dados?.oficina.campos || []).filter((c) => c.escopo !== 'cadastro');
  const regrasCondicionais = dados ? dados.oficina.bonificacoes.filter((b) => b.ativo && temCondicoes(b)) : [];
  const temComissao = linhas.some((l) => l.funcionario.comissionado || l.comissao);
  const colunasVisiveis = COLUNAS_EDITAVEIS.filter((c) => c !== 'comissao' || temComissao);

  const atualizar = useCallback((id, patch) => {
    setDados((d) => ({ ...d, lancamentos: d.lancamentos.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
    salvamento.agendar(id, patch);
  }, [salvamento]);

  const executar = async (acao) => {
    setOcupado(true);
    setErro(null);
    try {
      await salvamento.enviar();
      await acao();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const abrirFolha = () => executar(async () => {
    const d = await api.post('/folhas-mensais', { oficina_id: oficina.id, folha_numero: folhaNum, ano, mes });
    setDados(d);
    await carregarSituacao();
  });

  const fecharFolha = () => {
    if (!window.confirm(`Fechar a ${rotuloFolha(dados.folha)} de ${competencia(ano, mes)}?\n\nOs valores ficam guardados no histórico e a folha não pode mais ser alterada (a não ser que você reabra).`)) return;
    executar(async () => {
      setDados(await api.post(`/folhas-mensais/${dados.folha_mensal.id}/fechar`));
      await carregarSituacao();
    });
  };

  const reabrirFolha = () => {
    if (!window.confirm('Reabrir esta folha?\n\nOs valores voltarão a ser calculados com o cadastro e as configurações atuais (salários, bonificações, hora extra).')) return;
    executar(async () => {
      setDados(await api.post(`/folhas-mensais/${dados.folha_mensal.id}/reabrir`));
      await carregarSituacao();
    });
  };

  const excluirFolha = () => {
    if (!window.confirm('Excluir esta folha do mês? Todos os lançamentos dela (faltas, horas, descontos) serão apagados.')) return;
    executar(async () => {
      await api.del(`/folhas-mensais/${dados.folha_mensal.id}`);
      setDados(null);
      await carregarSituacao();
    });
  };

  const incluirPendentes = () => executar(async () => {
    setDados(await api.post(`/folhas-mensais/${dados.folha_mensal.id}/incluir`));
    await carregarSituacao();
  });

  const removerDaFolha = (l) => {
    if (!window.confirm(`Tirar ${l.funcionario.nome} desta folha? Os lançamentos dele neste mês serão apagados.`)) return;
    executar(async () => {
      await api.del(`/lancamentos/${l.id}`);
      setDetalheId(null);
      setDados(await api.get(`/folhas-mensais/${dados.folha_mensal.id}`));
      await carregarSituacao();
    });
  };

  // Depois de lançar um vale pelo painel do funcionário: recarrega a folha com o vale novo.
  const recarregarFolha = async () => {
    await salvamento.enviar();
    setDados(await api.get(`/folhas-mensais/${dados.folha_mensal.id}`));
  };

  const imprimir = async (funcionarioId) => {
    await salvamento.enviar();
    const url = `/imprimir?fm=${dados.folha_mensal.id}${funcionarioId ? `&f=${funcionarioId}` : ''}`;
    window.open(url, '_blank');
  };

  const focar = (coluna, linha) => {
    const alvo = document.querySelector(`[data-col="${coluna}"][data-linha="${linha}"]`);
    if (alvo) alvo.focus();
  };

  const folhaInfo = oficina.folhas.find((f) => f.numero === folhaNum);
  const detalhe = linhas.find((l) => l.id === detalheId);

  return (
    <>
      <div className="barra-mes">
        <div className="seletor-mes" data-guia="folha-mes">
          <button className="btn-icone" onClick={() => mudarMes(-1)} aria-label="Mês anterior">
            <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <span className="rotulo-mes">{competencia(ano, mes)}</span>
          <button className="btn-icone" onClick={() => mudarMes(1)} aria-label="Próximo mês">
            <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
        {(ano !== hoje.getFullYear() || mes !== hoje.getMonth() + 1) && (
          <button className="btn btn-texto btn-p" onClick={() => irPara({ ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 })}>
            Voltar para o mês atual
          </button>
        )}
      </div>

      {totaisMes && (
        <div className="resumo-mes">
          <div className="resumo-mes-titulo">
            <strong>Mês inteiro</strong>
            <span>
              {totaisMes.folhas === oficina.folhas.length
                ? `${totaisMes.folhas} folhas somadas`
                : `${totaisMes.folhas} de ${oficina.folhas.length} folhas abertas`}
            </span>
          </div>
          <div className="resumo-mes-item"><span>Funcionários</span><strong>{totaisMes.funcionarios}</strong></div>
          <div className="resumo-mes-item"><span>Proventos</span><strong>{brl(totaisMes.total_proventos)}</strong></div>
          <div className="resumo-mes-item"><span>Descontos</span><strong>{brl(totaisMes.total_descontos)}</strong></div>
          <div className="resumo-mes-item forte"><span>Total a pagar no mês</span><strong>{brl(totaisMes.liquido)}</strong></div>
        </div>
      )}

      <div className="abas-folha" data-guia="folha-abas">
        {oficina.folhas.map((f) => {
          const s = situacao?.find((x) => x.numero === f.numero);
          const fm = s?.folha_mensal;
          return (
            <button key={f.numero} className={`aba-folha ${f.numero === folhaNum ? 'ativa' : ''}`} onClick={() => irPara({ folha: f.numero })}>
              <span className="linha1">
                <strong>{rotuloFolha(f)}</strong>
                {s && (!fm ? (
                  <span className="chip chip-cinza">Não iniciada</span>
                ) : fm.status === 'fechada' ? (
                  <span className="chip chip-verde"><span className="bolinha" />Fechada</span>
                ) : (
                  <span className="chip chip-ambar"><span className="bolinha" />Em andamento</span>
                ))}
              </span>
              <span className="linha2">
                <span>{s ? `${fm ? fm.totais?.funcionarios ?? 0 : s.ativos} pessoas` : '…'}{f.dia_fechamento ? ` · fecha dia ${f.dia_fechamento}` : ''}</span>
                {fm && <span className="num">{brl(f.numero === folhaNum && dados ? totais.liquido : fm.totais?.liquido)}</span>}
              </span>
            </button>
          );
        })}
      </div>

      {erro && (
        <div className="faixa faixa-erro">
          {erro}
          <button className="btn btn-p" onClick={() => setErro(null)}>Ok</button>
        </div>
      )}

      {carregando ? (
        <div className="bloco vazio">Carregando…</div>
      ) : !dados ? (
        <div className="bloco vazio">
          <h3>{rotuloFolha(folhaInfo)} de {competencia(ano, mes).toLowerCase()} ainda não foi aberta</h3>
          <p>
            Ao abrir, os {situacao?.find((s) => s.numero === folhaNum)?.ativos ?? 0} funcionários ativos desta folha entram
            automaticamente, com salário, bonificações e parcelas de vales já calculados.
          </p>
          <button className="btn btn-primario btn-g" onClick={abrirFolha} disabled={ocupado} data-guia="folha-abrir">
            Abrir {rotuloFolha(folhaInfo)} de {competencia(ano, mes)}
          </button>
        </div>
      ) : (
        <>
          <div className="totais" data-guia="folha-totais">
            <div className="bloco total"><span>Funcionários</span><strong>{totais.funcionarios}</strong></div>
            <div className="bloco total"><span>Total de proventos</span><strong>{brl(totais.total_proventos)}</strong></div>
            <div className="bloco total"><span>Total de descontos</span><strong>{brl(totais.total_descontos)}</strong></div>
            <div className="bloco total forte"><span>Total a pagar</span><strong>{brl(totais.liquido)}</strong></div>
          </div>

          <div className="barra-folha">
            {aberta ? (
              <span className={`estado-salvo ${salvamento.estado === 'erro' ? 'erro' : ''}`} data-guia="folha-salvo">
                {salvamento.estado === 'ok' && '✓ Tudo salvo'}
                {salvamento.estado === 'pendente' && 'Alterações não salvas…'}
                {salvamento.estado === 'salvando' && 'Salvando…'}
                {salvamento.estado === 'erro' && 'Erro ao salvar — tente de novo'}
              </span>
            ) : (
              <span className="estado-salvo">
                Folha fechada em {new Date(dados.folha_mensal.fechada_em.replace(' ', 'T')).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · valores guardados no histórico
              </span>
            )}
            <span className="espaco" />
            <button className="btn" onClick={() => imprimir()} disabled={ocupado || !linhas.length} data-guia="folha-imprimir">
              <svg viewBox="0 0 24 24"><path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z" /></svg>
              Imprimir cards
            </button>
            {aberta ? (
              <>
                <Link className="btn" to={`../ponto?ano=${ano}&mes=${mes}&folha=${folhaNum}`} data-guia="folha-puxar-ponto">Puxar do ponto</Link>
                <button className="btn btn-texto btn-perigo" onClick={excluirFolha} disabled={ocupado}>Excluir folha</button>
                <button className="btn btn-primario" onClick={fecharFolha} disabled={ocupado} data-guia="folha-fechar">Fechar folha</button>
              </>
            ) : (
              <button className="btn" onClick={reabrirFolha} disabled={ocupado} data-guia="folha-fechar">Reabrir folha</button>
            )}
          </div>

          {aberta && dados.pendentes.length > 0 && (
            <div className="faixa faixa-alerta" data-guia="folha-pendentes">
              <span>
                <strong>{dados.pendentes.length} funcionário(s) ativo(s) desta folha não estão na lista:</strong>{' '}
                {dados.pendentes.map((p) => p.nome).join(', ')}
              </span>
              <button className="btn btn-p" onClick={incluirPendentes} disabled={ocupado}>Incluir na folha</button>
            </div>
          )}

          <div className="bloco tabela-moldura" data-guia="folha-tabela">
            <table className="tabela">
              <thead>
                <tr>
                  <th className="col-nome">Funcionário</th>
                  <th className="dir">Salário</th>
                  <th className="dir">Faltas<span className="th-dica">dias</span></th>
                  <th className="dir">Sábados<span className="th-dica">qtd.</span></th>
                  <th className="dir">Hora extra<span className="th-dica">h:mm</span></th>
                  <th className="dir">Atrasos<span className="th-dica">h:mm</span></th>
                  {temComissao && <th className="dir">Comissão<span className="th-dica">R$</span></th>}
                  {campos.map((c) => (
                    <th key={`c${c.id}`} className={c.tipo === 'sim_nao' ? 'centro' : 'dir'}>
                      {c.nome}{DICA_CAMPO[c.tipo] && <span className="th-dica">{DICA_CAMPO[c.tipo]}</span>}
                    </th>
                  ))}
                  {regrasCondicionais.map((b) => <th key={`r${b.id}`} className="centro">{b.nome}</th>)}
                  <th className="dir">Proventos</th>
                  <th className="dir">Descontos</th>
                  <th className="dir">Líquido</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => {
                  const r = l.resultado;
                  const outros = (l.descontos?.length || 0) + (l.acrescimos?.length || 0) + r.descontos.filter((d) => d.parcelamento_id).length;
                  return (
                    <tr key={l.id}>
                      <td className="col-nome">
                        <button className="nome-func" onClick={() => setDetalheId(l.id)}>{l.funcionario.nome}</button>
                        <span className="sub-func">
                          {[l.funcionario.funcao, ...r.proventos.filter((p) => p.chave.startsWith('bon:')).map((p) => p.rotulo)].filter(Boolean).join(' · ') || ' '}
                        </span>
                      </td>
                      <td className="dir num">{valor(r.salario)}</td>
                      {colunasVisiveis.map((c) => (
                        <td key={c} className="dir">
                          {aberta ? (
                            c === 'comissao' && !l.funcionario.comissionado && !l.comissao ? (
                              <span className="sem-valor">—</span>
                            ) : (
                              <CampoNumero
                                tipo={c === 'horas_extras' || c === 'horas_atraso' ? 'horas' : c === 'comissao' ? 'moeda' : 'numero'}
                                valor={l[c]}
                                aoMudar={(v) => atualizar(l.id, { [c]: v })}
                                data-col={c}
                                data-linha={i}
                                aria-label={`${NOMES_COLUNAS[c]} de ${l.funcionario.nome}`}
                                className={c === 'comissao' ? 'largo' : ''}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); focar(c, i + 1); }
                                  if (e.key === 'ArrowUp') { e.preventDefault(); focar(c, i - 1); }
                                }}
                              />
                            )
                          ) : (
                            <span className={l[c] ? 'num' : 'sem-valor'}>{l[c] ? mostrar(c, l[c]) : '—'}</span>
                          )}
                        </td>
                      ))}
                      {campos.map((c) => (
                        <td key={`c${c.id}`} className={c.tipo === 'sim_nao' ? 'centro' : 'dir'}>
                          <CampoDoMes
                            campo={c}
                            lancamento={l}
                            aberta={aberta}
                            linha={i}
                            focar={focar}
                            aoMudar={(v) => atualizar(l.id, { campos: { ...l.campos, [c.id]: v } })}
                          />
                        </td>
                      ))}
                      {regrasCondicionais.map((b) => (
                        <td key={`r${b.id}`} className="centro">
                          <AjusteRegra
                            regra={b}
                            lancamento={l}
                            aberta={aberta}
                            aoMudar={(v) => atualizar(l.id, { regras_manuais: { ...l.regras_manuais, [b.id]: v } })}
                          />
                        </td>
                      ))}
                      <td className="dir num">{valor(r.total_proventos)}</td>
                      <td className="dir num">
                        {r.total_descontos ? <span className="negativo">− {valor(r.total_descontos)}</span> : <span className="sem-valor">—</span>}
                      </td>
                      <td className={`dir liquido-celula ${r.liquido < 0 ? 'negativo' : ''}`}>{valor(r.liquido)}</td>
                      <td className="dir">
                        <button className="btn btn-p" onClick={() => setDetalheId(l.id)} data-guia={aberta ? 'folha-ajustes' : undefined}>
                          {aberta ? (outros ? `Ajustes (${outros})` : 'Ajustes') : 'Ver card'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!linhas.length && (
                  <tr><td colSpan={12} className="vazio">Nenhum funcionário nesta folha.</td></tr>
                )}
              </tbody>
              {linhas.length > 0 && (
                <tfoot>
                  <tr>
                    <td>Total ({totais.funcionarios})</td>
                    <td className="dir num">{valor(totais.salario)}</td>
                    <td colSpan={colunasVisiveis.length + campos.length + regrasCondicionais.length} />
                    <td className="dir num">{valor(totais.total_proventos)}</td>
                    <td className="dir num">− {valor(totais.total_descontos)}</td>
                    <td className="dir num">{valor(totais.liquido)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {aberta && (
            <p className="mini" style={{ marginTop: 10 }}>
              Dica: use Enter ou as setas ↑ ↓ para ir para o funcionário de baixo. Faltas e sábados aceitam meio dia (0,5).
              Horas aceitam “1:30” ou “1h30”. Tudo é salvo automaticamente.
            </p>
          )}

          {detalhe && (
            <DetalheLancamento
              lancamento={detalhe}
              oficina={dados.oficina}
              folha={dados.folha}
              ano={dados.folha_mensal.ano}
              mes={dados.folha_mensal.mes}
              aberta={aberta}
              aoMudar={(patch) => atualizar(detalhe.id, patch)}
              aoRemover={() => removerDaFolha(detalhe)}
              aoLancarVale={recarregarFolha}
              aoImprimir={() => imprimir(detalhe.funcionario_id)}
              aoFechar={() => setDetalheId(null)}
            />
          )}
          <p className="mini" style={{ marginTop: 6 }}>
            Precisa mudar salário, bonificações ou PIX? Vá em <Link to={`/empresa/${oficina.slug}/funcionarios`}>Funcionários</Link>.
          </p>
        </>
      )}
    </>
  );
}

/** Valor de um campo do mês criado pela empresa (número, horas, R$ ou sim/não). */
function CampoDoMes({ campo: c, lancamento: l, aberta, linha, focar, aoMudar }) {
  const v = l.campos?.[c.id] ?? 0;
  const coluna = `campo:${c.id}`;
  const rotulo = `${c.nome} de ${l.funcionario.nome}`;
  if (!aberta) return <span className={v ? 'num' : 'sem-valor'}>{v ? (c.tipo === 'moeda' ? valor(v) : formatarDado(c.tipo, v)) : '—'}</span>;
  if (c.tipo === 'sim_nao') {
    return (
      <input
        type="checkbox"
        checked={!!v}
        onChange={(e) => aoMudar(e.target.checked ? 1 : 0)}
        aria-label={rotulo}
        data-col={coluna}
        data-linha={linha}
        style={{ width: 17, height: 17, accentColor: 'var(--cor)' }}
      />
    );
  }
  return (
    <CampoNumero
      tipo={c.tipo === 'horas' ? 'horas' : c.tipo === 'moeda' ? 'moeda' : 'numero'}
      valor={v}
      aoMudar={aoMudar}
      data-col={coluna}
      data-linha={linha}
      aria-label={rotulo}
      className={c.tipo === 'moeda' ? 'largo' : ''}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); focar(coluna, linha + 1); }
        if (e.key === 'ArrowUp') { e.preventDefault(); focar(coluna, linha - 1); }
      }}
    />
  );
}

/** Indicador de uma regra com condição: automático (cumpre as condições → aplica) ou ajustado na mão pelo gestor. */
function AjusteRegra({ regra, lancamento: l, aberta, aoMudar }) {
  const s = situacaoDaRegra(regra, l.resultado);
  if (!s) return <span className="sem-valor" title="Esta regra não vale para este funcionário">—</span>;
  const cor = regra.tipo === 'desconto' ? 'chip-vermelho' : 'chip-verde';
  if (!aberta) return s.aplicada ? <span className={`chip ${cor}`}>Sim</span> : <span className="sem-valor">—</span>;
  const titulo = s.manual
    ? 'Ajustado na mão. Clique para alternar.'
    : s.automatico ? 'Cumpre as condições da regra. Clique para retirar.' : 'Não cumpre as condições da regra. Clique para aplicar mesmo assim.';
  return (
    <button
      className={`chip chip-botao ${s.aplicada ? cor : 'chip-cinza'} ${s.manual ? 'manual' : ''}`}
      title={titulo}
      onClick={() => {
        const novo = !s.aplicada;
        aoMudar(novo === s.automatico ? null : novo ? 'sim' : 'nao');
      }}
    >
      {s.aplicada ? 'Sim' : 'Não'}
      {s.manual && ' *'}
    </button>
  );
}

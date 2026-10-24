import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Gaveta from '../componentes/Gaveta.jsx';
import { Campo, CampoNumero } from '../componentes/Campos.jsx';
import { TIPOS_DESCONTO } from '@shared/calculo.js';
import { brl, competenciaCurta, fmtData, fmtQtd, valor } from '@shared/formato.js';
import { definicaoDaRegra, descreverCalculo, ehMarcada, valeNaFolha, variaveisDa } from '@shared/regras.js';
import { faltaParaQr } from '@shared/pix.js';
import { SituacaoVale } from './Vales.jsx';

const VAZIO = {
  nome: '', nome_completo: '', funcao: '', folha_numero: 1, salario: 0, admissao: '', comissionado: false,
  pix_tipo: 'CPF', pix_chave: '', pix_titular: '', pix_banco: '', observacoes: '', ativo: true, bonificacoes: [], campos: {},
};


export default function FormFuncionario({ oficina, funcionarioId, folhaInicial, aoSalvar, aoFechar, aoCriar }) {
  const [form, setForm] = useState(funcionarioId ? null : { ...VAZIO, folha_numero: folhaInicial });
  const [extra, setExtra] = useState({ parcelamentos: [], historico: [] });
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [alterado, setAlterado] = useState(false);

  useEffect(() => {
    if (!funcionarioId) return;
    api.get(`/funcionarios/${funcionarioId}`)
      .then((f) => {
        setForm({ ...VAZIO, ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v ?? VAZIO[k] ?? v])) });
        setExtra({ parcelamentos: f.parcelamentos, historico: f.historico });
      })
      .catch((e) => setErro(e.message));
  }, [funcionarioId]);

  const mudar = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setAlterado(true);
  };

  // Regras "só quem estiver marcado no cadastro"; as outras valem sozinhas, pelas condições de cada uma.
  // Só as regras da folha da pessoa (as marcas de outras folhas ficam guardadas e voltam se ela voltar para lá).
  const daFolha = form ? oficina.bonificacoes.filter((b) => valeNaFolha(b, form.folha_numero)) : oficina.bonificacoes;
  const bonificacoesAtribuiveis = daFolha.filter((b) => ehMarcada(b) && (b.ativo || form?.bonificacoes.some((x) => x.bonificacao_id === b.id)));
  const automaticas = daFolha.filter((b) => b.ativo && !ehMarcada(b));
  const dadosDasRegras = variaveisDa(oficina.campos, oficina.bonificacoes);
  // Campos que a empresa criou para o cadastro (ex.: número de filhos), usados pelas regras.
  const camposCadastro = oficina.campos.filter((c) => c.escopo === 'cadastro');
  const mudarCampo = (c, v) => mudar({ campos: { ...form.campos, [c.id]: v } });
  const emReais = (b) => {
    const c = definicaoDaRegra(b).calculo;
    return c.modo === 'fixo' || (c.modo === 'por_quantidade' && c.unidade === 'reais');
  };
  const temBon = (id) => form.bonificacoes.find((x) => x.bonificacao_id === id);
  const alternarBon = (id, ligado) => mudar({
    bonificacoes: ligado ? [...form.bonificacoes, { bonificacao_id: id, valor: null }] : form.bonificacoes.filter((x) => x.bonificacao_id !== id),
  });
  const valorBon = (id, v) => mudar({ bonificacoes: form.bonificacoes.map((x) => (x.bonificacao_id === id ? { ...x, valor: v || null } : x)) });

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      if (funcionarioId) {
        const f = await api.put(`/funcionarios/${funcionarioId}`, form);
        setExtra({ parcelamentos: f.parcelamentos, historico: f.historico });
        setAlterado(false);
        await aoSalvar();
        aoFechar();
      } else {
        const novo = await api.post(`/oficinas/${oficina.id}/funcionarios`, form);
        await aoSalvar();
        aoCriar(novo);
      }
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!window.confirm(`Excluir ${form.nome} do cadastro? Isso não pode ser desfeito.`)) return;
    try {
      await api.del(`/funcionarios/${funcionarioId}`);
      await aoSalvar();
      aoFechar();
    } catch (e) {
      setErro(e.message);
    }
  };

  const fechar = () => {
    if (alterado && !window.confirm('Sair sem salvar as alterações?')) return;
    aoFechar();
  };

  const folhaAtual = oficina.folhas.find((f) => f.numero === form?.folha_numero);

  return (
    <Gaveta
      aberta
      aoFechar={fechar}
      titulo={funcionarioId ? form?.nome || 'Funcionário' : 'Novo funcionário'}
      subtitulo={`${oficina.nome}${folhaAtual ? ` · ${folhaAtual.numero}ª Folha` : ''}`}
      largura={640}
      rodape={form && (
        <>
          {funcionarioId && !extra.historico.length && (
            <button className="btn btn-texto btn-perigo esquerda" onClick={excluir}>Excluir</button>
          )}
          <button className="btn" onClick={fechar}>Cancelar</button>
          <button className="btn btn-primario" onClick={salvar} disabled={salvando} data-guia="func-salvar">
            {salvando ? 'Salvando…' : funcionarioId ? 'Salvar alterações' : 'Cadastrar funcionário'}
          </button>
        </>
      )}
    >
      {erro && <div className="faixa faixa-erro" style={{ margin: 0 }}>{erro}</div>}
      {!form ? (
        <div className="vazio">Carregando…</div>
      ) : (
        <>
          <section className="painel" data-guia="func-dados">
            <div className="painel-titulo"><h3>Dados do funcionário</h3></div>
            <div className="grade-form">
              <Campo rotulo="Nome (aparece no card) *">
                <input className="campo" value={form.nome} onChange={(e) => mudar({ nome: e.target.value })} autoFocus={!funcionarioId} />
              </Campo>
              <Campo rotulo="Função">
                <input className="campo" list="funcoes" placeholder="Ex.: Auxiliar, Vendedora" value={form.funcao} onChange={(e) => mudar({ funcao: e.target.value })} />
                <datalist id="funcoes">
                  {['Auxiliar', 'Vendedora', 'Vendedor', 'Atendente', 'Caixa', 'Operador(a)', 'Motorista', 'Limpeza', 'Escritório (RH)', 'Supervisora', 'Gerente'].map((x) => <option key={x} value={x} />)}
                </datalist>
              </Campo>
              <Campo rotulo="Folha *">
                <select className="campo" value={form.folha_numero} onChange={(e) => mudar({ folha_numero: Number(e.target.value) })}>
                  {oficina.folhas.map((f) => (
                    <option key={f.numero} value={f.numero}>
                      {f.numero}ª Folha{f.apelido ? ` · ${f.apelido}` : ''}{f.dia_fechamento ? ` (fecha dia ${f.dia_fechamento})` : ''}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Salário mensal (R$) *" dica={form.salario ? `Valor do dia: ${brl(oficina.arredondar_dia ? Math.floor(form.salario / oficina.divisor_dias) : form.salario / oficina.divisor_dias)}` : null}>
                <CampoNumero tipo="moeda" valor={form.salario} aoMudar={(v) => mudar({ salario: v })} />
              </Campo>
              <Campo rotulo="Nome completo">
                <input className="campo" value={form.nome_completo} onChange={(e) => mudar({ nome_completo: e.target.value })} />
              </Campo>
              <Campo rotulo="Data de admissão">
                <input className="campo" type="date" value={form.admissao} onChange={(e) => mudar({ admissao: e.target.value })} />
              </Campo>
            </div>
          </section>

          <section className="painel" data-guia="func-bonificacoes">
            <div className="painel-titulo"><h3>Bonificações e comissão</h3></div>
            {bonificacoesAtribuiveis.length === 0 && (
              <p className="mini">{oficina.folhas.length > 1 ? 'Esta folha' : 'Esta empresa'} não tem bonificações para marcar no cadastro. Dá para criar na aba Regras.</p>
            )}
            {bonificacoesAtribuiveis.map((b) => {
              const atual = temBon(b.id);
              return (
                <div className="bonus-linha" key={b.id}>
                  <label className="caixa-marcar">
                    <input type="checkbox" checked={!!atual} onChange={(e) => alternarBon(b.id, e.target.checked)} />
                    <span>
                      <strong>{b.nome}{!b.ativo && ' (desativada)'}</strong>
                      <small>{b.tipo === 'desconto' ? 'Desconta' : 'Valor padrão'}: {descreverCalculo(definicaoDaRegra(b), b.valor, dadosDasRegras)}</small>
                    </span>
                  </label>
                  {atual && definicaoDaRegra(b).calculo.modo !== 'faixas' && (
                    <CampoNumero
                      tipo={emReais(b) ? 'moeda' : 'numero'}
                      valor={atual.valor ?? 0}
                      aoMudar={(v) => valorBon(b.id, v)}
                      placeholder={`Padrão ${emReais(b) ? valor(b.valor) : fmtQtd(b.valor)}`}
                      aria-label={`Valor próprio de ${b.nome}`}
                      title="Deixe em branco para usar o valor padrão"
                    />
                  )}
                </div>
              );
            })}
            {automaticas.length > 0 && (
              <p className="mini" style={{ margin: '8px 0' }}>
                Automáticas, valem sem marcar nada aqui (cada uma com as suas condições): {automaticas.map((b) => b.nome).join(', ')}.
              </p>
            )}
            <label className="caixa-marcar" style={{ borderTop: '1px dashed var(--borda)', marginTop: 6, paddingTop: 10 }}>
              <input type="checkbox" checked={form.comissionado} onChange={(e) => mudar({ comissionado: e.target.checked })} />
              <span>
                <strong>Recebe comissão sobre vendas</strong>
                <small>Abre o campo “Comissão” na folha do mês para este funcionário.</small>
              </span>
            </label>
          </section>

          {camposCadastro.length > 0 && (
            <section className="painel">
              <div className="painel-titulo"><h3>Dados para as regras</h3></div>
              <div className="grade-form">
                {camposCadastro.map((c) => (
                  <Campo key={c.id} rotulo={c.nome}>
                    {c.tipo === 'sim_nao' ? (
                      <select className="campo" value={form.campos?.[c.id] ? 1 : 0} onChange={(e) => mudarCampo(c, Number(e.target.value))}>
                        <option value={0}>Não</option>
                        <option value={1}>Sim</option>
                      </select>
                    ) : (
                      <CampoNumero
                        tipo={c.tipo === 'horas' ? 'horas' : c.tipo === 'moeda' ? 'moeda' : 'numero'}
                        valor={form.campos?.[c.id] ?? 0}
                        aoMudar={(v) => mudarCampo(c, v)}
                      />
                    )}
                  </Campo>
                ))}
              </div>
              <p className="mini" style={{ marginTop: 8 }}>Campos criados pela empresa na aba Regras.</p>
            </section>
          )}

          <section className="painel" data-guia="func-pix">
            <div className="painel-titulo"><h3>Chave PIX</h3></div>
            <div className="grade-form">
              <Campo rotulo="Tipo de chave">
                <select className="campo" value={form.pix_tipo || ''} onChange={(e) => mudar({ pix_tipo: e.target.value })}>
                  {['CPF', 'Telefone', 'E-mail', 'Aleatória', 'CNPJ'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Chave">
                <input className="campo" value={form.pix_chave} onChange={(e) => mudar({ pix_chave: e.target.value })} />
              </Campo>
              <Campo rotulo="Titular da conta" dica="Se a conta for de outra pessoa, coloque o nome dela.">
                <input className="campo" value={form.pix_titular} onChange={(e) => mudar({ pix_titular: e.target.value })} />
              </Campo>
              <Campo rotulo="Banco">
                <input className="campo" list="bancos" value={form.pix_banco} onChange={(e) => mudar({ pix_banco: e.target.value })} />
                <datalist id="bancos">
                  {['Nubank', 'Caixa', 'Bradesco', 'Banco do Brasil', 'Itaú', 'Santander', 'Inter', 'PicPay', 'Mercado Pago'].map((x) => <option key={x} value={x} />)}
                </datalist>
              </Campo>
            </div>
            <p className="mini" style={{ marginTop: 10 }}>
              {faltaParaQr(form).length
                ? `O card só sai com QR Code do Pix com chave, titular e banco preenchidos. Falta: ${faltaParaQr(form).join(', ')}.`
                : 'O card vai sair com QR Code do Pix (sem valor: quem paga digita o valor no banco).'}
            </p>
          </section>

          <section className="painel">
            <Campo rotulo="Observações (não saem no card)">
              <textarea className="campo" value={form.observacoes} onChange={(e) => mudar({ observacoes: e.target.value })} />
            </Campo>
            <label className="caixa-marcar" style={{ marginTop: 10 }} data-guia="func-desligado">
              <input type="checkbox" checked={!form.ativo} onChange={(e) => mudar({ ativo: !e.target.checked })} />
              <span>
                <strong>Funcionário desligado</strong>
                <small>Não entra mais nas novas folhas. O histórico de pagamentos continua guardado.</small>
              </span>
            </label>
          </section>

          {funcionarioId && (
            <ValesDoFuncionario oficina={oficina} funcionarioId={funcionarioId} lista={extra.parcelamentos} />
          )}

          {funcionarioId && (
            <section className="painel">
              <div className="painel-titulo"><h3>Histórico de pagamentos</h3></div>
              {!extra.historico.length ? (
                <p className="itens-vazio">Ainda não há pagamentos registrados.</p>
              ) : (
                <table className="tabela">
                  <thead>
                    <tr><th>Mês</th><th>Folha</th><th>Situação</th><th className="dir">Faltas</th><th className="dir">Líquido</th></tr>
                  </thead>
                  <tbody>
                    {extra.historico.map((h) => (
                      <tr key={h.folha_mensal_id}>
                        <td>
                          <Link to={`/empresa/${oficina.slug}/folha?ano=${h.ano}&mes=${h.mes}&folha=${h.folha_numero}`}>{competenciaCurta(h.ano, h.mes)}</Link>
                        </td>
                        <td>{h.folha_numero}ª</td>
                        <td>{h.status === 'fechada' ? <span className="chip chip-verde">Fechada</span> : <span className="chip chip-ambar">Em andamento</span>}</td>
                        <td className="dir num">{h.faltas || '—'}</td>
                        <td className="dir num"><strong>{valor(h.liquido)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
        </>
      )}
    </Gaveta>
  );
}

/** Vales do funcionário (o lançamento e a edição ficam no módulo Vales). */
function ValesDoFuncionario({ oficina, funcionarioId, lista }) {
  const base = `/empresa/${oficina.slug}/vales`;
  const abertos = lista.filter((v) => v.saldo > 0);
  const saldo = abertos.reduce((s, v) => s + v.saldo, 0);
  return (
    <section className="painel">
      <div className="painel-titulo">
        <h3>Vales {abertos.length > 0 && <span className="mini">· saldo a descontar {brl(saldo)}</span>}</h3>
        <Link className="btn btn-p" to={`${base}?v=novo&para=${funcionarioId}`}>+ Lançar vale</Link>
      </div>
      <div className="lista-simples">
        {lista.map((v) => (
          <div key={v.id} style={{ alignItems: 'center' }}>
            <span>
              <Link to={`${base}?v=${v.id}`}><strong>{v.descricao || TIPOS_DESCONTO[v.tipo]}</strong></Link>{' '}
              <span className="mini">
                {fmtData(v.data || v.criado_em)} · {v.num_parcelas === 1 ? 'de uma vez' : `${v.num_parcelas}× de ${valor(v.valor_parcela)}`} · a partir de {competenciaCurta(...v.inicio.split('-').map(Number))}
              </span>
            </span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="num">{valor(v.valor_total)}</span>
              <SituacaoVale vale={v} />
            </span>
          </div>
        ))}
        {!lista.length && <p className="itens-vazio">Nenhum vale lançado.</p>}
      </div>
    </section>
  );
}

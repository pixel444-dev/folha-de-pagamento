import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import Gaveta from '../componentes/Gaveta.jsx';
import { Campo, CampoNumero } from '../componentes/Campos.jsx';
import { indiceParcela, round2, TIPOS_DESCONTO } from '@shared/calculo.js';
import { brl, competencia, competenciaCurta, fmtData, MESES, valor } from '@shared/formato.js';

const hojeIso = () => new Date().toLocaleDateString('sv-SE');
const mesAtual = () => hojeIso().slice(0, 7);
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const mesCurto = (aaaamm) => competenciaCurta(...aaaamm.split('-').map(Number));

/** Meses (AAAA-MM) a partir de `inicio`. */
function proximosMeses(inicio, quantidade) {
  const [a, m] = inicio.split('-').map(Number);
  return Array.from({ length: quantidade }, (_, i) => {
    const d = new Date(a, m - 1 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

export function situacaoVale(v) {
  if (v.saldo <= 0) return { texto: 'Quitado', classe: 'chip-verde' };
  const hoje = new Date();
  if (!v.vezes && indiceParcela(v.inicio, hoje.getFullYear(), hoje.getMonth() + 1) < 0) {
    return { texto: `Começa em ${mesCurto(v.inicio)}`, classe: 'chip-cinza' };
  }
  if (!v.vezes) return { texto: 'A descontar', classe: 'chip-ambar' };
  return { texto: `${v.vezes} de ${v.num_parcelas} descontada${v.vezes > 1 ? 's' : ''}`, classe: 'chip-ambar' };
}

export function SituacaoVale({ vale }) {
  const s = situacaoVale(vale);
  return <span className={`chip ${s.classe}`}>{s.texto}</span>;
}

const nomeVale = (v) => v.descricao || TIPOS_DESCONTO[v.tipo] || 'Vale';
const abrirRecibo = (id) => window.open(`/recibo-vale?id=${id}`, '_blank');

export default function Vales() {
  const { oficina } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const [vales, setVales] = useState(null);
  const [funcionarios, setFuncionarios] = useState([]);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [filtro, setFiltro] = useState('aberto');
  const [busca, setBusca] = useState('');

  const editando = params.get('v'); // id do vale ou "novo"
  const filtroFuncionario = Number(params.get('f')) || null;
  const para = Number(params.get('para')) || null;

  const mudarParams = (mudancas) => {
    const p = Object.fromEntries(params.entries());
    for (const [k, v] of Object.entries(mudancas)) {
      if (v == null) delete p[k];
      else p[k] = String(v);
    }
    setParams(p);
  };

  const carregar = useCallback(async () => {
    try {
      const [v, f] = await Promise.all([api.get(`/oficinas/${oficina.id}/vales`), api.get(`/oficinas/${oficina.id}/funcionarios`)]);
      setVales(v);
      setFuncionarios(f);
    } catch (e) {
      setErro(e.message);
    }
  }, [oficina.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const filtrados = useMemo(() => {
    if (!vales) return [];
    const termo = semAcento(busca);
    return vales.filter((v) =>
      (filtro === 'todos' || (filtro === 'aberto' ? v.saldo > 0 : v.saldo <= 0))
      && (!filtroFuncionario || v.funcionario_id === filtroFuncionario)
      && (!termo || semAcento(`${v.funcionario_nome} ${v.descricao}`).includes(termo)));
  }, [vales, filtro, busca, filtroFuncionario]);

  const abertos = (vales || []).filter((v) => v.saldo > 0);
  const saldoTotal = round2(abertos.reduce((s, v) => s + v.saldo, 0));
  const doMes = (vales || []).filter((v) => (v.data || v.criado_em || '').slice(0, 7) === mesAtual());
  const totalDoMes = round2(doMes.reduce((s, v) => s + v.valor_total, 0));
  const hoje = new Date();
  const nomeFiltro = funcionarios.find((f) => f.id === filtroFuncionario)?.nome;
  const valeEditado = editando && editando !== 'novo' ? vales?.find((v) => v.id === Number(editando)) : null;

  const aoSalvar = async (vale, eraNovo) => {
    await carregar();
    mudarParams({ v: null, para: null });
    if (eraNovo) setAviso({ texto: `${TIPOS_DESCONTO[vale.tipo]} de ${brl(vale.valor_total)} lançado para ${vale.funcionario_nome}.`, id: vale.id });
  };

  return (
    <>
      <div className="totais totais-3" data-guia="vales-totais">
        <div className="bloco total forte"><span>Saldo a descontar</span><strong>{brl(saldoTotal)}</strong></div>
        <div className="bloco total"><span>Vales em aberto</span><strong>{abertos.length}</strong></div>
        <div className="bloco total"><span>Lançados em {MESES[hoje.getMonth()].toLowerCase()}</span><strong>{brl(totalDoMes)}</strong></div>
      </div>

      {aviso && (
        <div className="faixa faixa-info">
          <span>✓ {aviso.texto} O desconto entra sozinho na folha.</span>
          <button className="btn btn-p" onClick={() => abrirRecibo(aviso.id)}>Imprimir recibo</button>
          <button className="btn btn-p btn-texto" style={{ marginLeft: 0 }} onClick={() => setAviso(null)}>Fechar</button>
        </div>
      )}
      {erro && <div className="faixa faixa-erro">{erro}</div>}

      <div className="filtros" data-guia="vales-filtros">
        <input className="campo busca" placeholder="Buscar por funcionário ou descrição" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="segmentos">
          {[['aberto', 'Em aberto'], ['quitado', 'Quitados'], ['todos', 'Todos']].map(([k, r]) => (
            <button key={k} className={filtro === k ? 'ativo' : ''} onClick={() => setFiltro(k)}>{r}</button>
          ))}
        </div>
        {filtroFuncionario && (
          <span className="chip">
            Só {nomeFiltro || 'um funcionário'}
            <button className="chip-x" onClick={() => mudarParams({ f: null })} aria-label="Mostrar todos">×</button>
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn btn-primario" onClick={() => mudarParams({ v: 'novo', para: filtroFuncionario })} data-guia="vales-novo">+ Lançar vale</button>
      </div>

      <div className="bloco tabela-moldura" data-guia="vales-tabela">
        <table className="tabela">
          <thead>
            <tr>
              <th>Data</th>
              <th>Funcionário</th>
              <th>Descrição</th>
              <th className="dir">Valor</th>
              <th>Desconto na folha</th>
              <th className="dir">Já descontado</th>
              <th className="dir">Saldo</th>
              <th>Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!vales && <tr><td colSpan={9} className="vazio">Carregando…</td></tr>}
            {filtrados.map((v) => (
              <tr key={v.id} className="clicavel" onClick={() => mudarParams({ v: v.id })}>
                <td className="num">{fmtData(v.data || v.criado_em) || '—'}</td>
                <td>
                  <span className="nome-func">{v.funcionario_nome}</span>
                  <span className="sub-func">{v.folha_numero}ª Folha{v.funcionario_ativo ? '' : ' · desligado'}</span>
                </td>
                <td>
                  {nomeVale(v)}
                  {v.tipo !== 'vale' && <span className="chip" style={{ marginLeft: 6 }}>{TIPOS_DESCONTO[v.tipo]}</span>}
                </td>
                <td className="dir num">{valor(v.valor_total)}</td>
                <td>
                  {v.num_parcelas === 1 ? 'De uma vez' : `${v.num_parcelas}× de ${valor(v.valor_parcela)}`}
                  <span className="sub-func">a partir de {mesCurto(v.inicio)}</span>
                </td>
                <td className="dir num">{v.descontado ? valor(v.descontado) : <span className="sem-valor">—</span>}</td>
                <td className="dir num"><strong>{valor(v.saldo)}</strong></td>
                <td><SituacaoVale vale={v} /></td>
                <td className="dir">
                  <button className="btn btn-p" onClick={(e) => { e.stopPropagation(); abrirRecibo(v.id); }}>Recibo</button>
                </td>
              </tr>
            ))}
            {vales && !filtrados.length && (
              <tr>
                <td colSpan={9} className="vazio">
                  {filtro === 'aberto' ? 'Nenhum vale em aberto.' : 'Nenhum vale encontrado.'}
                </td>
              </tr>
            )}
          </tbody>
          {filtrados.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={3}>{filtrados.length} vale(s)</td>
                <td className="dir num">{valor(filtrados.reduce((s, v) => s + v.valor_total, 0))}</td>
                <td />
                <td className="dir num">{valor(filtrados.reduce((s, v) => s + v.descontado, 0))}</td>
                <td className="dir num">{valor(filtrados.reduce((s, v) => s + v.saldo, 0))}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="mini" style={{ marginTop: 10 }}>
        O vale é descontado sozinho nas folhas a partir do mês escolhido, até quitar. Se uma folha não descontar
        (ou já estiver fechada), a parcela passa para a próxima. O saldo só baixa quando a folha é fechada.
      </p>

      {editando && (editando === 'novo' || valeEditado) && (
        <FormVale
          key={editando}
          oficina={oficina}
          vale={valeEditado}
          funcionarios={funcionarios}
          funcionarioInicial={para}
          aoSalvar={aoSalvar}
          aoMudar={carregar}
          aoFechar={() => mudarParams({ v: null, para: null })}
        />
      )}
    </>
  );
}

function FormVale({ oficina, vale, funcionarios, funcionarioInicial, aoSalvar, aoMudar, aoFechar }) {
  const [form, setForm] = useState(() => (vale ? {
    funcionario_id: vale.funcionario_id, tipo: vale.tipo, data: vale.data || '', valor_total: vale.valor_total,
    num_parcelas: vale.num_parcelas, inicio: vale.inicio, descricao: vale.descricao || '',
  } : {
    funcionario_id: funcionarioInicial || '', tipo: 'vale', data: hojeIso(), valor_total: 0, num_parcelas: 1, inicio: mesAtual(), descricao: '',
  }));
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const mudar = (p) => setForm((f) => ({ ...f, ...p }));

  const travado = !!vale?.descontos.length; // já descontado em folha fechada
  const funcionario = funcionarios.find((f) => f.id === Number(form.funcionario_id));
  const parcelas = Math.max(1, Math.round(form.num_parcelas) || 1);
  const parcela = round2(form.valor_total / parcelas);
  const ultima = round2(form.valor_total - parcela * (parcelas - 1));
  const meses = /^\d{4}-\d{2}$/.test(form.inicio) ? proximosMeses(form.inicio, parcelas) : [];

  const porFolha = oficina.folhas.map((folha) => ({
    folha,
    lista: funcionarios.filter((f) => f.folha_numero === folha.numero && (f.ativo || f.id === Number(form.funcionario_id))),
  })).filter((g) => g.lista.length);

  const executar = async (acao) => {
    setSalvando(true);
    setErro(null);
    try {
      await acao();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const salvar = () => executar(async () => {
    const corpo = { ...form, funcionario_id: Number(form.funcionario_id), num_parcelas: parcelas };
    const salvo = vale ? await api.put(`/vales/${vale.id}`, corpo) : await api.post('/vales', corpo);
    await aoSalvar(salvo, !vale);
  });

  const excluir = () => {
    if (!window.confirm(`Excluir este vale de ${brl(vale.valor_total)} de ${vale.funcionario_nome}? Ele sai das folhas em andamento.`)) return;
    executar(async () => {
      await api.del(`/vales/${vale.id}`);
      await aoSalvar(vale, false);
    });
  };

  const encerrar = () => {
    if (!window.confirm(`Encerrar o vale com ${brl(vale.descontado)} descontados? O saldo de ${brl(vale.saldo)} não será mais descontado.`)) return;
    executar(async () => {
      await api.post(`/vales/${vale.id}/encerrar`);
      await aoMudar();
    });
  };

  return (
    <Gaveta
      aberta
      aoFechar={aoFechar}
      titulo={vale ? `${nomeVale(vale)} · ${vale.funcionario_nome}` : 'Lançar vale'}
      subtitulo={vale ? `Lançado em ${fmtData(vale.data || vale.criado_em)} · saldo ${brl(vale.saldo)}` : `${oficina.nome} · será descontado na folha`}
      largura={560}
      rodape={(
        <>
          {vale && !travado && <button className="btn btn-texto btn-perigo esquerda" onClick={excluir} disabled={salvando}>Excluir</button>}
          {vale && travado && vale.saldo > 0 && <button className="btn btn-texto esquerda" onClick={encerrar} disabled={salvando}>Encerrar saldo</button>}
          {vale && <button className="btn" onClick={() => abrirRecibo(vale.id)}>Recibo</button>}
          <button className="btn" onClick={aoFechar}>Cancelar</button>
          <button className="btn btn-primario" onClick={salvar} disabled={salvando} data-guia="vale-salvar">
            {salvando ? 'Salvando…' : vale ? 'Salvar alterações' : 'Lançar vale'}
          </button>
        </>
      )}
    >
      {erro && <div className="faixa faixa-erro" style={{ margin: 0 }}>{erro}</div>}

      <section className="painel">
        <div className="grade-form">
          <Campo rotulo="Funcionário *" className="inteiro" data-guia="vale-funcionario">
            <select className="campo" value={form.funcionario_id} disabled={travado} onChange={(e) => mudar({ funcionario_id: e.target.value })} autoFocus={!vale && !funcionarioInicial}>
              <option value="">Escolha…</option>
              {porFolha.map((g) => (
                <optgroup key={g.folha.numero} label={`${g.folha.numero}ª Folha${g.folha.apelido ? ` · ${g.folha.apelido}` : ''}`}>
                  {g.lista.map((f) => <option key={f.id} value={f.id}>{f.nome}{f.ativo ? '' : ' (desligado)'}</option>)}
                </optgroup>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Valor (R$) *">
            <CampoNumero tipo="moeda" valor={form.valor_total} aoMudar={(v) => mudar({ valor_total: v })} autoFocus={!vale && !!funcionarioInicial} />
          </Campo>
          <Campo rotulo="Data do vale">
            <input className="campo" type="date" value={form.data} onChange={(e) => mudar({ data: e.target.value })} />
          </Campo>
          <Campo rotulo="Descontar em quantas vezes" className="inteiro" data-guia="vale-vezes">
            <div className="vezes">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button key={n} type="button" className={`btn btn-p ${parcelas === n ? 'selecionado' : ''}`} onClick={() => mudar({ num_parcelas: n })}>
                  {n === 1 ? 'De uma vez' : `${n}×`}
                </button>
              ))}
              <CampoNumero valor={form.num_parcelas} aoMudar={(v) => mudar({ num_parcelas: Math.round(v) })} aria-label="Número de parcelas" style={{ width: 64 }} />
            </div>
          </Campo>
          <Campo rotulo="Começar a descontar na folha de" data-guia="vale-inicio">
            <input className="campo" type="month" value={form.inicio} onChange={(e) => mudar({ inicio: e.target.value })} />
          </Campo>
          <Campo rotulo="Tipo">
            <select className="campo" value={form.tipo} onChange={(e) => mudar({ tipo: e.target.value })}>
              <option value="vale">Vale (adiantamento)</option>
              <option value="compra">Compra</option>
              <option value="outro">Outro</option>
            </select>
          </Campo>
          <Campo rotulo="Descrição (opcional, sai no card)" className="inteiro" dica={!form.descricao && form.data ? `Sem descrição, o card mostra “${TIPOS_DESCONTO[form.tipo]} ${form.data.slice(8, 10)}/${form.data.slice(5, 7)}”.` : null}>
            <input className="campo" value={form.descricao} maxLength={40} onChange={(e) => mudar({ descricao: e.target.value })} placeholder="Ex.: Vale para conserto da moto" />
          </Campo>
        </div>
      </section>

      {form.valor_total > 0 && meses.length > 0 && (
        <section className="painel resumo-vale" data-guia="vale-resumo">
          <h3>Como vai ser descontado</h3>
          <p>
            {parcelas === 1 ? (
              <>Desconto de <strong>{brl(form.valor_total)}</strong> na folha de <strong>{competencia(...meses[0].split('-').map(Number)).toLowerCase()}</strong>
                {funcionario ? <> de {funcionario.nome} ({funcionario.folha_numero}ª Folha)</> : null}.</>
            ) : (
              <><strong>{parcelas} parcelas de {brl(parcela)}</strong>{ultima !== parcela ? <> (a última de {brl(ultima)})</> : null}:{' '}
                {meses.map(mesCurto).join(', ')}.</>
            )}
          </p>
          <p className="mini">Se a folha de algum desses meses já estiver fechada ou não descontar, a parcela passa para a próxima folha.</p>
        </section>
      )}

      {vale && (
        <section className="painel">
          <div className="painel-titulo"><h3>Descontos já feitos</h3><SituacaoVale vale={vale} /></div>
          {vale.descontos.length ? (
            <div className="lista-simples">
              {vale.descontos.map((d) => (
                <div key={d.folha_mensal_id}>
                  <Link to={`/empresa/${oficina.slug}/folha?ano=${d.ano}&mes=${d.mes}&folha=${d.folha_numero}`}>
                    {competencia(d.ano, d.mes)} · {d.folha_numero}ª Folha
                  </Link>
                  <span className="num">{valor(d.valor)}</span>
                </div>
              ))}
              <div><strong>Saldo</strong><strong className="num">{valor(vale.saldo)}</strong></div>
            </div>
          ) : (
            <p className="itens-vazio">Ainda não foi descontado em nenhuma folha fechada.</p>
          )}
        </section>
      )}
    </Gaveta>
  );
}

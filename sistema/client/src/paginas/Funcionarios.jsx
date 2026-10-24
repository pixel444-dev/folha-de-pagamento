import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import FormFuncionario from './FormFuncionario.jsx';
import { fmtQtd, valor } from '@shared/formato.js';
import { definicaoDaRegra, ehMarcada } from '@shared/regras.js';
import { faltaParaQr } from '@shared/pix.js';

const juntar = (itens) => (itens.length > 1 ? `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}` : itens[0]);

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function Funcionarios() {
  const { oficina, recarregar } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState(null);
  const [busca, setBusca] = useState('');
  const [folha, setFolha] = useState(0);
  const [mostrarDesligados, setMostrarDesligados] = useState(false);

  const editando = params.get('f'); // id ou "novo"
  const abrir = (valorF) => setParams(valorF ? { f: String(valorF) } : {});

  const carregar = useCallback(async () => {
    try {
      setLista(await api.get(`/oficinas/${oficina.id}/funcionarios`));
    } catch (e) {
      setErro(e.message);
    }
  }, [oficina.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const bonPorId = useMemo(() => new Map(oficina.bonificacoes.map((b) => [b.id, b])), [oficina.bonificacoes]);

  const filtrados = useMemo(() => {
    if (!lista) return [];
    const termo = semAcento(busca);
    return lista.filter((f) =>
      (mostrarDesligados || f.ativo)
      && (!folha || f.folha_numero === folha)
      && (!termo || semAcento(`${f.nome} ${f.nome_completo} ${f.funcao} ${f.pix_titular}`).includes(termo)));
  }, [lista, busca, folha, mostrarDesligados]);

  const desligados = lista?.filter((f) => !f.ativo).length ?? 0;
  const totalSalarios = filtrados.filter((f) => f.ativo).reduce((s, f) => s + f.salario, 0);

  const aoSalvar = async () => {
    await Promise.all([carregar(), recarregar()]);
  };

  return (
    <>
      <div className="filtros">
        <input className="campo busca" placeholder="Buscar por nome, função ou titular do PIX" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="segmentos" role="tablist">
          {[0, ...oficina.folhas.map((f) => f.numero)].map((n) => {
            const f = oficina.folhas.find((x) => x.numero === n);
            return (
              <button key={n} className={folha === n ? 'ativo' : ''} onClick={() => setFolha(n)}>
                {n === 0 ? 'Todas' : `${n}ª Folha${f?.apelido ? ` · ${f.apelido}` : ''}`}
              </button>
            );
          })}
        </div>
        {desligados > 0 && (
          <label className="caixa-marcar">
            <input type="checkbox" checked={mostrarDesligados} onChange={(e) => setMostrarDesligados(e.target.checked)} />
            <span>Mostrar desligados ({desligados})</span>
          </label>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn btn-primario" onClick={() => abrir('novo')}>+ Novo funcionário</button>
      </div>

      {erro && <div className="faixa faixa-erro">{erro}</div>}

      <div className="bloco tabela-moldura">
        <table className="tabela">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Função</th>
              <th>Folha</th>
              <th className="dir">Salário</th>
              <th>Bonificações</th>
              <th>Chave PIX</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!lista && <tr><td colSpan={7} className="vazio">Carregando…</td></tr>}
            {filtrados.map((f) => (
              <tr key={f.id} className={`clicavel ${f.ativo ? '' : 'linha-inativa'}`} onClick={() => abrir(f.id)}>
                <td>
                  <span className="nome-func">{f.nome}</span>
                  {f.pix_titular && <span className="sub-func">{f.pix_titular}</span>}
                </td>
                <td>{f.funcao || <span className="sem-valor">—</span>}</td>
                <td>{f.folha_numero}ª</td>
                <td className="dir num">{valor(f.salario)}</td>
                <td>
                  <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                    {f.bonificacoes.map((b) => {
                      const bon = bonPorId.get(b.bonificacao_id);
                      if (!bon || !ehMarcada(bon)) return null;
                      const c = definicaoDaRegra(bon).calculo;
                      const proprio = b.valor == null ? '' : c.modo === 'percentual' ? ` ${fmtQtd(b.valor)}%`
                        : c.modo === 'fixo' || c.unidade === 'reais' ? ` ${valor(b.valor)}` : ` ${fmtQtd(b.valor)}`;
                      return <span key={b.bonificacao_id} className="chip">{bon.nome}{proprio}</span>;
                    })}
                    {f.comissionado && <span className="chip chip-ambar">Comissão</span>}
                    {f.parcelamentos.some((v) => v.saldo > 0) && (
                      <span className="chip chip-cinza">Vale: {valor(f.parcelamentos.reduce((s, v) => s + Math.max(0, v.saldo), 0))}</span>
                    )}
                  </span>
                </td>
                <td>
                  {f.pix_chave ? (
                    <>
                      <span className="num">{f.pix_chave}</span> <span className="mini">{f.pix_tipo}</span>
                      {faltaParaQr(f).length > 0 && (
                        <span className="sub-func"><span className="chip chip-ambar">Sem QR Code: falta {juntar(faltaParaQr(f))}</span></span>
                      )}
                    </>
                  ) : <span className="chip chip-vermelho">Sem PIX</span>}
                </td>
                <td className="dir">{!f.ativo && <span className="chip">Desligado</span>}</td>
              </tr>
            ))}
            {lista && !filtrados.length && <tr><td colSpan={7} className="vazio">Nenhum funcionário encontrado.</td></tr>}
          </tbody>
          {filtrados.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={3}>{filtrados.length} funcionário(s)</td>
                <td className="dir num">{valor(totalSalarios)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {editando && (
        <FormFuncionario
          key={editando}
          oficina={oficina}
          funcionarioId={editando === 'novo' ? null : Number(editando)}
          folhaInicial={folha || oficina.folhas[0].numero}
          aoSalvar={aoSalvar}
          aoFechar={() => abrir(null)}
          aoCriar={(novo) => abrir(novo.id)}
        />
      )}
    </>
  );
}

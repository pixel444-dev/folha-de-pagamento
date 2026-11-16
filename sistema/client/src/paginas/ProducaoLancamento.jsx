import { useEffect, useMemo, useRef, useState } from 'react';
import Gaveta from '../componentes/Gaveta.jsx';
import { CampoNumero } from '../componentes/Campos.jsx';
import { calcularProducao } from '@shared/calculo.js';
import { brl, competencia, fmtQtd, rotuloFolha, valor } from '@shared/formato.js';

const linhaVazia = () => ({ referencia: '', cliente: '', quantidade: 0, valor: 0 });
const igual = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

/**
 * Tabela de produção de uma pessoa no mês (como no papel): referência, cliente, quantidade e valor da unidade.
 * O total de cada linha e o total do mês são calculados sozinhos; o total entra no pagamento como "Produção".
 */
export default function ProducaoLancamento({ lancamento: l, sugestoes = [], folha, ano, mes, aberta, aoMudar, aoFechar }) {
  // Tabela vazia: mostra uma linha em branco para digitar (só é guardada quando tiver alguma coisa).
  const lista = l.producao?.length ? l.producao : aberta ? [linhaVazia()] : [];
  const { linhas, pecas, total } = calcularProducao(lista);
  const [focarLinha, setFocarLinha] = useState(aberta && !l.producao?.length ? 0 : null);
  const tabela = useRef(null);

  useEffect(() => {
    if (focarLinha == null) return;
    tabela.current?.querySelector(`[data-prod="ref"][data-linha="${focarLinha}"]`)?.focus();
    setFocarLinha(null);
  }, [focarLinha, lista.length]);

  const referencias = useMemo(() => [...new Set(sugestoes.map((s) => s.referencia))], [sugestoes]);
  const clientes = useMemo(() => [...new Set(sugestoes.map((s) => s.cliente).filter(Boolean))], [sugestoes]);

  /**
   * Último valor da unidade usado para a referência (com o mesmo cliente, se houver; senão o da referência).
   * sugestoes = [{ referencia, cliente, valor }], da mais recente para a mais antiga.
   */
  const valorSugerido = (referencia, cliente) => {
    if (!String(referencia || '').trim()) return null;
    const mesmo = sugestoes.find((s) => igual(s.referencia, referencia) && igual(s.cliente, cliente));
    return (mesmo || sugestoes.find((s) => igual(s.referencia, referencia)))?.valor ?? null;
  };

  const mudarLinha = (i, patch) => {
    const nova = lista.map((x, j) => {
      if (j !== i) return x;
      const linha = { ...x, ...patch };
      // Preenche o valor da unidade sozinho enquanto a pessoa não digitar um valor.
      if (('referencia' in patch || 'cliente' in patch) && (!x.valor || x.auto)) {
        const v = valorSugerido(linha.referencia, linha.cliente);
        if (v != null) Object.assign(linha, { valor: v, auto: true });
        else if (x.auto) Object.assign(linha, { valor: 0, auto: false });
      }
      if ('valor' in patch) linha.auto = false;
      return linha;
    });
    aoMudar({ producao: nova });
  };
  const adicionar = () => {
    aoMudar({ producao: [...lista, linhaVazia()] });
    setFocarLinha(lista.length);
  };
  const remover = (i) => aoMudar({ producao: lista.filter((_, j) => j !== i) });

  // Enter no valor da unidade vai para a linha de baixo (cria uma nova no fim da tabela).
  const proximaLinha = (e, i) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (i === lista.length - 1) adicionar();
    else setFocarLinha(i + 1);
  };

  return (
    <Gaveta
      aberta
      aoFechar={aoFechar}
      titulo={`Produção · ${l.funcionario.nome}`}
      subtitulo={`${[l.funcionario.funcao, rotuloFolha(folha)].filter(Boolean).join(' · ')} · ${competencia(ano, mes)}`}
      largura={780}
      rodape={(
        <>
          <span className="esquerda mini">
            {aberta ? 'Tudo é salvo automaticamente.' : 'Folha fechada: a produção não pode ser alterada (a não ser que a folha seja reaberta).'}
          </span>
          <button className="btn btn-primario" onClick={aoFechar}>Pronto</button>
        </>
      )}
    >
      <div className="info-calculo">
        <div><span>Peças no mês</span><strong>{fmtQtd(pecas)}</strong></div>
        <div><span>Linhas lançadas</span><strong>{linhas.filter((x) => x.total || x.referencia).length}</strong></div>
        <div><span>Total da produção</span><strong>{brl(total)}</strong></div>
      </div>

      <div className="tabela-moldura bloco" ref={tabela}>
        <table className="tabela tabela-producao">
          <thead>
            <tr>
              <th>Referência</th>
              <th>Cliente</th>
              <th className="dir">Quant.<span className="th-dica">peças</span></th>
              <th className="dir">Valor unid.<span className="th-dica">R$</span></th>
              <th className="dir">Total<span className="th-dica">R$</span></th>
              {aberta && <th aria-label="Remover" />}
            </tr>
          </thead>
          <tbody>
            {linhas.map((x, i) => (
              <tr key={i}>
                {aberta ? (
                  <>
                    <td>
                      <input
                        className="campo"
                        list="producao-referencias"
                        value={lista[i].referencia ?? ''}
                        maxLength={40}
                        placeholder="Ex.: 1020"
                        aria-label={`Referência da linha ${i + 1}`}
                        data-prod="ref"
                        data-linha={i}
                        onChange={(e) => mudarLinha(i, { referencia: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="campo"
                        list="producao-clientes"
                        value={lista[i].cliente ?? ''}
                        maxLength={60}
                        aria-label={`Cliente da linha ${i + 1}`}
                        onChange={(e) => mudarLinha(i, { cliente: e.target.value })}
                      />
                    </td>
                    <td className="dir">
                      <CampoNumero
                        valor={x.quantidade}
                        aoMudar={(v) => mudarLinha(i, { quantidade: v })}
                        className="largo"
                        aria-label={`Quantidade da linha ${i + 1}`}
                      />
                    </td>
                    <td className="dir">
                      <CampoNumero
                        tipo="moeda"
                        valor={x.valor}
                        aoMudar={(v) => mudarLinha(i, { valor: v })}
                        className="largo"
                        aria-label={`Valor da unidade da linha ${i + 1}`}
                        title={lista[i].auto ? 'Último valor usado para esta referência. Pode mudar.' : undefined}
                        onKeyDown={(e) => proximaLinha(e, i)}
                      />
                    </td>
                  </>
                ) : (
                  <>
                    <td>{x.referencia || <span className="sem-valor">—</span>}</td>
                    <td>{x.cliente || <span className="sem-valor">—</span>}</td>
                    <td className="dir num">{fmtQtd(x.quantidade)}</td>
                    <td className="dir num">{valor(x.valor)}</td>
                  </>
                )}
                <td className="dir num total-linha">{x.total ? valor(x.total) : <span className="sem-valor">—</span>}</td>
                {aberta && (
                  <td className="dir">
                    <button className="btn-icone" onClick={() => remover(i)} aria-label={`Remover a linha ${i + 1}`}>
                      <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {!linhas.length && (
              <tr><td colSpan={aberta ? 6 : 5} className="vazio">Nenhuma produção lançada neste mês.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Total do mês</td>
              <td className="dir num">{fmtQtd(pecas)}</td>
              <td />
              <td className="dir num">{valor(total)}</td>
              {aberta && <td />}
            </tr>
          </tfoot>
        </table>
      </div>

      {aberta && (
        <>
          <div>
            <button className="btn" onClick={adicionar}>+ Adicionar linha</button>
          </div>
          <p className="mini">
            Total da linha = quantidade × valor da unidade. O total do mês entra no pagamento como <strong>Produção</strong>.
            Ao digitar uma referência já usada, o valor da unidade vem preenchido com o último valor (dá para mudar).
            Enter no valor da unidade vai para a próxima linha.
          </p>
          <datalist id="producao-referencias">
            {referencias.map((r) => <option key={r} value={r} />)}
          </datalist>
          <datalist id="producao-clientes">
            {clientes.map((c) => <option key={c} value={c} />)}
          </datalist>
        </>
      )}
    </Gaveta>
  );
}

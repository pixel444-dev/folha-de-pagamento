import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import { somarTotais } from '@shared/calculo.js';
import { brl, competencia, MESES_CURTOS, rotuloFolha, valor } from '@shared/formato.js';

// Linhas do quadro de cada mês (mesmo formato do "Histórico de pagamentos" das planilhas).
const LINHAS_PROVENTOS = [
  ['salario', 'Salários (mês)'],
  ['sabado', 'Sábados'],
  ['hora_extra', 'Horas extras'],
  ['comissao', 'Comissões'],
  ['acrescimos', 'Acréscimos'],
];
const LINHAS_DESCONTOS = [
  ['faltas', 'Faltas'],
  ['atrasos', 'Atrasos/saídas'],
  ['vales', 'Vales'],
  ['compras', 'Compras'],
  ['outros_descontos', 'Outros descontos'],
];

export default function Historico() {
  const { oficina } = useOutletContext();
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState(null);
  const [ano, setAno] = useState(null);

  useEffect(() => {
    api.get(`/oficinas/${oficina.id}/historico`)
      .then((l) => {
        setLista(l);
        setAno(l[0]?.ano ?? new Date().getFullYear());
      })
      .catch((e) => setErro(e.message));
  }, [oficina.id]);

  const anos = useMemo(() => [...new Set((lista || []).map((x) => x.ano))], [lista]);

  const meses = useMemo(() => {
    const grupos = new Map();
    for (const fm of lista || []) {
      if (fm.ano !== ano) continue;
      const chave = fm.mes;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(fm);
    }
    return [...grupos.entries()].sort((a, b) => b[0] - a[0]).map(([mes, folhas]) => ({ mes, folhas, total: somarTotais(folhas.map((f) => f.totais)) }));
  }, [lista, ano]);

  if (erro) return <div className="faixa faixa-erro">{erro}</div>;
  if (!lista) return <div className="bloco vazio">Carregando…</div>;
  if (!lista.length) {
    return (
      <div className="bloco vazio">
        <h3>Nenhuma folha registrada ainda</h3>
        <p>Assim que você abrir e fechar as folhas do mês, os totais aparecem aqui para consulta.</p>
        <Link className="btn btn-primario" to={`/empresa/${oficina.slug}/folha`}>Ir para a folha do mês</Link>
      </div>
    );
  }

  const porMes = Object.fromEntries(meses.map((m) => [m.mes, m.total.liquido]));
  const maior = Math.max(1, ...Object.values(porMes));
  const totalAno = meses.reduce((s, m) => s + m.total.liquido, 0);
  const fechadas = meses.flatMap((m) => m.folhas).filter((f) => f.status === 'fechada').length;

  return (
    <>
      <div className="filtros">
        <div className="segmentos" data-guia="hist-anos">
          {anos.map((a) => (
            <button key={a} className={a === ano ? 'ativo' : ''} onClick={() => setAno(a)}>{a}</button>
          ))}
        </div>
      </div>

      <div className="resumo-ano" data-guia="hist-resumo">
        <div className="bloco stats">
          <div><span>Total pago em {ano}</span><strong>{brl(totalAno)}</strong></div>
          <div><span>Média por mês</span><strong>{brl(meses.length ? totalAno / meses.length : 0)}</strong></div>
          <div><span>Folhas fechadas</span><strong>{fechadas}</strong></div>
        </div>
        <div className="bloco">
          <div className="barras" role="img" aria-label={`Total pago por mês em ${ano}`}>
            {MESES_CURTOS.map((m, i) => {
              const v = porMes[i + 1] || 0;
              return (
                <div className="barra" key={m} title={`${m}: ${brl(v)}`}>
                  <div className={`coluna ${v ? '' : 'vazia'}`} style={{ height: `${Math.max(2, (v / maior) * 100)}%` }} />
                  <span>{m}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grade-meses" data-guia="hist-meses">
        {meses.map(({ mes, folhas, total }) => {
          const nomes = (parte) => [...new Set(folhas.flatMap((f) => Object.keys(f.totais?.[parte] || {})))];
          // Regras de pagamento: as que somam vêm depois do salário; as que descontam, depois de faltas e atrasos.
          const linhas = [
            ...LINHAS_PROVENTOS.slice(0, 1).map(([k, r]) => ({ k, r })),
            ...nomes('bonificacoes').map((n) => ({ k: `bon:${n}`, r: n, parte: 'bonificacoes', nome: n })),
            ...LINHAS_PROVENTOS.slice(1).map(([k, r]) => ({ k, r })),
            ...LINHAS_DESCONTOS.slice(0, 2).map(([k, r]) => ({ k, r, desconto: true })),
            ...nomes('descontos_regras').map((n) => ({ k: `desc:${n}`, r: n, parte: 'descontos_regras', nome: n, desconto: true })),
            ...LINHAS_DESCONTOS.slice(2).map(([k, r]) => ({ k, r, desconto: true })),
          ];
          const ler = (t, linha) => (linha.parte ? t?.[linha.parte]?.[linha.nome] || 0 : t?.[linha.k] || 0);
          const visiveis = linhas.filter((linha) => ler(total, linha) !== 0 || linha.k === 'salario');
          const ordenadas = [...folhas].sort((a, b) => a.folha_numero - b.folha_numero);

          return (
            <section key={mes} className="bloco mes-bloco">
              <div className="mes-cab">
                <div>
                  <h3>{competencia(ano, mes)}</h3>
                  <span className="mini">
                    {folhas.length} folha(s) · {total.funcionarios} pagamentos
                    {folhas.some((f) => f.status === 'aberta') && ' · tem folha em andamento'}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="mes-total">{brl(total.liquido)}</div>
                  <a className="mini" href={`/imprimir?fm=${ordenadas.map((f) => f.id).join(',')}`} target="_blank" rel="noreferrer">Imprimir o mês inteiro</a>
                </div>
              </div>
              <div className="tabela-moldura">
                <table className="tabela-hist">
                  <thead>
                    <tr>
                      <th />
                      {ordenadas.map((f) => (
                        <th key={f.id}>
                          {rotuloFolha({ numero: f.folha_numero, apelido: f.apelido })}
                          {f.status === 'aberta' && <span className="chip chip-ambar" style={{ marginLeft: 6, height: 18 }}>aberta</span>}
                          {f.folha_apagada && <span className="chip chip-cinza" style={{ marginLeft: 6, height: 18 }}>apagada</span>}
                          <div className="th-links">
                            {!f.folha_apagada && <Link to={`/empresa/${oficina.slug}/folha?ano=${ano}&mes=${mes}&folha=${f.folha_numero}`}>abrir</Link>}
                            <a href={`/imprimir?fm=${f.id}`} target="_blank" rel="noreferrer">cards</a>
                          </div>
                        </th>
                      ))}
                      {ordenadas.length > 1 && <th className="col-total">Total</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((linha) => (
                      <tr key={linha.k} className={linha.desconto ? 'desconto' : ''}>
                        <td>{linha.desconto ? `− ${linha.r}` : linha.r}</td>
                        {ordenadas.map((f) => <td key={f.id}>{valor(ler(f.totais, linha))}</td>)}
                        {ordenadas.length > 1 && <td className="col-total">{valor(ler(total, linha))}</td>}
                      </tr>
                    ))}
                    <tr className="linha-total">
                      <td>Valor total da folha</td>
                      {ordenadas.map((f) => <td key={f.id}>{valor(f.totais?.liquido)}</td>)}
                      {ordenadas.length > 1 && <td className="col-total">{valor(total.liquido)}</td>}
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

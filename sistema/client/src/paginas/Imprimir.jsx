import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import CardPagamento, { alturaCard, CARD } from '../componentes/CardPagamento.jsx';
import { brl, competencia, rotuloFolha, valor } from '@shared/formato.js';

// Folha A4 (210 × 297 mm) com margem de 8 mm. Os cards ficam encostados (sem espaço entre eles),
// assim cada linha tracejada é um corte só, que já separa os dois cards vizinhos.
const MARGEM = 8;
const ALTURA_UTIL = 279;
const LINHAS_RESUMO_POR_PAGINA = 34;

/** Tesoura (ícone) centralizada em (x, y), apontando para a direita ou para baixo. Medidas em mm. */
function Tesoura({ x, y, paraBaixo }) {
  return (
    <g className="tesoura" transform={`translate(${x} ${y}) rotate(${paraBaixo ? 90 : 0}) scale(0.27) translate(-12 -12)`}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </g>
  );
}

/** Linhas tracejadas de corte de uma página, desenhadas por cima dos cards. */
function LinhasCorte({ fileiras }) {
  const L = CARD.largura;
  const ys = [MARGEM];
  for (const f of fileiras) ys.push(ys[ys.length - 1] + f.altura);
  const fim = ys[ys.length - 1];
  const colunas = fileiras.map((f) => f.par.length);
  const linhas = [];

  // Horizontais: cada uma vai até onde existe card acima ou abaixo dela.
  for (let i = 0; i < ys.length; i++) {
    const n = Math.max(colunas[i - 1] || 0, colunas[i] || 0);
    linhas.push([MARGEM, ys[i], MARGEM + n * L, ys[i]]);
  }
  // Verticais: borda esquerda e meio sempre; borda direita só onde há dois cards.
  linhas.push([MARGEM, MARGEM, MARGEM, fim], [MARGEM + L, MARGEM, MARGEM + L, fim]);
  let inicio = null;
  fileiras.forEach((f, i) => {
    if (f.par.length === 2 && inicio === null) inicio = ys[i];
    if (f.par.length !== 2 && inicio !== null) {
      linhas.push([MARGEM + 2 * L, inicio, MARGEM + 2 * L, ys[i]]);
      inicio = null;
    }
  });
  if (inicio !== null) linhas.push([MARGEM + 2 * L, inicio, MARGEM + 2 * L, fim]);

  return (
    <svg className="linhas-corte" viewBox="0 0 210 296" preserveAspectRatio="none" aria-hidden="true">
      {linhas.map(([x1, y1, x2, y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />)}
      {ys.map((y) => <Tesoura key={y} x={MARGEM - 4.2} y={y} />)}
      <Tesoura x={MARGEM + L} y={MARGEM - 4.2} paraBaixo />
    </svg>
  );
}

/** Distribui os cards em fileiras de 2 (sem misturar folhas na mesma fileira) e as fileiras em páginas A4. */
function paginar(grupos) {
  const pares = [];
  for (const { cards } of grupos) {
    for (let i = 0; i < cards.length; i += 2) pares.push(cards.slice(i, i + 2));
  }
  const paginas = [];
  let atual = [];
  let usado = 0;
  for (const par of pares) {
    const altura = Math.max(...par.map(alturaCard));
    if (atual.length && usado + altura > ALTURA_UTIL) {
      paginas.push(atual);
      atual = [];
      usado = 0;
    }
    usado += altura;
    atual.push({ par, altura });
  }
  if (atual.length) paginas.push(atual);
  return paginas;
}

export default function Imprimir() {
  const [params] = useSearchParams();
  const ids = (params.get('fm') || '').split(',').map(Number).filter(Boolean);
  const filtro = (params.get('f') || '').split(',').map(Number).filter(Boolean);
  const [folhas, setFolhas] = useState(null);
  const [erro, setErro] = useState(null);
  const [comCards, setComCards] = useState(true);
  const [comResumo, setComResumo] = useState(params.get('resumo') === '1');

  useEffect(() => {
    Promise.all(ids.map((id) => api.get(`/folhas-mensais/${id}`)))
      .then(setFolhas)
      .catch((e) => setErro(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('fm')]);

  const grupos = useMemo(() => (folhas || []).map((d) => {
    const { ano, mes } = d.folha_mensal;
    const lancs = d.lancamentos.filter((l) => !filtro.length || filtro.includes(l.funcionario_id));
    return {
      d,
      titulo: `${d.oficina.nome} · ${rotuloFolha(d.folha)} · ${competencia(ano, mes)}`,
      cards: lancs.map((l) => ({
        chave: l.id,
        oficina: d.oficina.nome,
        folha: rotuloFolha(d.folha),
        competencia: competencia(ano, mes),
        funcionario: l.funcionario,
        resultado: l.resultado,
        observacao: l.observacao,
        logo: d.oficina.logo_url,
      })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [folhas, params.get('f')]);

  const todosCards = grupos.flatMap((g) => g.cards);
  const paginas = useMemo(() => paginar(grupos), [grupos]);
  const total = todosCards.reduce((s, c) => s + c.resultado.liquido, 0);

  useEffect(() => {
    if (grupos.length) document.title = `Cards · ${grupos.map((g) => g.titulo).join(' + ')}`;
  }, [grupos]);

  if (erro) return <div className="tela-cheia"><div className="aviso aviso-erro">{erro}</div></div>;
  if (!folhas) return <div className="tela-cheia carregando">Preparando impressão…</div>;

  const algumaAberta = folhas.some((d) => d.folha_mensal.status === 'aberta');

  // Espera os logos carregarem antes de abrir a janela de impressão.
  const imprimir = async () => {
    const pendentes = [...document.images].filter((img) => !img.complete);
    await Promise.all(pendentes.map((img) => new Promise((ok) => { img.onload = ok; img.onerror = ok; })));
    window.print();
  };

  return (
    <div className="tela-impressao">
      <div className="barra-impressao nao-imprimir">
        <div>
          <h1>{grupos.length === 1 ? grupos[0].titulo : `${grupos.length} folhas`}</h1>
          <p>
            {todosCards.length} card(s) · {paginas.length} folha(s) A4 · total {brl(total)}
            {algumaAberta && ' · atenção: folha ainda em andamento (não fechada)'}
          </p>
        </div>
        <span className="espaco" />
        <div className="opcoes">
          <label className="caixa-marcar">
            <input type="checkbox" checked={comCards} onChange={(e) => setComCards(e.target.checked)} />
            <span>Cards</span>
          </label>
          <label className="caixa-marcar">
            <input type="checkbox" checked={comResumo} onChange={(e) => setComResumo(e.target.checked)} />
            <span>Lista de conferência</span>
          </label>
        </div>
        <button className="btn btn-primario btn-g" onClick={imprimir} disabled={!comCards && !comResumo}>
          Imprimir
        </button>
      </div>
      <p className="nao-imprimir mini" style={{ textAlign: 'center', padding: '10px 16px 0' }}>
        Na janela de impressão: papel A4, escala 100% (ou “Padrão”) e margens “Nenhuma” ou “Padrão”. Recorte na linha tracejada (✂): cada corte já separa dois cards.
      </p>

      <div className="paginas">
        {comCards && paginas.map((fileiras, i) => (
          <div className="folha-a4" key={`c${i}`}>
            {fileiras.map(({ par, altura }) => (
              <div className="fileira" key={par[0].chave}>
                {par.map((c) => <CardPagamento key={c.chave} dados={c} altura={altura} />)}
              </div>
            ))}
            <LinhasCorte fileiras={fileiras} />
          </div>
        ))}
        {comResumo && grupos.map((g) => <ResumoConferencia key={g.d.folha_mensal.id} grupo={g} />)}
      </div>
    </div>
  );
}

/** Lista para conferência e controle dos pagamentos via PIX. */
function ResumoConferencia({ grupo }) {
  const { d, cards, titulo } = grupo;
  const paginas = [];
  for (let i = 0; i < cards.length; i += LINHAS_RESUMO_POR_PAGINA) paginas.push(cards.slice(i, i + LINHAS_RESUMO_POR_PAGINA));
  if (!paginas.length) paginas.push([]);
  const soma = (k) => cards.reduce((s, c) => s + c.resultado[k], 0);

  return paginas.map((linhas, p) => (
    <div className="folha-a4 resumo-imp" key={p}>
      <div className="resumo-cab">
        <div className="resumo-titulo">
          {d.oficina.logo_url && <img className="resumo-logo" src={d.oficina.logo_url} alt="" />}
          <div>
            <h2>{titulo}</h2>
            <p>Lista de conferência dos pagamentos{d.folha_mensal.status === 'aberta' ? ' · folha em andamento' : ''}</p>
          </div>
        </div>
        <p>Página {p + 1} de {paginas.length}</p>
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Funcionário</th>
            <th className="dir">Proventos</th>
            <th className="dir">Descontos</th>
            <th className="dir">Líquido</th>
            <th>Chave PIX</th>
            <th>Pago</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((c, i) => (
            <tr key={c.chave}>
              <td>{p * LINHAS_RESUMO_POR_PAGINA + i + 1}</td>
              <td><strong>{c.funcionario.nome}</strong></td>
              <td className="dir">{valor(c.resultado.total_proventos)}</td>
              <td className="dir">{valor(c.resultado.total_descontos)}</td>
              <td className="dir"><strong>{valor(c.resultado.liquido)}</strong></td>
              <td className="pix-col">{c.funcionario.pix_chave || '—'}</td>
              <td><span className="confere" /></td>
            </tr>
          ))}
        </tbody>
        {p === paginas.length - 1 && (
          <tfoot>
            <tr>
              <td />
              <td>Total ({cards.length})</td>
              <td className="dir">{valor(soma('total_proventos'))}</td>
              <td className="dir">{valor(soma('total_descontos'))}</td>
              <td className="dir">{valor(soma('liquido'))}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  ));
}

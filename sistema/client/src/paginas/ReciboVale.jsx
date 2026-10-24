import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { round2 } from '@shared/calculo.js';
import { brl, competencia, fmtData, porExtenso } from '@shared/formato.js';

const MOTIVO = { vale: 'vale (adiantamento salarial)', compra: 'compra' };

/** Recibo de vale para o funcionário assinar: duas vias (empresa e funcionário) em uma folha A4. */
export default function ReciboVale() {
  const [params] = useSearchParams();
  const [vale, setVale] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    api.get(`/vales/${Number(params.get('id'))}`)
      .then((v) => {
        setVale(v);
        document.title = `Recibo de vale · ${v.funcionario.nome}`;
      })
      .catch((e) => setErro(e.message));
  }, [params]);

  if (erro) return <div className="tela-cheia"><div className="aviso aviso-erro">{erro}</div></div>;
  if (!vale) return <div className="tela-cheia carregando">Preparando recibo…</div>;

  const imprimir = async () => {
    const pendentes = [...document.images].filter((img) => !img.complete);
    await Promise.all(pendentes.map((img) => new Promise((ok) => { img.onload = ok; img.onerror = ok; })));
    window.print();
  };

  return (
    <div className="tela-impressao">
      <div className="barra-impressao nao-imprimir">
        <div>
          <h1>Recibo de vale · {vale.funcionario.nome}</h1>
          <p>Duas vias na mesma folha A4: uma fica com a empresa, a outra com o funcionário.</p>
        </div>
        <span className="espaco" />
        <button className="btn btn-primario btn-g" onClick={imprimir}>Imprimir</button>
      </div>
      <div className="paginas">
        <div className="folha-a4 recibo-folha">
          <Via vale={vale} via="Via da empresa" />
          <div className="recibo-corte">
            <svg viewBox="0 0 210 8" preserveAspectRatio="none" aria-hidden="true">
              <line x1="12" y1="4" x2="202" y2="4" />
              <g className="tesoura" transform="translate(5.5 4) scale(0.27) translate(-12 -12)">
                <circle cx="6" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <line x1="20" y1="4" x2="8.12" y2="15.88" />
                <line x1="14.47" y1="14.48" x2="20" y2="20" />
                <line x1="8.12" y1="8.12" x2="12" y2="12" />
              </g>
            </svg>
          </div>
          <Via vale={vale} via="Via do funcionário" />
        </div>
      </div>
    </div>
  );
}

function Via({ vale, via }) {
  const { oficina, funcionario: f } = vale;
  const [ano, mes] = vale.inicio.split('-').map(Number);
  const folha = competencia(ano, mes).toLowerCase();
  const parcela = round2(vale.valor_total / vale.num_parcelas);
  const motivo = vale.tipo === 'outro' ? (vale.descricao || 'adiantamento') : MOTIVO[vale.tipo];

  return (
    <section className="recibo">
      <header className="recibo-cab">
        <div className="recibo-titulo">
          {oficina.logo_url && <img src={oficina.logo_url} alt="" />}
          <div>
            <h2>Recibo de {vale.tipo === 'compra' ? 'compra' : 'vale'}</h2>
            <p>{oficina.nome} · Nº {String(vale.id).padStart(4, '0')}</p>
          </div>
        </div>
        <div className="recibo-valor">{brl(vale.valor_total)}</div>
      </header>

      <p className="recibo-texto">
        Recebi de <strong>{oficina.nome.toUpperCase()}</strong> a importância de <strong>{brl(vale.valor_total)}</strong>{' '}
        ({porExtenso(vale.valor_total)}), referente a {motivo}, que será descontada do meu salário{' '}
        {vale.num_parcelas === 1 ? (
          <>na folha de <strong>{folha}</strong>.</>
        ) : (
          <>em <strong>{vale.num_parcelas} parcelas de {brl(parcela)}</strong>, a partir da folha de <strong>{folha}</strong>.</>
        )}
      </p>

      <dl className="recibo-dados">
        <div><dt>Funcionário</dt><dd>{f.nome}{f.nome_completo ? ` — ${f.nome_completo}` : ''}</dd></div>
        <div><dt>Folha</dt><dd>{f.folha_numero}ª Folha</dd></div>
        <div><dt>Data do vale</dt><dd>{fmtData(vale.data || vale.criado_em)}</dd></div>
        {vale.descricao && vale.tipo !== 'outro' && <div><dt>Descrição</dt><dd>{vale.descricao}</dd></div>}
      </dl>

      <div className="recibo-assinaturas">
        <div><span />Assinatura do funcionário</div>
        <div><span />Responsável pela empresa</div>
      </div>
      <p className="recibo-via">{via}</p>
    </section>
  );
}

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useOficinas } from '../App.jsx';
import { lerHorario } from '@shared/ponto.js';
import { fmtData, fmtHoras, fmtQtd, rotuloFolha } from '@shared/formato.js';

// [cor do selo, texto]: as mesmas cores da aba Ponto
const SITUACOES = {
  ok: ['verde', 'Normal'],
  falta: ['vermelho', 'Falta'],
  conferir: ['ambar', 'Conferir'],
  sabado: ['verde', 'Sábado trabalhado'],
  folga: ['cinza', 'Folga'],
  sem_expediente: ['cinza', 'Sem expediente'],
  antes_admissao: ['cinza', 'Antes da admissão'],
  sem_dados: ['cinza', 'Sem dados'],
};

const horas = (h) => (h ? fmtHoras(h) : '—');
const minutos = (m) => (m ? fmtHoras(m / 60) : '');
const formatarCodigo = (c) => (c ? `${c.slice(0, 3)}.${c.slice(3, 8)}.${c.slice(8, 10)}-${c.slice(10)}` : '');

/**
 * Espelho de ponto para entregar ao funcionário (uma folha A4 por pessoa), com um recado
 * incentivando a bater o ponto certinho. Com ?f= imprime só um funcionário.
 */
export default function EspelhoPonto() {
  const [params] = useSearchParams();
  const { oficinas } = useOficinas();
  const oficina = oficinas.find((o) => o.id === Number(params.get('o')));
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    if (!oficina) return;
    const q = ['folha', 'ano', 'mes', 'inicio', 'fim'].map((k) => `${k}=${encodeURIComponent(params.get(k) || '')}`).join('&');
    api.get(`/oficinas/${oficina.id}/ponto/espelho?${q}`)
      .then((d) => {
        setDados(d);
        document.title = `Espelho de ponto · ${fmtData(d.periodo.inicio)} a ${fmtData(d.periodo.fim)}`;
      })
      .catch((e) => setErro(e.message));
  }, [oficina, params]);

  if (!oficina) return <div className="tela-cheia"><div className="aviso aviso-erro">Empresa não encontrada.</div></div>;
  if (erro) return <div className="tela-cheia"><div className="aviso aviso-erro">{erro}</div></div>;
  if (!dados) return <div className="tela-cheia carregando">Preparando espelho de ponto…</div>;

  const so = Number(params.get('f'));
  const lista = dados.funcionarios.filter((f) => f.espelho && (!so || f.id === so));
  const folha = oficina.folhas.find((x) => x.numero === Number(params.get('folha')));

  const imprimir = async () => {
    const pendentes = [...document.images].filter((img) => !img.complete);
    await Promise.all(pendentes.map((img) => new Promise((ok) => { img.onload = ok; img.onerror = ok; })));
    window.print();
  };

  return (
    <div className="tela-impressao">
      <div className="barra-impressao nao-imprimir">
        <div>
          <h1>Espelho de ponto · {lista.length === 1 ? lista[0].nome : `${lista.length} funcionários`}</h1>
          <p>Uma folha A4 por funcionário, com o recado sobre o ponto e espaço para assinatura.</p>
        </div>
        <span className="espaco" />
        <button className="btn btn-primario btn-g" onClick={imprimir} disabled={!lista.length}>Imprimir</button>
      </div>
      <div className="paginas">
        {lista.map((f) => (
          <Folha key={f.id} funcionario={f} dados={dados} oficina={oficina} folha={folha} />
        ))}
        {!lista.length && <div className="aviso">Nenhum funcionário ligado ao relógio nesta folha.</div>}
      </div>
    </div>
  );
}

/** Recado do fim da folha: muda conforme o ponto do período. */
function recado(e, horario) {
  const batidas = (lerHorario(horario)?.length || 2) * 2;
  const quais = batidas === 4 ? 'entrada, saída para o almoço, volta do almoço e saída' : batidas === 2 ? 'entrada e saída' : 'em cada entrada e saída';
  const perfeito = !e.faltas && !e.conferir && !e.horas_atraso;
  return {
    titulo: perfeito ? 'Parabéns pelo ponto em dia!' : 'Um recado para você',
    texto: perfeito
      ? 'Seu ponto ficou certinho neste período: nenhuma falta, nenhum atraso e todas as batidas no lugar. É esse cuidado que faz a diferença na equipe. Continue assim, obrigado!'
      : `O ponto é a sua garantia: é por ele que cada hora do seu trabalho é contada e paga certinho. Lembre-se das ${batidas} batidas do dia (${quais}) e de chegar no horário. `
        + 'Ponto bem batido evita descontos por engano e deixa o seu esforço registrado. Contamos com você!',
    lembrete: e.conferir
      ? `Neste período, ${e.conferir} ${e.conferir === 1 ? 'dia ficou' : 'dias ficaram'} com batida faltando ou sobrando (marcados como “Conferir”). Se tiver alguma dúvida, fale com a gente.`
      : null,
  };
}

function Folha({ funcionario: f, dados, oficina, folha }) {
  const e = f.espelho;
  const r = recado(e, f.horario);
  const relogio = dados.relogios[0];
  return (
    <div className="folha-a4 espelho-folha">
      <header className="recibo-cab">
        <div className="recibo-titulo">
          {oficina.logo_url && <img src={oficina.logo_url} alt="" />}
          <div>
            <h2>Espelho de ponto</h2>
            <p>{dados.empresa || oficina.nome} · {oficina.nome}</p>
          </div>
        </div>
        <div className="espelho-periodo">
          <span>Período</span>
          <strong>{fmtData(dados.periodo.inicio)} a {fmtData(dados.periodo.fim)}</strong>
        </div>
      </header>

      <dl className="recibo-dados espelho-dados">
        <div><dt>Funcionário</dt><dd>{f.nome}{f.nome_completo ? ` — ${f.nome_completo}` : ''}</dd></div>
        <div><dt>PIS/CPF</dt><dd>{formatarCodigo(f.ponto_codigo)}</dd></div>
        <div><dt>Função</dt><dd>{f.funcao || '—'}</dd></div>
        <div><dt>Horário</dt><dd>{f.horario.replace(/ /g, ' e ')}</dd></div>
        {folha && <div><dt>Folha</dt><dd>{rotuloFolha(folha)}</dd></div>}
      </dl>

      <table className="espelho-tabela">
        <thead>
          <tr>
            <th>Dia</th>
            <th>Batidas</th>
            <th>Situação</th>
            <th className="dir">Trabalhou</th>
            <th className="dir">Extra</th>
            <th className="dir">Atraso</th>
          </tr>
        </thead>
        <tbody>
          {e.dias.map((d) => {
            const [cor, rotulo] = SITUACOES[d.situacao] || ['cinza', d.situacao];
            return (
              <tr key={d.data} className={`sit-${d.situacao}`}>
                <td>{fmtData(d.data).slice(0, 5)} <span className="semana">{d.semana.slice(0, 3)}</span></td>
                <td className="marcas">{d.marcas.join('  ') || '—'}</td>
                <td>
                  <span className={`espelho-selo ${cor}`}>{rotulo}</span>
                  {d.nota && <span className="nota">{d.nota}</span>}
                </td>
                <td className="dir">{d.trabalhado != null ? minutos(d.trabalhado) : ''}</td>
                <td className="dir extra">{d.extra ? `+${minutos(d.extra)}` : ''}</td>
                <td className="dir atraso">{d.atraso ? `−${minutos(d.atraso)}` : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="espelho-totais">
        <div className="verde"><span>Dias trabalhados</span><strong>{e.trabalhados}</strong></div>
        <div className={e.faltas ? 'vermelho' : ''}><span>Faltas</span><strong>{fmtQtd(e.faltas)}</strong></div>
        <div className={e.sabados ? 'azul' : ''}><span>Sábados</span><strong>{fmtQtd(e.sabados)}</strong></div>
        <div className={e.horas_extras ? 'azul' : ''}><span>Horas extras</span><strong>{horas(e.horas_extras)}</strong></div>
        <div className={e.horas_atraso ? 'vermelho' : ''}><span>Atrasos</span><strong>{horas(e.horas_atraso)}</strong></div>
        <div className={e.conferir ? 'ambar' : ''}><span>Para conferir</span><strong>{e.conferir}</strong></div>
      </div>

      <section className="espelho-recado">
        <h3>{r.titulo}</h3>
        <p>{r.texto}</p>
        {r.lembrete && <p className="lembrete">{r.lembrete}</p>}
      </section>

      <p className="espelho-declaro">Declaro que recebi e conferi as marcações de ponto acima.</p>
      <div className="recibo-assinaturas">
        <div><span />Assinatura do funcionário</div>
        <div><span />Responsável pela empresa</div>
      </div>
      <p className="recibo-via">
        Recebido em ____/____/________
        {relogio ? ` · Relógio nº ${relogio.numero_fabricacao} · arquivo de ${fmtData(relogio.gerado_em)}` : ''}
      </p>
    </div>
  );
}

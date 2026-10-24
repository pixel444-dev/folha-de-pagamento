import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Gaveta from '../componentes/Gaveta.jsx';
import CardPagamento from '../componentes/CardPagamento.jsx';
import { Campo, CampoNumero } from '../componentes/Campos.jsx';
import { parcelasDoMes } from '@shared/calculo.js';
import { brl, competencia, rotuloFolha, valor } from '@shared/formato.js';
import { situacaoDaRegra, temCondicoes } from '@shared/regras.js';

const SUGESTOES_ACRESCIMO = ['Erro de folha', 'Produção', 'Meta', 'Ajuste do mês anterior'];

export default function DetalheLancamento({ lancamento: l, oficina, folha, ano, mes, aberta, aoMudar, aoRemover, aoImprimir, aoFechar, aoLancarVale }) {
  const f = l.funcionario;
  const r = l.resultado;
  const campos = (oficina.campos || []).filter((c) => c.escopo !== 'cadastro');
  const regrasCondicionais = oficina.bonificacoes.filter((b) => b.ativo && temCondicoes(b));
  const mudarCampo = (c, v) => aoMudar({ campos: { ...l.campos, [c.id]: v } });
  const parcelas = parcelasDoMes(f.parcelamentos || [], ano, mes);
  const acrescimos = l.acrescimos || [];
  const descontos = l.descontos || [];

  const mudarItem = (lista, campo, i, patch) => aoMudar({ [campo]: lista.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const removerItem = (lista, campo, i) => aoMudar({ [campo]: lista.filter((_, j) => j !== i) });

  const card = {
    oficina: oficina.nome,
    folha: rotuloFolha(folha),
    competencia: competencia(ano, mes),
    funcionario: f,
    resultado: r,
    observacao: l.observacao,
    logo: oficina.logo_url,
  };

  return (
    <Gaveta
      aberta
      aoFechar={aoFechar}
      titulo={f.nome}
      subtitulo={`${[f.funcao, rotuloFolha(folha)].filter(Boolean).join(' · ')} · ${competencia(ano, mes)}`}
      largura={600}
      rodape={(
        <>
          {aberta && <button className="btn btn-texto btn-perigo esquerda" onClick={aoRemover}>Tirar desta folha</button>}
          <button className="btn" onClick={aoImprimir}>Imprimir só este card</button>
          <button className="btn btn-primario" onClick={aoFechar}>Pronto</button>
        </>
      )}
    >
      <div className="info-calculo">
        <div><span>Salário</span><strong>{brl(r.salario)}</strong></div>
        <div><span>Valor do dia (falta)</span><strong>{brl(r.valor_dia)}</strong></div>
        <div><span>Valor da hora (atraso)</span><strong>{brl(r.valor_hora)}</strong></div>
      </div>

      {aberta && (
        <>
          <section className="painel">
            <div className="painel-titulo"><h3>Lançamentos do mês</h3></div>
            <div className="grade-3">
              <Campo rotulo="Faltas (dias)" dica="Meio dia = 0,5">
                <CampoNumero valor={l.faltas} aoMudar={(v) => aoMudar({ faltas: v })} />
              </Campo>
              <Campo rotulo="Sábados trabalhados" dica={oficina.sabado_modo === 'fixo' ? `${brl(oficina.sabado_valor)} cada` : 'Vale um dia de salário'}>
                <CampoNumero valor={l.sabados} aoMudar={(v) => aoMudar({ sabados: v })} />
              </Campo>
              <Campo rotulo="Horas extras" dica={`${brl(oficina.valor_hora_extra)} por hora`}>
                <CampoNumero tipo="horas" valor={l.horas_extras} aoMudar={(v) => aoMudar({ horas_extras: v })} placeholder="0:00" />
              </Campo>
              <Campo rotulo="Atrasos / saídas" dica="Horas a descontar">
                <CampoNumero tipo="horas" valor={l.horas_atraso} aoMudar={(v) => aoMudar({ horas_atraso: v })} placeholder="0:00" />
              </Campo>
              {(f.comissionado || l.comissao > 0) && (
                <Campo rotulo="Comissão (R$)" dica="Vendas do mês">
                  <CampoNumero tipo="moeda" valor={l.comissao} aoMudar={(v) => aoMudar({ comissao: v })} />
                </Campo>
              )}
              {campos.map((c) => (
                <Campo key={`c${c.id}`} rotulo={c.nome}>
                  {c.tipo === 'sim_nao' ? (
                    <select className="campo" value={l.campos?.[c.id] ? 1 : 0} onChange={(e) => mudarCampo(c, Number(e.target.value))}>
                      <option value={0}>Não</option>
                      <option value={1}>Sim</option>
                    </select>
                  ) : (
                    <CampoNumero
                      tipo={c.tipo === 'horas' ? 'horas' : c.tipo === 'moeda' ? 'moeda' : 'numero'}
                      valor={l.campos?.[c.id] ?? 0}
                      aoMudar={(v) => mudarCampo(c, v)}
                      placeholder={c.tipo === 'horas' ? '0:00' : undefined}
                    />
                  )}
                </Campo>
              ))}
              {regrasCondicionais.map((b) => {
                // Regra com condição: automática, ou ajustada na mão para esta pessoa neste mês.
                const s = situacaoDaRegra(b, r);
                if (!s) return null;
                const [sim, nao] = b.tipo === 'desconto' ? ['Desconta', 'Não desconta'] : ['Recebe', 'Não recebe'];
                const dica = s.manual ? 'Ajustado na mão' : s.automatico ? `Cumpre as condições → ${sim.toLowerCase()}` : `Não cumpre as condições → ${nao.toLowerCase()}`;
                return (
                  <Campo key={`r${b.id}`} rotulo={b.nome} dica={dica}>
                    <select className="campo" value={s.manual || ''} onChange={(e) => aoMudar({ regras_manuais: { ...l.regras_manuais, [b.id]: e.target.value || null } })}>
                      <option value="">Automático</option>
                      <option value="sim">{sim}</option>
                      <option value="nao">{nao}</option>
                    </select>
                  </Campo>
                );
              })}
            </div>
          </section>

          <PainelVales
            lancamento={l}
            oficina={oficina}
            ano={ano}
            mes={mes}
            parcelas={parcelas}
            aoMudar={aoMudar}
            aoLancarVale={aoLancarVale}
          />

          <section className="painel">
            <div className="painel-titulo">
              <h3>Outros descontos (compras…)</h3>
              <button className="btn btn-p" onClick={() => aoMudar({ descontos: [...descontos, { tipo: 'compra', descricao: '', valor: 0 }] })}>
                + Adicionar desconto
              </button>
            </div>
            <div className="itens">
              {descontos.map((d, i) => (
                <div className="item-linha" key={i}>
                  <select className="campo" value={d.tipo} onChange={(e) => mudarItem(descontos, 'descontos', i, { tipo: e.target.value })} aria-label="Tipo">
                    <option value="compra">Compra</option>
                    <option value="vale">Vale</option>
                    <option value="outro">Outro</option>
                  </select>
                  <input className="campo" placeholder="Descrição (aparece no card)" value={d.descricao} onChange={(e) => mudarItem(descontos, 'descontos', i, { descricao: e.target.value })} />
                  <CampoNumero tipo="moeda" valor={d.valor} aoMudar={(v) => mudarItem(descontos, 'descontos', i, { valor: v })} placeholder="0,00" aria-label="Valor" />
                  <button className="btn-icone" onClick={() => removerItem(descontos, 'descontos', i)} aria-label="Remover desconto">
                    <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
              ))}
              {!descontos.length && <div className="itens-vazio">Nenhum outro desconto neste mês.</div>}
              <p className="mini">Desconto que vale só para este mês. Para vales, use “Lançar vale” acima: o sistema controla parcelas e saldo.</p>
            </div>
          </section>

          <section className="painel">
            <div className="painel-titulo">
              <h3>Acréscimos</h3>
              <button className="btn btn-p" onClick={() => aoMudar({ acrescimos: [...acrescimos, { descricao: '', valor: 0 }] })}>
                + Adicionar acréscimo
              </button>
            </div>
            <div className="itens">
              {acrescimos.map((a, i) => (
                <div className="item-linha sem-tipo" key={i}>
                  <input className="campo" list="sugestoes-acrescimo" placeholder="Ex.: Erro de folha, Produção, Meta" value={a.descricao} onChange={(e) => mudarItem(acrescimos, 'acrescimos', i, { descricao: e.target.value })} />
                  <CampoNumero tipo="moeda" valor={a.valor} aoMudar={(v) => mudarItem(acrescimos, 'acrescimos', i, { valor: v })} placeholder="0,00" aria-label="Valor" />
                  <button className="btn-icone" onClick={() => removerItem(acrescimos, 'acrescimos', i)} aria-label="Remover acréscimo">
                    <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
              ))}
              {!acrescimos.length && <div className="itens-vazio">Nenhum acréscimo neste mês.</div>}
              <datalist id="sugestoes-acrescimo">
                {SUGESTOES_ACRESCIMO.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
          </section>

          <section className="painel">
            <Campo rotulo="Observação no card" dica="Opcional. Sai impressa no card (uma linha).">
              <input className="campo" value={l.observacao || ''} maxLength={90} onChange={(e) => aoMudar({ observacao: e.target.value })} />
            </Campo>
          </section>
        </>
      )}

      <section>
        <div className="painel-titulo"><h3>Prévia do card</h3></div>
        <div className="previa-card">
          <CardPagamento dados={card} />
        </div>
      </section>
    </Gaveta>
  );
}

const hojeIso = () => new Date().toLocaleDateString('sv-SE');

/** Vales descontados neste mês + lançamento rápido de um vale novo para o funcionário. */
function PainelVales({ lancamento: l, oficina, ano, mes, parcelas, aoMudar, aoLancarVale }) {
  const [novo, setNovo] = useState(null);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const lancar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      await api.post('/vales', {
        funcionario_id: l.funcionario_id,
        tipo: 'vale',
        valor_total: novo.valor,
        num_parcelas: Math.max(1, Math.round(novo.vezes) || 1),
        descricao: novo.descricao,
        data: hojeIso(),
        inicio: `${ano}-${String(mes).padStart(2, '0')}`,
      });
      setNovo(null);
      await aoLancarVale();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className="painel">
      <div className="painel-titulo">
        <h3>Vales</h3>
        {!novo && <button className="btn btn-p" onClick={() => setNovo({ valor: 0, vezes: 1, descricao: '' })}>+ Lançar vale</button>}
      </div>
      {parcelas.length > 0 ? (
        <div className="lista-simples">
          {parcelas.map((p) => (
            <div key={p.parcelamento_id}>
              <span>{p.descricao}</span>
              <span className={`num ${l.pular_parcelas ? 'sem-valor' : ''}`} style={l.pular_parcelas ? { textDecoration: 'line-through' } : undefined}>
                {valor(p.valor)}
              </span>
            </div>
          ))}
          <label className="caixa-marcar" style={{ border: 0 }}>
            <input type="checkbox" checked={!!l.pular_parcelas} onChange={(e) => aoMudar({ pular_parcelas: e.target.checked })} />
            <span><small>Não descontar vales neste mês (passam para a próxima folha)</small></span>
          </label>
        </div>
      ) : (
        !novo && <p className="itens-vazio">Nenhum vale para descontar neste mês.</p>
      )}
      {novo && (
        <div className="vale-rapido">
          <Campo rotulo="Valor (R$)">
            <CampoNumero tipo="moeda" valor={novo.valor} aoMudar={(v) => setNovo({ ...novo, valor: v })} autoFocus />
          </Campo>
          <Campo rotulo="Vezes">
            <CampoNumero valor={novo.vezes} aoMudar={(v) => setNovo({ ...novo, vezes: v })} />
          </Campo>
          <Campo rotulo="Descrição (opcional)">
            <input className="campo" value={novo.descricao} maxLength={40} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} />
          </Campo>
          {erro && <p className="mini negativo" style={{ gridColumn: '1 / -1' }}>{erro}</p>}
          <div className="acoes-form">
            <span className="mini">Começa a descontar nesta folha.</span>
            <button className="btn" onClick={() => setNovo(null)}>Cancelar</button>
            <button className="btn btn-primario" onClick={lancar} disabled={salvando || !(novo.valor > 0)}>Lançar vale</button>
          </div>
        </div>
      )}
      <p className="mini" style={{ marginTop: 8 }}>
        <Link to={`/empresa/${oficina.slug}/vales?f=${l.funcionario_id}`}>Ver todos os vales de {l.funcionario.nome}</Link>
      </p>
    </section>
  );
}

// Aba "Regras": o cálculo básico, as regras de pagamento montadas pela empresa e os campos personalizados.
// As regras são guardadas como dados e calculadas por shared/regras.js (o mesmo código do servidor).

import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import Gaveta from '../componentes/Gaveta.jsx';
import { Campo, CampoNumero } from '../componentes/Campos.jsx';
import { Mensagem, useEnvio } from './Configuracoes.jsx';
import { calcularLancamento, mesesDeCasa, valorDoDia } from '@shared/calculo.js';
import { brl, MESES, rotuloFolha } from '@shared/formato.js';
import { compilarFormula, FUNCOES, paraNomes } from '@shared/formula.js';
import {
  cobre, definicaoDaRegra, descreverCondicao, descreverRegra, ESCOPOS_CAMPO, formatarDado, GRUPOS, MODELOS, MODOS, OPERADORES, QUEM,
  regrasDaFolha, TIPOS_CAMPO, TIPOS_FAIXA, UNIDADES, valeNaFolha, variaveisDa, variaveisUsadas,
} from '@shared/regras.js';

const LIXEIRA = <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>;
const XIS = <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>;
const SOBE = <svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6" /></svg>;
const DESCE = <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>;

const tipoDoCampoNumero = (tipo) => (tipo === 'horas' ? 'horas' : tipo === 'moeda' ? 'moeda' : 'numero');

export default function Regras() {
  const { oficina, recarregar } = useOutletContext();
  return (
    <div className="pagina-regras">
      <ListaRegras oficina={oficina} recarregar={recarregar} />
      <div className="grade-config">
        <div><CalculoBasico oficina={oficina} recarregar={recarregar} /></div>
        <div><CamposPersonalizados oficina={oficina} recarregar={recarregar} /></div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- lista de regras

const NOVA = { nome: '', tipo: 'provento', valor: 0, ativo: true, folhas: null, definicao: { quem: 'todos', condicoes: [], calculo: { modo: 'fixo' } } };

/** "Todas as folhas", "1ª Folha", "1ª Folha e 3ª Folha · Grupo B" */
function textoFolhas(regra, folhas) {
  if (!Array.isArray(regra.folhas)) return 'Todas as folhas';
  const nomes = folhas.filter((f) => regra.folhas.includes(f.numero)).map(rotuloFolha);
  if (!nomes.length) return 'Nenhuma folha';
  return nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
}

function ListaRegras({ oficina, recarregar }) {
  const variasFolhas = oficina.folhas.length > 1;
  // Folha que a lista mostra (0 = todas as regras da empresa). Com uma folha só, mostra tudo e não pede para escolher.
  const [folhaEscolhida, setFolhaEscolhida] = useState(() => (variasFolhas ? oficina.folhas[0].numero : 0));
  const vista = variasFolhas && oficina.folhas.some((f) => f.numero === folhaEscolhida) ? folhaEscolhida : 0;
  const [editando, setEditando] = useState(null);
  const [estado, enviar] = useEnvio(recarregar);
  const todas = oficina.bonificacoes;
  const regras = vista ? regrasDaFolha(todas, vista) : todas;
  const lista = variaveisDa(oficina.campos, todas);

  const alternar = (b) => enviar(() => api.put(`/bonificacoes/${b.id}`, { ...b, ativo: !b.ativo }));
  const duplicar = (b) => enviar(() => api.post(`/oficinas/${oficina.id}/bonificacoes`, { ...b, nome: `${b.nome} (cópia)`.slice(0, 60) }));
  // Troca com a vizinha que aparece na lista (as regras de outras folhas que estão no meio não mudam de lugar).
  const mover = (i, delta) => {
    const ids = todas.map((b) => b.id);
    const a = ids.indexOf(regras[i].id);
    const z = ids.indexOf(regras[i + delta].id);
    [ids[a], ids[z]] = [ids[z], ids[a]];
    enviar(() => api.put(`/oficinas/${oficina.id}/bonificacoes/ordem`, { ids }));
  };
  const remover = (b) => {
    const texto = `Apagar a regra "${b.nome}"?\n\nEla deixa de valer nas folhas em andamento e nas próximas. Folhas fechadas não mudam.\n`
      + 'Se for só por um tempo, use "Desligar".';
    if (window.confirm(texto)) enviar(() => api.del(`/bonificacoes/${b.id}`));
  };

  return (
    <section className="bloco bloco-corpo">
      <h2 className="secao-titulo">{vista ? `Regras da ${rotuloFolha(oficina.folhas.find((f) => f.numero === vista))}` : 'Regras da empresa'}</h2>
      <p className="secao-desc">
        Bonificações, prêmios e descontos que o sistema calcula sozinho em cada folha. Cada regra diz
        <strong> quem</strong> recebe, <strong>quando</strong> e <strong>quanto</strong>. Elas são calculadas de cima para baixo:
        uma regra pode usar o valor das que estão acima dela (mude a ordem com as setas). Valem para as folhas em andamento e as
        próximas; folhas fechadas não mudam.
        {variasFolhas && ' Cada folha tem as suas regras: escolha a folha abaixo. Uma regra também pode valer em várias folhas.'}
      </p>
      {variasFolhas && (
        <div className="segmentos" role="tablist" style={{ marginBottom: 12 }} data-guia="regras-folhas">
          {oficina.folhas.map((f) => (
            <button key={f.numero} role="tab" aria-selected={vista === f.numero} className={vista === f.numero ? 'ativo' : ''} onClick={() => setFolhaEscolhida(f.numero)}>
              {rotuloFolha(f)}
            </button>
          ))}
          <button role="tab" aria-selected={vista === 0} className={vista === 0 ? 'ativo' : ''} onClick={() => setFolhaEscolhida(0)}>
            Todas as regras
          </button>
        </div>
      )}
      <div className="regras-lista" data-guia="regras-lista">
        {regras.map((b, i) => {
          const d = descreverRegra(b, lista);
          return (
            <div className={`regra-item ${b.ativo ? '' : 'desligada'}`} key={b.id}>
              <div className="regra-ordem" data-guia="regras-ordem">
                <button className="btn-icone" aria-label={`Subir ${b.nome}`} title="Subir" disabled={i === 0 || estado.salvando} onClick={() => mover(i, -1)}>{SOBE}</button>
                <button className="btn-icone" aria-label={`Descer ${b.nome}`} title="Descer" disabled={i === regras.length - 1 || estado.salvando} onClick={() => mover(i, 1)}>{DESCE}</button>
              </div>
              <div className="regra-texto">
                <div className="regra-nome">
                  <strong>{b.nome}</strong>
                  <span className={`chip ${b.tipo === 'desconto' ? 'chip-vermelho' : 'chip-verde'}`}>{b.tipo === 'desconto' ? 'Desconta' : 'Soma'}</span>
                  {!b.ativo && <span className="chip chip-cinza">Desligada</span>}
                  {(variasFolhas || Array.isArray(b.folhas)) && <span className="chip chip-cinza">{textoFolhas(b, oficina.folhas)}</span>}
                </div>
                <div className="regra-frase">{d.quem} · {d.quando} · {d.quanto}</div>
              </div>
              <div className="regra-acoes" data-guia="regras-acoes">
                <button className="btn btn-p" onClick={() => setEditando(b)}>Editar</button>
                <button className="btn btn-p btn-texto" disabled={estado.salvando} onClick={() => duplicar(b)} title="Cria uma cópia no fim da lista">Duplicar</button>
                <button className="btn btn-p btn-texto" disabled={estado.salvando} onClick={() => alternar(b)}>{b.ativo ? 'Desligar' : 'Ligar'}</button>
                <button className="btn-icone" aria-label={`Apagar a regra ${b.nome}`} title="Apagar regra" disabled={estado.salvando} onClick={() => remover(b)}>
                  {LIXEIRA}
                </button>
              </div>
            </div>
          );
        })}
        {!regras.length && (
          <div className="itens-vazio">Nenhuma regra {vista ? 'nesta folha' : 'nesta empresa'} ainda. Comece por um dos modelos prontos.</div>
        )}
      </div>
      <div className="acoes-form">
        <Mensagem estado={estado} />
        <button className="btn btn-primario" onClick={() => setEditando({ ...NOVA, folhas: vista ? [vista] : null })} data-guia="regras-nova">
          + Nova regra
        </button>
      </div>
      {editando && (
        <EditorRegra
          regra={editando}
          oficina={oficina}
          aoFechar={() => setEditando(null)}
          aoSalvo={async () => {
            await recarregar();
            setEditando(null);
          }}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------- editor de uma regra

/** Regra na forma da tela: a fórmula aparece com os nomes dos dados, não com as chaves guardadas. */
function paraForm(r, lista) {
  const definicao = definicaoDaRegra(r);
  if (definicao.calculo.modo === 'formula') definicao.calculo.formula = paraNomes(definicao.calculo.formula, lista);
  return {
    id: r.id, nome: r.nome || '', tipo: r.tipo || 'provento', valor: r.valor ?? 0, ativo: r.ativo !== false, folhas: r.folhas ?? null, definicao,
  };
}

/** Outras regras que esta pode usar: nunca ela mesma, e só as que valem em todas as folhas dela. */
const outrasRegras = (oficina, regra) => oficina.bonificacoes.filter((b) => b.id !== regra.id && cobre(b, regra));

/** Ao trocar o jeito de calcular, começa com valores que fazem sentido. */
function calculoPadrao(modo) {
  if (modo === 'percentual') return { modo, base: 'salario' };
  if (modo === 'por_quantidade') return { modo, quantidade: 'horas_extras', unidade: 'reais' };
  if (modo === 'faixas') return { modo, variavel: 'anos_de_casa', tipo_faixa: 'fixo', faixas: [{ ate: 1, valor: 0 }, { ate: null, valor: 0 }] };
  if (modo === 'formula') return { modo, formula: '' };
  return { modo };
}

/** Opções de dados agrupadas pela origem; `filtro` escolhe quais entram. */
function OpcoesDados({ variaveis, filtro = () => true, comEspeciais = false }) {
  return Object.entries(GRUPOS).map(([grupo, rotulo]) => {
    const lista = variaveis.filter((v) => v.grupo === grupo && (comEspeciais || !v.soFormula) && filtro(v));
    return lista.length ? (
      <optgroup key={grupo} label={rotulo}>
        {lista.map((v) => <option key={v.chave} value={v.chave}>{v.rotulo}</option>)}
      </optgroup>
    ) : null;
  });
}

/** Campo para digitar um dado do tipo certo (horas, R$, número ou sim/não). */
function EntradaDado({ tipo, valor, aoMudar, ...resto }) {
  if (tipo === 'sim_nao') {
    return (
      <select className="campo" value={valor ? 1 : 0} onChange={(e) => aoMudar(Number(e.target.value))} {...resto}>
        <option value={1}>Sim</option>
        <option value={0}>Não</option>
      </select>
    );
  }
  return <CampoNumero tipo={tipoDoCampoNumero(tipo)} valor={valor} aoMudar={aoMudar} {...resto} />;
}

function EditorRegra({ regra, oficina, aoFechar, aoSalvo }) {
  // Só as folhas que existem; uma folha apagada some da lista ao salvar.
  const [form, setForm] = useState(() => {
    const folhas = Array.isArray(regra.folhas) ? regra.folhas.filter((x) => oficina.folhas.some((f) => f.numero === x)) : null;
    return paraForm({ ...regra, folhas }, variaveisDa(oficina.campos, outrasRegras(oficina, regra)));
  });
  // Dados que esta regra pode usar: os fixos, os campos e as outras regras das folhas dela.
  const lista = variaveisDa(oficina.campos, outrasRegras(oficina, form));
  const [modelo, setModelo] = useState(null);
  const [funcionarios, setFuncionarios] = useState([]);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.get(`/oficinas/${oficina.id}/funcionarios`).then((l) => setFuncionarios(l.filter((f) => f.ativo))).catch(() => {});
  }, [oficina.id]);

  const tipoDe = (chave) => lista.find((v) => v.chave === chave)?.tipo || 'numero';
  const def = form.definicao;
  const calculo = def.calculo;
  const desconto = form.tipo === 'desconto';

  const mudar = (p) => setForm((f) => ({ ...f, ...p }));
  const mudarDef = (p) => setForm((f) => ({ ...f, definicao: { ...f.definicao, ...p } }));
  const mudarCalc = (p) => setForm((f) => ({ ...f, definicao: { ...f.definicao, calculo: { ...f.definicao.calculo, ...p } } }));
  const mudarCondicao = (i, p) => mudarDef({ condicoes: def.condicoes.map((c, j) => (j === i ? { ...c, ...p } : c)) });

  const usarModelo = (i) => {
    const m = MODELOS[i] || null;
    setModelo(m);
    setForm((f) => ({ ...paraForm(m || NOVA, lista), folhas: f.folhas }));
  };

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      const corpo = { nome: form.nome, tipo: form.tipo, valor: form.valor, ativo: form.ativo, folhas: form.folhas, definicao: form.definicao };
      if (form.id) await api.put(`/bonificacoes/${form.id}`, corpo);
      else await api.post(`/oficinas/${oficina.id}/bonificacoes`, corpo);
      await aoSalvo();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <Gaveta
      aberta
      aoFechar={aoFechar}
      titulo={form.id ? `Editar regra: ${regra.nome}` : 'Nova regra'}
      subtitulo="Monte a regra em três passos e teste antes de salvar."
      largura={700}
      rodape={(
        <>
          {erro && <span className="mini negativo esquerda">{erro}</span>}
          <button className="btn" onClick={aoFechar}>Cancelar</button>
          <button className="btn btn-primario" disabled={salvando} onClick={salvar} data-guia="regra-salvar">Salvar regra</button>
        </>
      )}
    >
      {!form.id && (
        <section className="painel" data-guia="regra-modelo">
          <Campo rotulo="Começar de um modelo" dica={modelo ? modelo.explicacao : 'Escolha um modelo pronto e ajuste, ou monte do zero.'}>
            <select className="campo" value={modelo ? MODELOS.indexOf(modelo) : ''} onChange={(e) => usarModelo(e.target.value === '' ? -1 : Number(e.target.value))}>
              <option value="">Regra em branco</option>
              {MODELOS.map((m, i) => <option key={m.nome} value={i}>{m.nome}</option>)}
            </select>
          </Campo>
        </section>
      )}

      <section className="painel" data-guia="regra-nome">
        <div className="grade-form">
          <Campo rotulo="Nome (sai assim no card)">
            <input className="campo" value={form.nome} maxLength={60} placeholder="Ex.: Prêmio assiduidade" onChange={(e) => mudar({ nome: e.target.value })} />
          </Campo>
          <Campo rotulo="O que a regra faz">
            <select className="campo" value={form.tipo} onChange={(e) => mudar({ tipo: e.target.value })}>
              <option value="provento">Soma no pagamento</option>
              <option value="desconto">Desconta do pagamento</option>
            </select>
          </Campo>
        </div>
        <label className="caixa-marcar" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={form.ativo} onChange={(e) => mudar({ ativo: e.target.checked })} />
          <span>
            <strong>Regra ligada</strong>
            <small>Desligada, a regra fica guardada mas não entra nas folhas.</small>
          </span>
        </label>
      </section>

      {(oficina.folhas.length > 1 || Array.isArray(form.folhas)) && (
        <EscolherFolhas folhas={oficina.folhas} escolhidas={form.folhas} aoMudar={(folhas) => mudar({ folhas })} />
      )}

      <section className="painel" data-guia="regra-quem">
        <div className="painel-titulo"><h3><span className="passo">1</span>{desconto ? 'Para quem vale' : 'Quem recebe'}</h3></div>
        <select className="campo" value={def.quem} onChange={(e) => mudarDef({ quem: e.target.value })}>
          {Object.entries(QUEM).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
        </select>
        {def.quem === 'marcados' && (
          <p className="mini" style={{ marginTop: 8 }}>
            Marque quem entra nesta regra no cadastro de cada funcionário (aba Funcionários). Lá também dá para dar um valor diferente para cada pessoa.
          </p>
        )}
        {def.quem === 'funcoes' && (
          <EscolherFuncoes escolhidas={def.funcoes} funcionarios={funcionarios} aoMudar={(funcoes) => mudarDef({ funcoes })} />
        )}
      </section>

      <section className="painel" data-guia="regra-quando">
        <div className="painel-titulo">
          <h3><span className="passo">2</span>Quando</h3>
          <button className="btn btn-p" onClick={() => mudarDef({ condicoes: [...def.condicoes, { variavel: 'faltas', op: 'igual', valor: 0 }] })}>
            + Adicionar condição
          </button>
        </div>
        {!def.condicoes.length && <p className="itens-vazio">Sempre: a regra não depende de nada do mês.</p>}
        <div className="itens">
          {def.condicoes.map((c, i) => {
            const tipo = tipoDe(c.variavel);
            return (
              <div className="condicao" key={i}>
                <span className="condicao-se">{i === 0 ? 'Se' : def.juntar === 'alguma' ? 'ou' : 'e'}</span>
                <select
                  className="campo"
                  aria-label="Dado"
                  value={c.variavel}
                  onChange={(e) => mudarCondicao(i, tipoDe(e.target.value) === 'sim_nao' ? { variavel: e.target.value, op: 'igual', valor: 1 } : { variavel: e.target.value })}
                >
                  <OpcoesDados variaveis={lista} />
                </select>
                <select className="campo" aria-label="Comparação" value={c.op} onChange={(e) => mudarCondicao(i, { op: e.target.value })}>
                  {Object.entries(OPERADORES).filter(([k]) => tipo !== 'sim_nao' || k === 'igual' || k === 'diferente').map(([k, o]) => (
                    <option key={k} value={k}>{o.rotulo}</option>
                  ))}
                </select>
                <EntradaDado
                  tipo={tipo}
                  valor={c.valor}
                  aoMudar={(valor) => mudarCondicao(i, { valor })}
                  aria-label="Valor da condição"
                  placeholder={tipo === 'horas' ? '0:00' : '0'}
                />
                <button className="btn-icone" aria-label="Tirar condição" onClick={() => mudarDef({ condicoes: def.condicoes.filter((_, j) => j !== i) })}>{XIS}</button>
              </div>
            );
          })}
        </div>
        {def.condicoes.length > 1 && (
          <select className="campo" style={{ marginTop: 10 }} value={def.juntar} onChange={(e) => mudarDef({ juntar: e.target.value })}>
            <option value="todas">Precisa cumprir todas as condições</option>
            <option value="alguma">Basta cumprir uma das condições</option>
          </select>
        )}
        {def.condicoes.length > 0 && (
          <p className="mini" style={{ marginTop: 8 }}>Na folha do mês dá para marcar na mão “aplica” ou “não aplica” para uma pessoa, em casos especiais.</p>
        )}
      </section>

      <section className="painel" data-guia="regra-quanto">
        <div className="painel-titulo"><h3><span className="passo">3</span>Quanto</h3></div>
        <select className="campo" value={calculo.modo} onChange={(e) => mudarDef({ calculo: calculoPadrao(e.target.value) })}>
          {Object.entries(MODOS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
        </select>
        {calculo.modo === 'fixo' && (
          <div className="linha-regra">
            <span>R$</span>
            <CampoNumero tipo="moeda" valor={form.valor} aoMudar={(valor) => mudar({ valor })} style={{ width: 130 }} aria-label="Valor" />
            <span>por mês</span>
          </div>
        )}
        {calculo.modo === 'percentual' && (
          <div className="linha-regra">
            <CampoNumero valor={form.valor} aoMudar={(valor) => mudar({ valor })} style={{ width: 90 }} aria-label="Porcentagem" />
            <span>% de</span>
            <select className="campo" style={{ width: 260 }} value={calculo.base} onChange={(e) => mudarCalc({ base: e.target.value })} aria-label="Sobre qual valor">
              <OpcoesDados variaveis={lista} filtro={(v) => v.tipo === 'moeda'} />
            </select>
          </div>
        )}
        {calculo.modo === 'por_quantidade' && (
          <div className="linha-regra">
            <span>Para cada</span>
            <select className="campo" style={{ width: 200 }} value={calculo.quantidade} onChange={(e) => mudarCalc({ quantidade: e.target.value })} aria-label="Quantidade">
              <OpcoesDados variaveis={lista} filtro={(v) => v.tipo === 'numero' || v.tipo === 'horas'} />
            </select>
            <span>{tipoDe(calculo.quantidade) === 'horas' ? '(hora)' : ''}:</span>
            <CampoNumero
              tipo={calculo.unidade === 'reais' ? 'moeda' : 'numero'}
              valor={form.valor}
              aoMudar={(valor) => mudar({ valor })}
              style={{ width: 100 }}
              aria-label="Valor por unidade"
            />
            <select className="campo" style={{ width: 180 }} value={calculo.unidade} onChange={(e) => mudarCalc({ unidade: e.target.value })} aria-label="Unidade">
              {Object.entries(UNIDADES).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
            </select>
          </div>
        )}
        {calculo.modo === 'faixas' && <EditorFaixas calculo={calculo} lista={lista} tipoDe={tipoDe} aoMudar={mudarCalc} />}
        {calculo.modo === 'formula' && (
          <EditorFormula texto={calculo.formula} lista={lista} valor={form.valor} aoMudar={(formula) => mudarCalc({ formula })} aoMudarValor={(valor) => mudar({ valor })} />
        )}
        <Limites calculo={calculo} aoMudar={mudarCalc} />
        {def.quem === 'marcados' && calculo.modo !== 'faixas' && (
          <p className="mini" style={{ marginTop: 8 }}>
            {calculo.modo === 'formula' ? 'O "Valor da regra" é' : 'Este é'} o valor padrão. No cadastro do funcionário dá para dar um valor próprio a cada pessoa.
          </p>
        )}
      </section>

      <TesteRegra form={form} oficina={oficina} funcionarios={funcionarios} lista={lista} />
    </Gaveta>
  );
}

/** Em quais folhas (grupos) a regra vale: todas, ou só as marcadas. */
function EscolherFolhas({ folhas, escolhidas, aoMudar }) {
  const algumas = Array.isArray(escolhidas);
  const marcar = (numero, sim) => aoMudar(folhas.map((f) => f.numero).filter((x) => (x === numero ? sim : escolhidas.includes(x))));

  return (
    <section className="painel" data-guia="regra-folhas">
      <div className="painel-titulo"><h3>Em quais folhas vale</h3></div>
      <select className="campo" value={algumas ? 'algumas' : 'todas'} onChange={(e) => aoMudar(e.target.value === 'todas' ? null : [folhas[0].numero])}>
        <option value="todas">Em todas as folhas (também nas que forem criadas depois)</option>
        <option value="algumas">Só nas folhas marcadas</option>
      </select>
      {algumas && (
        <div className="funcoes-regra" style={{ marginTop: 8 }}>
          {folhas.map((f) => (
            <label key={f.numero} className="caixa-marcar">
              <input type="checkbox" checked={escolhidas.includes(f.numero)} onChange={(e) => marcar(f.numero, e.target.checked)} />
              <span>{rotuloFolha(f)}</span>
            </label>
          ))}
        </div>
      )}
      {algumas && !escolhidas.length && <p className="mini negativo" style={{ marginTop: 8 }}>Marque pelo menos uma folha.</p>}
      <p className="mini" style={{ marginTop: 8 }}>Nas outras folhas a regra não entra no cálculo, nem aparece na folha do mês.</p>
    </section>
  );
}

function EscolherFuncoes({ escolhidas, funcionarios, aoMudar }) {
  const [outra, setOutra] = useState('');
  const existentes = funcionarios.map((f) => (f.funcao || '').trim()).filter(Boolean);
  const todas = [...new Set([...existentes, ...escolhidas])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const marcar = (f, sim) => aoMudar(sim ? [...escolhidas.filter((x) => x !== f), f] : escolhidas.filter((x) => x !== f));
  const adicionar = () => {
    if (!outra.trim()) return;
    marcar(outra.trim(), true);
    setOutra('');
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div className="funcoes-regra">
        {todas.map((f) => (
          <label key={f} className="caixa-marcar">
            <input type="checkbox" checked={escolhidas.includes(f)} onChange={(e) => marcar(f, e.target.checked)} />
            <span>{f}</span>
          </label>
        ))}
      </div>
      {!todas.length && <p className="mini">Nenhum funcionário ativo tem a função preenchida no cadastro. Digite a função abaixo.</p>}
      <div className="linha-regra">
        <input
          className="campo"
          style={{ maxWidth: 240 }}
          placeholder="Outra função"
          value={outra}
          onChange={(e) => setOutra(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && adicionar()}
        />
        <button className="btn btn-p" disabled={!outra.trim()} onClick={adicionar}>Adicionar</button>
      </div>
    </div>
  );
}

function EditorFaixas({ calculo, lista, tipoDe, aoMudar }) {
  const { faixas } = calculo;
  const tipo = tipoDe(calculo.variavel);
  const emReais = calculo.tipo_faixa === 'fixo';
  const comLimite = faixas.filter((f) => f.ate !== null);
  const acima = faixas.filter((f) => f.ate === null);
  const mudarFaixa = (i, p) => aoMudar({ faixas: faixas.map((f, j) => (j === i ? { ...f, ...p } : f)) });
  const adicionar = () => {
    const ultimo = comLimite.reduce((m, f) => Math.max(m, f.ate), 0);
    aoMudar({ faixas: [...comLimite, { ate: ultimo + 1, valor: 0 }, ...acima] });
  };
  const dica = {
    fixo: '“Até” inclui o próprio número: até 2 anos vale para quem tem 0, 1 ou 2 anos de casa.',
    percentual: 'A porcentagem da faixa vale sobre o valor inteiro. Ex.: comissão de R$ 6.000 na faixa de 5% → R$ 300.',
    progressiva: 'Cada porcentagem vale só sobre a parte do valor que cai na faixa, como no INSS. Sem a linha “acima disso”, o que passar da última faixa não paga nada (teto).',
  }[calculo.tipo_faixa];

  return (
    <div className="itens" style={{ marginTop: 10 }}>
      <div className="linha-regra" style={{ marginTop: 0 }}>
        <span>Conforme</span>
        <select className="campo" style={{ width: 260 }} value={calculo.variavel} onChange={(e) => aoMudar({ variavel: e.target.value })} aria-label="Dado das faixas">
          <OpcoesDados variaveis={lista} filtro={(v) => v.tipo !== 'sim_nao'} />
        </select>
      </div>
      <select className="campo" value={calculo.tipo_faixa} onChange={(e) => aoMudar({ tipo_faixa: e.target.value })} aria-label="Como as faixas pagam">
        {Object.entries(TIPOS_FAIXA).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
      </select>
      {faixas.map((f, i) => (
        <div className="faixa-linha" key={i}>
          {f.ate === null ? (
            <span className="faixa-rotulo" style={{ gridColumn: 'span 2' }}>Acima disso</span>
          ) : (
            <>
              <span className="faixa-rotulo">Até</span>
              <EntradaDado tipo={tipo} valor={f.ate} aoMudar={(ate) => mudarFaixa(i, { ate })} aria-label="Limite da faixa" placeholder={tipo === 'horas' ? '0:00' : '0'} />
            </>
          )}
          <span className="faixa-rotulo">{emReais ? '→ R$' : '→ %'}</span>
          <CampoNumero
            tipo={emReais ? 'moeda' : 'numero'}
            valor={f.valor}
            aoMudar={(valor) => mudarFaixa(i, { valor })}
            aria-label={emReais ? 'Valor da faixa' : 'Porcentagem da faixa'}
            placeholder={emReais ? '0,00' : '0'}
          />
          <button className="btn-icone" aria-label="Tirar faixa" disabled={faixas.length <= 1} onClick={() => aoMudar({ faixas: faixas.filter((_, j) => j !== i) })}>{XIS}</button>
        </div>
      ))}
      <div className="linha-regra" style={{ marginTop: 0 }}>
        <button className="btn btn-p" onClick={adicionar}>+ Faixa</button>
        {!acima.length && <button className="btn btn-p" onClick={() => aoMudar({ faixas: [...faixas, { ate: null, valor: 0 }] })}>+ Linha “acima disso”</button>}
      </div>
      <p className="mini">{dica}</p>
    </div>
  );
}

const EXEMPLOS_FORMULA = [
  ['SE([Faltas] = 0; 150; 50)', 'R$ 150 para quem não faltou, R$ 50 para quem faltou'],
  ['[Salário] * 10%', '10% do salário'],
  ['MIN([Comissão] * 5%; 300)', '5% da comissão, no máximo R$ 300'],
  ['[Valor da regra] * [Dias trabalhados] / [Dias do mês (divisor)]', 'proporcional aos dias trabalhados'],
  ['SE(E([Faltas] = 0; [Horas de atraso] <= 1); 100; 0)', 'R$ 100 se não faltou e atrasou até 1 hora'],
  ['ARRED([Valor das horas extras] / 6)', 'um sexto do valor das horas extras'],
];

function EditorFormula({ texto, lista, valor, aoMudar, aoMudarValor }) {
  const caixa = useRef(null);
  const [funcao, setFuncao] = useState(null);
  const f = compilarFormula(texto, lista);
  const usaValor = /\[\s*valor da regra\s*\]/i.test(texto);

  // Põe o trecho onde está o cursor (ou no fim) e deixa o cursor depois dele, ou dentro dos parênteses da função.
  const inserir = (trecho, recuo = 0) => {
    const el = caixa.current;
    const ini = el ? el.selectionStart : texto.length;
    const fim = el ? el.selectionEnd : texto.length;
    aoMudar(texto.slice(0, ini) + trecho + texto.slice(fim));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = ini + trecho.length - recuo;
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="formula">
      <textarea
        ref={caixa}
        className="campo campo-formula"
        rows={3}
        spellCheck={false}
        value={texto}
        placeholder="Ex.: SE([Faltas] = 0; 150; 50)"
        onChange={(e) => aoMudar(e.target.value)}
        aria-label="Fórmula"
      />
      <div className={`formula-situacao ${f.erro ? 'erro' : 'ok'}`} role="status">{f.erro ? `✗ ${f.erro}` : '✓ A fórmula está certa. Confira o resultado no teste abaixo.'}</div>
      <div className="linha-regra">
        <select
          className="campo"
          style={{ width: 230 }}
          value=""
          aria-label="Inserir dado"
          onChange={(e) => {
            const v = lista.find((x) => x.chave === e.target.value);
            if (v) inserir(`[${v.rotulo}]`);
          }}
        >
          <option value="">+ Inserir dado…</option>
          <OpcoesDados variaveis={lista} comEspeciais />
        </select>
        <select
          className="campo"
          style={{ width: 200 }}
          value=""
          aria-label="Inserir função"
          onChange={(e) => {
            const nome = e.target.value;
            if (!nome) return;
            setFuncao(nome);
            inserir(`${nome === 'NAO' ? 'NÃO' : nome}()`, 1);
          }}
        >
          <option value="">+ Inserir função…</option>
          {Object.entries(FUNCOES).map(([k, x]) => <option key={k} value={k}>{x.uso.split('(')[0]}: {x.explica}</option>)}
        </select>
        <span className="mini">Contas: + − * / e ^ · comparações: = &lt;&gt; &lt; &lt;= &gt; &gt;= · 10% = 0,10 · números sem ponto: 100000 ou 1500,50</span>
      </div>
      {funcao && <p className="mini">Como usar: <code>{FUNCOES[funcao].uso}</code>. Separe os valores com ponto e vírgula (;), como no Excel.</p>}
      {usaValor && (
        <div className="linha-regra">
          <span>Valor da regra:</span>
          <CampoNumero tipo="moeda" valor={valor} aoMudar={aoMudarValor} style={{ width: 130 }} aria-label="Valor da regra" />
        </div>
      )}
      <details className="formula-ajuda">
        <summary>Exemplos de fórmulas</summary>
        {EXEMPLOS_FORMULA.map(([exemplo, explica]) => (
          <div className="formula-exemplo" key={exemplo}>
            <code>{exemplo}</code>
            <span className="mini">{explica}</span>
            <button className="btn btn-p btn-texto" onClick={() => aoMudar(exemplo)}>Usar</button>
          </div>
        ))}
      </details>
    </div>
  );
}

/** Piso e teto opcionais para o valor da regra. */
function Limites({ calculo, aoMudar }) {
  const tem = (k) => calculo[k] !== null && calculo[k] !== undefined;
  return (
    <div className="limites">
      {[['minimo', 'No mínimo'], ['maximo', 'No máximo']].map(([k, rotulo]) => (
        <div className="limite" key={k}>
          <label className="caixa-marcar">
            <input type="checkbox" checked={tem(k)} onChange={(e) => aoMudar({ [k]: e.target.checked ? 0 : null })} />
            <span>{rotulo}</span>
          </label>
          {tem(k) && <CampoNumero tipo="moeda" valor={calculo[k]} aoMudar={(v) => aoMudar({ [k]: v })} style={{ width: 120 }} aria-label={`${rotulo} (R$)`} placeholder="0,00" />}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- teste antes de salvar

function TesteRegra({ form, oficina, funcionarios, lista }) {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [quemId, setQuemId] = useState('');
  const [pessoa, setPessoa] = useState({ salario: 1500, funcao: '', meses: 0, comissionado: false, campos: {}, marcado: true, proprio: null, marcas: [] });
  const [mesTeste, setMesTeste] = useState({});
  // Folha do teste: as outras regras que entram no cálculo são as dela. Fica numa folha em que esta regra vale.
  const folhasDaRegra = oficina.folhas.filter((f) => valeNaFolha(form, f.numero));
  const [folhaEscolhida, setFolhaEscolhida] = useState(null);
  const folhaTeste = (folhasDaRegra.find((f) => f.numero === folhaEscolhida) || folhasDaRegra[0] || oficina.folhas[0]).numero;
  const daRegra = funcionarios.filter((f) => valeNaFolha(form, f.folha_numero));

  const info = (chave) => lista.find((v) => v.chave === chave) || { rotulo: chave, tipo: 'numero' };
  const def = definicaoDaRegra(form);
  const usadas = variaveisUsadas(def, lista);
  const desconto = form.tipo === 'desconto';
  const idTeste = form.id ?? -1;

  const escolher = (fid) => {
    setQuemId(fid);
    const f = funcionarios.find((x) => String(x.id) === fid);
    if (!f) return;
    setFolhaEscolhida(f.folha_numero);
    const marcado = f.bonificacoes.find((b) => b.bonificacao_id === form.id);
    setPessoa({
      salario: f.salario,
      funcao: f.funcao || '',
      meses: mesesDeCasa(f.admissao, ano, mes),
      comissionado: f.comissionado,
      campos: f.campos || {},
      marcado: !!marcado,
      proprio: marcado?.valor ?? null,
      marcas: f.bonificacoes.filter((b) => b.bonificacao_id !== form.id),
    });
  };
  const mudarPessoa = (p) => setPessoa((x) => ({ ...x, ...p }));

  // Calcula a folha inteira da pessoa com todas as regras da folha (esta no lugar dela, ou no fim se for nova),
  // para a regra ver os totais e as regras de cima exatamente como na folha.
  const regraTeste = { ...form, id: idTeste, ativo: true };
  const regras = (form.id ? oficina.bonificacoes.map((b) => (b.id === form.id ? regraTeste : b)) : [...oficina.bonificacoes, regraTeste])
    .filter((b) => b.id === idTeste || valeNaFolha(b, folhaTeste));
  const inicio = new Date(ano, mes - 1 - pessoa.meses, 1);
  const funcionario = {
    salario: pessoa.salario,
    funcao: pessoa.funcao,
    comissionado: pessoa.comissionado,
    campos: pessoa.campos,
    admissao: `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}-01`,
    bonificacoes: [...pessoa.marcas, ...(pessoa.marcado ? [{ bonificacao_id: idTeste, valor: pessoa.proprio }] : [])],
  };
  const lancamento = { campos: {} };
  for (const [k, v] of Object.entries(mesTeste)) {
    const m = /^campo:(\d+)$/.exec(k);
    if (m) lancamento.campos[m[1]] = v;
    else lancamento[k] = v;
  }
  const r = calcularLancamento({ oficina, bonificacoes: regras, funcionario, parcelamentos: [], ano, mes, explicar: true }, lancamento);
  const a = r.avaliacoes[idTeste];

  let resultado;
  if (a.erro) {
    resultado = { sim: false, texto: `A fórmula tem um erro: ${a.erro}` };
  } else if (!a.elegivel) {
    resultado = { sim: false, texto: `Não entra nesta regra. ${a.motivo}` };
  } else if (!a.aplicada) {
    const porque = a.falhas.map((c) => `${info(c.variavel).rotulo} está em ${formatarDado(info(c.variavel).tipo, a.valores[c.variavel])}, e a regra pede ${descreverCondicao(c, lista)}`);
    resultado = { sim: false, texto: `${desconto ? 'Não tem o desconto' : 'Não recebe'}: ${porque.join('; ')}.` };
  } else if (!a.valor) {
    resultado = { sim: false, texto: 'A regra vale para esta pessoa, mas o valor calculado deu R$ 0,00.' };
  } else {
    resultado = { sim: true, texto: `${desconto ? 'Desconta' : 'Recebe'} ${brl(a.valor)}${a.detalhe ? ` (${a.detalhe})` : ''}.` };
  }

  // Quais dados pedir: os que a regra usa e, se ela usa totais ou outras regras, tudo o que se lança no mês.
  const grupoDe = (k) => info(k).grupo;
  const amplo = [...usadas].some((k) => grupoDe(k) === 'folha' || grupoDe(k) === 'regras');
  const doMes = lista.filter((v) => v.grupo === 'mes' && (amplo || usadas.has(v.chave) || (v.chave === 'faltas' && usadas.has('dias_trabalhados'))));
  const doCadastro = lista.filter((v) => v.grupo === 'cadastro' && v.chave.startsWith('campo:') && (amplo || usadas.has(v.chave)));
  const usaCasa = usadas.has('meses_de_casa') || usadas.has('anos_de_casa');
  const anos = usadas.has('anos_de_casa') && !usadas.has('meses_de_casa');
  const mostrarValores = [...usadas].filter((k) => ['calculado', 'folha', 'regras'].includes(grupoDe(k)) && k !== 'mes');

  return (
    <section className="painel teste-regra" data-guia="regra-teste">
      <div className="painel-titulo"><h3>Testar antes de salvar</h3></div>
      <div className="grade-form">
        <Campo rotulo="Testar com">
          <select className="campo" value={quemId} onChange={(e) => escolher(e.target.value)}>
            <option value="">Um exemplo (preencha abaixo)</option>
            {daRegra.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </Campo>
        {folhasDaRegra.length > 1 && (
          <Campo rotulo="Folha">
            <select className="campo" value={folhaTeste} onChange={(e) => setFolhaEscolhida(Number(e.target.value))}>
              {folhasDaRegra.map((f) => <option key={f.numero} value={f.numero}>{rotuloFolha(f)}</option>)}
            </select>
          </Campo>
        )}
        <Campo rotulo="Salário (R$)">
          <CampoNumero tipo="moeda" valor={pessoa.salario} aoMudar={(salario) => mudarPessoa({ salario })} />
        </Campo>
        {def.quem === 'funcoes' && (
          <Campo rotulo="Função">
            <input className="campo" value={pessoa.funcao} onChange={(e) => mudarPessoa({ funcao: e.target.value })} list="funcoes-teste" />
            <datalist id="funcoes-teste">{def.funcoes.map((f) => <option key={f} value={f} />)}</datalist>
          </Campo>
        )}
        {usaCasa && (
          <Campo rotulo={anos ? 'Anos de casa' : 'Meses de casa'}>
            <CampoNumero valor={anos ? Math.floor(pessoa.meses / 12) : pessoa.meses} aoMudar={(v) => mudarPessoa({ meses: Math.max(0, Math.round(anos ? v * 12 : v)) })} />
          </Campo>
        )}
        {usadas.has('mes') && (
          <Campo rotulo="Mês da folha">
            <select className="campo" value={mes} onChange={(e) => setMes(Number(e.target.value))}>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </Campo>
        )}
        {doCadastro.map((v) => (
          <Campo key={v.chave} rotulo={`${v.rotulo} (cadastro)`}>
            <EntradaDado
              tipo={v.tipo}
              valor={pessoa.campos[v.chave.slice(6)] ?? 0}
              aoMudar={(x) => mudarPessoa({ campos: { ...pessoa.campos, [v.chave.slice(6)]: x } })}
            />
          </Campo>
        ))}
        {doMes.map((v) => (
          <Campo key={v.chave} rotulo={`${v.rotulo} no mês`}>
            <EntradaDado tipo={v.tipo} valor={mesTeste[v.chave] ?? 0} aoMudar={(x) => setMesTeste((m) => ({ ...m, [v.chave]: x }))} />
          </Campo>
        ))}
        {usadas.has('comissionado') && (
          <label className="caixa-marcar inteiro">
            <input type="checkbox" checked={pessoa.comissionado} onChange={(e) => mudarPessoa({ comissionado: e.target.checked })} />
            <span><strong>Recebe comissão (cadastro)</strong></span>
          </label>
        )}
        {def.quem === 'marcados' && (
          <label className="caixa-marcar inteiro">
            <input type="checkbox" checked={pessoa.marcado} onChange={(e) => mudarPessoa({ marcado: e.target.checked })} />
            <span><strong>Marcado no cadastro</strong></span>
          </label>
        )}
      </div>
      {mostrarValores.length > 0 && (
        <p className="mini" style={{ marginTop: 8 }}>
          Na hora desta regra: {mostrarValores.map((k) => `${info(k).rotulo} = ${formatarDado(info(k).tipo, a.valores[k])}`).join(' · ')}
        </p>
      )}
      {(usadas.has('valor_dia') || usadas.has('valor_hora')) && !mostrarValores.length && (
        <p className="mini" style={{ marginTop: 8 }}>
          Com este salário: valor do dia {brl(valorDoDia(pessoa.salario, oficina))} · valor da hora {brl(r.valor_hora)}
        </p>
      )}
      <div className={`teste-resultado ${resultado.sim ? 'sim' : 'nao'}`} role="status">
        {resultado.sim ? '✓ ' : '✗ '}{resultado.texto}
      </div>
      <p className="mini" style={{ marginTop: 6 }}>
        Líquido do mês desta pessoa, com todas as regras {oficina.folhas.length > 1 ? `da ${rotuloFolha(oficina.folhas.find((f) => f.numero === folhaTeste))}` : 'da empresa'}: {brl(r.liquido)}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- cálculo básico

function CalculoBasico({ oficina, recarregar }) {
  const [form, setForm] = useState({
    valor_hora_extra: oficina.valor_hora_extra,
    divisor_dias: oficina.divisor_dias,
    divisor_nome: oficina.divisor_nome || 'dias',
    arredondar_dia: oficina.arredondar_dia,
    horas_por_dia: oficina.horas_por_dia,
    sabado_modo: oficina.sabado_modo,
    sabado_valor: oficina.sabado_valor,
  });
  const [estado, enviar] = useEnvio(recarregar);
  const mudar = (p) => setForm((f) => ({ ...f, ...p }));
  const exemplo = valorDoDia(1000, form);

  return (
    <section className="bloco bloco-corpo" data-guia="regras-basico">
      <h2 className="secao-titulo">Cálculo básico</h2>
      <p className="secao-desc">Faltas, atrasos, sábados e hora extra. Valem para as folhas em andamento e as próximas. Folhas já fechadas não mudam.</p>
      <div className="grade-form">
        <Campo rotulo="Hora extra (R$ por hora)" dica="Deixe em 0 se usar uma regra de hora extra">
          <CampoNumero tipo="moeda" valor={form.valor_hora_extra} aoMudar={(v) => mudar({ valor_hora_extra: v })} />
        </Campo>
        <Campo rotulo={`Dividir o salário por (${form.divisor_nome.trim() || 'dias'})`} dica="Para achar o valor do dia de falta. O nome ao lado pode ser trocado">
          <div style={{ display: 'flex', gap: 8 }}>
            <CampoNumero valor={form.divisor_dias} aoMudar={(v) => mudar({ divisor_dias: v })} style={{ flex: 1, minWidth: 0 }} />
            <input
              className="campo"
              style={{ flex: 1, minWidth: 0 }}
              aria-label="Nome do divisor"
              placeholder="dias"
              maxLength={30}
              value={form.divisor_nome}
              onChange={(e) => mudar({ divisor_nome: e.target.value })}
            />
          </div>
        </Campo>
        <label className="caixa-marcar inteiro">
          <input type="checkbox" checked={form.arredondar_dia} onChange={(e) => mudar({ arredondar_dia: e.target.checked })} />
          <span>
            <strong>Usar só o quociente inteiro da divisão</strong>
            <small>
              Ex.: salário de R$ 1.000,00 ÷ {form.divisor_dias || 22} {form.divisor_nome.trim() || 'dias'} → dia de falta = {brl(exemplo)}
              {form.arredondar_dia ? ' (sem os centavos)' : ''}
            </small>
          </span>
        </label>
        <Campo rotulo="Horas de trabalho por dia" dica="Para descontar atrasos e saídas antecipadas">
          <CampoNumero valor={form.horas_por_dia} aoMudar={(v) => mudar({ horas_por_dia: v })} />
        </Campo>
        <div />
        <Campo rotulo="Sábado trabalhado vale">
          <select className="campo" value={form.sabado_modo} onChange={(e) => mudar({ sabado_modo: e.target.value })}>
            <option value="diaria">Um dia de salário (valor do dia)</option>
            <option value="fixo">Um valor fixo por sábado</option>
          </select>
        </Campo>
        {form.sabado_modo === 'fixo' && (
          <Campo rotulo="Valor por sábado (R$)">
            <CampoNumero tipo="moeda" valor={form.sabado_valor} aoMudar={(v) => mudar({ sabado_valor: v })} />
          </Campo>
        )}
      </div>
      <div className="acoes-form">
        <Mensagem estado={estado} />
        <button className="btn btn-primario" disabled={estado.salvando} onClick={() => enviar(() => api.put(`/oficinas/${oficina.id}`, form))}>
          Salvar cálculo básico
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- campos personalizados

const ONDE_CAMPO = { mes: 'Folha do mês', cadastro: 'Cadastro' };

function CamposPersonalizados({ oficina, recarregar }) {
  const [novo, setNovo] = useState({ nome: '', tipo: 'numero', escopo: 'mes' });
  const [estado, enviar] = useEnvio(recarregar);

  const criar = () => enviar(async () => {
    await api.post(`/oficinas/${oficina.id}/campos`, novo);
    setNovo((x) => ({ ...x, nome: '' }));
  });
  const renomear = (c) => {
    const nome = window.prompt('Novo nome do campo:', c.nome);
    if (nome && nome.trim() && nome.trim() !== c.nome) enviar(() => api.put(`/campos/${c.id}`, { ...c, nome }));
  };
  const remover = (c) => {
    const onde = c.escopo === 'cadastro' ? 'O campo sai do cadastro dos funcionários.' : 'A coluna sai das folhas em andamento e das próximas.';
    if (window.confirm(`Apagar o campo "${c.nome}"?\n\n${onde} Folhas fechadas não mudam.`)) enviar(() => api.del(`/campos/${c.id}`));
  };

  return (
    <section className="bloco bloco-corpo" data-guia="regras-campos">
      <h2 className="secao-titulo">Campos personalizados</h2>
      <p className="secao-desc">
        Crie campos para o que a empresa precisar e use nas regras. <strong>Folha do mês</strong>: lançado todo mês, vira uma coluna
        na folha (peças produzidas, vendas, meta batida…). <strong>Cadastro</strong>: preenchido uma vez no funcionário (número de
        filhos, nível, tem moto…).
      </p>
      <table className="tabela-bonus">
        <thead>
          <tr><th>Campo</th><th style={{ width: 110 }}>Onde</th><th style={{ width: 120 }}>Tipo</th><th style={{ width: 120 }} /></tr>
        </thead>
        <tbody>
          {oficina.campos.map((c) => (
            <tr key={c.id}>
              <td><strong>{c.nome}</strong></td>
              <td className="mini">{ONDE_CAMPO[c.escopo] || ONDE_CAMPO.mes}</td>
              <td className="mini">{TIPOS_CAMPO[c.tipo]}</td>
              <td className="dir" style={{ whiteSpace: 'nowrap' }}>
                <button className="btn btn-p btn-texto" disabled={estado.salvando} onClick={() => renomear(c)}>Renomear</button>
                <button className="btn-icone" aria-label={`Apagar o campo ${c.nome}`} title="Apagar campo" disabled={estado.salvando} onClick={() => remover(c)}>{LIXEIRA}</button>
              </td>
            </tr>
          ))}
          {!oficina.campos.length && <tr><td colSpan={4} className="itens-vazio">Nenhum campo criado.</td></tr>}
        </tbody>
      </table>
      <div className="linha-regra">
        <input
          className="campo"
          style={{ flex: 1, minWidth: 160 }}
          placeholder="Nome do campo novo"
          maxLength={40}
          value={novo.nome}
          onChange={(e) => setNovo((x) => ({ ...x, nome: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && novo.nome.trim() && criar()}
        />
        <select className="campo" style={{ width: 210 }} value={novo.escopo} onChange={(e) => setNovo((x) => ({ ...x, escopo: e.target.value }))} aria-label="Onde o campo é preenchido">
          {Object.entries(ESCOPOS_CAMPO).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
        </select>
        <select className="campo" style={{ width: 140 }} value={novo.tipo} onChange={(e) => setNovo((x) => ({ ...x, tipo: e.target.value }))} aria-label="Tipo do campo">
          {Object.entries(TIPOS_CAMPO).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
        </select>
        <button className="btn" disabled={!novo.nome.trim() || estado.salvando} onClick={criar}>+ Criar campo</button>
      </div>
      <div className="acoes-form" style={{ marginTop: 8 }}>
        <Mensagem estado={estado} />
      </div>
    </section>
  );
}

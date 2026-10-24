import { useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import { useOficinas } from '../App.jsx';
import { Campo } from '../componentes/Campos.jsx';
import CardPagamento from '../componentes/CardPagamento.jsx';
import EscolherCor from '../componentes/EscolherCor.jsx';
import { competencia, rotuloFolha } from '@shared/formato.js';

export default function Configuracoes() {
  const { oficina, recarregar } = useOutletContext();
  return (
    <div className="grade-config">
      <div>
        <Identificacao oficina={oficina} recarregar={recarregar} />
        <Folhas oficina={oficina} recarregar={recarregar} />
        <section className="bloco bloco-corpo">
          <h2 className="secao-titulo">Cálculo e bonificações</h2>
          <p className="secao-desc" style={{ marginBottom: 0 }}>
            Hora extra, faltas, sábados, bonificações, prêmios e descontos agora ficam na aba{' '}
            <Link to={`/empresa/${oficina.slug}/regras`}>Regras</Link>.
          </p>
        </section>
      </div>
      <div>
        <Logo oficina={oficina} recarregar={recarregar} />
        <ApagarOficina oficina={oficina} recarregar={recarregar} />
      </div>
    </div>
  );
}

export function useEnvio(recarregar) {
  const [estado, setEstado] = useState({ salvando: false, erro: null, ok: false });
  const enviar = async (fn) => {
    setEstado({ salvando: true, erro: null, ok: false });
    try {
      await fn();
      await recarregar();
      setEstado({ salvando: false, erro: null, ok: true });
    } catch (e) {
      setEstado({ salvando: false, erro: e.message, ok: false });
    }
  };
  return [estado, enviar];
}

export function Mensagem({ estado }) {
  if (estado.erro) return <span className="mini negativo">{estado.erro}</span>;
  if (estado.ok) return <span className="mini">✓ Salvo</span>;
  return <span className="mini" />;
}

function Identificacao({ oficina, recarregar }) {
  const [form, setForm] = useState({ nome: oficina.nome, cor: oficina.cor });
  const [estado, enviar] = useEnvio(recarregar);
  const mudar = (p) => setForm((f) => ({ ...f, ...p }));

  return (
    <section className="bloco bloco-corpo">
      <h2 className="secao-titulo">Empresa</h2>
      <p className="secao-desc">Nome e cor da empresa. Folhas já fechadas continuam com o nome antigo no histórico e nos cards.</p>
      <div className="grade-form">
        <Campo rotulo="Nome da empresa" className="inteiro">
          <input className="campo" value={form.nome} maxLength={60} onChange={(e) => mudar({ nome: e.target.value })} />
        </Campo>
        <Campo rotulo="Cor" className="inteiro">
          <EscolherCor valor={form.cor} aoMudar={(cor) => mudar({ cor })} />
        </Campo>
      </div>
      <div className="acoes-form">
        <Mensagem estado={estado} />
        <button className="btn btn-primario" disabled={estado.salvando} onClick={() => enviar(() => api.put(`/oficinas/${oficina.id}/identificacao`, form))}>
          Salvar nome e cor
        </button>
      </div>
    </section>
  );
}

function ApagarOficina({ oficina, recarregar }) {
  const { oficinas } = useOficinas();
  const navegar = useNavigate();
  const [conteudo, setConteudo] = useState(null); // aberto quando carregado
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const confere = texto.trim().toLowerCase() === oficina.nome.toLowerCase();

  const abrir = async () => {
    setErro(null);
    try {
      setConteudo(await api.get(`/oficinas/${oficina.id}/conteudo`));
    } catch (e) {
      setErro(e.message);
    }
  };
  const apagar = async () => {
    setOcupado(true);
    setErro(null);
    try {
      await api.del(`/oficinas/${oficina.id}?confirmacao=${encodeURIComponent(texto.trim())}`);
      navegar('/', { replace: true });
      await recarregar();
    } catch (e) {
      setErro(e.message);
      setOcupado(false);
    }
  };

  if (oficinas.length <= 1) return null;
  return (
    <section className="bloco bloco-corpo">
      <h2 className="secao-titulo">Apagar empresa</h2>
      {!conteudo ? (
        <>
          <p className="secao-desc">Tira a empresa do sistema junto com tudo o que é dela.</p>
          <button className="btn btn-perigo" onClick={abrir}>Apagar {oficina.nome}…</button>
        </>
      ) : (
        <>
          <div className="aviso aviso-erro" style={{ maxWidth: 'none' }}>
            <strong>Isto apaga para sempre:</strong>
            <ul className="lista-perigo">
              <li>{conteudo.funcionarios} {conteudo.funcionarios === 1 ? 'funcionário' : 'funcionários'} (com PIX e bonificações)</li>
              <li>{conteudo.folhas_mensais} {conteudo.folhas_mensais === 1 ? 'folha do mês' : 'folhas do mês'} do histórico</li>
              <li>{conteudo.vales} {conteudo.vales === 1 ? 'vale' : 'vales'}, o ponto, o logo e as regras desta empresa</li>
            </ul>
            <p>Antes de apagar, o sistema faz uma cópia de segurança. Se foi engano, dá para voltar por ela em Cópias de segurança.</p>
          </div>
          <Campo rotulo={`Para confirmar, digite o nome da empresa: ${oficina.nome}`}>
            <input className="campo" value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" />
          </Campo>
          <div className="acoes-form">
            <button className="btn btn-texto" disabled={ocupado} onClick={() => { setConteudo(null); setTexto(''); }}>Cancelar</button>
            <button className="btn btn-perigo" disabled={!confere || ocupado} onClick={apagar}>Apagar para sempre</button>
          </div>
        </>
      )}
      {erro && <p className="mini negativo" style={{ marginTop: 8 }}>{erro}</p>}
    </section>
  );
}

/** Reduz a imagem escolhida (máx. 800 × 400 px) e devolve em PNG, para não pesar no banco nem na impressão. */
function prepararImagem(arquivo) {
  return new Promise((ok, falha) => {
    if (!arquivo.type.startsWith('image/')) return falha(new Error('Escolha um arquivo de imagem (PNG ou JPG).'));
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      const largura = img.naturalWidth || 600;
      const altura = img.naturalHeight || 300;
      const escala = Math.min(1, 800 / largura, 400 / altura);
      const tela = document.createElement('canvas');
      tela.width = Math.max(1, Math.round(largura * escala));
      tela.height = Math.max(1, Math.round(altura * escala));
      tela.getContext('2d').drawImage(img, 0, 0, tela.width, tela.height);
      URL.revokeObjectURL(url);
      ok(tela.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      falha(new Error('Não foi possível ler esta imagem. Tente salvar o logo como PNG ou JPG.'));
    };
    img.src = url;
  });
}

function Logo({ oficina, recarregar }) {
  const { oficinas } = useOficinas();
  const [previa, setPrevia] = useState(null);
  const [erroArquivo, setErroArquivo] = useState(null);
  const [estado, enviar] = useEnvio(recarregar);
  const seletor = useRef(null);
  const hoje = new Date();
  const atual = previa || oficina.logo_url;

  const escolher = async (e) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setErroArquivo(null);
    try {
      setPrevia(await prepararImagem(arquivo));
    } catch (err) {
      setErroArquivo(err.message);
    }
  };
  const salvar = (todas) => enviar(async () => {
    await api.put(`/oficinas/${oficina.id}/logo`, { imagem: previa, todas });
    setPrevia(null);
  });
  const remover = () => {
    if (window.confirm(`Remover o logo de ${oficina.nome}?`)) enviar(() => api.del(`/oficinas/${oficina.id}/logo`));
  };

  const exemplo = {
    oficina: oficina.nome,
    folha: '1ª Folha',
    competencia: competencia(hoje.getFullYear(), hoje.getMonth() + 1),
    funcionario: { nome: 'EXEMPLO', funcao: 'Auxiliar', pix_tipo: 'CPF', pix_chave: '000.000.000-00', pix_titular: 'Nome do titular', pix_banco: 'Banco' },
    resultado: { proventos: [{ chave: 'salario', rotulo: 'Salário', valor: 1000 }], descontos: [], total_proventos: 1000, total_descontos: 0, liquido: 1000 },
    logo: atual,
  };

  return (
    <section className="bloco bloco-corpo">
      <h2 className="secao-titulo">Logo da empresa</h2>
      <p className="secao-desc">Sai no topo de cada card de pagamento e na lista de conferência. PNG com fundo branco ou transparente fica melhor.</p>
      <div className="logo-config">
        <div className="logo-previa">
          {atual ? <img src={atual} alt="Logo" /> : <span className="mini">Sem logo</span>}
        </div>
        <div className="logo-acoes">
          <input ref={seletor} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif,image/bmp" hidden onChange={escolher} />
          {previa ? (
            <>
              <button className="btn btn-primario" disabled={estado.salvando} onClick={() => salvar(false)}>Salvar nesta empresa</button>
              {oficinas.length > 1 && (
                <button className="btn" disabled={estado.salvando} onClick={() => salvar(true)}>Usar em todas as empresas</button>
              )}
              <button className="btn btn-texto" onClick={() => setPrevia(null)}>Cancelar</button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => seletor.current.click()}>{oficina.logo_url ? 'Trocar logo' : 'Escolher imagem'}</button>
              {oficina.logo_url && <button className="btn btn-texto btn-perigo" onClick={remover}>Remover</button>}
            </>
          )}
        </div>
      </div>
      {erroArquivo && <p className="mini negativo" style={{ marginTop: 8 }}>{erroArquivo}</p>}
      {previa && <p className="mini" style={{ marginTop: 8 }}>Prévia — o logo ainda não foi salvo.</p>}
      <div className="painel-titulo" style={{ marginTop: 16 }}><h3>Como fica no card</h3></div>
      <div className="previa-card">
        <CardPagamento dados={exemplo} />
      </div>
      <div className="acoes-form" style={{ marginTop: 10 }}>
        <Mensagem estado={estado} />
      </div>
    </section>
  );
}

const paraForm = (f) => ({ ...f, apelido: f.apelido || '', dia_fechamento: f.dia_fechamento ?? '' });

function Folhas({ oficina, recarregar }) {
  const [form, setForm] = useState(() => oficina.folhas.map(paraForm));
  const [estado, enviar] = useEnvio(recarregar);
  const mudar = (numero, p) => setForm((l) => l.map((f) => (f.numero === numero ? { ...f, ...p } : f)));

  // Criar e apagar valem na hora; o que estiver sendo digitado nas outras linhas continua na tela.
  const criar = () => enviar(async () => {
    const atualizada = await api.post(`/oficinas/${oficina.id}/folhas`, {});
    const nova = atualizada.folhas.find((f) => !form.some((x) => x.numero === f.numero));
    if (nova) setForm((l) => [...l, paraForm(nova)]);
  });
  const apagar = (f) => {
    const texto = `Apagar a ${rotuloFolha(f)}?\n\nAs folhas dela que já foram fechadas continuam no histórico. `
      + 'Funcionários ativos precisam ser passados para outra folha antes.';
    if (!window.confirm(texto)) return;
    enviar(async () => {
      await api.del(`/oficinas/${oficina.id}/folhas/${f.numero}`);
      setForm((l) => l.filter((x) => x.numero !== f.numero));
    });
  };

  return (
    <section className="bloco bloco-corpo">
      <h2 className="secao-titulo">Folhas (grupos)</h2>
      <p className="secao-desc">
        Cada folha é um grupo de funcionários pago junto. Dê um apelido (ex.: Grupo A) e o dia em que cada uma fecha.
        Crie quantas precisar.
      </p>
      <table className="tabela-bonus">
        <thead>
          <tr><th>Folha</th><th>Apelido</th><th style={{ width: 110 }}>Fecha no dia</th><th style={{ width: 40 }} /></tr>
        </thead>
        <tbody>
          {form.map((f) => (
            <tr key={f.numero}>
              <td style={{ whiteSpace: 'nowrap' }}>
                <strong>{f.numero}ª Folha</strong>
                <div className="mini">{oficina.ativos_por_folha?.[f.numero] ?? 0} ativos</div>
              </td>
              <td><input className="campo" value={f.apelido} placeholder="Opcional" onChange={(e) => mudar(f.numero, { apelido: e.target.value })} /></td>
              <td>
                <input className="campo campo-num" type="number" min={1} max={31} value={f.dia_fechamento} onChange={(e) => mudar(f.numero, { dia_fechamento: e.target.value })} />
              </td>
              <td>
                {form.length > 1 && (
                  <button className="btn-icone" aria-label={`Apagar ${f.numero}ª Folha`} title="Apagar folha" disabled={estado.salvando} onClick={() => apagar(f)}>
                    <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn btn-p" style={{ marginTop: 10 }} disabled={estado.salvando} onClick={criar}>+ Nova folha</button>
      <div className="acoes-form">
        <Mensagem estado={estado} />
        <button
          className="btn btn-primario"
          disabled={estado.salvando}
          onClick={() => enviar(async () => {
            for (const f of form) await api.put(`/oficinas/${oficina.id}/folhas/${f.numero}`, f);
          })}
        >
          Salvar folhas
        </button>
      </div>
    </section>
  );
}

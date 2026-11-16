import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Campo } from '../componentes/Campos.jsx';

const VALIDADES = [
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
  { dias: 365, rotulo: '1 ano' },
  { dias: 0, rotulo: 'Sem prazo (até revogar)' },
];

const dataHora = (s) => (s ? s.slice(0, 16).replace(/^(\d{4})-(\d{2})-(\d{2}) /, '$3/$2/$1 ') : '—');

/** Copia um texto. No endereço http://IP do servidor o navegador não libera a área de transferência moderna. */
async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

function BotaoCopiar({ texto }) {
  const [feito, setFeito] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-p"
      onClick={async () => {
        setFeito(await copiar(texto));
        setTimeout(() => setFeito(false), 2000);
      }}
    >
      {feito ? '✓ Copiado' : 'Copiar'}
    </button>
  );
}

function Trecho({ titulo, texto }) {
  return (
    <div className="ia-trecho">
      <div className="ia-trecho-cab">
        <strong>{titulo}</strong>
        <BotaoCopiar texto={texto} />
      </div>
      <pre>{texto}</pre>
    </div>
  );
}

/** Chave recém-criada: aparece uma vez só, com o jeito de configurar no agente. */
function ChaveNova({ token, aoFechar }) {
  const url = `${window.location.origin}/mcp`;
  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const json = JSON.stringify({
    mcpServers: { 'folha-de-pagamento': { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } },
  }, null, 2);
  const ponte = JSON.stringify({
    mcpServers: {
      'folha-de-pagamento': {
        command: 'npx',
        args: ['-y', 'mcp-remote', url, '--allow-http', '--header', 'Authorization:${AUTH_HEADER}'],
        env: { AUTH_HEADER: `Bearer ${token}` },
      },
    },
  }, null, 2);
  return (
    <section className="bloco bloco-corpo ia-nova">
      <h2 className="secao-titulo">Chave criada</h2>
      <p className="secao-desc">
        <strong>Copie agora: esta chave não aparece de novo.</strong> Quem tiver a chave consegue usar o sistema pelo assistente,
        então trate como uma senha: não mande por e-mail ou grupo de mensagens, e não deixe salva em arquivo aberto.
      </p>
      <Trecho titulo="Chave" texto={token} />
      <Trecho titulo="Endereço do servidor MCP" texto={url} />
      {local && (
        <p className="mini negativo">
          Você abriu o sistema por "localhost". Se o assistente roda em outro computador, troque "localhost" pelo endereço do servidor
          (o mesmo que os outros computadores usam para abrir o sistema).
        </p>
      )}
      <details className="ia-detalhes">
        <summary>Como configurar no agente de IA</summary>
        <p className="mini">Claude Code (no computador onde o agente roda):</p>
        <Trecho titulo="Comando" texto={`claude mcp add --transport http folha-de-pagamento ${url} --header "Authorization: Bearer ${token}"`} />
        <p className="mini">Aplicativos que aceitam servidor MCP por endereço (HTTP), no arquivo de configuração de MCP do aplicativo:</p>
        <Trecho titulo="Configuração" texto={json} />
        <p className="mini">Aplicativos que só aceitam servidor MCP local (ex.: Claude Desktop), usando a ponte mcp-remote (precisa do Node.js):</p>
        <Trecho titulo="Configuração com ponte" texto={ponte} />
      </details>
      <div className="copias-botoes">
        <button type="button" className="btn btn-primario" onClick={aoFechar}>Já copiei</button>
      </div>
    </section>
  );
}

export default function AssistenteIA() {
  const [dados, setDados] = useState(null);
  const [form, setForm] = useState({ nome: '', permissao: 'leitura', validade_dias: 90, ver_pix: false });
  const [nova, setNova] = useState(null);
  const [estado, setEstado] = useState({ ocupado: false, erro: null });

  const carregar = () => api.get('/assistente').then(setDados).catch((e) => setEstado({ ocupado: false, erro: e.message }));
  useEffect(() => {
    carregar();
  }, []);

  const criar = async () => {
    setEstado({ ocupado: true, erro: null });
    try {
      const r = await api.post('/assistente/chaves', form);
      setNova(r.token);
      setForm({ nome: '', permissao: 'leitura', validade_dias: 90, ver_pix: false });
      await carregar();
      setEstado({ ocupado: false, erro: null });
    } catch (e) {
      setEstado({ ocupado: false, erro: e.message });
    }
  };

  const revogar = async (chave) => {
    if (!window.confirm(`Revogar a chave "${chave.nome}"? O assistente que usa esta chave para de funcionar na hora.`)) return;
    try {
      await api.post(`/assistente/chaves/${chave.id}/revogar`);
      await carregar();
    } catch (e) {
      setEstado({ ocupado: false, erro: e.message });
    }
  };

  if (!dados) return estado.erro ? <p className="negativo">{estado.erro}</p> : <p className="carregando">Carregando…</p>;
  const nomeFerramenta = Object.fromEntries(dados.ferramentas.map((f) => [f.nome, f.titulo]));

  return (
    <>
      <div className="cab-pagina">
        <div>
          <h1>Assistente de IA</h1>
          <p>
            Deixe um agente de IA da empresa consultar e lançar na folha (protocolo MCP). Cada agente usa uma chave própria,
            que pode ser revogada a qualquer momento, e tudo o que ele faz fica registrado aqui.
          </p>
        </div>
      </div>

      {estado.erro && <p className="copias-mensagem negativo" role="alert">{estado.erro}</p>}
      {nova && <ChaveNova token={nova} aoFechar={() => setNova(null)} />}

      <div className="copias-grade">
        <section className="bloco bloco-corpo">
          <h2 className="secao-titulo">Nova chave</h2>
          <p className="secao-desc">Crie uma chave para cada agente ou pessoa, para saber quem fez o quê e poder revogar só uma.</p>
          <Campo rotulo="Nome da chave" dica='Ex.: "Assistente do RH" ou "Claude da Maria"'>
            <input className="campo" value={form.nome} maxLength={60} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </Campo>
          <Campo rotulo="O que o assistente pode fazer">
            <select className="campo" value={form.permissao} onChange={(e) => setForm({ ...form, permissao: e.target.value })}>
              <option value="leitura">Só consultar (não muda nada)</option>
              <option value="lancamentos">Consultar e lançar na folha</option>
            </select>
          </Campo>
          <Campo rotulo="Validade">
            <select className="campo" value={form.validade_dias} onChange={(e) => setForm({ ...form, validade_dias: Number(e.target.value) })}>
              {VALIDADES.map((v) => <option key={v.dias} value={v.dias}>{v.rotulo}</option>)}
            </select>
          </Campo>
          <label className="ia-marcar">
            <input type="checkbox" checked={form.ver_pix} onChange={(e) => setForm({ ...form, ver_pix: e.target.checked })} />
            <span>Pode ver as chaves PIX dos funcionários <small className="mini">(sem marcar, aparecem como "oculto")</small></span>
          </label>
          <div className="copias-botoes">
            <button className="btn btn-primario" disabled={estado.ocupado || !form.nome.trim()} onClick={criar}>Criar chave</button>
          </div>
        </section>

        <section className="bloco bloco-corpo">
          <h2 className="secao-titulo">Segurança</h2>
          <ul className="ia-lista">
            <li>O assistente <strong>nunca</strong> apaga nada, não reabre folha, não muda regras, senha nem cópias de segurança.</li>
            <li><strong>Dados de pagamento (PIX) só são mudados por uma pessoa</strong>, na tela de Funcionários.</li>
            <li>Com "Consultar e lançar" ele pode: abrir e fechar a folha do mês, lançar faltas, horas, comissão e ajustes, passar o ponto para a folha,
              cadastrar e alterar funcionários (sem PIX) e lançar vales.</li>
            <li>Use só dentro da rede da empresa (ou Tailscale). Nunca abra a porta do sistema para a internet.</li>
            <li>O agente vê salários e dados dos funcionários: use um serviço de IA com contrato que proteja esses dados (LGPD).</li>
          </ul>
        </section>
      </div>

      <section className="bloco bloco-corpo ia-secao">
        <h2 className="secao-titulo">Chaves</h2>
        {!dados.chaves.length ? <p className="mini">Nenhuma chave ainda. Sem chave, nenhum assistente consegue entrar.</p> : (
          <div className="tabela-moldura">
            <table className="tabela">
              <thead>
                <tr><th>Nome</th><th>Pode</th><th>PIX</th><th>Criada</th><th>Vale até</th><th>Último uso</th><th>Situação</th><th /></tr>
              </thead>
              <tbody>
                {dados.chaves.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.nome}</strong><div className="mini">{c.prefixo}…</div></td>
                    <td>{dados.permissoes[c.permissao]}</td>
                    <td>{c.ver_pix ? 'Vê' : 'Oculto'}</td>
                    <td>{dataHora(c.criada_em)}</td>
                    <td>{c.expira_em ? dataHora(c.expira_em) : 'Sem prazo'}</td>
                    <td>{dataHora(c.ultimo_uso)}</td>
                    <td>
                      {c.revogada_em ? <span className="chip chip-cinza">Revogada</span>
                        : c.ativa ? <span className="chip chip-verde"><span className="bolinha" />Ativa</span>
                          : <span className="chip chip-ambar">Vencida</span>}
                    </td>
                    <td className="dir">
                      {!c.revogada_em && <button className="btn btn-texto btn-perigo" onClick={() => revogar(c)}>Revogar</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bloco bloco-corpo ia-secao">
        <h2 className="secao-titulo">O que o assistente fez</h2>
        <p className="secao-desc">As 100 ações mais recentes.</p>
        {!dados.registro.length ? <p className="mini">Nada ainda.</p> : (
          <div className="tabela-moldura">
            <table className="tabela">
              <thead><tr><th>Quando</th><th>Chave</th><th>Ação</th><th>Detalhes</th><th>Resultado</th></tr></thead>
              <tbody>
                {dados.registro.map((r) => (
                  <tr key={r.id}>
                    <td>{dataHora(r.quando)}</td>
                    <td>{r.chave_nome}</td>
                    <td>{nomeFerramenta[r.ferramenta] || r.ferramenta}</td>
                    <td><code className="ia-args">{r.argumentos}</code></td>
                    <td>{r.ok ? <span className="chip chip-verde">Feito</span> : <span className="chip chip-vermelho" title={r.erro}>Recusado: {r.erro}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

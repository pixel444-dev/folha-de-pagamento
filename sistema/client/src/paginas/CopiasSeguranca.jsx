import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Campo } from '../componentes/Campos.jsx';

const dataHora = (iso) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const tamanho = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.ceil(bytes / 1024)} KB`);

function Resumo({ resumo }) {
  if (!resumo) return null;
  if (resumo.erro) return <p className="mini negativo">{resumo.erro}</p>;
  if (!resumo.ultima) return <p className="mini">Nenhuma cópia ainda.</p>;
  return (
    <p className="mini">
      {resumo.quantidade} {resumo.quantidade === 1 ? 'cópia' : 'cópias'} · a mais recente é de {dataHora(resumo.ultima.em)} ({tamanho(resumo.ultima.bytes)})
    </p>
  );
}

export default function CopiasSeguranca() {
  const [situacao, setSituacao] = useState(null);
  const [pasta, setPasta] = useState('');
  const [estado, setEstado] = useState({ ocupado: false, erro: null, aviso: null });

  useEffect(() => {
    api.get('/copias')
      .then((s) => {
        setSituacao(s);
        setPasta(s.pastaExtra || '');
      })
      .catch((e) => setEstado({ ocupado: false, erro: e.message, aviso: null }));
  }, []);

  const executar = async (fn, aviso) => {
    setEstado({ ocupado: true, erro: null, aviso: null });
    try {
      const s = await fn();
      setSituacao(s);
      setPasta(s.pastaExtra || '');
      if (s.statusExtra && !s.statusExtra.ok) {
        setEstado({ ocupado: false, erro: 'A cópia foi feita na pasta principal, mas não foi possível gravar na segunda pasta.', aviso: null });
      } else {
        setEstado({ ocupado: false, erro: null, aviso });
      }
    } catch (e) {
      setEstado({ ocupado: false, erro: e.message, aviso: null });
    }
  };

  const salvarPasta = () => executar(() => api.put('/copias/pasta-extra', { pasta }), 'Pasta salva e cópia feita.');
  const removerPasta = () => {
    if (window.confirm('Parar de copiar para a segunda pasta? As cópias que já estão lá não são apagadas.')) {
      executar(() => api.put('/copias/pasta-extra', { pasta: '' }), 'A segunda pasta não será mais usada.');
    }
  };
  const copiarAgora = () => executar(() => api.post('/copias/agora'), 'Cópia feita agora.');

  if (!situacao) {
    return estado.erro ? <p className="negativo">{estado.erro}</p> : <p className="carregando">Carregando…</p>;
  }
  const status = situacao.statusExtra;
  const mudou = pasta.trim() !== (situacao.pastaExtra || '');

  return (
    <>
      <div className="cab-pagina">
        <div>
          <h1>Cópias de segurança</h1>
          <p>O sistema copia o banco uma vez por dia e sempre que uma folha é fechada, guardando as 60 mais recentes em cada pasta.</p>
        </div>
        <div className="copias-acoes">
          <button className="btn btn-primario" disabled={estado.ocupado} onClick={copiarAgora}>Fazer cópia agora</button>
          <a className="btn" href="/api/backup" download>Baixar cópia</a>
        </div>
      </div>

      {(estado.erro || estado.aviso) && (
        <p className={`copias-mensagem ${estado.erro ? 'negativo' : ''}`} role="status">{estado.erro || `✓ ${estado.aviso}`}</p>
      )}

      <div className="copias-grade">
        <section className="bloco bloco-corpo">
          <h2 className="secao-titulo">Pasta principal</h2>
          <p className="secao-desc">Fica junto com o sistema, no mesmo computador.</p>
          <code className="copias-caminho">{situacao.pastaPrincipal}</code>
          <Resumo resumo={situacao.principal} />
        </section>

        <section className="bloco bloco-corpo">
          <h2 className="secao-titulo">Segunda pasta</h2>
          <p className="secao-desc">
            Cada cópia também é gravada aqui. Use outro disco, um HD externo ou uma pasta sincronizada com a nuvem, para não perder tudo se o disco
            principal estragar. O caminho é do computador onde o sistema está instalado (o servidor).
          </p>
          <Campo rotulo="Caminho da pasta" dica="Exemplo: D:\Backups\Folha">
            <input
              className="campo"
              value={pasta}
              placeholder="Nenhuma: as cópias ficam só na pasta principal"
              spellCheck={false}
              onChange={(e) => setPasta(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && mudou && pasta.trim() && salvarPasta()}
            />
          </Campo>
          <div className="copias-botoes">
            <button className="btn btn-primario" disabled={estado.ocupado || !mudou || !pasta.trim()} onClick={salvarPasta}>Salvar pasta</button>
            {situacao.pastaExtra && (
              <button className="btn btn-texto btn-perigo" disabled={estado.ocupado} onClick={removerPasta}>Parar de usar</button>
            )}
          </div>
          {situacao.pastaExtra && (
            <div className="copias-status">
              {status && (status.ok ? (
                <span className="chip chip-verde"><span className="bolinha" />Última cópia gravada em {dataHora(status.quando)}</span>
              ) : (
                <span className="chip chip-vermelho"><span className="bolinha" />Falhou em {dataHora(status.quando)}: {status.erro}</span>
              ))}
              {status && !status.ok ? <p className="mini">O sistema tenta de novo a cada hora.</p> : <Resumo resumo={situacao.extra} />}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

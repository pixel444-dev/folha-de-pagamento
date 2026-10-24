import { useState } from 'react';
import { api } from '../api.js';

export default function Entrar({ aoEntrar }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await api.post('/entrar', { senha });
      await aoEntrar();
    } catch (falha) {
      setErro(falha.message);
      setSenha('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="tela-cheia">
      <form className="entrar" onSubmit={entrar}>
        <span className="marca-icone" aria-hidden="true">
          <svg viewBox="0 0 32 32"><path d="M9 9h14M9 15h14M9 21h8" /></svg>
        </span>
        <h1>Folha de Pagamento</h1>
        <label className="grupo-campo">
          <span className="rotulo">Senha</span>
          <input
            type="password"
            className="campo"
            autoComplete="current-password"
            autoFocus
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </label>
        {erro && <p className="entrar-erro" role="alert">{erro}</p>}
        <button className="btn btn-primario btn-g" disabled={enviando || !senha}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

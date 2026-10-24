import { useEffect, useState } from 'react';
import { fmtHorasCampo, parseHoras, parseNum } from '@shared/formato.js';

const mostrarNumero = (v) => (v ? String(v).replace('.', ',') : '');
const mostrarMoeda = (v) => (v ? Number(v).toFixed(2).replace('.', ',') : '');

/**
 * Campo numérico que aceita vírgula ("1,5").
 * tipo: 'numero' | 'moeda' | 'horas' (aceita "1:30", "1h30", "45min")
 */
export function CampoNumero({ valor, aoMudar, tipo = 'numero', className = '', ...resto }) {
  const formatar = tipo === 'horas' ? fmtHorasCampo : tipo === 'moeda' ? mostrarMoeda : mostrarNumero;
  const ler = tipo === 'horas' ? parseHoras : parseNum;
  const [texto, setTexto] = useState(() => formatar(valor));
  const [focado, setFocado] = useState(false);
  const invalido = ler(texto) === null;

  useEffect(() => {
    if (!focado) setTexto(formatar(valor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, focado]);

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={`campo campo-num ${invalido ? 'invalido' : ''} ${className}`}
      value={texto}
      onFocus={(e) => {
        setFocado(true);
        e.target.select();
      }}
      onChange={(e) => {
        setTexto(e.target.value);
        const n = ler(e.target.value);
        if (n !== null && n !== valor) aoMudar(n);
      }}
      onBlur={() => setFocado(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      {...resto}
    />
  );
}

/** Rótulo + campo, para formulários. */
export function Campo({ rotulo, dica, children, className = '' }) {
  return (
    <label className={`grupo-campo ${className}`}>
      <span className="rotulo">{rotulo}</span>
      {children}
      {dica && <span className="dica">{dica}</span>}
    </label>
  );
}

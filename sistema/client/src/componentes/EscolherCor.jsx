export const CORES_OFICINA = ['#3d7a4f', '#2a6f97', '#9a4a2c', '#6b4c9a', '#b07d1a', '#3a7d7c', '#a33b5c', '#55606e'];

/** Bolinhas de cor para escolher a cor da empresa (aparece no menu, nos títulos e nos botões). */
export default function EscolherCor({ valor, aoMudar }) {
  return (
    <div className="escolher-cor">
      {CORES_OFICINA.map((c) => (
        <button
          key={c}
          type="button"
          className={c === valor ? 'ativa' : ''}
          style={{ background: c }}
          aria-label={`Cor ${c}`}
          onClick={() => aoMudar(c)}
        />
      ))}
      <input type="color" value={valor} onChange={(e) => aoMudar(e.target.value)} aria-label="Outra cor" title="Outra cor" />
    </div>
  );
}

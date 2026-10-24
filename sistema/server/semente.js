// Dados iniciais, usados só quando o banco está vazio (instalação nova): uma empresa genérica,
// igual a criar uma "Nova empresa" pelo sistema (regras padrão e uma folha, sem funcionários).
// O nome, a cor e as regras se ajustam em Configurações; depois disso, tudo é mantido pelo próprio sistema.

export function semear(db) {
  const oficinaId = Number(db.prepare('INSERT INTO oficinas (slug, nome, cor) VALUES (?, ?, ?)')
    .run('minha-empresa', 'Minha Empresa', '#3d7a4f').lastInsertRowid);
  db.prepare('INSERT INTO folhas (oficina_id, numero) VALUES (?, 1)').run(oficinaId);
}

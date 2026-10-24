// Banco de dados SQLite (um único arquivo em sistema/dados/folha.db).

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { semear } from './semente.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PASTA_DADOS = process.env.FOLHA_DADOS || path.join(RAIZ, 'dados');
export const PASTA_BACKUPS = path.join(PASTA_DADOS, 'backups');
fs.mkdirSync(PASTA_BACKUPS, { recursive: true });

export const db = new DatabaseSync(path.join(PASTA_DADOS, 'folha.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS oficinas (
  id                INTEGER PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,
  nome              TEXT NOT NULL,
  cor               TEXT NOT NULL DEFAULT '#555555',
  valor_hora_extra  REAL NOT NULL DEFAULT 7,
  divisor_dias      REAL NOT NULL DEFAULT 22,
  arredondar_dia    INTEGER NOT NULL DEFAULT 1,
  horas_por_dia     REAL NOT NULL DEFAULT 8,
  sabado_modo       TEXT NOT NULL DEFAULT 'diaria' CHECK (sabado_modo IN ('diaria', 'fixo')),
  sabado_valor      REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS folhas (
  oficina_id      INTEGER NOT NULL REFERENCES oficinas(id),
  numero          INTEGER NOT NULL CHECK (numero >= 1),
  apelido         TEXT,
  dia_fechamento  INTEGER,
  PRIMARY KEY (oficina_id, numero)
);

CREATE TABLE IF NOT EXISTS bonificacoes (
  id          INTEGER PRIMARY KEY,
  oficina_id  INTEGER NOT NULL REFERENCES oficinas(id),
  nome        TEXT NOT NULL,
  valor       REAL NOT NULL DEFAULT 0,
  regra       TEXT NOT NULL CHECK (regra IN ('zero_falta', 'atribuida')),
  ativo       INTEGER NOT NULL DEFAULT 1,
  ordem       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS funcionarios (
  id             INTEGER PRIMARY KEY,
  oficina_id     INTEGER NOT NULL REFERENCES oficinas(id),
  folha_numero   INTEGER NOT NULL DEFAULT 1 CHECK (folha_numero >= 1),
  nome           TEXT NOT NULL,
  nome_completo  TEXT,
  funcao         TEXT,
  salario        REAL NOT NULL DEFAULT 0,
  comissionado   INTEGER NOT NULL DEFAULT 0,
  pix_tipo       TEXT,
  pix_chave      TEXT,
  pix_titular    TEXT,
  pix_banco      TEXT,
  admissao       TEXT,
  observacoes    TEXT,
  ativo          INTEGER NOT NULL DEFAULT 1,
  criado_em      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS funcionario_bonificacoes (
  funcionario_id  INTEGER NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  bonificacao_id  INTEGER NOT NULL REFERENCES bonificacoes(id) ON DELETE CASCADE,
  valor           REAL,
  PRIMARY KEY (funcionario_id, bonificacao_id)
);

CREATE TABLE IF NOT EXISTS parcelamentos (
  id              INTEGER PRIMARY KEY,
  funcionario_id  INTEGER NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL DEFAULT 'vale' CHECK (tipo IN ('vale', 'compra', 'outro')),
  descricao       TEXT,
  valor_parcela   REAL NOT NULL,
  num_parcelas    INTEGER NOT NULL,
  inicio          TEXT NOT NULL,
  criado_em       TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  valor_total     REAL,
  data            TEXT
);

CREATE TABLE IF NOT EXISTS folhas_mensais (
  id            INTEGER PRIMARY KEY,
  oficina_id    INTEGER NOT NULL REFERENCES oficinas(id),
  folha_numero  INTEGER NOT NULL,
  ano           INTEGER NOT NULL,
  mes           INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  status        TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'fechada')),
  fechada_em    TEXT,
  totais        TEXT,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (oficina_id, folha_numero, ano, mes)
);

CREATE TABLE IF NOT EXISTS lancamentos (
  id               INTEGER PRIMARY KEY,
  folha_mensal_id  INTEGER NOT NULL REFERENCES folhas_mensais(id) ON DELETE CASCADE,
  funcionario_id   INTEGER NOT NULL REFERENCES funcionarios(id),
  faltas           REAL NOT NULL DEFAULT 0,
  sabados          REAL NOT NULL DEFAULT 0,
  horas_extras     REAL NOT NULL DEFAULT 0,
  horas_atraso     REAL NOT NULL DEFAULT 0,
  comissao         REAL NOT NULL DEFAULT 0,
  zero_falta       TEXT CHECK (zero_falta IN ('sim', 'nao')),
  acrescimos       TEXT NOT NULL DEFAULT '[]',
  descontos        TEXT NOT NULL DEFAULT '[]',
  pular_parcelas   INTEGER NOT NULL DEFAULT 0,
  observacao       TEXT,
  snapshot         TEXT,
  UNIQUE (folha_mensal_id, funcionario_id)
);

CREATE TABLE IF NOT EXISTS logos (
  oficina_id  INTEGER PRIMARY KEY REFERENCES oficinas(id),
  tipo        TEXT NOT NULL,
  dados       BLOB NOT NULL,
  versao      INTEGER NOT NULL
);

-- Quanto de cada vale foi descontado em cada folha fechada (gravado ao fechar, apagado ao reabrir).
CREATE TABLE IF NOT EXISTS descontos_vales (
  parcelamento_id  INTEGER NOT NULL REFERENCES parcelamentos(id) ON DELETE CASCADE,
  folha_mensal_id  INTEGER NOT NULL REFERENCES folhas_mensais(id) ON DELETE CASCADE,
  valor            REAL NOT NULL,
  PRIMARY KEY (parcelamento_id, folha_mensal_id)
);

CREATE INDEX IF NOT EXISTS idx_func_oficina ON funcionarios (oficina_id, folha_numero);
CREATE INDEX IF NOT EXISTS idx_lanc_func ON lancamentos (funcionario_id);
`);

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ---- atualizações de bancos criados por versões anteriores

const colunas = (tabela) => db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);
if (!colunas('parcelamentos').includes('valor_total')) {
  db.exec('ALTER TABLE parcelamentos ADD COLUMN valor_total REAL');
  db.exec('UPDATE parcelamentos SET valor_total = valor_parcela * num_parcelas');
}
if (!colunas('parcelamentos').includes('data')) db.exec('ALTER TABLE parcelamentos ADD COLUMN data TEXT');

if (db.prepare('PRAGMA user_version').get().user_version < 1) {
  // Registra os descontos de vales das folhas que já estavam fechadas.
  tx(() => {
    const existe = db.prepare('SELECT 1 FROM parcelamentos WHERE id = ?');
    const inserir = db.prepare('INSERT OR REPLACE INTO descontos_vales (parcelamento_id, folha_mensal_id, valor) VALUES (?, ?, ?)');
    const fechados = db.prepare(`SELECT l.folha_mensal_id, l.snapshot FROM lancamentos l
      JOIN folhas_mensais fm ON fm.id = l.folha_mensal_id WHERE fm.status = 'fechada' AND l.snapshot IS NOT NULL`).all();
    for (const { folha_mensal_id: fmId, snapshot } of fechados) {
      for (const d of JSON.parse(snapshot).resultado?.descontos || []) {
        const m = /^parcela:(\d+)$/.exec(d.chave || '');
        if (m && existe.get(Number(m[1]))) inserir.run(Number(m[1]), fmId, d.valor);
      }
    }
    db.exec('PRAGMA user_version = 1');
  });
}

// Relógio de ponto (arquivo AFD): cada relógio pertence a uma oficina; as batidas ficam guardadas
// e o funcionário é ligado à pessoa do relógio pelo PIS/CPF (ponto_codigo).
db.exec(`
CREATE TABLE IF NOT EXISTS relogios (
  id                INTEGER PRIMARY KEY,
  numero_fabricacao TEXT NOT NULL UNIQUE,
  oficina_id        INTEGER NOT NULL REFERENCES oficinas(id),
  empresa           TEXT,
  gerado_em         TEXT,
  importado_em      TEXT
);

CREATE TABLE IF NOT EXISTS ponto_pessoas (
  codigo    TEXT PRIMARY KEY,
  nome      TEXT NOT NULL,
  excluido  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS batidas (
  relogio_id  INTEGER NOT NULL REFERENCES relogios(id),
  nsr         INTEGER NOT NULL,
  codigo      TEXT NOT NULL,
  data        TEXT NOT NULL,
  hora        TEXT NOT NULL,
  PRIMARY KEY (relogio_id, nsr)
);

CREATE INDEX IF NOT EXISTS idx_batidas_pessoa ON batidas (relogio_id, codigo, data);
CREATE INDEX IF NOT EXISTS idx_batidas_data ON batidas (relogio_id, data);
`);
if (!colunas('funcionarios').includes('ponto_codigo')) db.exec('ALTER TABLE funcionarios ADD COLUMN ponto_codigo TEXT');
// Horário próprio do funcionário (vazio = horário da oficina).
if (!colunas('funcionarios').includes('ponto_horario')) db.exec('ALTER TABLE funcionarios ADD COLUMN ponto_horario TEXT');
if (!colunas('oficinas').includes('ponto_horario')) {
  db.exec("ALTER TABLE oficinas ADD COLUMN ponto_horario TEXT NOT NULL DEFAULT '07:00-11:00 12:10-17:00'");
}

// Folhas (grupos) à vontade: os bancos antigos só aceitavam as folhas 1, 2 e 3.
// O SQLite não muda uma regra CHECK, então a tabela é recriada com os mesmos dados (o código antigo continua funcionando com ela).
function liberarNumeroDaFolha(tabela, regraAntiga, regraNova) {
  const sql = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?").get(tabela)?.sql;
  if (!sql || !sql.includes(regraAntiga)) return;
  const indices = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL").all(tabela);
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    tx(() => {
      db.exec(sql.replace(regraAntiga, regraNova).replace(/^CREATE TABLE "?\w+"?/, `CREATE TABLE ${tabela}_novo`));
      db.exec(`INSERT INTO ${tabela}_novo SELECT * FROM ${tabela}`);
      db.exec(`DROP TABLE ${tabela}`);
      db.exec(`ALTER TABLE ${tabela}_novo RENAME TO ${tabela}`);
      for (const i of indices) db.exec(i.sql);
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error(`Falha ao atualizar a tabela ${tabela}.`);
    });
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}
liberarNumeroDaFolha('folhas', 'CHECK (numero BETWEEN 1 AND 3)', 'CHECK (numero >= 1)');
liberarNumeroDaFolha('funcionarios', 'CHECK (folha_numero BETWEEN 1 AND 3)', 'CHECK (folha_numero >= 1)');
// Folha apagada fica guardada (excluida = 1) para o histórico continuar mostrando o nome dela.
if (!colunas('folhas').includes('excluida')) db.exec('ALTER TABLE folhas ADD COLUMN excluida INTEGER NOT NULL DEFAULT 0');

// Regras de pagamento montadas pela empresa (shared/regras.js): as bonificações ganham tipo (soma ou desconta)
// e uma definição (quem, quando, quanto). Sem definição, valem as regras antigas ("zero_falta" / "atribuida"),
// e a coluna "regra" continua gravada para o código anterior entender o banco se o atualizador voltar a versão.
if (!colunas('bonificacoes').includes('tipo')) {
  db.exec("ALTER TABLE bonificacoes ADD COLUMN tipo TEXT NOT NULL DEFAULT 'provento' CHECK (tipo IN ('provento', 'desconto'))");
}
if (!colunas('bonificacoes').includes('definicao')) db.exec('ALTER TABLE bonificacoes ADD COLUMN definicao TEXT');
// Folhas em que a regra vale: NULL = todas (também as criadas depois); senão, lista JSON com os números das folhas.
// As regras de antes continuam valendo em todas (o código anterior ignora a coluna e também aplica em todas).
if (!colunas('bonificacoes').includes('folhas')) db.exec('ALTER TABLE bonificacoes ADD COLUMN folhas TEXT');
// Campos que a empresa cria para lançar na folha do mês (ex.: "Peças produzidas"); o valor fica em lancamentos.campos.
// AUTOINCREMENT: o número de um campo apagado nunca volta, senão um campo novo herdaria os valores dele nas folhas.
// (Bancos de teste criaram a tabela sem ele por uns dias; vazia, ela é refeita e os valores que sobraram de campos apagados, limpos.)
const sqlCampos = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'campos_personalizados'").get()?.sql;
if (sqlCampos && !sqlCampos.includes('AUTOINCREMENT') && !db.prepare('SELECT 1 FROM campos_personalizados LIMIT 1').get()) {
  tx(() => {
    db.exec('DROP TABLE campos_personalizados');
    db.exec("UPDATE lancamentos SET campos = '{}' WHERE campos <> '{}'");
  });
}
db.exec(`
CREATE TABLE IF NOT EXISTS campos_personalizados (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  oficina_id  INTEGER NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('numero', 'horas', 'moeda', 'sim_nao')),
  ordem       INTEGER NOT NULL DEFAULT 0,
  escopo      TEXT NOT NULL DEFAULT 'mes' CHECK (escopo IN ('mes', 'cadastro'))
);
`);
// escopo: 'mes' = lançado todo mês na folha (lancamentos.campos); 'cadastro' = fica no funcionário (funcionarios.campos).
if (!colunas('campos_personalizados').includes('escopo')) {
  db.exec("ALTER TABLE campos_personalizados ADD COLUMN escopo TEXT NOT NULL DEFAULT 'mes' CHECK (escopo IN ('mes', 'cadastro'))");
}
if (!colunas('funcionarios').includes('campos')) db.exec("ALTER TABLE funcionarios ADD COLUMN campos TEXT NOT NULL DEFAULT '{}'");
if (!colunas('lancamentos').includes('campos')) db.exec("ALTER TABLE lancamentos ADD COLUMN campos TEXT NOT NULL DEFAULT '{}'");
// Ajustes manuais das regras com condição nesta folha: { [regraId]: 'sim' | 'nao' | null }.
if (!colunas('lancamentos').includes('regras_manuais')) db.exec("ALTER TABLE lancamentos ADD COLUMN regras_manuais TEXT NOT NULL DEFAULT '{}'");
// Nome da unidade do divisor do salário ("Dividir o salário por 22 dias"), que a empresa pode trocar.
if (!colunas('oficinas').includes('divisor_nome')) db.exec("ALTER TABLE oficinas ADD COLUMN divisor_nome TEXT NOT NULL DEFAULT 'dias'");

if (db.prepare('SELECT COUNT(*) AS n FROM oficinas').get().n === 0) {
  tx(() => semear(db));
}

// ---- configurações gerais (chave → valor)

db.exec('CREATE TABLE IF NOT EXISTS configuracoes (chave TEXT PRIMARY KEY, valor TEXT)');

export const lerConfig = (chave) => db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(chave)?.valor ?? null;

export function gravarConfig(chave, valor) {
  if (valor == null) db.prepare('DELETE FROM configuracoes WHERE chave = ?').run(chave);
  else db.prepare('INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)').run(chave, String(valor));
}

// ---- cópias de segurança

const MANTER_COPIAS = 60;
const ARQUIVO_COPIA = /^folha-\d{4}-\d{2}-\d{2}\.db$/;

/** Gera uma cópia consistente do banco no caminho indicado. */
export function copiarBanco(destino) {
  if (fs.existsSync(destino)) fs.rmSync(destino);
  db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
}

/** Cópias da pasta, da mais antiga para a mais nova. */
export const copiasNaPasta = (pasta) => fs.readdirSync(pasta).filter((f) => ARQUIVO_COPIA.test(f)).sort();

function apagarAntigas(pasta) {
  for (const f of copiasNaPasta(pasta).slice(0, -MANTER_COPIAS)) fs.rmSync(path.join(pasta, f));
}

/** Traduz os erros mais comuns de pasta/disco para quem usa o sistema. */
export function explicarErroPasta(e) {
  if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return 'A pasta não foi encontrada. O disco ou a unidade está conectado?';
  if (e.code === 'EACCES' || e.code === 'EPERM') return 'Sem permissão para gravar nesta pasta.';
  if (e.code === 'ENOSPC') return 'O disco da pasta está cheio.';
  if (e.code === 'EBUSY') return 'O arquivo está sendo usado por outro programa.';
  return e.message;
}

/**
 * Copia o backup do dia para a segunda pasta escolhida em Cópias de segurança (se houver).
 * Grava o resultado em configuracoes.backup_extra_status para aparecer na tela.
 */
function copiarParaPastaExtra(arquivo, forcar) {
  const pasta = lerConfig('backup_pasta_extra');
  if (!pasta) return;
  const alvo = path.join(pasta, path.basename(arquivo));
  if (!forcar && fs.existsSync(alvo)) return;
  let status;
  try {
    fs.mkdirSync(pasta, { recursive: true });
    fs.copyFileSync(arquivo, `${alvo}.tmp`); // copia com outro nome e só renomeia no fim: nunca fica um arquivo pela metade
    fs.renameSync(`${alvo}.tmp`, alvo);
    apagarAntigas(pasta);
    status = { quando: new Date().toISOString(), ok: true };
  } catch (e) {
    console.error(`Falha ao copiar o backup para ${pasta}:`, e.message);
    status = { quando: new Date().toISOString(), ok: false, erro: explicarErroPasta(e) };
  }
  gravarConfig('backup_extra_status', JSON.stringify(status));
}

/** Cópia de segurança diária em dados/backups e na segunda pasta, se houver (guarda as 60 mais recentes em cada). */
export function backupAutomatico({ forcar = false } = {}) {
  const hoje = new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD no horário local
  const destino = path.join(PASTA_BACKUPS, `folha-${hoje}.db`);
  if (forcar || !fs.existsSync(destino)) copiarBanco(destino);
  apagarAntigas(PASTA_BACKUPS);
  copiarParaPastaExtra(destino, forcar);
  return destino;
}

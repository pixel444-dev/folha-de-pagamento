// Senha de acesso e sessões (cookie). Usado quando o sistema roda no servidor da empresa.

import crypto from 'node:crypto';
import { db } from './db.js';

const COOKIE = 'folha_sessao';
const DURACAO_SESSAO_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const MAX_TENTATIVAS = 5;
const BLOQUEIO_MS = 5 * 60 * 1000;

db.exec(`
CREATE TABLE IF NOT EXISTS acesso (
  id     INTEGER PRIMARY KEY CHECK (id = 1),
  sal    TEXT NOT NULL,
  hash   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessoes (
  token_hash  TEXT PRIMARY KEY,
  expira_em   INTEGER NOT NULL
);
`);

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const derivar = (senha, sal) => crypto.scryptSync(senha, sal, 64).toString('hex');

export const temSenha = () => Boolean(db.prepare('SELECT 1 FROM acesso WHERE id = 1').get());

/** Grava uma nova senha e derruba todas as sessões abertas. */
export function definirSenha(senha) {
  const sal = crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT OR REPLACE INTO acesso (id, sal, hash) VALUES (1, ?, ?)').run(sal, derivar(senha, sal));
  db.exec('DELETE FROM sessoes');
}

function senhaConfere(senha) {
  const linha = db.prepare('SELECT sal, hash FROM acesso WHERE id = 1').get();
  if (!linha) return false;
  const esperado = Buffer.from(linha.hash, 'hex');
  const recebido = Buffer.from(derivar(String(senha), linha.sal), 'hex');
  return crypto.timingSafeEqual(esperado, recebido);
}

function lerCookie(req) {
  for (const parte of (req.headers.cookie || '').split(';')) {
    const [nome, ...valor] = parte.trim().split('=');
    if (nome === COOKIE) return decodeURIComponent(valor.join('='));
  }
  return null;
}

function sessaoValida(req) {
  const token = lerCookie(req);
  if (!token) return false;
  const linha = db.prepare('SELECT expira_em FROM sessoes WHERE token_hash = ?').get(hashToken(token));
  return Boolean(linha && linha.expira_em > Date.now());
}

const cookie = (req, valor, maxAgeS) =>
  `${COOKIE}=${valor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeS}${req.secure ? '; Secure' : ''}`;

// Tentativas erradas por endereço, para dificultar quem tenta adivinhar a senha.
const tentativas = new Map();

/** Rotas /api/sessao, /api/entrar e /api/sair + bloqueio das demais rotas /api sem login. */
export function instalarAcesso(app) {
  app.get('/api/sessao', (req, res) => {
    const exigeSenha = temSenha();
    res.json({ exigeSenha, logado: !exigeSenha || sessaoValida(req) });
  });

  app.post('/api/entrar', (req, res) => {
    const ip = req.socket.remoteAddress || '';
    const agora = Date.now();
    const t = tentativas.get(ip);
    if (t && t.bloqueadoAte > agora) {
      const minutos = Math.ceil((t.bloqueadoAte - agora) / 60000);
      return res.status(429).json({ erro: `Muitas tentativas erradas. Tente de novo em ${minutos} min.` });
    }
    if (!senhaConfere(req.body?.senha || '')) {
      const falhas = (t?.falhas || 0) + 1;
      tentativas.set(ip, falhas >= MAX_TENTATIVAS ? { falhas: 0, bloqueadoAte: agora + BLOQUEIO_MS } : { falhas, bloqueadoAte: 0 });
      return res.status(401).json({ erro: 'Senha incorreta.' });
    }
    tentativas.delete(ip);
    const token = crypto.randomBytes(32).toString('base64url');
    db.prepare('DELETE FROM sessoes WHERE expira_em <= ?').run(agora);
    db.prepare('INSERT INTO sessoes (token_hash, expira_em) VALUES (?, ?)').run(hashToken(token), agora + DURACAO_SESSAO_MS);
    res.setHeader('Set-Cookie', cookie(req, token, DURACAO_SESSAO_MS / 1000));
    res.json({ ok: true });
  });

  app.post('/api/sair', (req, res) => {
    const token = lerCookie(req);
    if (token) db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(hashToken(token));
    res.setHeader('Set-Cookie', cookie(req, '', 0));
    res.json({ ok: true });
  });

  app.use('/api', (req, res, next) => {
    if (!temSenha() || sessaoValida(req)) return next();
    res.status(401).json({ erro: 'Entre com a senha para continuar.', exigeLogin: true });
  });
}

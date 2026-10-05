import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { adoptOrphans, get, nowIso, run } from './db.ts';
import { HttpError } from './routes/errors.ts';

const COOKIE = 'vagas_sid';
const SESSION_DAYS = 30;
const MAX_USERS = Number(process.env.MAX_USERS ?? 2);

export interface AuthUser {
  id: number;
  username: string;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [, salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function readCookie(req: Request, name: string) {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function startSession(res: Response, userId: number) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  run('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', token, userId, nowIso(), expires.toISOString());
  res.setHeader('set-cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86_400}`);
}

function userFromRequest(req: Request): AuthUser | null {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  return (
    get<AuthUser>(
      `SELECT u.id, u.username, u.name FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
      token,
      nowIso(),
    ) ?? null
  );
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const user = userFromRequest(req);
  if (!user) return next(new HttpError(401, 'Faça login para continuar.'));
  req.user = user;
  next();
}

/** Id do usuário logado (só usar em rotas protegidas por requireAuth). */
export const uid = (req: Request) => req.user!.id;

const userCount = () => get<{ c: number }>('SELECT COUNT(*) AS c FROM users')!.c;

export const authRouter = Router();

authRouter.get('/status', (req, res) => {
  const count = userCount();
  res.json({ user: userFromRequest(req), canRegister: count < MAX_USERS, hasUsers: count > 0 });
});

authRouter.post('/register', (req, res) => {
  const { username, name, password } = req.body ?? {};
  const cleanUser = String(username ?? '').trim().toLowerCase();
  if (userCount() >= MAX_USERS) throw new HttpError(403, `Limite de ${MAX_USERS} usuários atingido.`);
  if (!/^[a-z0-9._-]{3,30}$/.test(cleanUser)) throw new HttpError(400, 'Usuário: 3 a 30 caracteres (letras, números, ponto, hífen).');
  if (String(password ?? '').length < 6) throw new HttpError(400, 'A senha precisa ter pelo menos 6 caracteres.');
  if (get('SELECT id FROM users WHERE username = ?', cleanUser)) throw new HttpError(409, 'Esse usuário já existe.');
  const first = userCount() === 0;
  const result = run(
    'INSERT INTO users (username, name, password_hash, created_at) VALUES (?, ?, ?, ?)',
    cleanUser,
    String(name ?? '').trim() || cleanUser,
    hashPassword(String(password)),
    nowIso(),
  );
  const id = Number(result.lastInsertRowid);
  if (first) adoptOrphans(id);
  startSession(res, id);
  res.status(201).json({ user: get<AuthUser>('SELECT id, username, name FROM users WHERE id = ?', id) });
});

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body ?? {};
  const row = get<AuthUser & { password_hash: string }>('SELECT * FROM users WHERE username = ?', String(username ?? '').trim().toLowerCase());
  if (!row || !verifyPassword(String(password ?? ''), row.password_hash)) throw new HttpError(401, 'Usuário ou senha incorretos.');
  run('DELETE FROM sessions WHERE expires_at <= ?', nowIso());
  startSession(res, row.id);
  res.json({ user: { id: row.id, username: row.username, name: row.name } });
});

authRouter.post('/logout', (req, res) => {
  const token = readCookie(req, COOKIE);
  if (token) run('DELETE FROM sessions WHERE token = ?', token);
  res.setHeader('set-cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.status(204).end();
});

authRouter.post('/password', requireAuth, (req, res) => {
  const { current, next } = req.body ?? {};
  const row = get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', uid(req))!;
  if (!verifyPassword(String(current ?? ''), row.password_hash)) throw new HttpError(400, 'Senha atual incorreta.');
  if (String(next ?? '').length < 6) throw new HttpError(400, 'A nova senha precisa ter pelo menos 6 caracteres.');
  run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(String(next)), uid(req));
  res.status(204).end();
});

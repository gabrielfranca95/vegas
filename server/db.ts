import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

/**
 * Acesso ao PostgreSQL.
 * - Com DATABASE_URL (produção): conecta no Postgres via pool.
 * - Sem DATABASE_URL (desenvolvimento local): usa PGlite, um Postgres embutido salvo em data/pgdata.
 * As consultas usam "?" como placeholder; a conversão para $1, $2… é feita aqui.
 */

export const DATA_DIR = process.env.VAGAS_DATA_DIR ?? path.resolve(import.meta.dirname, '..', 'data');

interface Driver {
  query(sql: string, params: unknown[]): Promise<{ rows: any[]; rowCount: number }>;
  exec(sql: string): Promise<void>;
}

async function createDriver(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const ssl = /sslmode=(require|verify)/.test(url) || process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined;
    const pool = new pg.Pool({ connectionString: url, ssl, max: 5 });
    return {
      async query(sql, params) {
        const r = await pool.query(sql, params as unknown[]);
        return { rows: r.rows, rowCount: r.rowCount ?? 0 };
      },
      async exec(sql) {
        await pool.query(sql);
      },
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const lite = new PGlite(path.join(DATA_DIR, 'pgdata'));
  return {
    async query(sql, params) {
      const r = await lite.query(sql, params as unknown[]);
      return { rows: r.rows as any[], rowCount: r.affectedRows ?? r.rows.length };
    },
    async exec(sql) {
      await lite.exec(sql);
    },
  };
}

const driver = await createDriver();

/** Converte placeholders "?" em "$n", ignorando "?" dentro de strings entre aspas simples. */
function toPg(sql: string) {
  let n = 0;
  let inString = false;
  let out = '';
  for (const ch of sql) {
    if (ch === "'") inString = !inString;
    out += ch === '?' && !inString ? `$${++n}` : ch;
  }
  return out;
}

export async function all<T = any>(sql: string, ...params: unknown[]): Promise<T[]> {
  return (await driver.query(toPg(sql), params)).rows as T[];
}

export async function get<T = any>(sql: string, ...params: unknown[]): Promise<T | undefined> {
  return (await all<T>(sql, ...params))[0];
}

/** Executa um comando. Em INSERT, devolve o id criado (a consulta deve terminar com RETURNING id). */
export async function run(sql: string, ...params: unknown[]): Promise<{ id: number | null; changes: number }> {
  const r = await driver.query(toPg(sql), params);
  return { id: r.rows[0]?.id ?? null, changes: r.rowCount };
}

await driver.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS companies (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    website      TEXT,
    linkedin_url TEXT,
    notes        TEXT,
    created_at   TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_user_name ON companies (user_id, lower(name));

  CREATE TABLE IF NOT EXISTS jobs (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    company_id  INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    title       TEXT NOT NULL DEFAULT '',
    url         TEXT,
    platform    TEXT NOT NULL DEFAULT 'linkedin',
    status      TEXT NOT NULL DEFAULT 'salvas',
    position    DOUBLE PRECISION NOT NULL DEFAULT 0,
    location    TEXT,
    work_model  TEXT,
    salary      TEXT,
    description TEXT,
    notes       TEXT,
    apply_email TEXT,
    applied_at  TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS job_status_history (
    id          SERIAL PRIMARY KEY,
    job_id      INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status   TEXT NOT NULL,
    changed_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS resumes (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    is_official INTEGER NOT NULL DEFAULT 0,
    job_id      INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
    data        TEXT NOT NULL,
    notes       TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    linkedin_url  TEXT,
    role_category TEXT NOT NULL DEFAULT 'recrutador',
    role_title    TEXT,
    company_id    INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    job_id        INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
    platform      TEXT NOT NULL DEFAULT 'linkedin',
    stage         TEXT NOT NULL DEFAULT 'novo',
    notes         TEXT,
    snooze_until  TEXT,
    draft         TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contact_events (
    id          SERIAL PRIMARY KEY,
    contact_id  INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    content     TEXT,
    occurred_at TEXT NOT NULL,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS evs (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_id   INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    job_id       INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
    company_id   INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    kind         TEXT NOT NULL DEFAULT 'flash_report',
    title        TEXT NOT NULL,
    summary      TEXT,
    content      TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'ideia',
    delivered_at TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS job_chats (
    id         SERIAL PRIMARY KEY,
    job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_job_chats_job ON job_chats(job_id, id);

  CREATE INDEX IF NOT EXISTS idx_events_contact ON contact_events(contact_id, occurred_at);
  CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
  CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id);
  CREATE INDEX IF NOT EXISTS idx_resumes_user ON resumes(user_id);
  CREATE INDEX IF NOT EXISTS idx_evs_user ON evs(user_id);
  CREATE INDEX IF NOT EXISTS idx_history_job ON job_status_history(job_id, changed_at);
`);

export const nowIso = () => new Date().toISOString();

/** Retorna o id da empresa do usuário com esse nome (sem diferenciar maiúsculas), criando se não existir. */
export async function findOrCreateCompany(userId: number, name: string | null | undefined): Promise<number | null> {
  const clean = (name ?? '').trim();
  if (!clean) return null;
  const existing = await get<{ id: number }>('SELECT id FROM companies WHERE user_id = ? AND lower(name) = lower(?)', userId, clean);
  if (existing) return existing.id;
  const res = await run('INSERT INTO companies (user_id, name, created_at) VALUES (?, ?, ?) RETURNING id', userId, clean, nowIso());
  return res.id;
}

/** Registra uma mudança de coluna do quadro (base dos indicadores ao longo do tempo). */
export async function recordJobStatus(jobId: number, from: string | null, to: string, at = nowIso()) {
  if (from === to) return;
  await run('INSERT INTO job_status_history (job_id, from_status, to_status, changed_at) VALUES (?, ?, ?, ?)', jobId, from, to, at);
}

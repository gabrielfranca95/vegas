import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = process.env.VAGAS_DATA_DIR ?? path.resolve(import.meta.dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'vagas.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
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
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL COLLATE NOCASE,
    website      TEXT,
    linkedin_url TEXT,
    notes        TEXT,
    created_at   TEXT NOT NULL,
    UNIQUE (user_id, name)
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    company_id  INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    title       TEXT NOT NULL DEFAULT '',
    url         TEXT,
    platform    TEXT NOT NULL DEFAULT 'linkedin',
    status      TEXT NOT NULL DEFAULT 'salvas',
    position    REAL NOT NULL DEFAULT 0,
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
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id      INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status   TEXT NOT NULL,
    changed_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS resumes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
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
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
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
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id  INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    content     TEXT,
    occurred_at TEXT NOT NULL,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS evs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
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
`);

// ---------- Migrações de bancos criados antes do login ----------

function columns(table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

function migrate() {
  for (const table of ['jobs', 'resumes', 'contacts']) {
    if (!columns(table).includes('user_id')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`);
    }
  }
  if (!columns('jobs').includes('apply_email')) db.exec('ALTER TABLE jobs ADD COLUMN apply_email TEXT');

  // A tabela antiga de empresas tinha nome único global; agora é único por usuário.
  if (!columns('companies').includes('user_id')) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      CREATE TABLE companies_new (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name         TEXT NOT NULL COLLATE NOCASE,
        website      TEXT,
        linkedin_url TEXT,
        notes        TEXT,
        created_at   TEXT NOT NULL,
        UNIQUE (user_id, name)
      );
      INSERT INTO companies_new (id, name, website, linkedin_url, notes, created_at)
        SELECT id, name, website, linkedin_url, notes, created_at FROM companies;
      DROP TABLE companies;
      ALTER TABLE companies_new RENAME TO companies;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_events_contact ON contact_events(contact_id, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id);
    CREATE INDEX IF NOT EXISTS idx_companies_user ON companies(user_id);
    CREATE INDEX IF NOT EXISTS idx_resumes_user ON resumes(user_id);
    CREATE INDEX IF NOT EXISTS idx_evs_user ON evs(user_id);
    CREATE INDEX IF NOT EXISTS idx_history_job ON job_status_history(job_id, changed_at);
  `);
}
migrate();

/** Registros sem dono (de antes do login existir) passam a pertencer ao primeiro usuário. */
export function adoptOrphans(userId: number) {
  for (const table of ['companies', 'jobs', 'resumes', 'contacts']) {
    db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`).run(userId);
  }
  const legacy = db.prepare("SELECT value FROM settings WHERE key = 'app'").get() as { value: string } | undefined;
  if (legacy) {
    db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(`app:${userId}`, legacy.value);
    db.prepare("DELETE FROM settings WHERE key = 'app'").run();
  }
}

export const nowIso = () => new Date().toISOString();

type Row = Record<string, unknown>;

export function all<T = Row>(sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...(params as never[])) as T[];
}

export function get<T = Row>(sql: string, ...params: unknown[]): T | undefined {
  return db.prepare(sql).get(...(params as never[])) as T | undefined;
}

export function run(sql: string, ...params: unknown[]) {
  return db.prepare(sql).run(...(params as never[]));
}

/** Retorna o id da empresa do usuário com esse nome (case-insensitive), criando se não existir. */
export function findOrCreateCompany(userId: number, name: string | null | undefined): number | null {
  const clean = (name ?? '').trim();
  if (!clean) return null;
  const existing = get<{ id: number }>('SELECT id FROM companies WHERE user_id = ? AND name = ?', userId, clean);
  if (existing) return existing.id;
  const res = run('INSERT INTO companies (user_id, name, created_at) VALUES (?, ?, ?)', userId, clean, nowIso());
  return Number(res.lastInsertRowid);
}

/** Registra uma mudança de coluna do quadro (base dos indicadores ao longo do tempo). */
export function recordJobStatus(jobId: number, from: string | null, to: string, at = nowIso()) {
  if (from === to) return;
  run('INSERT INTO job_status_history (job_id, from_status, to_status, changed_at) VALUES (?, ?, ?, ?)', jobId, from, to, at);
}

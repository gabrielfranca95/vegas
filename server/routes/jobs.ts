import { Router } from 'express';
import type { MatchAnalysis } from '../../shared/types.ts';
import { completeJson } from '../ai.ts';
import { uid } from '../auth.ts';
import { all, findOrCreateCompany, get, nowIso, recordJobStatus, run } from '../db.ts';
import { buildMatchPrompt } from '../prompts.ts';
import { getJob, listJobs, ownJob, resumeForJob } from '../repo.ts';
import { detectPlatform, scrapeJob } from '../scrape.ts';
import { HttpError } from './errors.ts';

export const jobsRouter = Router();

const FIELDS = ['title', 'url', 'platform', 'status', 'position', 'location', 'work_model', 'salary', 'description', 'notes', 'apply_email', 'applied_at'] as const;

jobsRouter.get('/', (req, res) => {
  res.json(listJobs(uid(req)));
});

jobsRouter.get('/companies', (req, res) => {
  res.json(all('SELECT * FROM companies WHERE user_id = ? ORDER BY name COLLATE NOCASE', uid(req)));
});

jobsRouter.put('/companies/:id', (req, res) => {
  const { website, linkedin_url, notes } = req.body ?? {};
  run(
    'UPDATE companies SET website = COALESCE(?, website), linkedin_url = COALESCE(?, linkedin_url), notes = COALESCE(?, notes) WHERE id = ? AND user_id = ?',
    website ?? null,
    linkedin_url ?? null,
    notes ?? null,
    Number(req.params.id),
    uid(req),
  );
  res.json(get('SELECT * FROM companies WHERE id = ? AND user_id = ?', Number(req.params.id), uid(req)));
});

jobsRouter.post('/scrape', async (req, res) => {
  const url = String(req.body?.url ?? '');
  const scraped = await scrapeJob(url);
  const existing = scraped.url
    ? get<{ id: number }>('SELECT id FROM jobs WHERE user_id = ? AND (url = ? OR url = ?)', uid(req), scraped.url, url)
    : undefined;
  res.json({ ...scraped, existingJobId: existing?.id ?? null });
});

jobsRouter.post('/', (req, res) => {
  const userId = uid(req);
  const b = req.body ?? {};
  const now = nowIso();
  const status = b.status ?? 'salvas';
  const maxPos = get<{ m: number | null }>('SELECT MAX(position) AS m FROM jobs WHERE user_id = ? AND status = ?', userId, status)?.m ?? 0;
  const result = run(
    `INSERT INTO jobs (user_id, company_id, title, url, platform, status, position, location, work_model, salary, description, notes, apply_email, applied_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId,
    findOrCreateCompany(userId, b.company),
    b.title ?? '',
    b.url || null,
    b.platform ?? (b.url ? detectPlatform(b.url) : 'outro'),
    status,
    maxPos + 1,
    b.location || null,
    b.work_model || null,
    b.salary || null,
    b.description || null,
    b.notes || null,
    b.apply_email || null,
    b.applied_at || (status === 'aplicado' ? now : null),
    now,
    now,
  );
  const id = Number(result.lastInsertRowid);
  recordJobStatus(id, null, status, now);
  res.status(201).json(getJob(userId, id));
});

jobsRouter.put('/:id', (req, res) => {
  const userId = uid(req);
  const id = Number(req.params.id);
  const current = ownJob(userId, id);
  if (!current) throw new HttpError(404, 'Vaga não encontrada');
  const b = req.body ?? {};
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const f of FIELDS) {
    if (f in b) {
      sets.push(`${f} = ?`);
      params.push(b[f] === '' ? null : b[f]);
    }
  }
  if ('company' in b) {
    sets.push('company_id = ?');
    params.push(findOrCreateCompany(userId, b.company));
  }
  // Ao mover para "Aplicado" pela primeira vez, registra a data de candidatura.
  if (b.status === 'aplicado' && !current.applied_at && !('applied_at' in b)) {
    sets.push('applied_at = ?');
    params.push(nowIso());
  }
  sets.push('updated_at = ?');
  params.push(nowIso());
  run(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
  if (b.status && b.status !== current.status) recordJobStatus(id, current.status, b.status);
  res.json(getJob(userId, id));
});

/** Reordena uma coluna inteira após um drag-and-drop. */
jobsRouter.post('/reorder', (req, res) => {
  const userId = uid(req);
  const { status, ids } = req.body as { status: string; ids: number[] };
  const now = nowIso();
  ids.forEach((id, idx) => {
    const current = ownJob(userId, id);
    if (!current) return;
    const setApplied = status === 'aplicado' && !current.applied_at;
    run(
      `UPDATE jobs SET status = ?, position = ?, updated_at = CASE WHEN status <> ? THEN ? ELSE updated_at END${setApplied ? ', applied_at = ?' : ''} WHERE id = ?`,
      ...(setApplied ? [status, idx, status, now, now, id] : [status, idx, status, now, id]),
    );
    recordJobStatus(id, current.status, status, now);
  });
  res.json(listJobs(userId));
});

jobsRouter.delete('/:id', (req, res) => {
  run('DELETE FROM jobs WHERE id = ? AND user_id = ?', Number(req.params.id), uid(req));
  res.status(204).end();
});

jobsRouter.post('/:id/match', async (req, res) => {
  const userId = uid(req);
  const job = ownJob(userId, Number(req.params.id));
  if (!job) throw new HttpError(404, 'Vaga não encontrada');
  if (!job.description) throw new HttpError(400, 'A vaga não tem descrição. Busque pelo link ou cole a descrição.');
  const resume = resumeForJob(userId, job.id);
  if (!resume) throw new HttpError(400, 'Cadastre seu currículo oficial primeiro (aba Currículo).');
  const { system, prompt } = buildMatchPrompt(resume, { title: job.title, company: job.company_name, description: job.description });
  res.json(await completeJson<MatchAnalysis>({ userId, system, prompt }));
});

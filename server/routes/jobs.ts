import { Router } from 'express';
import type { MatchAnalysis } from '../../shared/types.ts';
import { completeJson, completeWithModel } from '../ai.ts';
import { uid } from '../auth.ts';
import { all, findOrCreateCompany, get, nowIso, recordJobStatus, run } from '../db.ts';
import { buildApplicationChatPrompt, buildMatchPrompt } from '../prompts.ts';
import { getJob, listJobs, ownJob, resumeForJob } from '../repo.ts';
import { getSettings } from '../settings.ts';
import { fetchSiteText } from '../site.ts';
import { detectPlatform, scrapeJob } from '../scrape.ts';
import { HttpError } from './errors.ts';
import { enqueueTailoring, maybeAutoTailor } from '../tailor.ts';
import { jobUrlKey, normalizeCompany, textSimilarity, titleSimilarity } from '../similarity.ts';
import type { DuplicateCandidate } from '../../shared/types.ts';

export const jobsRouter = Router();

const FIELDS = ['title', 'url', 'platform', 'status', 'position', 'location', 'work_model', 'salary', 'description', 'notes', 'apply_email', 'applied_at'] as const;

jobsRouter.get('/', async (req, res) => {
  res.json(await listJobs(uid(req)));
});

jobsRouter.get('/companies', async (req, res) => {
  res.json(await all('SELECT * FROM companies WHERE user_id = ? ORDER BY lower(name)', uid(req)));
});

jobsRouter.put('/companies/:id', async (req, res) => {
  const { website, linkedin_url, notes } = req.body ?? {};
  await run(
    'UPDATE companies SET website = COALESCE(?, website), linkedin_url = COALESCE(?, linkedin_url), notes = COALESCE(?, notes) WHERE id = ? AND user_id = ?',
    website ?? null,
    linkedin_url ?? null,
    notes ?? null,
    Number(req.params.id),
    uid(req),
  );
  res.json(await get('SELECT * FROM companies WHERE id = ? AND user_id = ?', Number(req.params.id), uid(req)));
});

/**
 * Procura vagas já cadastradas que podem ser a mesma: mesmo link (ou ID da vaga), mesma empresa com
 * título/descrição parecidos, ou descrição quase idêntica em outra empresa (ex.: consultoria republicando).
 */
jobsRouter.post('/check-duplicates', async (req, res) => {
  const userId = uid(req);
  const { url, title, company, description, excludeId } = req.body ?? {};
  const key = jobUrlKey(url);
  const comp = normalizeCompany(String(company ?? ''));
  const desc = String(description ?? '');
  const candidates: DuplicateCandidate[] = [];
  for (const job of await listJobs(userId)) {
    if (excludeId && job.id === Number(excludeId)) continue;
    const reasons: string[] = [];
    let score = 0;
    if (key && jobUrlKey(job.url) === key) {
      score = 1;
      reasons.push('Mesmo link da vaga');
    }
    const t = titleSimilarity(String(title ?? ''), job.title);
    const d = desc.trim() && job.description?.trim() ? textSimilarity(desc, job.description) : null;
    const sameCompany = Boolean(comp) && normalizeCompany(job.company_name ?? '') === comp;
    if (sameCompany) {
      const s = d !== null ? Math.max(t * 0.9, 0.3 * t + 0.7 * d) : t * 0.9;
      if (s >= 0.45 || t >= 0.6) {
        score = Math.max(score, s);
        reasons.push('Mesma empresa', `Título ${Math.round(t * 100)}% parecido`);
        if (d !== null) reasons.push(`Descrição ${Math.round(d * 100)}% parecida`);
      }
    } else if (d !== null && d >= 0.7) {
      score = Math.max(score, d * 0.9);
      reasons.push(`Descrição ${Math.round(d * 100)}% parecida com a de outra empresa (pode ser consultoria republicando)`);
    }
    if (score > 0) candidates.push({ job, score: Math.min(1, score), reasons: [...new Set(reasons)] });
  }
  candidates.sort((a, b) => b.score - a.score);
  res.json(candidates.slice(0, 5));
});

jobsRouter.post('/scrape', async (req, res) => {
  const url = String(req.body?.url ?? '');
  const scraped = await scrapeJob(url);
  const existing = scraped.url
    ? await get<{ id: number }>('SELECT id FROM jobs WHERE user_id = ? AND (url = ? OR url = ?)', uid(req), scraped.url, url)
    : undefined;
  res.json({ ...scraped, existingJobId: existing?.id ?? null });
});

jobsRouter.post('/', async (req, res) => {
  const userId = uid(req);
  const b = req.body ?? {};
  const now = nowIso();
  const status = b.status ?? 'salvas';
  const maxPos = (await get<{ m: number | null }>('SELECT MAX(position) AS m FROM jobs WHERE user_id = ? AND status = ?', userId, status))?.m ?? 0;
  const result = await run(
    `INSERT INTO jobs (user_id, company_id, title, url, platform, status, position, location, work_model, salary, description, notes, apply_email, applied_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    userId,
    await findOrCreateCompany(userId, b.company),
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
  const id = result.id!;
  await recordJobStatus(id, null, status, now);
  await maybeAutoTailor(userId, id);
  res.status(201).json(await getJob(userId, id));
});

jobsRouter.put('/:id', async (req, res) => {
  const userId = uid(req);
  const id = Number(req.params.id);
  const current = await ownJob(userId, id);
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
    params.push(await findOrCreateCompany(userId, b.company));
  }
  // Ao mover para "Aplicado" pela primeira vez, registra a data de candidatura.
  if (b.status === 'aplicado' && !current.applied_at && !('applied_at' in b)) {
    sets.push('applied_at = ?');
    params.push(nowIso());
  }
  sets.push('updated_at = ?');
  params.push(nowIso());
  await run(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
  if (b.status && b.status !== current.status) await recordJobStatus(id, current.status, b.status);
  // Vaga que acabou de ganhar descrição entra na adaptação automática.
  if (!current.description?.trim() && String(b.description ?? '').trim()) await maybeAutoTailor(userId, id);
  res.json(await getJob(userId, id));
});

/** Reordena uma coluna inteira após um drag-and-drop. */
jobsRouter.post('/reorder', async (req, res) => {
  const userId = uid(req);
  const { status, ids } = req.body as { status: string; ids: number[] };
  const now = nowIso();
  for (const [idx, id] of ids.entries()) {
    const current = await ownJob(userId, id);
    if (!current) continue;
    const setApplied = status === 'aplicado' && !current.applied_at;
    await run(
      `UPDATE jobs SET status = ?, position = ?, updated_at = CASE WHEN status <> ? THEN ? ELSE updated_at END${setApplied ? ', applied_at = ?' : ''} WHERE id = ?`,
      ...(setApplied ? [status, idx, status, now, now, id] : [status, idx, status, now, id]),
    );
    await recordJobStatus(id, current.status, status, now);
  }
  res.json(await listJobs(userId));
});

jobsRouter.delete('/:id', async (req, res) => {
  await run('DELETE FROM jobs WHERE id = ? AND user_id = ?', Number(req.params.id), uid(req));
  res.status(204).end();
});

jobsRouter.post('/:id/match', async (req, res) => {
  const userId = uid(req);
  const job = await ownJob(userId, Number(req.params.id));
  if (!job) throw new HttpError(404, 'Vaga não encontrada');
  if (!job.description) throw new HttpError(400, 'A vaga não tem descrição. Busque pelo link ou cole a descrição.');
  const resume = await resumeForJob(userId, job.id);
  if (!resume) throw new HttpError(400, 'Cadastre seu currículo oficial primeiro (aba Currículo).');
  const { system, prompt } = buildMatchPrompt(resume, { title: job.title, company: job.company_name, description: job.description });
  res.json(await completeJson<MatchAnalysis>({ userId, system, prompt }));
});

/** Coloca a vaga na fila de adaptação do currículo (processada em segundo plano). */
jobsRouter.post('/:id/tailor', async (req, res) => {
  const userId = uid(req);
  const job = await ownJob(userId, Number(req.params.id));
  if (!job) throw new HttpError(404, 'Vaga não encontrada');
  if (!job.description?.trim()) throw new HttpError(400, 'A vaga não tem descrição — busque pelo link ou cole a descrição.');
  enqueueTailoring(userId, [job.id]);
  res.status(202).json(await getJob(userId, job.id));
});

/** Adapta todas as vagas com descrição que ainda não têm currículo adaptado. */
jobsRouter.post('/tailor-pending', async (req, res) => {
  const userId = uid(req);
  const rows = await all<{ id: number }>(
    `SELECT j.id FROM jobs j
     WHERE j.user_id = ? AND coalesce(j.description, '') <> '' AND j.status <> 'encerrado'
       AND NOT EXISTS (SELECT 1 FROM resumes r WHERE r.job_id = j.id)
     ORDER BY j.created_at DESC`,
    userId,
  );
  enqueueTailoring(userId, rows.map((r) => r.id));
  res.status(202).json({ queued: rows.length });
});

// ---------- Assistente de candidatura (chat por vaga) ----------

jobsRouter.get('/:id/chat', async (req, res) => {
  const job = await ownJob(uid(req), Number(req.params.id));
  if (!job) throw new HttpError(404, 'Vaga não encontrada');
  res.json(await all('SELECT id, role, content, created_at FROM job_chats WHERE job_id = ? ORDER BY id', job.id));
});

jobsRouter.post('/:id/chat', async (req, res) => {
  const userId = uid(req);
  const job = await ownJob(userId, Number(req.params.id));
  if (!job) throw new HttpError(404, 'Vaga não encontrada');
  const message = String(req.body?.message ?? '').trim();
  if (!message) throw new HttpError(400, 'Escreva a pergunta ou o pedido.');

  const history = await all<{ role: 'user' | 'assistant'; content: string }>('SELECT role, content FROM job_chats WHERE job_id = ? ORDER BY id', job.id);
  const website = job.company_id ? (await get<{ website: string | null }>('SELECT website FROM companies WHERE id = ?', job.company_id))?.website : null;
  const companySiteText = website ? await fetchSiteText(website) : null;
  const { system, prompt } = buildApplicationChatPrompt({
    settings: await getSettings(userId),
    job: { ...job, company: job.company_name },
    resume: await resumeForJob(userId, job.id),
    history,
    message,
    companySiteText,
  });
  const r = await completeWithModel({ userId, system, prompt, maxTokens: 6000 });
  const answer = r.text.trim();
  if (!answer) throw new HttpError(502, 'A IA não retornou resposta. Tente novamente.');

  const now = nowIso();
  await run('INSERT INTO job_chats (job_id, role, content, created_at) VALUES (?, ?, ?, ?)', job.id, 'user', message, now);
  await run('INSERT INTO job_chats (job_id, role, content, created_at) VALUES (?, ?, ?, ?)', job.id, 'assistant', answer, nowIso());
  res.json({
    messages: await all('SELECT id, role, content, created_at FROM job_chats WHERE job_id = ? ORDER BY id', job.id),
    model: r.model,
    failed: r.failed,
  });
});

jobsRouter.delete('/:id/chat', async (req, res) => {
  const job = await ownJob(uid(req), Number(req.params.id));
  if (!job) throw new HttpError(404, 'Vaga não encontrada');
  await run('DELETE FROM job_chats WHERE job_id = ?', job.id);
  res.status(204).end();
});

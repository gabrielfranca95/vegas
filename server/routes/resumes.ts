import { Router } from 'express';
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';
import type { MatchAnalysis, ResumeAIAction, ResumeData, ResumeReview } from '../../shared/types.ts';
import { completeJson } from '../ai.ts';
import { uid } from '../auth.ts';
import { findOrCreateCompany, get, nowIso, recordJobStatus, run } from '../db.ts';
import { resumeToDocx } from '../export/docx.ts';
import { resumeToPdf } from '../export/pdf.ts';
import { buildParsePrompt, buildReviewPrompt, buildSectionPrompt, buildTailorPrompt } from '../prompts.ts';
import { createResume, getJob, getResume, listResumes, ownJob } from '../repo.ts';
import { emptyResume, normalizeResume, safeFileName } from '../resume-utils.ts';
import { detectPlatform, scrapeJob } from '../scrape.ts';
import { HttpError } from './errors.ts';

export const resumesRouter = Router();

resumesRouter.get('/', (req, res) => {
  res.json(listResumes(uid(req)));
});

resumesRouter.get('/:id', (req, res) => {
  const r = getResume(uid(req), Number(req.params.id));
  if (!r) throw new HttpError(404, 'Currículo não encontrado');
  res.json(r);
});

resumesRouter.post('/', (req, res) => {
  const { name, fromId, data } = req.body ?? {};
  let base: ResumeData = data ? normalizeResume(data) : emptyResume();
  if (fromId) {
    const src = getResume(uid(req), Number(fromId));
    if (!src) throw new HttpError(404, 'Currículo de origem não encontrado');
    base = src.data;
  }
  res.status(201).json(createResume(uid(req), name || 'Novo currículo', base, { official: req.body?.official }));
});

resumesRouter.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const current = getResume(uid(req), id);
  if (!current) throw new HttpError(404, 'Currículo não encontrado');
  const b = req.body ?? {};
  run(
    'UPDATE resumes SET name = ?, data = ?, notes = ?, job_id = ?, updated_at = ? WHERE id = ?',
    b.name ?? current.name,
    JSON.stringify(normalizeResume(b.data ?? current.data)),
    'notes' in b ? b.notes : current.notes,
    'job_id' in b ? (b.job_id && ownJob(uid(req), Number(b.job_id)) ? Number(b.job_id) : null) : current.job_id,
    nowIso(),
    id,
  );
  res.json(getResume(uid(req), id));
});

resumesRouter.post('/:id/official', (req, res) => {
  const id = Number(req.params.id);
  if (!getResume(uid(req), id)) throw new HttpError(404, 'Currículo não encontrado');
  run('UPDATE resumes SET is_official = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE user_id = ?', id, uid(req));
  res.json(listResumes(uid(req)));
});

resumesRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const r = getResume(uid(req), id);
  if (!r) return void res.status(204).end();
  run('DELETE FROM resumes WHERE id = ?', id);
  if (r.is_official) {
    const next = get<{ id: number }>('SELECT id FROM resumes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1', uid(req));
    if (next) run('UPDATE resumes SET is_official = 1 WHERE id = ?', next.id);
  }
  res.status(204).end();
});

resumesRouter.get('/:id/export', async (req, res) => {
  const r = getResume(uid(req), Number(req.params.id));
  if (!r) throw new HttpError(404, 'Currículo não encontrado');
  const format = req.query.format === 'docx' ? 'docx' : 'pdf';
  const base = safeFileName(`Curriculo ${r.data.personal.name || ''} ${r.is_official ? '' : r.company_name ?? r.name}`);
  const buffer = format === 'pdf' ? await resumeToPdf(r.data) : await resumeToDocx(r.data);
  res.setHeader(
    'content-type',
    format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  const disposition = req.query.inline ? 'inline' : 'attachment';
  res.setHeader('content-disposition', `${disposition}; filename="${base}.${format}"`);
  res.send(buffer);
});

// ---------- IA ----------

resumesRouter.post('/:id/ai/section', async (req, res) => {
  const r = getResume(uid(req), Number(req.params.id));
  if (!r) throw new HttpError(404, 'Currículo não encontrado');
  const { section, content, action, instruction } = req.body as { section: string; content: unknown; action: ResumeAIAction; instruction?: string };
  const jobDescription = r.job_id ? (ownJob(uid(req), r.job_id)?.description ?? null) : null;
  const { system, prompt } = buildSectionPrompt({ section, content, action, instruction, resume: r.data, jobDescription });
  const out = await completeJson<{ result: unknown; notes?: string }>({ userId: uid(req), system, prompt });
  if (out.result === undefined) throw new HttpError(502, 'A IA não retornou o conteúdo revisado. Tente novamente.');
  res.json(out);
});

resumesRouter.post('/:id/ai/review', async (req, res) => {
  const r = getResume(uid(req), Number(req.params.id));
  if (!r) throw new HttpError(404, 'Currículo não encontrado');
  const { system, prompt } = buildReviewPrompt(r.data);
  res.json(await completeJson<ResumeReview>({ userId: uid(req), system, prompt }));
});

/**
 * Cria uma versão adaptada a partir de um currículo base para uma vaga.
 * A vaga pode vir de um card existente (jobId), de um link (cria o card) ou de uma descrição colada.
 */
resumesRouter.post('/:id/tailor', async (req, res) => {
  const userId = uid(req);
  const base = getResume(userId, Number(req.params.id));
  if (!base) throw new HttpError(404, 'Currículo não encontrado');
  const { jobId, url, description, title, company } = req.body ?? {};

  let job: { id: number; title: string; company: string | null; description: string } | null = null;
  if (jobId) {
    const j = getJob(userId, Number(jobId));
    if (!j) throw new HttpError(404, 'Vaga não encontrada');
    if (!j.description) throw new HttpError(400, 'Essa vaga não tem descrição. Abra o card e busque/cole a descrição.');
    job = { id: j.id, title: j.title, company: j.company_name, description: j.description };
  } else {
    let data = { title: title ?? '', company: company ?? '', description: description ?? '', url: url ?? '', location: '', workModel: '', applyEmail: '', platform: 'outro' as string };
    if (url && !description) {
      const scraped = await scrapeJob(url);
      if (!scraped.description) throw new HttpError(400, scraped.warning ?? 'Não consegui ler a vaga. Cole a descrição.');
      data = { ...data, ...scraped, title: title || scraped.title, company: company || scraped.company };
    }
    if (!data.description.trim()) throw new HttpError(400, 'Informe o link ou a descrição da vaga.');
    // Reaproveita o card se o link já estiver no quadro; senão cria em "Salvas".
    const existing = data.url ? get<{ id: number }>('SELECT id FROM jobs WHERE user_id = ? AND url = ?', userId, data.url) : undefined;
    let id = existing?.id;
    const now = nowIso();
    if (!id) {
      const result = run(
        `INSERT INTO jobs (user_id, company_id, title, url, platform, status, position, location, work_model, description, apply_email, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'salvas', (SELECT COALESCE(MAX(position), 0) + 1 FROM jobs WHERE user_id = ? AND status = 'salvas'), ?, ?, ?, ?, ?, ?)`,
        userId,
        findOrCreateCompany(userId, data.company),
        data.title || 'Vaga sem título',
        data.url || null,
        data.url ? detectPlatform(data.url) : 'outro',
        userId,
        data.location || null,
        data.workModel || null,
        data.description,
        data.applyEmail || null,
        now,
        now,
      );
      id = Number(result.lastInsertRowid);
      recordJobStatus(id, null, 'salvas', now);
    }
    job = { id, title: data.title, company: data.company || null, description: data.description };
  }

  const { system, prompt } = buildTailorPrompt(base.data, job);
  const out = await completeJson<{ resume: unknown; changes?: string[]; match?: MatchAnalysis }>({ userId, system, prompt, maxTokens: 16000 });
  if (!out.resume) throw new HttpError(502, 'A IA não retornou o currículo adaptado. Tente novamente.');

  const name = `${job.company ?? 'Vaga'} · ${job.title}`.slice(0, 120);
  const notes = [
    out.match ? `Aderência estimada: ${out.match.score}%` : '',
    out.changes?.length ? `Mudanças:\n- ${out.changes.join('\n- ')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const created = createResume(userId, name, normalizeResume(out.resume), { official: false, jobId: job.id, notes });
  res.status(201).json({ resume: created, changes: out.changes ?? [], match: out.match ?? null, jobId: job.id });
});

/** Importa um currículo (texto colado, PDF ou DOCX em base64) e estrutura com IA. */
resumesRouter.post('/import', async (req, res) => {
  const { text, fileBase64, filename, name, targetId } = req.body ?? {};
  let raw = String(text ?? '');
  if (fileBase64) {
    const buf = Buffer.from(String(fileBase64), 'base64');
    const lower = String(filename ?? '').toLowerCase();
    if (lower.endsWith('.pdf')) {
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const extracted = await extractText(pdf, { mergePages: true });
      raw = String(extracted.text);
    } else if (lower.endsWith('.docx')) {
      raw = (await mammoth.extractRawText({ buffer: buf })).value;
    } else {
      raw = buf.toString('utf8');
    }
  }
  if (!raw.trim()) throw new HttpError(400, 'Não encontrei texto no arquivo. Tente colar o texto do currículo.');
  const { system, prompt } = buildParsePrompt(raw);
  const userId = uid(req);
  const parsed = normalizeResume(await completeJson<unknown>({ userId, system, prompt, maxTokens: 12000 }));

  if (targetId) {
    const target = getResume(userId, Number(targetId));
    if (!target) throw new HttpError(404, 'Currículo não encontrado');
    run('UPDATE resumes SET data = ?, updated_at = ? WHERE id = ?', JSON.stringify(parsed), nowIso(), target.id);
    return void res.json(getResume(userId, target.id));
  }
  res.status(201).json(createResume(userId, name || 'Currículo oficial', parsed));
});

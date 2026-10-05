import { Router } from 'express';
import * as cheerio from 'cheerio';
import type { EVIdea, EVKind } from '../../shared/types.ts';
import { EV_KINDS } from '../../shared/types.ts';
import { completeJson } from '../ai.ts';
import { uid } from '../auth.ts';
import { findOrCreateCompany, get, nowIso, run } from '../db.ts';
import { evToPdf } from '../export/ev-pdf.ts';
import { buildEVContentPrompt, buildEVIdeasPrompt, type EVContext } from '../prompts.ts';
import { getEV, getOfficialResume, jobForContact, listEVs, ownContact, ownJob, resumeForJob } from '../repo.ts';
import { safeFileName } from '../resume-utils.ts';
import { htmlToText } from '../scrape.ts';
import { getSettings } from '../settings.ts';
import { HttpError } from './errors.ts';

export const evsRouter = Router();

const KINDS = EV_KINDS.map((k) => k.key);
const kindOf = (v: unknown): EVKind => (KINDS.includes(v as EVKind) ? (v as EVKind) : 'flash_report');

async function fetchSiteText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const $ = cheerio.load(await res.text());
    $('script, style, noscript, svg, nav, footer').remove();
    const meta = [$('title').text(), $('meta[name="description"]').attr('content') ?? ''].filter(Boolean).join(' — ');
    return `${meta}\n\n${htmlToText($('body').html() ?? '')}`.slice(0, 8000);
  } catch {
    return null;
  }
}

/** Monta o contexto da IA a partir do contato e/ou vaga, salvando o site da empresa se informado. */
async function buildContext(userId: number, body: any, opts: { fetchSite?: boolean } = { fetchSite: true }): Promise<{ ctx: EVContext; contactId: number | null; jobId: number | null; companyId: number | null }> {
  const contact = body.contact_id ? ownContact(userId, Number(body.contact_id)) : null;
  if (body.contact_id && !contact) throw new HttpError(404, 'Contato não encontrado');
  let job = body.job_id ? ownJob(userId, Number(body.job_id)) : null;
  if (body.job_id && !job) throw new HttpError(404, 'Vaga não encontrada');
  if (!job && contact) job = jobForContact(contact);

  let companyId: number | null = contact?.company_id ?? job?.company_id ?? null;
  if (!companyId && body.company) companyId = findOrCreateCompany(userId, body.company);
  const companyUrl = String(body.company_url ?? '').trim();
  if (companyId && /^https?:\/\//i.test(companyUrl)) {
    run('UPDATE companies SET website = ? WHERE id = ? AND user_id = ?', companyUrl, companyId, userId);
  }
  const company = companyId ? get<{ name: string; website: string | null }>('SELECT name, website FROM companies WHERE id = ?', companyId) : undefined;
  const site = companyUrl || company?.website || '';
  const companySiteText = opts.fetchSite && /^https?:\/\//i.test(site) ? await fetchSiteText(site) : null;

  return {
    ctx: {
      settings: getSettings(userId),
      company: company?.name ?? null,
      companySiteText,
      job: job ? { title: job.title, description: job.description } : null,
      contact: contact ? { name: contact.name, role_category: contact.role_category, role_title: contact.role_title, notes: contact.notes } : null,
      resume: resumeForJob(userId, job?.id ?? null),
      instruction: body.instruction ? String(body.instruction) : undefined,
    },
    contactId: contact?.id ?? null,
    jobId: job?.id ?? null,
    companyId,
  };
}

evsRouter.get('/', (req, res) => {
  res.json(listEVs(uid(req)));
});

evsRouter.post('/ideas', async (req, res) => {
  const userId = uid(req);
  const { ctx } = await buildContext(userId, req.body ?? {});
  const { system, prompt } = buildEVIdeasPrompt(ctx);
  const out = await completeJson<{ ideas?: EVIdea[] }>({ userId, system, prompt, maxTokens: 6000 });
  const ideas = (out.ideas ?? []).map((i) => ({ ...i, kind: kindOf(i.kind) }));
  res.json({ ideas, usedCompanySite: Boolean(ctx.companySiteText) });
});

evsRouter.post('/', async (req, res) => {
  const userId = uid(req);
  const b = req.body ?? {};
  if (!String(b.title ?? '').trim()) throw new HttpError(400, 'Dê um título ao EV.');
  const { contactId, jobId, companyId } = await buildContext(userId, { ...b, company_url: undefined }, { fetchSite: false });
  const now = nowIso();
  const result = run(
    `INSERT INTO evs (user_id, contact_id, job_id, company_id, kind, title, summary, content, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId,
    contactId,
    jobId,
    companyId,
    kindOf(b.kind),
    String(b.title).trim(),
    b.summary || null,
    b.content ?? '',
    b.content ? 'pronto' : 'ideia',
    now,
    now,
  );
  res.status(201).json(getEV(userId, Number(result.lastInsertRowid)));
});

evsRouter.put('/:id', (req, res) => {
  const userId = uid(req);
  const id = Number(req.params.id);
  const current = getEV(userId, id);
  if (!current) throw new HttpError(404, 'EV não encontrado');
  const b = req.body ?? {};
  const status = ['ideia', 'pronto', 'entregue'].includes(b.status) ? b.status : current.status;
  run(
    'UPDATE evs SET title = ?, kind = ?, summary = ?, content = ?, status = ?, delivered_at = ?, updated_at = ? WHERE id = ?',
    b.title ?? current.title,
    b.kind ? kindOf(b.kind) : current.kind,
    'summary' in b ? b.summary : current.summary,
    b.content ?? current.content,
    status,
    status === 'entregue' ? current.delivered_at ?? nowIso() : null,
    nowIso(),
    id,
  );
  res.json(getEV(userId, id));
});

evsRouter.delete('/:id', (req, res) => {
  run('DELETE FROM evs WHERE id = ? AND user_id = ?', Number(req.params.id), uid(req));
  res.status(204).end();
});

evsRouter.post('/:id/generate', async (req, res) => {
  const userId = uid(req);
  const id = Number(req.params.id);
  const ev = getEV(userId, id);
  if (!ev) throw new HttpError(404, 'EV não encontrado');
  const { ctx } = await buildContext(userId, {
    contact_id: ev.contact_id,
    job_id: ev.job_id,
    company: ev.company_name,
    company_url: req.body?.company_url,
    instruction: req.body?.instruction,
  });
  const { system, prompt } = buildEVContentPrompt(ctx, ev);
  const out = await completeJson<{ summary?: string; content?: string }>({ userId, system, prompt, maxTokens: 8000 });
  if (!out.content) throw new HttpError(502, 'A IA não retornou o conteúdo. Tente novamente.');
  run(
    "UPDATE evs SET content = ?, summary = ?, status = CASE WHEN status = 'entregue' THEN status ELSE 'pronto' END, updated_at = ? WHERE id = ?",
    String(out.content),
    out.summary ? String(out.summary) : ev.summary,
    nowIso(),
    id,
  );
  res.json({ ev: getEV(userId, id), usedCompanySite: Boolean(ctx.companySiteText) });
});

evsRouter.get('/:id/pdf', async (req, res) => {
  const userId = uid(req);
  const ev = getEV(userId, Number(req.params.id));
  if (!ev) throw new HttpError(404, 'EV não encontrado');
  const settings = getSettings(userId);
  const p = getOfficialResume(userId)?.data.personal;
  const buffer = await evToPdf({
    title: ev.title,
    kindLabel: EV_KINDS.find((k) => k.key === ev.kind)?.label.replace(/\s*\(PDF\)/, '') ?? 'Entrega de Valor',
    summary: ev.summary,
    content: ev.content,
    company: ev.company_name,
    author: {
      name: settings.profile.name || p?.name || req.user!.name,
      headline: settings.profile.headline || p?.headline || '',
      email: p?.email ?? '',
      phone: p?.phone ?? '',
      linkedin: p?.linkedin ?? '',
    },
  });
  res.setHeader('content-type', 'application/pdf');
  res.setHeader('content-disposition', `${req.query.inline ? 'inline' : 'attachment'}; filename="${safeFileName(`${ev.company_name ?? ''} ${ev.title}`)}.pdf"`);
  res.send(buffer);
});

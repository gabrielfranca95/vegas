import { Router } from 'express';
import type { EventType, MessageKind, ProfileData } from '../../shared/types.ts';
import { AIError, complete, completeJson, completeJsonWithModel } from '../ai.ts';
import { uid } from '../auth.ts';
import { findOrCreateCompany, get, nowIso, run } from '../db.ts';
import { computeMetrics } from '../followup.ts';
import { buildMessagePrompt, buildProfilePrompt, fallbackMessage, type MessagePromptInput } from '../prompts.ts';
import { canonicalProfileUrl, guessRoleCategory, profileNotes, scrapeLinkedInProfile } from '../profile.ts';
import { getContact, getContactEvents, getEV, jobForContact, listContacts, ownContact, ownJob, refreshContactStage, resumeForJob } from '../repo.ts';
import { getSettings } from '../settings.ts';
import { HttpError } from './errors.ts';
import { fetchSiteText } from '../site.ts';

export const contactsRouter = Router();

const EVENT_TYPES: EventType[] = [
  'invite_sent',
  'invite_accepted',
  'message_sent',
  'followup_sent',
  'reply_received',
  'ev_delivered',
  'interview',
  'offer',
  'note',
  'closed',
  'reopened',
];
const FIELDS = ['name', 'linkedin_url', 'role_category', 'role_title', 'platform', 'notes', 'snooze_until', 'draft'] as const;

function normalizeLinkedIn(url: unknown) {
  const s = String(url ?? '').trim();
  if (!s) return null;
  const profile = canonicalProfileUrl(s);
  if (profile) return profile;
  if (/^https?:\/\//i.test(s)) return s;
  if (/linkedin\.com/i.test(s)) return `https://${s.replace(/^\/+/, '')}`;
  return `https://www.linkedin.com/in/${s.replace(/^@/, '')}`;
}

/** Vaga informada, desde que pertença ao usuário. */
async function validJobId(userId: number, jobId: unknown): Promise<number | null> {
  if (!jobId) return null;
  const job = await ownJob(userId, Number(jobId));
  if (!job) throw new HttpError(400, 'Vaga inválida.');
  return job.id;
}

/** Empresa do contato: a informada, ou herdada da vaga vinculada. */
async function resolveCompany(userId: number, body: any, jobId: number | null): Promise<number | null> {
  if (body.company) return findOrCreateCompany(userId, body.company);
  if (jobId) return (await ownJob(userId, jobId))?.company_id ?? null;
  return null;
}

function eventOwner(userId: number, eventId: number) {
  return get<{ contact_id: number }>(
    'SELECT e.contact_id FROM contact_events e JOIN contacts c ON c.id = e.contact_id WHERE e.id = ? AND c.user_id = ?',
    eventId,
    userId,
  );
}

contactsRouter.get('/', async (req, res) => {
  res.json(await listContacts(uid(req)));
});

contactsRouter.get('/metrics', async (req, res) => {
  res.json(computeMetrics(await listContacts(uid(req))));
});

/**
 * Lê um perfil do LinkedIn: pelo link (dados públicos) ou pelo texto colado da página (via IA).
 * Também indica se a pessoa já está cadastrada e qual vaga da mesma empresa existe no quadro.
 */
contactsRouter.post('/parse-profile', async (req, res) => {
  const userId = uid(req);
  const url = String(req.body?.url ?? '').trim();
  const text = String(req.body?.text ?? '').trim();
  let profile: ProfileData;
  if (text) {
    const out = await completeJson<Partial<ProfileData>>({ userId, ...buildProfilePrompt(text) });
    const roleTitle = String(out.roleTitle ?? '');
    profile = {
      url: canonicalProfileUrl(url) ?? url,
      name: String(out.name ?? ''),
      headline: String(out.headline ?? ''),
      roleTitle,
      company: String(out.company ?? ''),
      location: String(out.location ?? ''),
      about: String(out.about ?? ''),
      previousCompanies: Array.isArray(out.previousCompanies) ? out.previousCompanies.map(String).slice(0, 5) : [],
      roleCategory: guessRoleCategory(`${roleTitle} ${out.headline ?? ''}`),
    };
  } else {
    profile = await scrapeLinkedInProfile(url);
  }
  const existing = profile.url
    ? await get<{ id: number; name: string }>('SELECT id, name FROM contacts WHERE user_id = ? AND linkedin_url = ?', userId, profile.url)
    : undefined;
  const job = profile.company
    ? await get<{ id: number; title: string }>(
        'SELECT j.id, j.title FROM jobs j JOIN companies c ON c.id = j.company_id WHERE j.user_id = ? AND lower(c.name) = lower(?) ORDER BY j.updated_at DESC LIMIT 1',
        userId,
        profile.company,
      )
    : undefined;
  res.json({ profile, notes: profileNotes(profile), existingContactId: existing?.id ?? null, suggestedJob: job ?? null });
});

contactsRouter.post('/', async (req, res) => {
  const userId = uid(req);
  const b = req.body ?? {};
  if (!String(b.name ?? '').trim()) throw new HttpError(400, 'Informe o nome da pessoa.');
  const now = nowIso();
  const jobId = await validJobId(userId, b.job_id);
  const result = await run(
    `INSERT INTO contacts (user_id, name, linkedin_url, role_category, role_title, company_id, job_id, platform, stage, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'novo', ?, ?, ?) RETURNING id`,
    userId,
    String(b.name).trim(),
    normalizeLinkedIn(b.linkedin_url),
    b.role_category ?? 'recrutador',
    b.role_title || null,
    await resolveCompany(userId, b, jobId),
    jobId,
    b.platform ?? 'linkedin',
    b.notes || null,
    now,
    now,
  );
  const id = result.id!;
  // Permite cadastrar alguém que já é conexão (pula a etapa do convite).
  if (b.already_connected) {
    await run("INSERT INTO contact_events (contact_id, type, content, occurred_at, created_at) VALUES (?, 'invite_accepted', 'Já era conexão', ?, ?)", id, now, now);
    await refreshContactStage(id);
  }
  res.status(201).json(await getContact(userId, id));
});

contactsRouter.put('/:id', async (req, res) => {
  const userId = uid(req);
  const id = Number(req.params.id);
  if (!(await ownContact(userId, id))) throw new HttpError(404, 'Contato não encontrado');
  const b = req.body ?? {};
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const f of FIELDS) {
    if (f in b) {
      sets.push(`${f} = ?`);
      params.push(f === 'linkedin_url' ? normalizeLinkedIn(b[f]) : b[f] === '' ? null : b[f]);
    }
  }
  let jobId: number | null = null;
  if ('job_id' in b) {
    jobId = await validJobId(userId, b.job_id);
    sets.push('job_id = ?');
    params.push(jobId);
  }
  if ('company' in b || (jobId && !b.company)) {
    sets.push('company_id = ?');
    params.push(await resolveCompany(userId, b, jobId));
  }
  if (!sets.length) return void res.json(await getContact(userId, id));
  sets.push('updated_at = ?');
  params.push(nowIso());
  await run(`UPDATE contacts SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
  res.json(await getContact(userId, id));
});

contactsRouter.delete('/:id', async (req, res) => {
  await run('DELETE FROM contacts WHERE id = ? AND user_id = ?', Number(req.params.id), uid(req));
  res.status(204).end();
});

// ---------- Linha do tempo ----------

contactsRouter.post('/:id/events', async (req, res) => {
  const userId = uid(req);
  const id = Number(req.params.id);
  if (!(await ownContact(userId, id))) throw new HttpError(404, 'Contato não encontrado');
  const { type, content, occurred_at, ev_id } = req.body ?? {};
  if (!EVENT_TYPES.includes(type)) throw new HttpError(400, 'Tipo de evento inválido');
  const at = occurred_at ? new Date(occurred_at).toISOString() : nowIso();
  await run('INSERT INTO contact_events (contact_id, type, content, occurred_at, created_at) VALUES (?, ?, ?, ?, ?)', id, type, content || null, at, nowIso());
  // Registrar uma interação limpa o "adiar lembrete" e o rascunho já enviado.
  const clearDraft = ['invite_sent', 'message_sent', 'followup_sent', 'ev_delivered'].includes(type);
  await run(`UPDATE contacts SET snooze_until = NULL${clearDraft ? ', draft = NULL' : ''} WHERE id = ?`, id);
  if (type === 'ev_delivered' && ev_id) {
    await run("UPDATE evs SET status = 'entregue', delivered_at = ?, contact_id = COALESCE(contact_id, ?), updated_at = ? WHERE id = ? AND user_id = ?", at, id, nowIso(), Number(ev_id), userId);
  }
  await refreshContactStage(id);
  res.status(201).json(await getContact(userId, id));
});

contactsRouter.put('/events/:eventId', async (req, res) => {
  const userId = uid(req);
  const ev = await eventOwner(userId, Number(req.params.eventId));
  if (!ev) throw new HttpError(404, 'Evento não encontrado');
  const { content, occurred_at, type } = req.body ?? {};
  if (type !== undefined && !EVENT_TYPES.includes(type)) throw new HttpError(400, 'Tipo de evento inválido');
  await run(
    'UPDATE contact_events SET content = COALESCE(?, content), occurred_at = COALESCE(?, occurred_at), type = COALESCE(?, type) WHERE id = ?',
    content ?? null,
    occurred_at ? new Date(occurred_at).toISOString() : null,
    type ?? null,
    Number(req.params.eventId),
  );
  await refreshContactStage(ev.contact_id);
  res.json(await getContact(userId, ev.contact_id));
});

contactsRouter.delete('/events/:eventId', async (req, res) => {
  const userId = uid(req);
  const ev = await eventOwner(userId, Number(req.params.eventId));
  if (!ev) throw new HttpError(404, 'Evento não encontrado');
  await run('DELETE FROM contact_events WHERE id = ?', Number(req.params.eventId));
  await refreshContactStage(ev.contact_id);
  res.json(await getContact(userId, ev.contact_id));
});

// ---------- Geração de mensagem ----------

contactsRouter.post('/:id/generate', async (req, res) => {
  const userId = uid(req);
  const id = Number(req.params.id);
  const contact = await ownContact(userId, id);
  if (!contact) throw new HttpError(404, 'Contato não encontrado');
  const kind = (req.body?.kind ?? 'first_message') as MessageKind;
  const settings = await getSettings(userId);
  const job = await jobForContact(contact);
  const company = contact.company_id ? ((await get<{ name: string }>('SELECT name FROM companies WHERE id = ?', contact.company_id))?.name ?? null) : null;

  let ev: MessagePromptInput['ev'] = null;
  let evUsed: { id: number; title: string } | null = null;
  if (kind === 'ev_delivery') {
    const evRow = req.body?.ev_id ? await getEV(userId, Number(req.body.ev_id)) : undefined;
    if (!evRow) throw new HttpError(400, 'Escolha qual EV será entregue (crie um na seção Entrega de Valor).');
    ev = { kind: evRow.kind, title: evRow.title, summary: evRow.summary, content: evRow.content };
    evUsed = { id: evRow.id, title: evRow.title };
  } else if (kind === 'first_message' || kind === 'followup' || kind === 'direct') {
    // A 1ª mensagem entrega o EV da pessoa (ou da mesma vaga/empresa); o follow-up complementa o material enviado.
    const evRow = await get<{ id: number }>(
      `SELECT id FROM evs WHERE user_id = ? AND content <> '' AND (contact_id = ? OR (job_id IS NOT NULL AND job_id = ?) OR (company_id IS NOT NULL AND company_id = ?))
       ORDER BY (contact_id = ?) DESC, (status = 'entregue') ${kind === 'followup' ? 'DESC' : 'ASC'}, updated_at DESC LIMIT 1`,
      userId,
      id,
      contact.job_id,
      contact.company_id,
      id,
    );
    const full = evRow ? await getEV(userId, evRow.id) : undefined;
    if (full) {
      ev = { kind: full.kind, title: full.title, summary: full.summary, content: full.content };
      evUsed = { id: full.id, title: full.title };
    }
  }

  // Contexto real da empresa (site) e mensagem já enviada a outra pessoa da mesma empresa.
  const warnings: string[] = [];
  const opening = ['invite_note', 'first_message', 'direct', 'ev_delivery'].includes(kind);
  const companyRow = contact.company_id ? await get<{ website: string | null }>('SELECT website FROM companies WHERE id = ?', contact.company_id) : undefined;
  const companySiteText = opening && companyRow?.website ? await fetchSiteText(companyRow.website) : null;
  const sameCompany =
    opening && contact.company_id
      ? await get<{ name: string; content: string; occurred_at: string }>(
          `SELECT c.name, e.content, e.occurred_at FROM contact_events e JOIN contacts c ON c.id = e.contact_id
           WHERE c.user_id = ? AND c.company_id = ? AND c.id <> ? AND e.type IN ('message_sent', 'ev_delivered', 'invite_sent')
             AND coalesce(e.content, '') <> '' ORDER BY e.occurred_at DESC LIMIT 1`,
          userId,
          contact.company_id,
          id,
        )
      : undefined;
  if (opening && companyRow?.website && !companySiteText) {
    warnings.push(`Não consegui ler o site ${companyRow.website} (bloqueado ou fora do ar). A IA usou só a vaga e as anotações.`);
  } else if (opening && !companySiteText && !job?.description && !contact.notes) {
    warnings.push('Não há contexto real da empresa (site, vaga ou anotações) — a mensagem tende a sair genérica. Cadastre o site da empresa (aba EV) ou uma vaga com descrição.');
  }
  if (sameCompany) {
    warnings.push(`Você já escreveu para ${sameCompany.name}, da mesma empresa, em ${new Date(sameCompany.occurred_at).toLocaleDateString('pt-BR')}. A IA variou a abordagem para não repetir.`);
  }

  const input: MessagePromptInput = {
    kind,
    settings,
    contact,
    company,
    job: job ? { title: job.title, description: job.description, url: job.url } : null,
    events: await getContactEvents(id),
    resume: await resumeForJob(userId, job?.id ?? null),
    instruction: req.body?.instruction,
    ev,
    companySiteText,
    sameCompanyMessage: sameCompany ? { name: sameCompany.name, content: sameCompany.content } : null,
  };

  if (!settings.ai.keys[settings.ai.provider]) {
    return void res.json({ variants: fallbackMessage(input), usedAI: false, evUsed, warnings, notice: 'Sem chave de IA configurada: usei um modelo simples. Configure a IA em Configurações.' });
  }

  const { system, prompt } = buildMessagePrompt(input);
  let variants: string[];
  let model: string | null = null;
  let failed: string[] = [];
  try {
    const r = await completeJsonWithModel<{ variants?: string[]; message?: string }>({ userId, system, prompt, maxTokens: 4000 });
    ({ model, failed } = r);
    const out = r.data;
    variants = (out.variants ?? (out.message ? [out.message] : [])).map((v) => String(v).trim()).filter(Boolean);
  } catch (err) {
    if (err instanceof AIError && err.status !== 502) throw err;
    // Alguns modelos ignoram o pedido de JSON; nesse caso usa o texto puro.
    const text = await complete({ userId, system: system.replace(/Responda em JSON.*$/m, 'Responda apenas com a mensagem.'), prompt, maxTokens: 3000 });
    variants = [text.trim()];
    if (!variants[0]) throw err;
  }
  res.json({ variants, usedAI: true, jobUsed: job ? job.title : null, model, failed, evUsed, warnings });
});

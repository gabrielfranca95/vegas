import { Router } from 'express';
import type { EventType, MessageKind } from '../../shared/types.ts';
import { complete, completeJson } from '../ai.ts';
import { uid } from '../auth.ts';
import { findOrCreateCompany, get, nowIso, run } from '../db.ts';
import { computeMetrics } from '../followup.ts';
import { buildMessagePrompt, fallbackMessage, type MessagePromptInput } from '../prompts.ts';
import { getContact, getContactEvents, getEV, jobForContact, listContacts, ownContact, ownJob, refreshContactStage, resumeForJob } from '../repo.ts';
import { getSettings } from '../settings.ts';
import { HttpError } from './errors.ts';

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
  if (/^https?:\/\//i.test(s)) return s;
  if (/linkedin\.com/i.test(s)) return `https://${s.replace(/^\/+/, '')}`;
  return `https://www.linkedin.com/in/${s.replace(/^@/, '')}`;
}

/** Vaga informada, desde que pertença ao usuário. */
function validJobId(userId: number, jobId: unknown): number | null {
  if (!jobId) return null;
  const job = ownJob(userId, Number(jobId));
  if (!job) throw new HttpError(400, 'Vaga inválida.');
  return job.id;
}

/** Empresa do contato: a informada, ou herdada da vaga vinculada. */
function resolveCompany(userId: number, body: any, jobId: number | null): number | null {
  if (body.company) return findOrCreateCompany(userId, body.company);
  if (jobId) return ownJob(userId, jobId)?.company_id ?? null;
  return null;
}

function eventOwner(userId: number, eventId: number) {
  return get<{ contact_id: number }>(
    'SELECT e.contact_id FROM contact_events e JOIN contacts c ON c.id = e.contact_id WHERE e.id = ? AND c.user_id = ?',
    eventId,
    userId,
  );
}

contactsRouter.get('/', (req, res) => {
  res.json(listContacts(uid(req)));
});

contactsRouter.get('/metrics', (req, res) => {
  res.json(computeMetrics(listContacts(uid(req))));
});

contactsRouter.post('/', (req, res) => {
  const userId = uid(req);
  const b = req.body ?? {};
  if (!String(b.name ?? '').trim()) throw new HttpError(400, 'Informe o nome da pessoa.');
  const now = nowIso();
  const jobId = validJobId(userId, b.job_id);
  const result = run(
    `INSERT INTO contacts (user_id, name, linkedin_url, role_category, role_title, company_id, job_id, platform, stage, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'novo', ?, ?, ?)`,
    userId,
    String(b.name).trim(),
    normalizeLinkedIn(b.linkedin_url),
    b.role_category ?? 'recrutador',
    b.role_title || null,
    resolveCompany(userId, b, jobId),
    jobId,
    b.platform ?? 'linkedin',
    b.notes || null,
    now,
    now,
  );
  const id = Number(result.lastInsertRowid);
  // Permite cadastrar alguém que já é conexão (pula a etapa do convite).
  if (b.already_connected) {
    run("INSERT INTO contact_events (contact_id, type, content, occurred_at, created_at) VALUES (?, 'invite_accepted', 'Já era conexão', ?, ?)", id, now, now);
    refreshContactStage(id);
  }
  res.status(201).json(getContact(userId, id));
});

contactsRouter.put('/:id', (req, res) => {
  const userId = uid(req);
  const id = Number(req.params.id);
  if (!ownContact(userId, id)) throw new HttpError(404, 'Contato não encontrado');
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
    jobId = validJobId(userId, b.job_id);
    sets.push('job_id = ?');
    params.push(jobId);
  }
  if ('company' in b || (jobId && !b.company)) {
    sets.push('company_id = ?');
    params.push(resolveCompany(userId, b, jobId));
  }
  if (!sets.length) return void res.json(getContact(userId, id));
  sets.push('updated_at = ?');
  params.push(nowIso());
  run(`UPDATE contacts SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
  res.json(getContact(userId, id));
});

contactsRouter.delete('/:id', (req, res) => {
  run('DELETE FROM contacts WHERE id = ? AND user_id = ?', Number(req.params.id), uid(req));
  res.status(204).end();
});

// ---------- Linha do tempo ----------

contactsRouter.post('/:id/events', (req, res) => {
  const userId = uid(req);
  const id = Number(req.params.id);
  if (!ownContact(userId, id)) throw new HttpError(404, 'Contato não encontrado');
  const { type, content, occurred_at, ev_id } = req.body ?? {};
  if (!EVENT_TYPES.includes(type)) throw new HttpError(400, 'Tipo de evento inválido');
  const at = occurred_at ? new Date(occurred_at).toISOString() : nowIso();
  run('INSERT INTO contact_events (contact_id, type, content, occurred_at, created_at) VALUES (?, ?, ?, ?, ?)', id, type, content || null, at, nowIso());
  // Registrar uma interação limpa o "adiar lembrete" e o rascunho já enviado.
  const clearDraft = ['invite_sent', 'message_sent', 'followup_sent', 'ev_delivered'].includes(type);
  run(`UPDATE contacts SET snooze_until = NULL${clearDraft ? ', draft = NULL' : ''} WHERE id = ?`, id);
  if (type === 'ev_delivered' && ev_id) {
    run("UPDATE evs SET status = 'entregue', delivered_at = ?, contact_id = COALESCE(contact_id, ?), updated_at = ? WHERE id = ? AND user_id = ?", at, id, nowIso(), Number(ev_id), userId);
  }
  refreshContactStage(id);
  res.status(201).json(getContact(userId, id));
});

contactsRouter.put('/events/:eventId', (req, res) => {
  const userId = uid(req);
  const ev = eventOwner(userId, Number(req.params.eventId));
  if (!ev) throw new HttpError(404, 'Evento não encontrado');
  const { content, occurred_at, type } = req.body ?? {};
  if (type !== undefined && !EVENT_TYPES.includes(type)) throw new HttpError(400, 'Tipo de evento inválido');
  run(
    'UPDATE contact_events SET content = COALESCE(?, content), occurred_at = COALESCE(?, occurred_at), type = COALESCE(?, type) WHERE id = ?',
    content ?? null,
    occurred_at ? new Date(occurred_at).toISOString() : null,
    type ?? null,
    Number(req.params.eventId),
  );
  refreshContactStage(ev.contact_id);
  res.json(getContact(userId, ev.contact_id));
});

contactsRouter.delete('/events/:eventId', (req, res) => {
  const userId = uid(req);
  const ev = eventOwner(userId, Number(req.params.eventId));
  if (!ev) throw new HttpError(404, 'Evento não encontrado');
  run('DELETE FROM contact_events WHERE id = ?', Number(req.params.eventId));
  refreshContactStage(ev.contact_id);
  res.json(getContact(userId, ev.contact_id));
});

// ---------- Geração de mensagem ----------

contactsRouter.post('/:id/generate', async (req, res) => {
  const userId = uid(req);
  const id = Number(req.params.id);
  const contact = ownContact(userId, id);
  if (!contact) throw new HttpError(404, 'Contato não encontrado');
  const kind = (req.body?.kind ?? 'first_message') as MessageKind;
  const settings = getSettings(userId);
  const job = jobForContact(contact);
  const company = contact.company_id ? get<{ name: string }>('SELECT name FROM companies WHERE id = ?', contact.company_id)?.name ?? null : null;

  let ev: MessagePromptInput['ev'] = null;
  if (kind === 'ev_delivery') {
    const evRow = req.body?.ev_id ? getEV(userId, Number(req.body.ev_id)) : undefined;
    if (!evRow) throw new HttpError(400, 'Escolha qual EV será entregue (crie um na seção Entrega de Valor).');
    ev = { kind: evRow.kind, title: evRow.title, summary: evRow.summary, content: evRow.content };
  }

  const input: MessagePromptInput = {
    kind,
    settings,
    contact,
    company,
    job: job ? { title: job.title, description: job.description, url: job.url } : null,
    events: getContactEvents(id),
    resume: resumeForJob(userId, job?.id ?? null),
    instruction: req.body?.instruction,
    ev,
  };

  if (!settings.ai.keys[settings.ai.provider]) {
    return void res.json({ variants: fallbackMessage(input), usedAI: false, notice: 'Sem chave de IA configurada: usei um modelo simples. Configure a IA em Configurações.' });
  }

  const { system, prompt } = buildMessagePrompt(input);
  let variants: string[];
  try {
    const out = await completeJson<{ variants?: string[]; message?: string }>({ userId, system, prompt, maxTokens: 4000 });
    variants = (out.variants ?? (out.message ? [out.message] : [])).map((v) => String(v).trim()).filter(Boolean);
  } catch (err) {
    // Alguns modelos ignoram o pedido de JSON; nesse caso usa o texto puro.
    const text = await complete({ userId, system: system.replace(/Responda em JSON.*$/m, 'Responda apenas com a mensagem.'), prompt, maxTokens: 3000 });
    variants = [text.trim()];
    if (!variants[0]) throw err;
  }
  res.json({ variants, usedAI: true, jobUsed: job ? job.title : null });
});

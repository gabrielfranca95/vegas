import type { Contact, ContactEvent, EV, Job, Resume, ResumeData, Settings } from '../shared/types.ts';
import { all, get, nowIso, run } from './db.ts';
import { computeCadence, computeNextAction, deriveStage } from './followup.ts';
import { getSettings } from './settings.ts';
import { normalizeResume } from './resume-utils.ts';
import { tailoringStatus } from './tailor-status.ts';

// ---------- Contatos ----------

const CONTACT_SELECT = `
  SELECT c.*, co.name AS company_name, j.title AS job_title
  FROM contacts c
  LEFT JOIN companies co ON co.id = c.company_id
  LEFT JOIN jobs j ON j.id = c.job_id
`;

async function hydrateContacts(rows: any[], settings: Settings): Promise<Contact[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const events = await all<ContactEvent>(
    `SELECT id, contact_id, type, content, occurred_at FROM contact_events WHERE contact_id IN (${ids.map(() => '?').join(',')}) ORDER BY occurred_at, id`,
    ...ids,
  );
  const byContact = new Map<number, ContactEvent[]>();
  for (const e of events) {
    const list = byContact.get(e.contact_id) ?? [];
    list.push(e);
    byContact.set(e.contact_id, list);
  }
  return rows.map((r) => {
    const ev = byContact.get(r.id) ?? [];
    const lastActivityAt = ev.length ? ev[ev.length - 1].occurred_at : r.created_at;
    return { ...r, events: ev, lastActivityAt, nextAction: computeNextAction(r, ev, settings), cadence: computeCadence(r, ev, settings) } as Contact;
  });
}

export async function listContacts(userId: number): Promise<Contact[]> {
  return hydrateContacts(await all(`${CONTACT_SELECT} WHERE c.user_id = ? ORDER BY c.updated_at DESC`, userId), await getSettings(userId));
}

export async function getContact(userId: number, id: number): Promise<Contact | undefined> {
  return (await hydrateContacts(await all(`${CONTACT_SELECT} WHERE c.user_id = ? AND c.id = ?`, userId, id), await getSettings(userId)))[0];
}

/** Linha bruta do contato, apenas se pertencer ao usuário. */
export function ownContact(userId: number, id: number) {
  return get<any>('SELECT * FROM contacts WHERE id = ? AND user_id = ?', id, userId);
}

export function getContactEvents(contactId: number) {
  return all<ContactEvent>('SELECT id, contact_id, type, content, occurred_at FROM contact_events WHERE contact_id = ? ORDER BY occurred_at, id', contactId);
}

/** Recalcula o estágio salvo a partir da linha do tempo. */
export async function refreshContactStage(contactId: number) {
  const stage = deriveStage(await getContactEvents(contactId));
  await run('UPDATE contacts SET stage = ?, updated_at = ? WHERE id = ?', stage, nowIso(), contactId);
}

// ---------- Vagas ----------

export async function listJobs(userId: number): Promise<Job[]> {
  const rows = await all<any>(
    `SELECT j.*, co.name AS company_name,
      (SELECT COUNT(*)::int FROM resumes r WHERE r.job_id = j.id) AS resumes_count
    FROM jobs j
    LEFT JOIN companies co ON co.id = j.company_id
    WHERE j.user_id = ?
    ORDER BY j.status, j.position, j.id`,
    userId,
  );
  // Contatos ligados à vaga diretamente ou pela mesma empresa.
  const contacts = await listContacts(userId);
  return rows.map((j) => {
    const related = contacts.filter((c) => c.job_id === j.id || (j.company_id && c.company_id === j.company_id));
    return {
      ...j,
      contacts_count: related.length,
      urgent_contacts: related.filter((c) => c.nextAction.urgent).length,
      tailoring: tailoringStatus(j.id),
    } as Job;
  });
}

export async function getJob(userId: number, id: number): Promise<Job | undefined> {
  return (await listJobs(userId)).find((j) => j.id === id);
}

export function ownJob(userId: number, id: number) {
  return get<any>('SELECT j.*, co.name AS company_name FROM jobs j LEFT JOIN companies co ON co.id = j.company_id WHERE j.id = ? AND j.user_id = ?', id, userId);
}

/** Vaga usada como contexto para um contato: a vinculada, ou a mais recente da mesma empresa. */
export async function jobForContact(contact: { user_id: number; job_id: number | null; company_id: number | null }) {
  if (contact.job_id) return (await ownJob(contact.user_id, contact.job_id)) ?? null;
  if (contact.company_id) {
    return (await get<any>('SELECT * FROM jobs WHERE user_id = ? AND company_id = ? ORDER BY updated_at DESC LIMIT 1', contact.user_id, contact.company_id)) ?? null;
  }
  return null;
}

// ---------- Currículos ----------

function toResume(row: any): Resume {
  return { ...row, is_official: Boolean(row.is_official), data: normalizeResume(JSON.parse(row.data)) };
}

const RESUME_SELECT = `
  SELECT r.*, j.title AS job_title, co.name AS company_name
  FROM resumes r
  LEFT JOIN jobs j ON j.id = r.job_id
  LEFT JOIN companies co ON co.id = j.company_id
`;

export async function listResumes(userId: number): Promise<Resume[]> {
  return (await all(`${RESUME_SELECT} WHERE r.user_id = ? ORDER BY r.is_official DESC, r.updated_at DESC`, userId)).map(toResume);
}

export async function getResume(userId: number, id: number): Promise<Resume | undefined> {
  const row = await get(`${RESUME_SELECT} WHERE r.user_id = ? AND r.id = ?`, userId, id);
  return row ? toResume(row) : undefined;
}

export async function getOfficialResume(userId: number): Promise<Resume | undefined> {
  const row = await get(`${RESUME_SELECT} WHERE r.user_id = ? AND r.is_official = 1 LIMIT 1`, userId);
  return row ? toResume(row) : undefined;
}

/** Currículo a usar como contexto: o adaptado para a vaga, se houver, senão o oficial. */
export async function resumeForJob(userId: number, jobId: number | null): Promise<ResumeData | null> {
  if (jobId) {
    const row = await get<any>('SELECT data FROM resumes WHERE user_id = ? AND job_id = ? ORDER BY updated_at DESC LIMIT 1', userId, jobId);
    if (row) return normalizeResume(JSON.parse(row.data));
  }
  return (await getOfficialResume(userId))?.data ?? null;
}

export async function createResume(
  userId: number,
  name: string,
  data: ResumeData,
  opts: { official?: boolean; jobId?: number | null; notes?: string | null } = {},
) {
  const now = nowIso();
  const hasOfficial = Boolean(await get('SELECT id FROM resumes WHERE user_id = ? AND is_official = 1', userId));
  const official = opts.official ?? !hasOfficial;
  if (official) await run('UPDATE resumes SET is_official = 0 WHERE user_id = ?', userId);
  const res = await run(
    'INSERT INTO resumes (user_id, name, is_official, job_id, data, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
    userId,
    name,
    official ? 1 : 0,
    opts.jobId ?? null,
    JSON.stringify(normalizeResume(data)),
    opts.notes ?? null,
    now,
    now,
  );
  return (await getResume(userId, res.id!))!;
}

// ---------- EV ----------

const EV_SELECT = `
  SELECT e.*, c.name AS contact_name, j.title AS job_title, co.name AS company_name
  FROM evs e
  LEFT JOIN contacts c ON c.id = e.contact_id
  LEFT JOIN jobs j ON j.id = e.job_id
  LEFT JOIN companies co ON co.id = e.company_id
`;

export function listEVs(userId: number): Promise<EV[]> {
  return all<EV>(`${EV_SELECT} WHERE e.user_id = ? ORDER BY e.updated_at DESC`, userId);
}

export function getEV(userId: number, id: number): Promise<EV | undefined> {
  return get<EV>(`${EV_SELECT} WHERE e.user_id = ? AND e.id = ?`, userId, id);
}

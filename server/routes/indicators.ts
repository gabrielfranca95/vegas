import { Router } from 'express';
import type { Contact, Indicators, Platform, WeeklyPoint } from '../../shared/types.ts';
import { uid } from '../auth.ts';
import { all } from '../db.ts';
import { completedAt, computeMetrics, MESSAGES_OUT } from '../followup.ts';
import { listContacts } from '../repo.ts';
import { getSettings } from '../settings.ts';

export const indicatorsRouter = Router();

interface JobRow {
  id: number;
  platform: Platform;
  status: string;
  created_at: string;
  applied_at: string | null;
}

interface HistoryRow {
  job_id: number;
  to_status: string;
  changed_at: string;
}

/** Segunda-feira 00:00 (horário local) da semana da data. */
function weekStart(iso: string) {
  const d = new Date(iso);
  const day = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Marcos de processo (entrevista/proposta) vêm de duas fontes: a coluna do quadro e o
 * evento registrado na pessoa. Deduplica por vaga (ou pela pessoa, quando não há vaga)
 * e fica com a data mais antiga.
 */
function milestones(jobs: JobRow[], history: HistoryRow[], contacts: Contact[], column: string, eventType: 'interview' | 'offer') {
  const firstAt = new Map<string, string>();
  const add = (key: string, at: string) => {
    const prev = firstAt.get(key);
    if (!prev || at < prev) firstAt.set(key, at);
  };
  for (const h of history) if (h.to_status === column) add(`job:${h.job_id}`, h.changed_at);
  for (const j of jobs) if (j.status === column && !firstAt.has(`job:${j.id}`)) add(`job:${j.id}`, j.created_at);
  for (const c of contacts) {
    for (const e of c.events) if (e.type === eventType) add(c.job_id ? `job:${c.job_id}` : `contact:${c.id}`, e.occurred_at);
  }
  return firstAt;
}

indicatorsRouter.get('/', async (req, res) => {
  const userId = uid(req);
  const weeks = Math.min(52, Math.max(4, Number(req.query.weeks) || 12));
  const settings = await getSettings(userId);
  const contacts = await listContacts(userId);
  const jobs = await all<JobRow>('SELECT id, platform, status, created_at, applied_at FROM jobs WHERE user_id = ?', userId);
  const history = await all<HistoryRow>(
    'SELECT h.job_id, h.to_status, h.changed_at FROM job_status_history h JOIN jobs j ON j.id = h.job_id WHERE j.user_id = ?',
    userId,
  );

  const interviews = milestones(jobs, history, contacts, 'entrevista', 'interview');
  const offers = milestones(jobs, history, contacts, 'proposta', 'offer');
  const applications = new Map<number, string>();
  for (const j of jobs) if (j.applied_at) applications.set(j.id, j.applied_at);
  for (const h of history) if (h.to_status === 'aplicado' && !applications.has(h.job_id)) applications.set(h.job_id, h.changed_at);

  // ---- Série semanal ----
  const start = weekStart(new Date().toISOString());
  start.setDate(start.getDate() - 7 * (weeks - 1));
  const series: WeeklyPoint[] = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + 7 * i);
    return { weekStart: isoDay(d), invites: 0, accepted: 0, messages: 0, replies: 0, evs: 0, completed: 0, interviews: 0, offers: 0, jobsAdded: 0, applications: 0 };
  });
  const index = new Map(series.map((p, i) => [p.weekStart, i]));
  const bump = (iso: string | null | undefined, key: keyof Omit<WeeklyPoint, 'weekStart'>) => {
    if (!iso) return;
    const i = index.get(isoDay(weekStart(iso)));
    if (i !== undefined) series[i][key]++;
  };

  for (const c of contacts) {
    for (const e of c.events) {
      if (e.type === 'invite_sent') bump(e.occurred_at, 'invites');
      else if (e.type === 'invite_accepted' && e.content !== 'Já era conexão') bump(e.occurred_at, 'accepted');
      else if (e.type === 'reply_received') bump(e.occurred_at, 'replies');
      if (MESSAGES_OUT.includes(e.type)) bump(e.occurred_at, 'messages');
      if (e.type === 'ev_delivered') bump(e.occurred_at, 'evs');
    }
    bump(completedAt(c.events), 'completed');
  }
  for (const at of interviews.values()) bump(at, 'interviews');
  for (const at of offers.values()) bump(at, 'offers');
  for (const j of jobs) bump(j.created_at, 'jobsAdded');
  for (const at of applications.values()) bump(at, 'applications');

  // ---- Totais / funil ----
  const has = (c: Contact, types: string[]) => c.events.some((e) => types.includes(e.type));
  const approached = contacts.filter((c) => has(c, ['invite_sent', ...MESSAGES_OUT])).length;
  const invited = contacts.filter((c) => has(c, ['invite_sent'])).length;
  const accepted = contacts.filter((c) => c.events.some((e) => e.type === 'invite_accepted' && e.content !== 'Já era conexão')).length;
  const messaged = contacts.filter((c) => has(c, MESSAGES_OUT)).length;
  const replied = contacts.filter((c) => has(c, ['reply_received'])).length;
  const withEV = contacts.filter((c) => has(c, ['ev_delivered']));
  const completed = contacts.filter((c) => completedAt(c.events)).length;

  const perOffer = settings.goal.interactionsPerOffer || 200;
  const messagedNoEV = contacts.filter((c) => has(c, MESSAGES_OUT) && !has(c, ['ev_delivered']));
  const rate = (list: Contact[]) => {
    const r = list.filter((c) => has(c, ['reply_received'])).length;
    return { contacts: list.length, replied: r, rate: list.length ? r / list.length : null };
  };

  const platforms = [...new Set(jobs.map((j) => j.platform))];
  const byPlatform = platforms
    .map((platform) => {
      const ids = jobs.filter((j) => j.platform === platform).map((j) => j.id);
      return {
        platform,
        jobs: ids.length,
        applied: ids.filter((id) => applications.has(id)).length,
        interviews: ids.filter((id) => interviews.has(`job:${id}`)).length,
        offers: ids.filter((id) => offers.has(`job:${id}`)).length,
      };
    })
    .sort((a, b) => b.jobs - a.jobs);

  const result: Indicators = {
    goal: {
      interactionsPerOffer: perOffer,
      completed,
      offers: offers.size,
      interviews: interviews.size,
      actualPerOffer: offers.size ? completed / offers.size : null,
      expectedOffers: completed / perOffer,
    },
    funnel: [
      { key: 'approached', label: 'Pessoas abordadas', value: approached },
      { key: 'invited', label: 'Convites enviados', value: invited },
      { key: 'accepted', label: 'Aceitaram o convite', value: accepted },
      { key: 'messaged', label: 'Receberam mensagem', value: messaged },
      { key: 'ev', label: 'Receberam EV', value: withEV.length },
      { key: 'replied', label: 'Responderam', value: replied },
      { key: 'completed', label: 'Interações completas', value: completed },
      { key: 'interviews', label: 'Entrevistas', value: interviews.size },
      { key: 'offers', label: 'Propostas', value: offers.size },
    ],
    weekly: series,
    byPlatform,
    ev: { withEV: rate(withEV), withoutEV: rate(messagedNoEV) },
    metrics: computeMetrics(contacts),
  };
  res.json(result);
});

import type {
  ContactEvent,
  ContactStage,
  EventType,
  Metrics,
  MetricsBucket,
  NextAction,
  RoleCategory,
  Settings,
} from '../shared/types.ts';

const OUTBOUND: EventType[] = ['invite_sent', 'message_sent', 'followup_sent', 'ev_delivered'];
export const MESSAGES_OUT: EventType[] = ['message_sent', 'followup_sent', 'ev_delivered'];
const PROCESS: EventType[] = ['interview', 'offer'];

const DAY_MS = 86_400_000;

const byDate = (a: ContactEvent, b: ContactEvent) => a.occurred_at.localeCompare(b.occurred_at) || a.id - b.id;

/** O estágio é sempre derivado da linha do tempo, assim editar/apagar eventos mantém tudo consistente. */
export function deriveStage(events: ContactEvent[]): ContactStage {
  let stage: ContactStage = 'novo';
  let hadReply = false;
  for (const e of [...events].sort(byDate)) {
    switch (e.type) {
      case 'invite_sent':
        if (stage === 'novo') stage = 'convite_enviado';
        break;
      case 'invite_accepted':
        if (stage === 'novo' || stage === 'convite_enviado') stage = 'conectado';
        break;
      case 'message_sent':
      case 'followup_sent':
      case 'ev_delivered':
        if (stage === 'novo' || stage === 'convite_enviado' || stage === 'conectado') stage = 'aguardando';
        break;
      case 'reply_received':
      case 'interview':
      case 'offer':
        hadReply = true;
        stage = 'conversa';
        break;
      case 'closed':
        stage = 'encerrado';
        break;
      case 'reopened':
        stage = hadReply ? 'conversa' : 'aguardando';
        break;
    }
  }
  return stage;
}

const addDays = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();

const fmtDays = (n: number) => (n === 1 ? '1 dia' : `${n} dias`);

export function computeNextAction(
  contact: { stage: ContactStage; created_at: string; snooze_until: string | null },
  events: ContactEvent[],
  settings: Settings,
  now = new Date(),
): NextAction {
  const nowIso = now.toISOString();
  const sorted = [...events].sort(byDate);
  const last = (types: EventType[]) => [...sorted].reverse().find((e) => types.includes(e.type));

  if (contact.stage !== 'encerrado' && contact.snooze_until && contact.snooze_until > nowIso) {
    return {
      kind: 'snoozed',
      label: 'Lembrete adiado',
      dueAt: contact.snooze_until,
      urgent: false,
      suggestedMessage: null,
    };
  }

  const { inviteStaleDays, days, maxFollowups } = settings.followup;

  switch (contact.stage) {
    case 'novo':
      return {
        kind: 'invite',
        label: 'Enviar convite / primeira abordagem',
        dueAt: contact.created_at,
        urgent: true,
        suggestedMessage: 'invite_note',
      };

    case 'convite_enviado': {
      const sentAt = last(['invite_sent'])!.occurred_at;
      const due = addDays(sentAt, inviteStaleDays);
      if (nowIso >= due) {
        return {
          kind: 'invite_stale',
          label: `Convite sem aceite há ${fmtDays(inviteStaleDays)}+ — tente mensagem direta/outro canal`,
          dueAt: due,
          urgent: true,
          suggestedMessage: 'direct',
        };
      }
      return { kind: 'wait_invite', label: 'Aguardando aceite do convite', dueAt: due, urgent: false, suggestedMessage: null };
    }

    case 'conectado': {
      const acceptedAt = last(['invite_accepted'])?.occurred_at ?? contact.created_at;
      return {
        kind: 'first_message',
        label: 'Aceitou o convite — envie a mensagem agora',
        dueAt: acceptedAt,
        urgent: true,
        suggestedMessage: 'first_message',
      };
    }

    case 'aguardando':
    case 'conversa': {
      const lastInteraction = last([...OUTBOUND, 'reply_received', ...PROCESS]);
      if (!lastInteraction) {
        return { kind: 'invite', label: 'Enviar primeira abordagem', dueAt: contact.created_at, urgent: true, suggestedMessage: 'direct' };
      }
      if (PROCESS.includes(lastInteraction.type)) {
        return {
          kind: 'in_process',
          label: lastInteraction.type === 'offer' ? 'Proposta recebida 🎉' : 'Em processo seletivo — mantenha contato',
          dueAt: lastInteraction.occurred_at,
          urgent: false,
          suggestedMessage: null,
        };
      }
      if (lastInteraction.type === 'reply_received') {
        return {
          kind: 'reply',
          label: 'Respondeu — sua vez de responder',
          dueAt: lastInteraction.occurred_at,
          urgent: true,
          suggestedMessage: 'reply',
        };
      }
      // Toda mensagem enviada depois da primeira (desde a última resposta) conta como follow-up.
      const lastReply = last(['reply_received']);
      const outboundSince = sorted.filter(
        (e) => MESSAGES_OUT.includes(e.type) && (!lastReply || e.occurred_at > lastReply.occurred_at),
      ).length;
      const followupsDone = Math.max(0, outboundSince - 1);
      const wait = days[Math.min(followupsDone, days.length - 1)] ?? 3;
      const due = addDays(lastInteraction.occurred_at, wait);
      if (followupsDone >= maxFollowups) {
        return {
          kind: 'close_suggest',
          label: `Sem resposta após ${followupsDone} follow-up(s) — encerrar ou tentar outro contato?`,
          dueAt: due,
          urgent: nowIso >= due,
          suggestedMessage: null,
        };
      }
      if (nowIso >= due) {
        return {
          kind: 'followup',
          label: `Fazer follow-up #${followupsDone + 1} (sem resposta há ${fmtDays(wait)}+)`,
          dueAt: due,
          urgent: true,
          suggestedMessage: 'followup',
        };
      }
      return {
        kind: 'wait_reply',
        label: `Aguardando resposta · follow-up #${followupsDone + 1} em ${fmtDays(wait)}`,
        dueAt: due,
        urgent: false,
        suggestedMessage: null,
      };
    }

    case 'encerrado':
    default:
      return { kind: 'none', label: 'Encerrado', dueAt: null, urgent: false, suggestedMessage: null };
  }
}

/**
 * Data em que o ciclo de abordagem foi concluído: a primeira resposta ou o encerramento.
 * É a definição de "interação completa" usada na meta de propostas.
 */
export function completedAt(events: ContactEvent[]): string | null {
  const done = [...events].sort(byDate).find((e) => e.type === 'reply_received' || e.type === 'closed');
  return done?.occurred_at ?? null;
}

// ---------- Métricas ----------

const hoursBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

interface ContactForMetrics {
  role_category: RoleCategory;
  events: ContactEvent[];
}

function bucket(contacts: ContactForMetrics[]): MetricsBucket {
  const acceptHours: number[] = [];
  const replyHours: number[] = [];
  let invitesSent = 0;
  let invitesAccepted = 0;
  let messaged = 0;
  let replied = 0;
  let repliedAfterFollowup = 0;

  for (const c of contacts) {
    const ev = [...c.events].sort(byDate);
    const invite = ev.find((e) => e.type === 'invite_sent');
    if (invite) {
      invitesSent++;
      const accepted = ev.find((e) => e.type === 'invite_accepted' && e.occurred_at >= invite.occurred_at);
      if (accepted) {
        invitesAccepted++;
        acceptHours.push(hoursBetween(invite.occurred_at, accepted.occurred_at));
      }
    }
    const firstMsg = ev.find((e) => MESSAGES_OUT.includes(e.type));
    if (firstMsg) {
      messaged++;
      const reply = ev.find((e) => e.type === 'reply_received' && e.occurred_at >= firstMsg.occurred_at);
      if (reply) {
        replied++;
        replyHours.push(hoursBetween(firstMsg.occurred_at, reply.occurred_at));
        const followupBefore = ev.some(
          (e) => e.type === 'followup_sent' && e.occurred_at >= firstMsg.occurred_at && e.occurred_at <= reply.occurred_at,
        );
        if (followupBefore) repliedAfterFollowup++;
      }
    }
  }

  return {
    contacts: contacts.length,
    invitesSent,
    invitesAccepted,
    acceptRate: invitesSent ? invitesAccepted / invitesSent : null,
    avgAcceptHours: avg(acceptHours),
    medianAcceptHours: median(acceptHours),
    messaged,
    replied,
    replyRate: messaged ? replied / messaged : null,
    avgReplyHours: avg(replyHours),
    medianReplyHours: median(replyHours),
    repliedAfterFollowup,
  };
}

export function computeMetrics(contacts: ContactForMetrics[]): Metrics {
  const byRole: Metrics['byRole'] = {};
  const groups = new Map<RoleCategory, ContactForMetrics[]>();
  for (const c of contacts) {
    const list = groups.get(c.role_category) ?? [];
    list.push(c);
    groups.set(c.role_category, list);
  }
  for (const [role, list] of groups) byRole[role] = bucket(list);
  return { overall: bucket(contacts), byRole };
}

import type {
  Cadence,
  CadenceStep,
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

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Jornada da abordagem em etapas, com datas reais (concluídas) e previstas (atual e próximas).
 * Fase "abordagem": convite → aceite → 1ª mensagem → follow-ups → resposta.
 * Fase "conversa": depois da primeira resposta (conversa → entrevista → proposta).
 */
export function computeCadence(
  contact: { stage: ContactStage; created_at: string; snooze_until: string | null },
  events: ContactEvent[],
  settings: Settings,
  now = new Date(),
): Cadence {
  const nowIso = now.toISOString();
  const sorted = [...events].sort(byDate);
  const first = (t: EventType) => sorted.find((e) => e.type === t);
  const { inviteStaleDays, days, maxFollowups } = settings.followup;

  const invite = first('invite_sent');
  const accepted = first('invite_accepted');
  const alreadyConnected = accepted?.content === 'Já era conexão';
  const reply = first('reply_received');
  const closed = contact.stage === 'encerrado' ? [...sorted].reverse().find((e) => e.type === 'closed') : undefined;
  // Mensagens da fase de abordagem: tudo o que foi enviado antes da primeira resposta.
  const outbound = sorted.filter((e) => MESSAGES_OUT.includes(e.type) && (!reply || e.occurred_at <= reply.occurred_at));
  const direct = !invite && !accepted && outbound.length > 0;

  const steps: CadenceStep[] = [];
  const push = (s: Omit<CadenceStep, 'hint' | 'messageKind'> & Partial<Pick<CadenceStep, 'hint' | 'messageKind'>>) =>
    steps.push({ hint: null, messageKind: null, ...s });

  // 1. Convite
  if (direct || (alreadyConnected && !invite)) {
    push({ key: 'invite', label: 'Convite', status: 'skipped', at: null, dueAt: null, hint: direct ? 'Abordagem direta, sem convite' : 'Já era conexão' });
  } else {
    push({ key: 'invite', label: 'Convite', status: invite ? 'done' : 'upcoming', at: invite?.occurred_at ?? null, dueAt: invite ? null : contact.created_at, messageKind: 'invite_note' });
  }

  // 2. Aceite
  if (direct) {
    push({ key: 'accept', label: 'Aceite', status: 'skipped', at: null, dueAt: null });
  } else {
    push({
      key: 'accept',
      label: alreadyConnected ? 'Conectados' : 'Aceite',
      status: accepted ? 'done' : 'upcoming',
      at: accepted?.occurred_at ?? null,
      dueAt: !accepted && invite ? addDays(invite.occurred_at, inviteStaleDays) : null,
      hint: !accepted && invite ? `Se não aceitar até ${fmtDate(addDays(invite.occurred_at, inviteStaleDays))}, tente outro canal` : null,
    });
  }

  // 3. Primeira mensagem
  push({
    key: 'first',
    label: '1ª mensagem',
    status: outbound[0] ? 'done' : 'upcoming',
    at: outbound[0]?.occurred_at ?? null,
    dueAt: outbound[0] ? null : accepted?.occurred_at ?? null,
    messageKind: direct || (!invite && !accepted) ? 'direct' : 'first_message',
    hint: outbound[0]?.type === 'ev_delivered' ? 'Enviada junto com um EV' : null,
  });

  // 4. Follow-ups: cada um conta a partir da mensagem anterior (enviada ou prevista).
  let prevAt: string | null = outbound[0]?.occurred_at ?? null;
  for (let k = 1; k <= maxFollowups; k++) {
    const sent = outbound[k];
    const wait = days[Math.min(k - 1, days.length - 1)] ?? 3;
    const due: string | null = prevAt ? addDays(prevAt, wait) : null;
    push({
      key: `followup${k}`,
      label: `Follow-up ${k}`,
      status: sent ? 'done' : 'upcoming',
      at: sent?.occurred_at ?? null,
      dueAt: sent ? null : due,
      messageKind: 'followup',
      hint: sent?.type === 'ev_delivered' ? 'Feito com um EV' : `${wait} dia(s) após a mensagem anterior sem resposta`,
    });
    prevAt = sent?.occurred_at ?? due;
  }

  // 5. Resposta
  const lastWait = days[Math.min(maxFollowups, days.length - 1)] ?? 3;
  push({
    key: 'reply',
    label: 'Resposta',
    status: reply ? 'done' : 'upcoming',
    at: reply?.occurred_at ?? null,
    dueAt: reply ? null : prevAt ? addDays(prevAt, lastWait) : null,
    hint: reply ? null : 'Sem resposta após os follow-ups: encerre ou tente outra pessoa da empresa',
  });
  // Se a pessoa já respondeu, follow-ups que não foram enviados deixaram de ser necessários.
  if (reply) {
    for (const st of steps) {
      if (st.status === 'upcoming') {
        st.status = 'skipped';
        st.dueAt = null;
        st.hint = 'Não precisou — a pessoa respondeu';
      }
    }
  }
  const approachTotal = steps.filter((st) => st.status !== 'skipped').length;

  // Fase de conversa
  if (reply) {
    const interview = first('interview');
    const offer = first('offer');
    push({ key: 'conversa', label: 'Conversa', status: interview || offer ? 'done' : 'upcoming', at: interview || offer ? reply.occurred_at : null, dueAt: null, messageKind: 'reply' });
    push({ key: 'interview', label: 'Entrevista', status: interview ? 'done' : 'upcoming', at: interview?.occurred_at ?? null, dueAt: null });
    push({ key: 'offer', label: 'Proposta', status: offer ? 'done' : 'upcoming', at: offer?.occurred_at ?? null, dueAt: null });
  }

  // Etapa atual = primeira não concluída/pulada; encerrado marca o resto como pulado.
  let currentIndex = steps.findIndex((st) => st.status === 'upcoming');
  if (closed) {
    for (const st of steps) {
      if (st.status === 'upcoming') {
        st.status = 'skipped';
        st.dueAt = null;
        st.hint = null;
      }
    }
    steps.push({ key: 'closed', label: 'Encerrado', status: 'done', at: closed.occurred_at, dueAt: null, hint: closed.content, messageKind: null });
    currentIndex = steps.length - 1;
  } else if (currentIndex >= 0) {
    const cur = steps[currentIndex];
    cur.status = 'current';
    // Última mensagem foi uma resposta da pessoa: a vez é sua (na fase de conversa).
    if (cur.key === 'conversa') {
      const lastIn = [...sorted].reverse().find((e) => [...MESSAGES_OUT, 'reply_received'].includes(e.type));
      cur.hint = lastIn?.type === 'reply_received' ? 'A pessoa respondeu — sua vez' : 'Você respondeu — aguardando a pessoa';
      cur.dueAt = lastIn?.type === 'reply_received' ? lastIn.occurred_at : null;
    }
    if (contact.snooze_until && contact.snooze_until > nowIso) {
      cur.dueAt = contact.snooze_until;
      cur.hint = `Lembrete adiado até ${fmtDate(contact.snooze_until)}`;
    }
  } else {
    currentIndex = steps.length - 1;
  }

  const phase: Cadence['phase'] = closed ? 'encerrado' : reply ? 'conversa' : 'abordagem';
  const approachSteps = steps.slice(0, steps.findIndex((st) => st.key === 'reply') + 1).filter((st) => st.status !== 'skipped');
  const posInApproach = approachSteps.findIndex((st) => st === steps[currentIndex]);
  return {
    phase,
    steps,
    currentIndex,
    stepNumber: phase === 'abordagem' ? posInApproach + 1 : approachTotal,
    stepTotal: approachTotal,
  };
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

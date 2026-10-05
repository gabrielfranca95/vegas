import { useMemo, useRef, useState } from 'react';
import {
  AlarmClockOff,
  Briefcase,
  Check,
  Copy,
  ExternalLink,
  MessageCircleReply,
  Pencil,
  Send,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  XCircle,
  RotateCcw,
  StickyNote,
  BellRing,
  Gift,
  CalendarCheck,
  Trophy,
  FileDown,
  Plus,
} from 'lucide-react';
import type { Contact, ContactEvent, EventType, MessageKind } from '../../../shared/types';
import { EV_KINDS, EV_STATUSES, EVENT_LABELS, MESSAGE_KINDS, ROLE_CATEGORIES } from '../../../shared/types';
import { navigate } from '../App';
import { api } from '../lib/api';
import { copyText, formatDateTime, formatHours, fromLocalInput, relativeTime, toLocalInput } from '../lib/format';
import { useData } from '../lib/store';
import { useToast } from '../lib/toast';
import ContactForm from './ContactForm';
import { currentStep, DueBadge, JourneyStepper, stepStatusText, stepTitle } from './journey';
import { Badge, Button, Input, Select, Textarea } from './ui';

const EVENT_ICONS: Record<EventType, React.ReactNode> = {
  invite_sent: <UserPlus size={15} />,
  invite_accepted: <UserCheck size={15} />,
  message_sent: <Send size={15} />,
  followup_sent: <BellRing size={15} />,
  reply_received: <MessageCircleReply size={15} />,
  ev_delivered: <Gift size={15} />,
  interview: <CalendarCheck size={15} />,
  offer: <Trophy size={15} />,
  note: <StickyNote size={15} />,
  closed: <XCircle size={15} />,
  reopened: <RotateCcw size={15} />,
};

const EVENT_COLORS: Record<EventType, string> = {
  invite_sent: '#0ea5e9',
  invite_accepted: '#16a34a',
  message_sent: '#4f46e5',
  followup_sent: '#d97706',
  reply_received: '#059669',
  ev_delivered: '#c026d3',
  interview: '#0891b2',
  offer: '#ca8a04',
  note: '#64748b',
  closed: '#dc2626',
  reopened: '#7c3aed',
};

/** Evento registrado quando se marca a mensagem gerada como enviada. */
const SENT_EVENT: Record<MessageKind, EventType> = {
  invite_note: 'invite_sent',
  first_message: 'message_sent',
  ev_delivery: 'ev_delivered',
  direct: 'message_sent',
  followup: 'followup_sent',
  reply: 'message_sent',
};

export default function ContactPanel({ contact }: { contact: Contact }) {
  const { settings, upsertContact, refresh, jobs, evs } = useData();
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [kind, setKind] = useState<MessageKind>(stepKind(contact));
  const composerRef = useRef<HTMLDivElement>(null);
  const [instruction, setInstruction] = useState('');
  const [variants, setVariants] = useState<string[]>([]);
  const [activeVariant, setActiveVariant] = useState(0);
  const [text, setText] = useState(contact.draft ?? '');
  const [generating, setGenerating] = useState(false);
  const [genInfo, setGenInfo] = useState<{ warnings: string[]; evUsed: { id: number; title: string } | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [eventForm, setEventForm] = useState<{ type: EventType; content: string; at: string; evId?: number } | null>(null);

  // EVs desta pessoa primeiro, depois os da mesma vaga/empresa, depois os demais.
  const evOptions = useMemo(() => {
    const score = (e: (typeof evs)[number]) =>
      e.contact_id === contact.id ? 0 : (contact.job_id && e.job_id === contact.job_id) || (contact.company_id && e.company_id === contact.company_id) ? 1 : 2;
    return [...evs].sort((a, b) => score(a) - score(b));
  }, [evs, contact.id, contact.job_id, contact.company_id]);
  const contactEVs = evs.filter((e) => e.contact_id === contact.id);
  const [evId, setEvId] = useState<number | null>(contactEVs.find((e) => e.status !== 'entregue')?.id ?? contactEVs[0]?.id ?? null);

  const job = jobs.find((j) => j.id === contact.job_id);
  const limit = settings?.followup.inviteNoteLimit ?? 200;
  const overLimit = kind === 'invite_note' && text.length > limit;
  const role = ROLE_CATEGORIES.find((r) => r.key === contact.role_category);
  const timings = useMemo(() => computeTimings(contact.events), [contact.events]);

  const apply = async (p: Promise<Contact>, msg?: string) => {
    setBusy(true);
    try {
      const updated = await p;
      upsertContact(updated);
      refresh(['jobs']);
      if (msg) toast(msg);
      return updated;
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const addEvent = async (type: EventType, content?: string, at?: string, eventEvId?: number) => {
    const updated = await apply(api.contacts.addEvent(contact.id, { type, content, occurred_at: at, ev_id: eventEvId }), `Registrado: ${EVENT_LABELS[type]}`);
    if (updated && type === 'ev_delivered') refresh(['evs']);
    return updated;
  };

  const generate = async (kindOverride?: MessageKind) => {
    const kind_ = kindOverride ?? kind;
    setGenerating(true);
    try {
      if (kind_ === 'ev_delivery' && !evId) {
        toast('Escolha (ou crie) o EV que será entregue.', 'error');
        return;
      }
      const out = await api.contacts.generate(contact.id, kind_, instruction || undefined, kind_ === 'ev_delivery' ? evId ?? undefined : undefined);
      setVariants(out.variants);
      setGenInfo({ warnings: out.warnings ?? [], evUsed: out.evUsed ?? null });
      setActiveVariant(0);
      setText(out.variants[0] ?? '');
      if (out.notice) toast(out.notice, 'info');
      if (out.failed?.length) toast(`Gerado com ${out.model} (reserva). Indisponíveis agora:\n${out.failed.join('\n')}`, 'info');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const saveDraft = () => {
    if ((contact.draft ?? '') !== text) api.contacts.update(contact.id, { draft: text }).then(upsertContact).catch(() => {});
  };

  const copy = async () => {
    if (await copyText(text)) toast('Mensagem copiada', 'info');
  };

  const copyAndOpen = async () => {
    await copy();
    if (contact.linkedin_url) window.open(contact.linkedin_url, '_blank', 'noopener');
    else toast('Esse contato não tem link de perfil.', 'error');
  };

  const markSent = async () => {
    // A 1ª mensagem que entrega um EV é registrada como "EV entregue" (um único evento, que também conta como mensagem enviada).
    const deliveredEv = kind === 'ev_delivery' ? evId : kind === 'first_message' || kind === 'direct' ? genInfo?.evUsed?.id ?? null : null;
    const updated = await addEvent(deliveredEv ? 'ev_delivered' : SENT_EVENT[kind], text || undefined, undefined, deliveredEv ?? undefined);
    setGenInfo(null);
    if (updated) {
      setText('');
      setVariants([]);
      setKind(stepKind(updated));
    }
  };

  const snooze = (days: number) => {
    const until = new Date(Date.now() + days * 86_400_000).toISOString();
    apply(api.contacts.update(contact.id, { snooze_until: until }), `Lembrete adiado ${days === 1 ? '1 dia' : `${days} dias`}`);
  };

  const remove = async () => {
    if (!confirm(`Excluir ${contact.name} e todo o histórico?`)) return;
    await api.contacts.remove(contact.id);
    await refresh(['contacts', 'jobs']);
    navigate('mensagens');
  };

  const na = contact.nextAction;
  const cur = currentStep(contact);
  const curKind = cur.status === 'current' ? cur.messageKind : null;
  const kindLabel = (k: MessageKind) => MESSAGE_KINDS.find((m) => m.key === k)?.label ?? k;
  const openForm = (type: EventType) => setEventForm({ type, content: '', at: toLocalInput(null), evId: evId ?? undefined });

  // Atalho de registro que faz sentido na etapa atual.
  const stepAction: { label: string; run: () => void } | null =
    contact.cadence.phase === 'encerrado'
      ? { label: 'Reabrir', run: () => addEvent('reopened') }
      : cur.key === 'invite'
        ? { label: 'Já enviei o convite', run: () => addEvent('invite_sent') }
        : cur.key === 'accept'
          ? { label: 'Aceitou o convite', run: () => addEvent('invite_accepted') }
          : cur.key === 'reply'
            ? { label: 'Encerrar abordagem…', run: () => openForm('closed') }
            : cur.key === 'interview'
              ? { label: 'Registrar entrevista…', run: () => openForm('interview') }
              : cur.key === 'offer'
                ? { label: 'Registrar proposta…', run: () => openForm('offer') }
                : { label: 'A pessoa respondeu…', run: () => openForm('reply_received') };

  const writeStepMessage = (k: MessageKind) => {
    setKind(k);
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    generate(k);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-3 md:p-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 md:gap-4">
        <div className="grid size-12 shrink-0 place-items-center rounded-full bg-indigo-100 text-lg font-bold text-indigo-700">{contact.name[0]?.toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">{contact.name}</h2>
            <Badge color="#4f46e5">{stepTitle(contact)}</Badge>
            <Badge color="#0f766e">{role?.label}</Badge>
          </div>
          <p className="text-sm text-slate-600">
            {contact.role_title}
            {contact.role_title && contact.company_name && ' · '}
            {contact.company_name}
          </p>
          {job && (
            <button onClick={() => navigate('vagas', { job: job.id })} className="mt-1 flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">
              <Briefcase size={12} /> {job.title}
            </button>
          )}
          {contact.notes && <p className="mt-2 text-xs whitespace-pre-line text-slate-500">{contact.notes}</p>}
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
            {timings.accept !== null && <span>Aceitou em {formatHours(timings.accept)}</span>}
            {timings.reply !== null && <span>Respondeu em {formatHours(timings.reply)}</span>}
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-row flex-wrap gap-2 sm:w-auto sm:flex-col">
          {contact.linkedin_url && (
            <a href={contact.linkedin_url} target="_blank" rel="noreferrer">
              <Button variant="linkedin" icon={<ExternalLink size={15} />} className="w-full">
                Abrir LinkedIn
              </Button>
            </a>
          )}
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditOpen(true)}>
              Editar
            </Button>
            <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={remove} />
          </div>
        </div>
      </div>

      {/* Jornada da abordagem */}
      <div className={`rounded-xl border bg-white p-4 ${na.urgent ? 'border-red-200' : 'border-slate-200'}`}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Jornada da abordagem</p>
          <span className="text-xs text-slate-400">
            {contact.cadence.phase === 'conversa' ? 'fase: conversa' : contact.cadence.phase === 'encerrado' ? 'encerrada' : `etapa ${contact.cadence.stepNumber} de ${contact.cadence.stepTotal}`}
          </span>
        </div>
        <JourneyStepper contact={contact} />

        <div className={`mt-4 rounded-lg px-4 py-3 ${na.urgent ? 'bg-red-50' : contact.cadence.phase === 'encerrado' ? 'bg-slate-50' : 'bg-indigo-50/60'}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase ${na.urgent ? 'bg-red-600 text-white' : 'bg-slate-700 text-white'}`}>
              {na.urgent ? 'Agora' : contact.cadence.phase === 'encerrado' ? 'Fim' : 'Próximo'}
            </span>
            <p className={`font-semibold ${na.urgent ? 'text-red-800' : 'text-slate-800'}`}>{stepStatusText(contact)}</p>
            {cur.status === 'current' && <DueBadge iso={cur.dueAt} />}
          </div>
          {cur.hint && cur.status === 'current' && cur.key !== 'conversa' && <p className="mt-1 text-xs text-slate-600">{cur.hint}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {curKind && (
              <Button size="sm" variant="ai" icon={<Sparkles size={13} />} loading={generating} onClick={() => writeStepMessage(curKind)}>
                Gerar: {kindLabel(curKind)}
              </Button>
            )}
            {stepAction && (
              <Button size="sm" onClick={stepAction.run}>
                {stepAction.label}
              </Button>
            )}
            {na.kind !== 'none' && na.kind !== 'in_process' && (
              <>
                <Button size="sm" variant="ghost" icon={<AlarmClockOff size={13} />} onClick={() => snooze(1)} className="sm:ml-auto">
                  Adiar 1 dia
                </Button>
                <Button size="sm" variant="ghost" onClick={() => snooze(3)}>
                  3 dias
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Entrega de Valor */}
      <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50/40 p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Gift size={16} className="text-fuchsia-600" />
          <p className="text-sm font-semibold text-slate-800">Entrega de Valor (EV)</p>
          <span className="text-xs text-slate-500">— a contribuição que provoca a resposta</span>
          <Button size="sm" icon={<Plus size={13} />} className="ml-auto" onClick={() => navigate('ev', { contact: contact.id })}>
            Criar EV
          </Button>
        </div>
        {contactEVs.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum EV para esta pessoa ainda. Crie um (ex.: Flash Report sobre a empresa) e entregue na conversa.</p>
        ) : (
          <ul className="space-y-1.5">
            {contactEVs.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
                <span className="line-clamp-2 w-full min-w-0 font-medium text-slate-800 sm:w-auto sm:flex-1">{e.title}</span>
                <Badge color="#c026d3">{EV_KINDS.find((k) => k.key === e.kind)?.label}</Badge>
                <Badge color={e.status === 'entregue' ? '#16a34a' : '#64748b'}>{EV_STATUSES.find((x) => x.key === e.status)?.label}</Badge>
                <a href={api.evs.pdfUrl(e.id)} className="text-slate-500 hover:text-fuchsia-700" title="Baixar PDF">
                  <FileDown size={15} />
                </a>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setKind('ev_delivery');
                    setEvId(e.id);
                  }}
                >
                  Usar na mensagem
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Compositor */}
      <div ref={composerRef} className="scroll-mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-sm text-slate-600">
          {curKind ? (
            <>
              Mensagem desta etapa: <b className="text-slate-800">{kindLabel(curKind)}</b>
              {kind !== curKind && <span className="text-amber-700"> · você escolheu outro tipo abaixo</span>}
            </>
          ) : (
            'Escreva ou gere uma mensagem.'
          )}
        </p>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="w-full sm:min-w-56 sm:flex-1">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Tipo de mensagem</span>
            <Select value={kind} onChange={(e) => setKind(e.target.value as MessageKind)}>
              {MESSAGE_KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="w-full sm:min-w-64 sm:flex-[2]">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Instrução extra (opcional)</span>
            <Input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="ex.: mencionar que tenho disponibilidade imediata" onKeyDown={(e) => e.key === 'Enter' && generate()} />
          </label>
          <Button variant="ai" icon={<Sparkles size={16} />} loading={generating} onClick={() => generate()}>
            Gerar com IA
          </Button>
        </div>

        {kind === 'ev_delivery' && (
          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">EV a entregar</span>
            <Select value={evId ?? ''} onChange={(e) => setEvId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Selecione…</option>
              {evOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                  {e.contact_name && e.contact_id !== contact.id ? ` (feito para ${e.contact_name})` : ''}
                  {e.status === 'entregue' ? ' · já entregue' : ''}
                </option>
              ))}
            </Select>
            {evId && (
              <a href={api.evs.pdfUrl(evId)} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-fuchsia-700 hover:underline">
                <FileDown size={13} /> Baixar o PDF para anexar na conversa
              </a>
            )}
          </label>
        )}

        {(kind === 'first_message' || kind === 'direct') && contactEVs.length === 0 && !genInfo?.evUsed && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-fuchsia-200 bg-fuchsia-50/60 px-3 py-2 text-sm text-fuchsia-900">
            <Gift size={15} className="shrink-0" />
            <span className="flex-1">A 1ª mensagem que funcionou levava um material específico (Flash Report). Esta pessoa ainda não tem EV.</span>
            <Button size="sm" onClick={() => navigate('ev', { contact: contact.id })}>
              Criar EV
            </Button>
          </div>
        )}
        {genInfo?.evUsed && (
          <p className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-fuchsia-800">
            <Gift size={13} /> Mensagem escrita para entregar o EV “{genInfo.evUsed.title}” —
            <a href={api.evs.pdfUrl(genInfo.evUsed.id)} className="font-semibold underline">
              baixar o PDF para anexar
            </a>
          </p>
        )}
        {!!genInfo?.warnings.length && (
          <div className="mb-2 space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {genInfo.warnings.map((w, i) => (
              <p key={i}>⚠ {w}</p>
            ))}
          </div>
        )}

        {variants.length > 1 && (
          <div className="mb-2 flex gap-1">
            {variants.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  setActiveVariant(i);
                  setText(variants[i]);
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${activeVariant === i ? 'bg-violet-100 text-violet-700' : 'text-slate-500 hover:bg-slate-100'}`}
              >
                Opção {i + 1}
              </button>
            ))}
          </div>
        )}

        <Textarea rows={7} autoGrow value={text} onChange={(e) => setText(e.target.value)} onBlur={saveDraft} placeholder="Gere com IA ou escreva aqui. O rascunho fica salvo." />
        <div className="mt-1 flex justify-between text-xs">
          <span className={overLimit ? 'font-semibold text-red-600' : 'text-slate-400'}>
            {text.length} caracteres{kind === 'invite_note' && ` / limite ${limit}`}
            {overLimit && ' — encurte antes de enviar'}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button icon={<Copy size={15} />} onClick={copy} disabled={!text}>
            Copiar
          </Button>
          <Button variant="linkedin" icon={<ExternalLink size={15} />} onClick={copyAndOpen} disabled={!text}>
            Copiar e abrir LinkedIn
          </Button>
          <Button variant="success" icon={<Check size={15} />} loading={busy} onClick={markSent} className="w-full sm:ml-auto sm:w-auto">
            Marcar como enviada ({(genInfo?.evUsed && (kind === 'first_message' || kind === 'direct') ? EVENT_LABELS.ev_delivered : EVENT_LABELS[SENT_EVENT[kind]]).toLowerCase()})
          </Button>
        </div>
      </div>

      {/* Registro rápido */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Registrar o que aconteceu</p>
        <div className="flex flex-wrap gap-2">
          <QuickBtn type="invite_sent" onClick={() => addEvent('invite_sent')} />
          <QuickBtn type="invite_accepted" onClick={() => addEvent('invite_accepted')} />
          <QuickBtn type="message_sent" onClick={() => setEventForm({ type: 'message_sent', content: '', at: toLocalInput(null) })} />
          <QuickBtn type="followup_sent" onClick={() => setEventForm({ type: 'followup_sent', content: '', at: toLocalInput(null) })} />
          <QuickBtn type="reply_received" label="Respondeu…" onClick={() => setEventForm({ type: 'reply_received', content: '', at: toLocalInput(null) })} />
          <QuickBtn type="ev_delivered" label="EV entregue…" onClick={() => setEventForm({ type: 'ev_delivered', content: '', at: toLocalInput(null), evId: evId ?? undefined })} />
          <QuickBtn type="interview" label="Entrevista…" onClick={() => setEventForm({ type: 'interview', content: '', at: toLocalInput(null) })} />
          <QuickBtn type="offer" label="Proposta…" onClick={() => setEventForm({ type: 'offer', content: '', at: toLocalInput(null) })} />
          <QuickBtn type="note" label="Anotação…" onClick={() => setEventForm({ type: 'note', content: '', at: toLocalInput(null) })} />
          {contact.stage === 'encerrado' ? (
            <QuickBtn type="reopened" label="Reabrir" onClick={() => addEvent('reopened')} />
          ) : (
            <QuickBtn type="closed" label="Encerrar…" onClick={() => setEventForm({ type: 'closed', content: '', at: toLocalInput(null) })} />
          )}
        </div>
        <p className="mt-2 text-xs text-slate-400">Os botões diretos registram com a hora atual. Para outra data/hora, use os que têm “…” ou edite no histórico.</p>

        {eventForm && (
          <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap gap-2">
              <Select value={eventForm.type} onChange={(e) => setEventForm({ ...eventForm, type: e.target.value as EventType })} className="w-full sm:w-56">
                {(Object.keys(EVENT_LABELS) as EventType[]).map((t) => (
                  <option key={t} value={t}>
                    {EVENT_LABELS[t]}
                  </option>
                ))}
              </Select>
              <Input type="datetime-local" value={eventForm.at} onChange={(e) => setEventForm({ ...eventForm, at: e.target.value })} className="w-full sm:w-56" />
            </div>
            {eventForm.type === 'ev_delivered' && (
              <Select value={eventForm.evId ?? ''} onChange={(e) => setEventForm({ ...eventForm, evId: e.target.value ? Number(e.target.value) : undefined })}>
                <option value="">Qual EV foi entregue? (opcional)</option>
                {evOptions.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </Select>
            )}
            <Textarea
              rows={3}
              autoFocus
              value={eventForm.content}
              onChange={(e) => setEventForm({ ...eventForm, content: e.target.value })}
              placeholder={eventForm.type === 'reply_received' ? 'Cole aqui a resposta da pessoa — a IA usa isso para sugerir sua resposta.' : eventForm.type === 'closed' ? 'Motivo (ex.: vaga preenchida, sem resposta…)' : eventForm.type === 'offer' ? 'Detalhes da proposta (cargo, salário, prazo…)' : eventForm.type === 'interview' ? 'Com quem, quando, formato…' : 'Conteúdo / observação'}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" onClick={() => setEventForm(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                variant="primary"
                loading={busy}
                onClick={async () => {
                  const updated = await addEvent(eventForm.type, eventForm.content || undefined, fromLocalInput(eventForm.at), eventForm.evId);
                  if (updated) {
                    setEventForm(null);
                    setKind(stepKind(updated));
                  }
                }}
              >
                Registrar
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Histórico */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">Histórico</p>
        {contact.events.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma interação registrada ainda.</p>
        ) : (
          <ol className="relative space-y-3 border-l border-slate-200 pl-5">
            {[...contact.events].reverse().map((e) => (
              <TimelineItem key={e.id} event={e} onChange={(p) => apply(p)} />
            ))}
          </ol>
        )}
      </div>

      {editOpen && <ContactForm open contact={contact} onClose={() => setEditOpen(false)} />}
    </div>
  );
}

function QuickBtn({ type, label, onClick }: { type: EventType; label?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:shadow-sm"
      style={{ borderColor: `${EVENT_COLORS[type]}55`, color: EVENT_COLORS[type], backgroundColor: `${EVENT_COLORS[type]}0d` }}
    >
      {EVENT_ICONS[type]}
      {label ?? EVENT_LABELS[type]}
    </button>
  );
}

function TimelineItem({ event, onChange }: { event: ContactEvent; onChange: (p: Promise<Contact>) => void }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(event.content ?? '');
  const [at, setAt] = useState(toLocalInput(event.occurred_at));
  const color = EVENT_COLORS[event.type];

  return (
    <li className="relative">
      <span className="absolute top-0.5 -left-[29px] grid size-6 place-items-center rounded-full border-2 border-white text-white" style={{ backgroundColor: color }}>
        {EVENT_ICONS[event.type]}
      </span>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-semibold" style={{ color }}>
          {EVENT_LABELS[event.type]}
        </span>
        <span className="text-xs text-slate-400">
          {formatDateTime(event.occurred_at)} · {relativeTime(event.occurred_at)}
        </span>
        {!editing && (
          <span className="ml-auto flex gap-1">
            <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => setEditing(true)} title="Editar">
              <Pencil size={13} />
            </button>
            <button
              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
              onClick={() => confirm('Apagar este registro?') && onChange(api.contacts.removeEvent(event.id))}
              title="Apagar"
            >
              <Trash2 size={13} />
            </button>
          </span>
        )}
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="w-56" />
          <Textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                onChange(api.contacts.updateEvent(event.id, { content, occurred_at: fromLocalInput(at) }));
                setEditing(false);
              }}
            >
              Salvar
            </Button>
          </div>
        </div>
      ) : (
        event.content && <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm whitespace-pre-line text-slate-700">{event.content}</p>
      )}
    </li>
  );
}

/** Tipo de mensagem da etapa atual da jornada (ou um padrão pelo estágio). */
function stepKind(c: Contact): MessageKind {
  const cur = c.cadence.steps[c.cadence.currentIndex];
  return (cur?.status === 'current' ? cur.messageKind : null) ?? c.nextAction.suggestedMessage ?? defaultKind(c);
}

function defaultKind(c: Contact): MessageKind {
  if (c.stage === 'novo') return 'invite_note';
  if (c.stage === 'conectado' || c.stage === 'convite_enviado') return 'first_message';
  if (c.stage === 'conversa') return 'reply';
  return 'followup';
}

function computeTimings(events: ContactEvent[]) {
  const sorted = [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const hours = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
  const invite = sorted.find((e) => e.type === 'invite_sent');
  const accepted = invite && sorted.find((e) => e.type === 'invite_accepted' && e.occurred_at >= invite.occurred_at);
  const firstMsg = sorted.find((e) => e.type === 'message_sent' || e.type === 'followup_sent');
  const reply = firstMsg && sorted.find((e) => e.type === 'reply_received' && e.occurred_at >= firstMsg.occurred_at);
  return {
    accept: invite && accepted ? hours(invite.occurred_at, accepted.occurred_at) : null,
    reply: firstMsg && reply ? hours(firstMsg.occurred_at, reply.occurred_at) : null,
  };
}

import { useEffect, useRef } from 'react';
import { Check, Minus } from 'lucide-react';
import type { CadenceStep, Contact } from '../../../shared/types';
import { dueInfo, shortDate, type DueTone } from '../lib/format';

const TONE_CLASS: Record<DueTone, string> = {
  late: 'bg-red-100 text-red-700',
  today: 'bg-amber-100 text-amber-800',
  soon: 'bg-sky-100 text-sky-800',
  later: 'bg-slate-100 text-slate-600',
};

export function currentStep(c: Contact): CadenceStep {
  return c.cadence.steps[c.cadence.currentIndex];
}

/** Texto curto da etapa para listas: "Etapa 4/6 · Follow-up 1". */
export function stepTitle(c: Contact) {
  const cur = currentStep(c);
  if (c.cadence.phase === 'encerrado') return 'Encerrado';
  if (c.cadence.phase === 'conversa') return cur.key === 'conversa' ? 'Em conversa' : cur.label;
  return `Etapa ${c.cadence.stepNumber}/${c.cadence.stepTotal} · ${cur.label}`;
}

/** O que esperar/fazer na etapa atual, em linguagem direta. */
export function stepStatusText(c: Contact): string {
  const cur = currentStep(c);
  const due = cur.dueAt ? new Date(cur.dueAt).getTime() <= Date.now() : false;
  if (c.cadence.phase === 'encerrado') return cur.hint ? `Motivo: ${cur.hint}` : 'Ciclo encerrado';
  switch (cur.key) {
    case 'invite':
      return 'Enviar o convite de conexão com nota';
    case 'accept':
      return due ? 'Convite sem aceite no prazo — tente mensagem direta ou outra pessoa' : 'Aguardando a pessoa aceitar o convite';
    case 'first':
      return 'Conexão aceita — envie a 1ª mensagem agora';
    case 'reply':
      return 'Follow-ups feitos e sem resposta — encerre ou tente outra pessoa';
    case 'conversa':
      return cur.hint ?? 'Em conversa';
    case 'interview':
      return 'Em processo — registre a entrevista quando marcar';
    case 'offer':
      return 'Entrevistando — registre a proposta quando vier';
    default:
      if (cur.key.startsWith('followup')) {
        return due ? `Hora do ${cur.label.toLowerCase()} — a pessoa ainda não respondeu` : `Aguardando resposta — ${cur.label.toLowerCase()} se não responder`;
      }
      return cur.label;
  }
}

export function DueBadge({ iso, className = '' }: { iso: string | null | undefined; className?: string }) {
  const info = dueInfo(iso);
  if (!info) return null;
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${TONE_CLASS[info.tone]} ${className}`}>{info.text}</span>;
}

/** Linha do tempo horizontal da abordagem: concluído (✓), atual (destaque), próximos (com data prevista). */
export function JourneyStepper({ contact }: { contact: Contact }) {
  const { steps, currentIndex } = contact.cadence;
  const listRef = useRef<HTMLOListElement>(null);

  // Em telas estreitas a linha rola na horizontal: centraliza a etapa atual.
  useEffect(() => {
    const list = listRef.current;
    const item = list?.children[currentIndex] as HTMLElement | undefined;
    if (list && item && list.scrollWidth > list.clientWidth) {
      list.scrollLeft = item.offsetLeft - list.clientWidth / 2 + item.clientWidth / 2;
    }
  }, [currentIndex, contact.id]);

  return (
    <ol ref={listRef} className="scroll-thin relative flex gap-0 overflow-x-auto pb-1">
      {steps.map((st, i) => {
        const done = st.status === 'done';
        const current = i === currentIndex && st.status === 'current';
        const skipped = st.status === 'skipped';
        return (
          <li key={st.key} className="flex min-w-[84px] flex-1 flex-col items-center text-center" title={st.hint ?? undefined}>
            <div className="flex w-full items-center">
              <span className={`h-0.5 flex-1 ${i === 0 ? 'invisible' : done || current ? 'bg-emerald-400' : 'bg-slate-200'}`} />
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  done
                    ? 'bg-emerald-500 text-white'
                    : current
                      ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                      : skipped
                        ? 'border border-dashed border-slate-300 bg-white text-slate-300'
                        : 'border border-slate-300 bg-white text-slate-400'
                }`}
              >
                {done ? <Check size={14} /> : skipped ? <Minus size={12} /> : i + 1}
              </span>
              <span className={`h-0.5 flex-1 ${i === steps.length - 1 ? 'invisible' : done ? 'bg-emerald-400' : 'bg-slate-200'}`} />
            </div>
            <span className={`mt-1 px-1 text-[11px] leading-tight font-medium ${current ? 'text-indigo-700' : skipped ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{st.label}</span>
            <span className="text-[10px] text-slate-500">
              {done && st.at ? shortDate(st.at) : current && st.dueAt ? <DueBadge iso={st.dueAt} className="mt-0.5" /> : !skipped && st.dueAt ? `prev. ${shortDate(st.dueAt)}` : skipped ? (st.hint ? 'não precisou' : '') : ''}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

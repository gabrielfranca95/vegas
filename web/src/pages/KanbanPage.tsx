import { useMemo, useState, type DragEvent } from 'react';
import { AlertTriangle, BellRing, Download, Loader2, MapPin, MessageSquareText, Plus, RefreshCw, Search, Sparkles, Users } from 'lucide-react';
import type { Job } from '../../../shared/types';
import type { Route } from '../App';
import { navigate } from '../App';
import JobModal, { type JobModalTab } from '../components/JobModal';
import NewJobModal from '../components/NewJobModal';
import { Badge, Button, Input, PLATFORM_COLORS } from '../components/ui';
import { api } from '../lib/api';
import { relativeTime } from '../lib/format';
import { useData } from '../lib/store';
import { useToast } from '../lib/toast';

export default function KanbanPage({ route }: { route: Route }) {
  const { jobs, settings, setJobs } = useData();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<{ status: string; index: number } | null>(null);

  const openJobId = Number(route.params.get('job')) || null;
  const openJob = jobs.find((j) => j.id === openJobId) ?? null;

  const columns = settings?.kanbanColumns ?? [];
  const firstCol = columns[0]?.key ?? 'salvas';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) => `${j.title} ${j.company_name ?? ''} ${j.location ?? ''}`.toLowerCase().includes(q));
  }, [jobs, query]);

  const byColumn = useMemo(() => {
    const map = new Map<string, Job[]>(columns.map((c) => [c.key, []]));
    for (const j of filtered) {
      const key = map.has(j.status) ? j.status : firstCol;
      map.get(key)?.push(j);
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position || a.id - b.id);
    return map;
  }, [filtered, columns, firstCol]);

  const onCardDragOver = (e: DragEvent, status: string, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    setOver({ status, index: after ? index + 1 : index });
  };

  const onDrop = async (status: string) => {
    if (dragId === null || !over) return;
    const target = (byColumn.get(status) ?? []).filter((j) => j.id !== dragId);
    const sourceIndex = (byColumn.get(status) ?? []).findIndex((j) => j.id === dragId);
    let index = over.index;
    if (sourceIndex !== -1 && sourceIndex < index) index -= 1;
    const dragged = jobs.find((j) => j.id === dragId)!;
    target.splice(index, 0, dragged);
    const ids = target.map((j) => j.id);

    // Atualização otimista
    setJobs(jobs.map((j) => (ids.includes(j.id) ? { ...j, status, position: ids.indexOf(j.id) } : j)));
    setDragId(null);
    setOver(null);
    try {
      setJobs(await api.jobs.reorder(status, ids));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 px-3 py-3 md:gap-3 md:px-5">
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setNewOpen(true)}>
          Nova vaga
        </Button>
        <div className="relative min-w-0 flex-1 md:w-72 md:flex-none">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Buscar por cargo, empresa, local…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <span className="hidden text-sm text-slate-500 sm:inline">{jobs.length} vaga(s)</span>
        <span className="w-full text-xs text-slate-400 md:hidden">Deslize para ver as colunas. No celular, mude a coluna dentro do card.</span>
      </div>

      <div className="scroll-thin flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-4 md:snap-none md:px-5 md:pb-5">
        {columns.map((col) => {
          const list = byColumn.get(col.key) ?? [];
          return (
            <section
              key={col.key}
              className={`flex w-[85vw] max-w-80 shrink-0 snap-center flex-col rounded-xl bg-slate-200/60 sm:w-72 ${over?.status === col.key ? 'ring-2 ring-indigo-300' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (over?.status !== col.key) setOver({ status: col.key, index: list.length });
              }}
              onDrop={() => onDrop(col.key)}
            >
              <header className="flex items-center gap-2 px-3 pt-3 pb-2">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: col.color }} />
                <h3 className="text-sm font-semibold text-slate-700">{col.label}</h3>
                <span className="ml-auto rounded-full bg-white/70 px-2 text-xs font-medium text-slate-500">{list.length}</span>
              </header>
              <div className="scroll-thin flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-3">
                {list.map((job, i) => (
                  <div key={job.id}>
                    {over?.status === col.key && over.index === i && dragId !== job.id && <div className="mb-2 h-1 rounded bg-indigo-400" />}
                    <JobCard
                      job={job}
                      dragging={dragId === job.id}
                      onOpen={() => navigate('vagas', { job: job.id })}
                      onDragStart={() => setDragId(job.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setOver(null);
                      }}
                      onDragOver={(e) => onCardDragOver(e, col.key, i)}
                    />
                  </div>
                ))}
                {over?.status === col.key && over.index === list.length && dragId !== null && <div className="h-1 rounded bg-indigo-400" />}
              </div>
            </section>
          );
        })}
      </div>

      {newOpen && <NewJobModal onClose={() => setNewOpen(false)} />}
      {openJob && (
        <JobModal key={openJob.id} job={openJob} initialTab={(route.params.get('tab') as JobModalTab) || 'detalhes'} onClose={() => navigate('vagas')} />
      )}
    </div>
  );
}

function JobCard({
  job,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
  onDragOver,
}: {
  job: Job;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent) => void;
}) {
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onClick={onOpen}
      className={`cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-indigo-300 hover:shadow ${dragging ? 'opacity-40' : ''}`}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{job.company_name || 'Empresa?'}</p>
        <Badge color={PLATFORM_COLORS[job.platform]}>{job.platform}</Badge>
      </div>
      <p className="text-sm leading-snug font-semibold text-slate-900">{job.title || 'Vaga sem título'}</p>
      {(job.location || job.work_model) && (
        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
          <MapPin size={12} />
          {[job.work_model, job.location].filter(Boolean).join(' · ')}
        </p>
      )}
      <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
        <span className="flex items-center gap-1" title="Pessoas dessa empresa/vaga">
          <Users size={13} /> {job.contacts_count}
        </span>
        {job.urgent_contacts > 0 && (
          <span className="flex items-center gap-1 font-semibold text-red-600" title="Pessoas com ação pendente (follow-up, resposta…)">
            <BellRing size={13} /> {job.urgent_contacts}
          </span>
        )}
        <span className="ml-auto">{relativeTime(job.created_at)}</span>
      </div>
      <CardActions job={job} />
    </article>
  );
}

/** Ações rápidas do card: gerar/baixar o currículo adaptado e abrir o assistente de candidatura. */
function CardActions({ job }: { job: Job }) {
  const { refresh } = useData();
  const toast = useToast();
  const [starting, setStarting] = useState(false);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const busy = starting || (job.tailoring && job.tailoring.status !== 'error');

  const generate = async (e: React.MouseEvent) => {
    stop(e);
    if (!job.description) {
      toast('Essa vaga não tem descrição. Abra o card e busque/cole a descrição primeiro.', 'error');
      return;
    }
    setStarting(true);
    try {
      await api.jobs.tailor(job.id);
      await refresh(['jobs']);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setStarting(false);
    }
  };

  const btn = 'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition';
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2" onMouseDown={stop}>
      {busy ? (
        <span className={`${btn} bg-violet-50 text-violet-700`}>
          <Loader2 size={12} className="animate-spin" /> {job.tailoring?.status === 'queued' ? 'Na fila…' : 'Gerando CV…'}
        </span>
      ) : job.tailored_resume_id ? (
        <>
          <a href={api.resumes.exportUrl(job.tailored_resume_id, 'pdf')} onClick={stop} className={`${btn} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`} title="Baixar o currículo adaptado (PDF)">
            <Download size={12} /> CV PDF
          </a>
          <a href={api.resumes.exportUrl(job.tailored_resume_id, 'docx')} onClick={stop} className={`${btn} text-slate-500 hover:bg-slate-100`} title="Baixar em Word">
            Word
          </a>
          <button onClick={generate} className={`${btn} text-slate-400 hover:bg-slate-100 hover:text-slate-600`} title="Adaptar de novo">
            <RefreshCw size={11} />
          </button>
        </>
      ) : (
        <button
          onClick={generate}
          className={`${btn} ${job.tailoring?.status === 'error' ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-violet-600 text-white hover:bg-violet-700'}`}
          title={job.tailoring?.status === 'error' ? `Falhou: ${job.tailoring.error ?? ''} — clique para tentar de novo` : 'Gerar currículo adaptado para esta vaga'}
        >
          {job.tailoring?.status === 'error' ? <AlertTriangle size={12} /> : <Sparkles size={12} />} {job.tailoring?.status === 'error' ? 'Tentar de novo' : 'Gerar CV'}
        </button>
      )}
      <button
        onClick={(e) => {
          stop(e);
          navigate('vagas', { job: job.id, tab: 'candidatura' });
        }}
        className={`${btn} ml-auto text-indigo-700 hover:bg-indigo-50`}
        title="Perguntas do formulário e carta de apresentação"
      >
        <MessageSquareText size={12} /> Candidatura
      </button>
    </div>
  );
}

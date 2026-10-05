import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Eye, FileDown, Gift, Lightbulb, Loader2, Pencil, Plus, Send, Sparkles, Trash2 } from 'lucide-react';
import type { EV, EVIdea, EVKind, EVStatus } from '../../../shared/types';
import { EV_KINDS, EV_STATUSES } from '../../../shared/types';
import type { Route } from '../App';
import { navigate } from '../App';
import MiniMarkdown from '../components/MiniMarkdown';
import { Badge, Button, Empty, Field, Input, Select, Textarea } from '../components/ui';
import { api } from '../lib/api';
import { relativeTime } from '../lib/format';
import { useData } from '../lib/store';
import { useToast } from '../lib/toast';

const kindLabel = (k: EVKind) => EV_KINDS.find((x) => x.key === k)?.label ?? k;
const STATUS_COLORS: Record<EVStatus, string> = { ideia: '#64748b', pronto: '#2563eb', entregue: '#16a34a' };
const EFFORT_LABEL = { baixo: 'esforço baixo', medio: 'esforço médio', alto: 'esforço alto' } as const;

export default function EVPage({ route }: { route: Route }) {
  const { evs } = useData();
  const [filter, setFilter] = useState<EVStatus | 'todos'>('todos');

  const selectedId = Number(route.params.get('id')) || null;
  const selected = evs.find((e) => e.id === selectedId) ?? null;
  const creating = !selected && (route.params.has('new') || route.params.has('contact') || route.params.has('job'));

  const list = useMemo(() => evs.filter((e) => filter === 'todos' || e.status === filter), [evs, filter]);
  const detailOpen = Boolean(selected || creating);

  return (
    <div className="flex h-full min-h-0">
      <aside className={`w-full shrink-0 flex-col border-r border-slate-200 bg-white md:flex md:w-[320px] ${detailOpen ? 'hidden' : 'flex'}`}>
        <div className="space-y-3 border-b border-slate-200 p-3">
          <Button variant="primary" icon={<Plus size={16} />} className="w-full" onClick={() => navigate('ev', { new: 1 })}>
            Novo EV
          </Button>
          <div className="flex flex-wrap gap-1">
            {(['todos', ...EV_STATUSES.map((s) => s.key)] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${filter === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {k === 'todos' ? 'Todos' : EV_STATUSES.find((s) => s.key === k)?.label} <span className="opacity-70">{k === 'todos' ? evs.length : evs.filter((e) => e.status === k).length}</span>
              </button>
            ))}
          </div>
        </div>
        <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {list.length === 0 && (
            <Empty icon={<Gift size={28} />} title="Nenhum EV ainda">
              Crie uma Entrega de Valor para usar nas conversas.
            </Empty>
          )}
          {list.map((e) => (
            <li key={e.id}>
              <button
                onClick={() => navigate('ev', { id: e.id })}
                className={`w-full border-b border-slate-100 px-3 py-3 text-left ${selectedId === e.id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
              >
                <p className="line-clamp-2 text-sm font-medium text-slate-800">{e.title}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{[e.company_name, e.contact_name].filter(Boolean).join(' · ') || 'Sem vínculo'}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <Badge color="#c026d3">{kindLabel(e.kind)}</Badge>
                  <Badge color={STATUS_COLORS[e.status]}>{EV_STATUSES.find((s) => s.key === e.status)?.label}</Badge>
                  <span className="ml-auto text-[11px] text-slate-400">{relativeTime(e.updated_at)}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className={`scroll-thin min-w-0 flex-1 overflow-y-auto md:block ${detailOpen ? 'block' : 'hidden'}`}>
        {detailOpen && (
          <button
            onClick={() => navigate('ev')}
            className="sticky top-0 z-10 flex w-full items-center gap-1 border-b border-slate-200 bg-white/95 px-3 py-2 text-sm font-medium text-indigo-700 backdrop-blur md:hidden"
          >
            <ChevronLeft size={16} /> Voltar para a lista
          </button>
        )}
        {selected ? (
          <EVEditor key={selected.id} ev={selected} />
        ) : creating ? (
          <EVCreator
            key={route.params.toString()}
            initialContactId={Number(route.params.get('contact')) || null}
            initialJobId={Number(route.params.get('job')) || null}
          />
        ) : (
          <EVGuide />
        )}
      </section>
    </div>
  );
}

/** Explica o conceito e os formatos quando nada está selecionado. */
function EVGuide() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div className="rounded-xl border border-fuchsia-200 bg-white p-5">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Gift size={20} className="text-fuchsia-600" /> Entrega de Valor (EV)
        </h2>
        <p className="text-sm text-slate-600">
          Uma contribuição pequena e específica para a empresa, entregue sem ser pedida, ligada ao cargo que você quer. Ela prende a atenção, mostra sua competência na
          prática e gera vontade de retribuir — normalmente com uma resposta, uma conversa ou a porta de um processo.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {EV_KINDS.filter((k) => k.key !== 'outro').map((k) => (
          <div key={k.key} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="font-semibold text-slate-800">{k.label}</p>
            <p className="mt-1 text-sm text-slate-600">{k.hint}</p>
          </div>
        ))}
      </div>
      <Button variant="primary" icon={<Plus size={16} />} onClick={() => navigate('ev', { new: 1 })}>
        Criar um EV
      </Button>
    </div>
  );
}

function EVCreator({ initialContactId, initialJobId }: { initialContactId: number | null; initialJobId: number | null }) {
  const { contacts, jobs, companies, refresh, upsertEV } = useData();
  const toast = useToast();
  const [contactId, setContactId] = useState<number | null>(initialContactId);
  const initialContact = contacts.find((c) => c.id === initialContactId);
  const [jobId, setJobId] = useState<number | null>(initialJobId ?? initialContact?.job_id ?? null);
  const contact = contacts.find((c) => c.id === contactId);
  const job = jobs.find((j) => j.id === jobId);
  const companyName = contact?.company_name ?? job?.company_name ?? '';
  const company = companies.find((c) => c.name.toLowerCase() === companyName.toLowerCase());
  const [companyUrl, setCompanyUrl] = useState(company?.website ?? '');
  const [instruction, setInstruction] = useState('');
  const [ideas, setIdeas] = useState<EVIdea[]>([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [creatingIdx, setCreatingIdx] = useState<number | null>(null);
  const [blank, setBlank] = useState({ title: '', kind: 'flash_report' as EVKind });

  useEffect(() => {
    if (company?.website && !companyUrl) setCompanyUrl(company.website);
  }, [company?.website]); // eslint-disable-line react-hooks/exhaustive-deps

  const context = { contact_id: contactId, job_id: jobId, company: companyName || undefined, company_url: companyUrl || undefined };

  const suggest = async () => {
    setLoadingIdeas(true);
    try {
      const out = await api.evs.ideas({ ...context, instruction: instruction || undefined });
      setIdeas(out.ideas);
      if (companyUrl && !out.usedCompanySite) toast('Não consegui ler o site da empresa; as ideias usaram só a vaga e o seu perfil.', 'info');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoadingIdeas(false);
    }
  };

  const create = async (input: { title: string; kind: EVKind; summary?: string }, generate: boolean, idx: number | null) => {
    setCreatingIdx(idx);
    try {
      let ev: EV = await api.evs.create({ ...input, contact_id: contactId, job_id: jobId, company: companyName || undefined });
      if (generate) {
        const out = await api.evs.generate(ev.id, { company_url: companyUrl || undefined, instruction: instruction || undefined });
        ev = out.ev;
      }
      upsertEV(ev);
      refresh(['companies']);
      navigate('ev', { id: ev.id });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setCreatingIdx(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 md:p-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-semibold text-slate-900">Novo EV — para quem e sobre o quê?</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Pessoa que vai receber">
            <Select
              value={contactId ?? ''}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : null;
                setContactId(id);
                const c = contacts.find((x) => x.id === id);
                if (c?.job_id) setJobId(c.job_id);
              }}
            >
              <option value="">— nenhuma específica —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.company_name ? ` · ${c.company_name}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Vaga">
            <Select value={jobId ?? ''} onChange={(e) => setJobId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— nenhuma —</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.company_name ? `${j.company_name} · ` : ''}
                  {j.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Site da empresa (para a IA analisar)" hint="Página inicial, produto ou blog. Fica salvo na empresa." className="sm:col-span-2">
            <Input value={companyUrl} onChange={(e) => setCompanyUrl(e.target.value)} placeholder="https://empresa.com.br" />
          </Field>
          <Field label="Direcionamento (opcional)" className="sm:col-span-2">
            <Input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="ex.: focar em automação com IA no atendimento" />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="ai" icon={<Lightbulb size={16} />} loading={loadingIdeas} onClick={suggest}>
            Sugerir ideias de EV com IA
          </Button>
        </div>
      </div>

      {ideas.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {ideas.map((idea, i) => (
            <div key={i} className="flex flex-col rounded-xl border border-violet-200 bg-white p-4">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <Badge color="#c026d3">{kindLabel(idea.kind)}</Badge>
                <span className="text-[11px] text-slate-500">{EFFORT_LABEL[idea.effort] ?? idea.effort}</span>
              </div>
              <p className="font-semibold text-slate-900">{idea.title}</p>
              <p className="mt-1 text-sm text-slate-600">{idea.summary}</p>
              <p className="mt-2 text-xs text-violet-700">
                <b>Por que funciona:</b> {idea.whyItWorks}
              </p>
              <Button
                size="sm"
                variant="primary"
                className="mt-3 self-start"
                icon={<Sparkles size={13} />}
                loading={creatingIdx === i}
                disabled={creatingIdx !== null}
                onClick={() => create({ title: idea.title, kind: idea.kind, summary: idea.summary }, true, i)}
              >
                Usar e gerar conteúdo
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-semibold text-slate-700">Ou comece do zero</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={blank.title} onChange={(e) => setBlank({ ...blank, title: e.target.value })} placeholder="Título do EV" />
          <Select value={blank.kind} onChange={(e) => setBlank({ ...blank, kind: e.target.value as EVKind })} className="sm:w-56">
            {EV_KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </Select>
          <Button disabled={!blank.title.trim() || creatingIdx !== null} loading={creatingIdx === -1} onClick={() => create(blank, false, -1)}>
            Criar
          </Button>
        </div>
      </div>
    </div>
  );
}

function EVEditor({ ev }: { ev: EV }) {
  const { upsertEV, refresh } = useData();
  const toast = useToast();
  const [title, setTitle] = useState(ev.title);
  const [kind, setKind] = useState<EVKind>(ev.kind);
  const [status, setStatus] = useState<EVStatus>(ev.status);
  const [summary, setSummary] = useState(ev.summary ?? '');
  const [content, setContent] = useState(ev.content);
  const [mode, setMode] = useState<'edit' | 'preview'>(ev.content ? 'preview' : 'edit');
  const [instruction, setInstruction] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saveState, setSaveState] = useState<'salvo' | 'salvando' | 'pendente'>('salvo');
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaveState('pendente');
    const t = setTimeout(async () => {
      setSaveState('salvando');
      try {
        upsertEV(await api.evs.update(ev.id, { title, kind, status, summary, content }));
        setSaveState('salvo');
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, kind, status, summary, content]);

  const generate = async () => {
    if (content.trim() && !confirm('Substituir o conteúdo atual pelo gerado pela IA?')) return;
    setGenerating(true);
    try {
      const out = await api.evs.generate(ev.id, { instruction: instruction || undefined });
      first.current = true;
      setContent(out.ev.content);
      setSummary(out.ev.summary ?? '');
      setStatus(out.ev.status);
      setMode('preview');
      upsertEV(out.ev);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const remove = async () => {
    if (!confirm('Excluir este EV?')) return;
    await api.evs.remove(ev.id);
    await refresh(['evs']);
    navigate('ev');
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 md:p-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-base font-semibold" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select value={kind} onChange={(e) => setKind(e.target.value as EVKind)} className="w-full sm:w-56">
            {EV_KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value as EVStatus)} className="w-full sm:w-52">
            {EV_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
          <span className="text-xs text-slate-400">{saveState === 'salvo' ? 'Salvo' : saveState === 'salvando' ? 'Salvando…' : 'Alterações pendentes'}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
          {ev.company_name && <span>Empresa: <b>{ev.company_name}</b></span>}
          {ev.job_title && (
            <button className="text-indigo-600 hover:underline" onClick={() => navigate('vagas', { job: ev.job_id! })}>
              Vaga: {ev.job_title}
            </button>
          )}
          {ev.contact_name && (
            <button className="text-indigo-600 hover:underline" onClick={() => navigate('mensagens', { contact: ev.contact_id! })}>
              Para: {ev.contact_name}
            </button>
          )}
          {ev.delivered_at && <span className="text-emerald-700">Entregue {relativeTime(ev.delivered_at)}</span>}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <Field label="Resumo (aparece em destaque no topo do PDF)">
          <Textarea rows={2} autoGrow value={summary} onChange={(e) => setSummary(e.target.value)} />
        </Field>
        <div className="mt-4 mb-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">Conteúdo</span>
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
            <button onClick={() => setMode('edit')} className={`flex items-center gap-1 rounded-md px-2 py-1 ${mode === 'edit' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>
              <Pencil size={12} /> Editar
            </button>
            <button onClick={() => setMode('preview')} className={`flex items-center gap-1 rounded-md px-2 py-1 ${mode === 'preview' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>
              <Eye size={12} /> Visualizar
            </button>
          </div>
          <span className="text-[11px] text-slate-400">Use “## ” para seções, “- ” para tópicos e **negrito**.</span>
        </div>
        {mode === 'edit' ? (
          <Textarea rows={16} autoGrow value={content} onChange={(e) => setContent(e.target.value)} className="font-mono text-xs" />
        ) : content.trim() ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
            <MiniMarkdown text={content} />
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Sem conteúdo ainda — gere com IA ou escreva.</p>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Direcionamento para a IA (opcional)" />
          <Button variant="ai" icon={generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} disabled={generating} onClick={generate} className="shrink-0">
            {content.trim() ? 'Regerar com IA' : 'Gerar conteúdo com IA'}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <a href={api.evs.pdfUrl(ev.id)}>
          <Button variant="primary" icon={<FileDown size={15} />}>
            Baixar PDF
          </Button>
        </a>
        <a href={api.evs.pdfUrl(ev.id, true)} target="_blank" rel="noreferrer">
          <Button icon={<Eye size={15} />}>Ver PDF</Button>
        </a>
        {ev.contact_id && (
          <Button icon={<Send size={15} />} onClick={() => navigate('mensagens', { contact: ev.contact_id! })}>
            Entregar na conversa
          </Button>
        )}
        <Button variant="danger" icon={<Trash2 size={15} />} onClick={remove} className="sm:ml-auto">
          Excluir
        </Button>
      </div>
    </div>
  );
}

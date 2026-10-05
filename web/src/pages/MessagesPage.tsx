import { useEffect, useMemo, useState } from 'react';
import { BarChart3, BellRing, Building2, ChevronDown, ChevronLeft, Plus, Search, UserRound } from 'lucide-react';
import type { Contact, ContactStage, Metrics, MetricsBucket } from '../../../shared/types';
import { CONTACT_STAGES, ROLE_CATEGORIES } from '../../../shared/types';
import type { Route } from '../App';
import { navigate } from '../App';
import ContactForm from '../components/ContactForm';
import ContactPanel from '../components/ContactPanel';
import { currentStep, DueBadge, stepTitle } from '../components/journey';
import { Button, Empty, Input } from '../components/ui';
import { api } from '../lib/api';
import { formatHours, formatPct } from '../lib/format';
import { useData } from '../lib/store';

type Filter = 'acao' | 'todos' | ContactStage;

const roleLabel = (k: string) => ROLE_CATEGORIES.find((r) => r.key === k)?.label.split(' / ')[0] ?? k;

/** Ordena por urgência: ações vencidas primeiro, depois os próximos lembretes, encerrados por último. */
function sortByUrgency(a: Contact, b: Contact) {
  const rank = (c: Contact) => (c.nextAction.urgent ? 0 : c.stage === 'encerrado' ? 2 : 1);
  const r = rank(a) - rank(b);
  if (r !== 0) return r;
  const da = a.nextAction.dueAt ?? a.lastActivityAt;
  const db = b.nextAction.dueAt ?? b.lastActivityAt;
  return da.localeCompare(db);
}

export default function MessagesPage({ route }: { route: Route }) {
  const { contacts, jobs } = useData();
  const [filter, setFilter] = useState<Filter>('acao');
  const [query, setQuery] = useState('');
  const [jobFilter, setJobFilter] = useState<string>('');
  const [newOpen, setNewOpen] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  const selectedId = Number(route.params.get('contact')) || null;
  const selected = contacts.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    api.contacts.metrics().then(setMetrics).catch(() => {});
  }, [contacts]);

  const urgentCount = contacts.filter((c) => c.nextAction.urgent).length;

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const job = jobs.find((j) => String(j.id) === jobFilter);
    return contacts
      .filter((c) => (filter === 'acao' ? c.nextAction.urgent : filter === 'todos' ? true : c.stage === filter))
      .filter((c) => !job || c.job_id === job.id || (job.company_id !== null && c.company_id === job.company_id))
      .filter((c) => !q || `${c.name} ${c.company_name ?? ''} ${c.role_title ?? ''}`.toLowerCase().includes(q))
      .sort(sortByUrgency);
  }, [contacts, jobs, filter, query, jobFilter]);

  // Agrupa por empresa; empresas com ação pendente (e prazo mais próximo) primeiro.
  const groups = useMemo(() => {
    const map = new Map<string, Contact[]>();
    for (const c of list) {
      const key = c.company_name || 'Sem empresa';
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return [...map.entries()]
      .map(([company, cs]) => ({ company, contacts: cs }))
      .sort((a, b) => sortByUrgency(a.contacts[0], b.contacts[0]) || a.company.localeCompare(b.company));
  }, [list]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Se não há nada urgente, a aba "Ação agora" vazia não ajuda: mostra todos.
  useEffect(() => {
    if (filter === 'acao' && urgentCount === 0 && contacts.length > 0) setFilter('todos');
  }, [filter, urgentCount, contacts.length]);

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'acao', label: 'Ação agora', count: urgentCount },
    { key: 'todos', label: 'Todos', count: contacts.length },
    ...CONTACT_STAGES.map((s) => ({ key: s.key as Filter, label: s.label, count: contacts.filter((c) => c.stage === s.key).length })),
  ];

  return (
    <div className="flex h-full min-h-0">
      <aside className={`w-full shrink-0 flex-col border-r border-slate-200 bg-white md:flex md:w-[340px] lg:w-[380px] ${selected || showMetrics ? 'hidden' : 'flex'}`}>
        <div className="space-y-3 border-b border-slate-200 p-3">
          <div className="flex gap-2">
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setNewOpen(true)} className="flex-1">
              Nova pessoa
            </Button>
            <Button icon={<BarChart3 size={16} />} onClick={() => setShowMetrics((s) => !s)} variant={showMetrics ? 'primary' : 'secondary'}>
              Métricas
            </Button>
          </div>
          <div className="relative">
            <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Buscar nome, empresa, cargo…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-600">
            <option value="">Todas as vagas/empresas</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.company_name ? `${j.company_name} · ` : ''}
                {j.title}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  filter === f.key ? (f.key === 'acao' ? 'bg-red-600 text-white' : 'bg-indigo-600 text-white') : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f.label} <span className="opacity-70">{f.count}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {list.length === 0 && (
            <Empty icon={<UserRound size={28} />} title={contacts.length ? 'Nada neste filtro' : 'Nenhuma pessoa ainda'}>
              {contacts.length ? 'Tente outro filtro.' : 'Adicione um recrutador, líder ou alguém da empresa para começar.'}
            </Empty>
          )}
          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.company);
            const urgent = g.contacts.filter((c) => c.nextAction.urgent).length;
            return (
              <section key={g.company} className="border-b border-slate-200">
                <button
                  onClick={() =>
                    setCollapsed((set) => {
                      const next = new Set(set);
                      if (next.has(g.company)) next.delete(g.company);
                      else next.add(g.company);
                      return next;
                    })
                  }
                  className="sticky top-0 z-[1] flex w-full items-center gap-2 bg-slate-50/95 px-3 py-2 text-left backdrop-blur"
                >
                  <ChevronDown size={15} className={`shrink-0 text-slate-400 transition ${isCollapsed ? '-rotate-90' : ''}`} />
                  <Building2 size={15} className="shrink-0 text-slate-500" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{g.company}</span>
                  <span className="text-[11px] text-slate-500">{g.contacts.length} pessoa(s)</span>
                  {urgent > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{urgent}</span>}
                </button>
                {!isCollapsed && (
                  <ul>
                    {g.contacts.map((c) => {
                      const cur = currentStep(c);
                      return (
                        <li key={c.id}>
                          <button
                            onClick={() => navigate('mensagens', { contact: c.id })}
                            className={`flex w-full gap-3 border-t border-slate-100 py-2.5 pr-3 pl-5 text-left transition ${selectedId === c.id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                          >
                            <div
                              className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${c.nextAction.urgent ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}
                            >
                              {c.name[0]?.toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <p className="truncate text-sm font-medium text-slate-800">{c.name}</p>
                                <span className="shrink-0 text-[11px] text-slate-400">{roleLabel(c.role_category)}</span>
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                <span className={`text-xs ${c.nextAction.urgent ? 'font-semibold text-red-600' : 'text-slate-600'}`}>
                                  {c.nextAction.urgent && <BellRing size={11} className="mr-1 inline" />}
                                  {stepTitle(c)}
                                </span>
                                {cur.status === 'current' && <DueBadge iso={cur.dueAt} />}
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </aside>

      <section className={`scroll-thin min-w-0 flex-1 overflow-y-auto md:block ${selected || showMetrics ? 'block' : 'hidden'}`}>
        {(selected || showMetrics) && (
          <button
            onClick={() => (showMetrics ? setShowMetrics(false) : navigate('mensagens'))}
            className="sticky top-0 z-10 flex w-full items-center gap-1 border-b border-slate-200 bg-white/95 px-3 py-2 text-sm font-medium text-indigo-700 backdrop-blur md:hidden"
          >
            <ChevronLeft size={16} /> Voltar para a lista
          </button>
        )}
        {showMetrics && metrics && <MetricsPanel metrics={metrics} />}
        {selected ? (
          <ContactPanel key={selected.id} contact={selected} />
        ) : (
          !showMetrics && (
            <Empty icon={<BellRing size={32} />} title="Selecione uma pessoa">
              {urgentCount > 0 ? `Você tem ${urgentCount} ação(ões) pendente(s) — follow-ups, respostas ou mensagens a enviar.` : 'Tudo em dia por aqui.'}
            </Empty>
          )
        )}
      </section>

      {newOpen && <ContactForm open onClose={() => setNewOpen(false)} onSaved={(c) => navigate('mensagens', { contact: c.id })} />}
    </div>
  );
}

function MetricsPanel({ metrics }: { metrics: Metrics }) {
  const rows: [string, MetricsBucket][] = [
    ['Geral', metrics.overall],
    ...ROLE_CATEGORIES.filter((r) => metrics.byRole[r.key]).map((r) => [r.label, metrics.byRole[r.key]!] as [string, MetricsBucket]),
  ];
  return (
    <div className="m-3 rounded-xl border border-slate-200 bg-white p-4 md:m-5">
      <h3 className="mb-1 font-semibold text-slate-800">Métricas de abordagem</h3>
      <p className="mb-3 text-xs text-slate-500">
        Tempo de aceite = do convite ao aceite. Tempo de resposta = da primeira mensagem até a primeira resposta. Use para ajustar o momento dos follow-ups.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1 pr-3">Perfil</th>
              <th className="pr-3">Pessoas</th>
              <th className="pr-3">Convites</th>
              <th className="pr-3">Aceite</th>
              <th className="pr-3">Tempo aceite (méd / mediana)</th>
              <th className="pr-3">Msgs</th>
              <th className="pr-3">Resposta</th>
              <th className="pr-3">Tempo resposta (méd / mediana)</th>
              <th>Resp. após follow-up</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, b], i) => (
              <tr key={label} className={`border-t border-slate-100 ${i === 0 ? 'font-semibold' : ''}`}>
                <td className="py-1.5 pr-3">{label}</td>
                <td className="pr-3">{b.contacts}</td>
                <td className="pr-3">
                  {b.invitesAccepted}/{b.invitesSent}
                </td>
                <td className="pr-3">{formatPct(b.acceptRate)}</td>
                <td className="pr-3">
                  {formatHours(b.avgAcceptHours)} / {formatHours(b.medianAcceptHours)}
                </td>
                <td className="pr-3">{b.messaged}</td>
                <td className="pr-3">{formatPct(b.replyRate)}</td>
                <td className="pr-3">
                  {formatHours(b.avgReplyHours)} / {formatHours(b.medianReplyHours)}
                </td>
                <td>{b.repliedAfterFollowup}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

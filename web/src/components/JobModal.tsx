import { useState } from 'react';
import { ExternalLink, FileText, Gauge, Gift, Loader2, Mail, Plus, Sparkles, Trash2, UserRound } from 'lucide-react';
import type { Job, MatchAnalysis } from '../../../shared/types';
import { CONTACT_STAGES, ROLE_CATEGORIES } from '../../../shared/types';
import { navigate } from '../App';
import { api } from '../lib/api';
import { formatDate, relativeTime } from '../lib/format';
import { useData } from '../lib/store';
import { useToast } from '../lib/toast';
import ContactForm from './ContactForm';
import JobFields, { type JobFormState } from './JobFields';
import MatchView from './MatchView';
import { Badge, Button, Empty, Modal } from './ui';

type Tab = 'detalhes' | 'pessoas' | 'curriculo';

export default function JobModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const { contacts, resumes, refresh } = useData();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('detalhes');
  const [form, setForm] = useState<JobFormState>({
    title: job.title,
    company: job.company_name ?? '',
    url: job.url ?? '',
    platform: job.platform,
    status: job.status,
    location: job.location ?? '',
    work_model: job.work_model ?? '',
    salary: job.salary ?? '',
    apply_email: job.apply_email ?? '',
    description: job.description ?? '',
    notes: job.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [matching, setMatching] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [match, setMatch] = useState<MatchAnalysis | null>(null);
  const [changes, setChanges] = useState<string[] | undefined>();

  const related = contacts.filter((c) => c.job_id === job.id || (job.company_id && c.company_id === job.company_id));
  const jobResumes = resumes.filter((r) => r.job_id === job.id);
  const official = resumes.find((r) => r.is_official);

  const save = async () => {
    setSaving(true);
    try {
      await api.jobs.update(job.id, form);
      await refresh(['jobs', 'companies', 'contacts']);
      toast('Vaga salva');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm('Excluir esta vaga? As pessoas ligadas a ela continuam salvas.')) return;
    await api.jobs.remove(job.id);
    await refresh(['jobs', 'contacts', 'resumes']);
    onClose();
  };

  const runMatch = async () => {
    setMatching(true);
    try {
      if (form.description !== (job.description ?? '')) await api.jobs.update(job.id, { description: form.description });
      setMatch(await api.jobs.match(job.id));
      setChanges(undefined);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setMatching(false);
    }
  };

  const tailor = async () => {
    if (!official) return toast('Cadastre seu currículo oficial na aba Currículo primeiro.', 'error');
    setTailoring(true);
    try {
      if (form.description !== (job.description ?? '')) await api.jobs.update(job.id, { description: form.description });
      const out = await api.resumes.tailor(official.id, { jobId: job.id });
      setMatch(out.match);
      setChanges(out.changes);
      await refresh(['resumes', 'jobs']);
      toast('Currículo adaptado criado! Revise na aba Currículo.');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setTailoring(false);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'detalhes', label: 'Detalhes' },
    { key: 'pessoas', label: `Pessoas (${related.length})` },
    { key: 'curriculo', label: `Currículo & aderência (${jobResumes.length})` },
  ];

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-4xl"
      title={
        <span className="flex items-center gap-2">
          {job.company_name && <span className="text-slate-500">{job.company_name} ·</span>}
          {job.title || 'Vaga'}
          {job.url && (
            <a href={job.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-800" title="Abrir a vaga">
              <ExternalLink size={16} />
            </a>
          )}
          {job.apply_email && (
            <a href={`mailto:${job.apply_email}?subject=${encodeURIComponent(`Candidatura — ${job.title}`)}`} className="text-emerald-600 hover:text-emerald-800" title={`Candidatar por e-mail: ${job.apply_email}`}>
              <Mail size={16} />
            </a>
          )}
        </span>
      }
      footer={
        <>
          <Button variant="danger" icon={<Trash2 size={15} />} onClick={remove} className="mr-auto">
            Excluir
          </Button>
          <Button onClick={onClose}>Fechar</Button>
          {tab === 'detalhes' && (
            <Button variant="primary" loading={saving} onClick={save}>
              Salvar
            </Button>
          )}
        </>
      }
    >
      <div className="scroll-thin mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap ${tab === t.key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto hidden self-center text-xs whitespace-nowrap text-slate-400 sm:inline">
          Criada {relativeTime(job.created_at)}
          {job.applied_at && ` · aplicou em ${formatDate(job.applied_at)}`}
        </span>
      </div>

      {tab === 'detalhes' && <JobFields form={form} onChange={setForm} />}

      {tab === 'pessoas' && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-500">Pessoas ligadas a esta vaga ou à mesma empresa.</p>
            <div className="flex gap-2">
              <Button size="sm" icon={<Gift size={14} />} onClick={() => navigate('ev', { job: job.id })}>
                EV para esta vaga
              </Button>
              <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setContactOpen(true)}>
                Adicionar pessoa
              </Button>
            </div>
          </div>
          {related.length === 0 ? (
            <Empty icon={<UserRound size={28} />} title="Ninguém ainda">
              Adicione o recrutador, líder técnico ou alguém do time para gerar a abordagem.
            </Empty>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {related.map((c) => (
                <li key={c.id}>
                  <button onClick={() => navigate('mensagens', { contact: c.id })} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                    <div className="grid size-9 place-items-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">{c.name[0]?.toUpperCase()}</div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800">{c.name}</p>
                      <p className="text-xs text-slate-500">
                        {c.role_title || ROLE_CATEGORIES.find((r) => r.key === c.role_category)?.label}
                        {c.job_id !== job.id && ' · mesma empresa'}
                      </p>
                    </div>
                    <Badge color="#4f46e5">{CONTACT_STAGES.find((s) => s.key === c.stage)?.label}</Badge>
                    <span className={`text-xs ${c.nextAction.urgent ? 'font-semibold text-red-600' : 'text-slate-500'}`}>{c.nextAction.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {contactOpen && <ContactForm open onClose={() => setContactOpen(false)} defaults={{ jobId: job.id, company: job.company_name }} />}
        </div>
      )}

      {tab === 'curriculo' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="ai" icon={<Sparkles size={16} />} loading={tailoring} onClick={tailor}>
              {jobResumes.length ? 'Adaptar de novo (atualiza a versão)' : 'Gerar currículo adaptado para esta vaga'}
            </Button>
            <Button icon={<Gauge size={16} />} loading={matching} onClick={runMatch}>
              Analisar aderência
            </Button>
          </div>
          {!form.description && <p className="text-sm text-amber-700">Essa vaga ainda não tem descrição — preencha na aba Detalhes para a IA conseguir trabalhar.</p>}
          {job.tailoring && job.tailoring.status !== 'error' && (
            <p className="flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-800">
              <Loader2 size={15} className="animate-spin" /> {job.tailoring.status === 'queued' ? 'Na fila para adaptar o currículo…' : 'Adaptando o currículo automaticamente…'}
            </p>
          )}
          {job.tailoring?.status === 'error' && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Adaptação automática falhou: {job.tailoring.error}</p>
          )}
          <MatchView match={match} changes={changes} />
          {jobResumes.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Currículos desta vaga</p>
              <ul className="space-y-2">
                {jobResumes.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                    <FileText size={16} className="text-slate-400" />
                    <span className="flex-1 text-sm font-medium">{r.name}</span>
                    <span className="text-xs text-slate-500">{relativeTime(r.updated_at)}</span>
                    <Button size="sm" onClick={() => navigate('curriculo', { id: r.id })}>
                      Abrir
                    </Button>
                    <a className="text-xs font-medium text-indigo-600 hover:underline" href={api.resumes.exportUrl(r.id, 'pdf')}>
                      PDF
                    </a>
                    <a className="text-xs font-medium text-indigo-600 hover:underline" href={api.resumes.exportUrl(r.id, 'docx')}>
                      Word
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

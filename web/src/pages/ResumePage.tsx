import { useEffect, useRef, useState } from 'react';
import { Bot, Briefcase, ClipboardCopy, Copy, Download, Eye, EyeOff, FilePlus2, FileText, MoreHorizontal, ScanSearch, Sparkles, Star, Trash2, Upload } from 'lucide-react';
import type { MatchAnalysis, Resume, ResumeData, ResumeReview } from '../../../shared/types';
import type { Route } from '../App';
import { navigate } from '../App';
import MatchView from '../components/MatchView';
import ResumeEditor from '../components/resume/ResumeEditor';
import { ImportModal, ReviewModal, TailorModal } from '../components/resume/ResumeModals';
import ResumePreview from '../components/resume/ResumePreview';
import AutomationModal from '../components/resume/AutomationModal';
import { Button, Dropdown, Empty, Input, MenuItem, Select } from '../components/ui';
import { api } from '../lib/api';
import { copyText, relativeTime } from '../lib/format';
import { useData } from '../lib/store';
import { useToast } from '../lib/toast';

export default function ResumePage({ route }: { route: Route }) {
  const { resumes, refresh } = useData();
  const toast = useToast();
  const [importOpen, setImportOpen] = useState<null | { targetId?: number }>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [automationOpen, setAutomationOpen] = useState(false);

  const official = resumes.find((r) => r.is_official);
  const selectedId = Number(route.params.get('id')) || official?.id || resumes[0]?.id || null;
  const selected = resumes.find((r) => r.id === selectedId) ?? null;

  const setOfficial = async (id: number) => {
    await api.resumes.setOfficial(id);
    await refresh(['resumes']);
    toast('Currículo oficial atualizado — ele é a base das adaptações');
  };

  const createBlank = async () => {
    const r = await api.resumes.create({ name: resumes.length ? 'Novo currículo' : 'Currículo oficial' });
    await refresh(['resumes']);
    navigate('curriculo', { id: r.id });
  };

  if (!resumes.length) {
    return (
      <div className="grid h-full place-items-center">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <FileText size={36} className="mx-auto mb-3 text-indigo-500" />
          <h2 className="mb-1 text-lg font-semibold">Cadastre seu currículo oficial</h2>
          <p className="mb-5 text-sm text-slate-600">Ele é a base para as versões adaptadas a cada vaga e para a IA personalizar suas mensagens.</p>
          <div className="flex justify-center gap-2">
            <Button variant="ai" icon={<Upload size={16} />} onClick={() => setImportOpen({})}>
              Importar (PDF/Word/texto)
            </Button>
            <Button icon={<FilePlus2 size={16} />} onClick={createBlank}>
              Começar do zero
            </Button>
          </div>
        </div>
        {importOpen && (
          <ImportModal
            onClose={() => setImportOpen(null)}
            onDone={async (r) => {
              await refresh(['resumes']);
              navigate('curriculo', { id: r.id });
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="scroll-thin hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white md:flex">
        <div className="space-y-2 p-3">
          <Button variant="secondary" icon={<FilePlus2 size={15} />} className="w-full" onClick={createBlank}>
            Novo em branco
          </Button>
          <Button variant="secondary" icon={<Upload size={15} />} className="w-full" onClick={() => setImportOpen({})}>
            Importar currículo
          </Button>
          <Button variant="ai" icon={<Bot size={15} />} className="w-full" onClick={() => setAutomationOpen(true)}>
            Automação por vaga
          </Button>
        </div>
        <ul className="flex-1">
          {resumes.map((r) => (
            <li key={r.id} className={`flex items-start border-l-4 ${r.id === selectedId ? 'border-indigo-600 bg-indigo-50' : 'border-transparent hover:bg-slate-50'}`}>
              <button
                onClick={() => !r.is_official && setOfficial(r.id)}
                className="mt-2 ml-2 rounded p-1 hover:bg-amber-50"
                title={r.is_official ? 'Este é o currículo oficial (base das adaptações)' : 'Tornar este o currículo oficial (base das adaptações)'}
              >
                <Star size={16} className={r.is_official ? 'fill-amber-400 text-amber-400' : 'text-slate-300 hover:text-amber-400'} />
              </button>
              <button onClick={() => navigate('curriculo', { id: r.id })} className="min-w-0 flex-1 px-2 py-2.5 text-left">
                <p className="truncate text-sm font-medium text-slate-800">{r.name}</p>
                <p className="truncate text-xs text-slate-500">{r.is_official ? 'Oficial (base)' : r.job_title ? `Adaptado · ${r.company_name ?? ''}` : 'Versão'} · {relativeTime(r.updated_at)}</p>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {selected ? (
        <ResumeWorkspace key={`${selected.id}-${reloadKey}`} resume={selected} onImport={() => setImportOpen({ targetId: selected.id })} onAutomation={() => setAutomationOpen(true)} />
      ) : (
        <Empty title="Selecione um currículo" />
      )}

      {automationOpen && <AutomationModal onClose={() => setAutomationOpen(false)} />}
      {importOpen && (
        <ImportModal
          targetId={importOpen.targetId}
          onClose={() => setImportOpen(null)}
          onDone={async (r) => {
            await refresh(['resumes']);
            if (importOpen.targetId) setReloadKey((k) => k + 1);
            navigate('curriculo', { id: r.id });
          }}
        />
      )}
    </div>
  );
}

function ResumeWorkspace({ resume, onImport, onAutomation }: { resume: Resume; onImport: () => void; onAutomation: () => void }) {
  const { refresh, jobs } = useData();
  const toast = useToast();
  const [name, setName] = useState(resume.name);
  const [data, setData] = useState<ResumeData>(resume.data);
  const [status, setStatus] = useState<'salvo' | 'salvando' | 'pendente'>('salvo');
  const [showPreview, setShowPreview] = useState(true);
  const [tailorOpen, setTailorOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [review, setReview] = useState<ResumeReview | null>(null);
  const [tailorResult, setTailorResult] = useState<{ changes: string[]; match: MatchAnalysis | null } | null>(null);
  const first = useRef(true);

  // Salvamento automático (debounce)
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setStatus('pendente');
    const t = setTimeout(async () => {
      setStatus('salvando');
      try {
        await api.resumes.update(resume.id, { name, data });
        setStatus('salvo');
        refresh(['resumes']);
      } catch (e) {
        toast((e as Error).message, 'error');
        setStatus('pendente');
      }
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, data]);

  const runReview = async () => {
    setReviewing(true);
    try {
      setReview(await api.resumes.review(resume.id));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setReviewing(false);
    }
  };

  const duplicate = async () => {
    const r = await api.resumes.create({ name: `${name} (cópia)`, fromId: resume.id, official: false });
    await refresh(['resumes']);
    navigate('curriculo', { id: r.id });
  };

  const makeOfficial = async () => {
    await api.resumes.setOfficial(resume.id);
    await refresh(['resumes']);
    toast('Definido como currículo oficial');
  };

  const remove = async () => {
    if (!confirm(`Excluir "${name}"?`)) return;
    await api.resumes.remove(resume.id);
    await refresh(['resumes', 'jobs']);
    navigate('curriculo');
  };

  const linkJob = async (value: string) => {
    await api.resumes.update(resume.id, { job_id: value ? Number(value) : null });
    await refresh(['resumes', 'jobs']);
  };

  const ensureSaved = async () => {
    if (status !== 'salvo') await api.resumes.update(resume.id, { name, data });
  };

  const download = async (format: 'pdf' | 'docx') => {
    await ensureSaved();
    window.location.href = api.resumes.exportUrl(resume.id, format);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2.5 md:px-4">
        <MobileResumePicker currentId={resume.id} />
        {resume.is_official && <Star size={16} className="fill-amber-400 text-amber-400" />}
        <Input value={name} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1 font-semibold md:w-72 md:flex-none" />
        <Select value={data.lang} onChange={(e) => setData({ ...data, lang: e.target.value as 'pt' | 'en' })} className="w-20" title="Idioma dos títulos das seções">
          <option value="pt">PT</option>
          <option value="en">EN</option>
        </Select>
        <span className="text-xs text-slate-400">{status === 'salvo' ? 'Salvo' : status === 'salvando' ? 'Salvando…' : 'Alterações pendentes'}</span>

        <div className="flex w-full flex-wrap items-center gap-2 md:ml-auto md:w-auto">
          {!resume.is_official && (
            <Button icon={<Star size={15} />} onClick={makeOfficial} title="Torna este currículo a base das adaptações">
              Usar como oficial
            </Button>
          )}
          <Button variant="ai" icon={<Sparkles size={15} />} onClick={() => setTailorOpen(true)}>
            Adaptar para vaga
          </Button>
          <Button icon={<ScanSearch size={15} />} loading={reviewing} onClick={runReview}>
            Revisão IA
          </Button>
          <Button icon={<ClipboardCopy size={15} />} onClick={async () => (await copyText(resumeToText(data))) && toast('Currículo copiado como texto', 'info')}>
            Copiar texto
          </Button>
          <Button icon={<Download size={15} />} onClick={() => download('pdf')}>
            PDF
          </Button>
          <Button icon={<Download size={15} />} onClick={() => download('docx')}>
            Word
          </Button>
          <Button variant="ghost" icon={showPreview ? <EyeOff size={15} /> : <Eye size={15} />} onClick={() => setShowPreview((s) => !s)} title="Mostrar/ocultar prévia" />
          <Dropdown align="right" trigger={(toggle) => <Button variant="ghost" icon={<MoreHorizontal size={16} />} onClick={toggle} />}>
            {(close) => (
              <>
                {!resume.is_official && (
                  <MenuItem icon={<Star size={15} />} onClick={() => (close(), makeOfficial())}>
                    Tornar oficial
                  </MenuItem>
                )}
                <MenuItem icon={<Bot size={15} />} onClick={() => (close(), onAutomation())}>
                  Automação por vaga
                </MenuItem>
                <MenuItem icon={<Copy size={15} />} onClick={() => (close(), duplicate())}>
                  Duplicar
                </MenuItem>
                <MenuItem icon={<Upload size={15} />} onClick={() => (close(), onImport())}>
                  Importar e substituir conteúdo
                </MenuItem>
                <MenuItem icon={<Eye size={15} />} onClick={() => (close(), ensureSaved().then(() => window.open(api.resumes.exportUrl(resume.id, 'pdf', true), '_blank')))}>
                  Ver PDF em nova aba
                </MenuItem>
                <MenuItem icon={<Trash2 size={15} />} onClick={() => (close(), remove())}>
                  Excluir
                </MenuItem>
              </>
            )}
          </Dropdown>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="scroll-thin min-w-0 flex-1 overflow-y-auto p-3 md:p-4">
          <div className="mx-auto max-w-3xl space-y-4">
            {!resume.is_official && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm">
                <Briefcase size={15} className="text-slate-400" />
                <span className="text-slate-600">Vaga vinculada:</span>
                <Select value={resume.job_id ?? ''} onChange={(e) => linkJob(e.target.value)} className="min-w-0 flex-1">
                  <option value="">— nenhuma —</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.company_name ? `${j.company_name} · ` : ''}
                      {j.title}
                    </option>
                  ))}
                </Select>
                {resume.job_id && (
                  <Button size="sm" onClick={() => navigate('vagas', { job: resume.job_id! })}>
                    Abrir card
                  </Button>
                )}
              </div>
            )}
            {tailorResult && <MatchView match={tailorResult.match} changes={tailorResult.changes} />}
            {!tailorResult && resume.notes && (
              <details open={resume.notes.startsWith('Revisar')} className="rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-2.5 text-sm">
                <summary className="cursor-pointer font-medium text-violet-800">
                  Notas da adaptação{resume.notes.startsWith('Revisar') && <span className="ml-1 text-amber-700">· tem itens para revisar</span>}
                </summary>
                <p className="mt-2 whitespace-pre-line text-slate-700">{resume.notes}</p>
              </details>
            )}
            <ResumeEditor resumeId={resume.id} data={data} onChange={setData} />
          </div>
        </div>
        {showPreview && (
          <div className="scroll-thin hidden w-[46%] max-w-[700px] shrink-0 overflow-y-auto border-l border-slate-200 bg-slate-200/60 p-5 xl:block">
            <ResumePreview data={data} />
          </div>
        )}
      </div>

      {tailorOpen && (
        <TailorModal
          base={{ ...resume, name, data }}
          onClose={() => setTailorOpen(false)}
          onDone={(out) => {
            try {
              sessionStorage.setItem(`tailor-${out.resume.id}`, JSON.stringify({ changes: out.changes, match: out.match }));
            } catch {
              /* sessionStorage indisponível */
            }
            navigate('curriculo', { id: out.resume.id });
          }}
        />
      )}
      {review && <ReviewModal review={review} onClose={() => setReview(null)} />}
      <TailorResultLoader resumeId={resume.id} onLoad={setTailorResult} />
    </div>
  );
}

/** Mostra o resultado da adaptação logo após criar a nova versão. */
function TailorResultLoader({ resumeId, onLoad }: { resumeId: number; onLoad: (v: { changes: string[]; match: MatchAnalysis | null }) => void }) {
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`tailor-${resumeId}`);
      if (raw) {
        onLoad(JSON.parse(raw));
        sessionStorage.removeItem(`tailor-${resumeId}`);
      }
    } catch {
      /* sessionStorage indisponível */
    }
  }, [resumeId, onLoad]);
  return null;
}

/** No celular a lista lateral some; este seletor troca de currículo. */
function MobileResumePicker({ currentId }: { currentId: number }) {
  const { resumes } = useData();
  return (
    <Select
      value={currentId}
      onChange={(e) => navigate('curriculo', { id: e.target.value })}
      className="w-full md:hidden"
    >
      {resumes.map((r) => (
        <option key={r.id} value={r.id}>
          {r.is_official ? '★ ' : ''}
          {r.name}
        </option>
      ))}
    </Select>
  );
}

/** Versão em texto simples do currículo (para colar em formulários e e-mails). */
function resumeToText(d: ResumeData): string {
  const L = d.lang === 'en'
    ? { summary: 'PROFESSIONAL SUMMARY', exp: 'PROFESSIONAL EXPERIENCE', projects: 'PROJECTS', skills: 'SKILLS', edu: 'EDUCATION', certs: 'CERTIFICATIONS', langs: 'LANGUAGES', current: 'Present', closing: 'PROFESSIONAL PHILOSOPHY' }
    : { summary: 'RESUMO PROFISSIONAL', exp: 'EXPERIÊNCIA PROFISSIONAL', projects: 'PROJETOS', skills: 'HABILIDADES', edu: 'FORMAÇÃO ACADÊMICA', certs: 'CERTIFICAÇÕES', langs: 'IDIOMAS', current: 'Atual', closing: 'FILOSOFIA PROFISSIONAL' };
  const p = d.personal;
  const bullets = (t: string) => t.split('\n').map((l) => l.replace(/^\s*[-•*–]\s*/, '').trim()).filter(Boolean).map((l) => `• ${l}`);
  const out: string[] = [p.name, p.headline, [p.location, p.phone, p.email, p.linkedin, p.github, p.website].filter((x) => x.trim()).join(' | ')].filter(Boolean);
  const section = (title: string, lines: string[]) => lines.length && out.push('', title, ...lines);
  section(L.summary, d.summary.trim() ? [d.summary.trim()] : []);
  section(L.exp, d.experiences.flatMap((e) => [`${[e.role, e.company].filter(Boolean).join(' — ')} (${[e.start, e.current ? L.current : e.end].filter(Boolean).join(' – ')})`, ...bullets(e.description), '']));
  section(L.projects, d.projects.flatMap((x) => [x.name + (x.link ? ` — ${x.link}` : ''), ...bullets(x.description)]));
  section(L.skills, d.skills.map((s) => (s.category ? `${s.category}: ${s.items}` : s.items)));
  section(L.edu, d.education.map((e) => `${[e.degree, e.institution].filter(Boolean).join(' — ')} (${[e.start, e.end].filter(Boolean).join(' – ')})`));
  section(L.certs, d.certifications.map((c) => [c.name, c.issuer, c.year].filter(Boolean).join(' — ')));
  section(L.langs, d.languages.length ? [d.languages.map((l) => (l.level ? `${l.name} (${l.level})` : l.name)).join(' • ')] : []);
  if (d.closing?.text.trim()) section(d.closing.title.trim().toUpperCase() || L.closing, [d.closing.text.trim()]);
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

import { useState } from 'react';
import { Sparkles, Upload } from 'lucide-react';
import type { MatchAnalysis, Resume, ResumeReview } from '../../../../shared/types';
import { api } from '../../lib/api';
import { fileToBase64 } from '../../lib/format';
import { useData } from '../../lib/store';
import { useToast } from '../../lib/toast';
import { Badge, Button, Field, Input, Modal, Select, Textarea } from '../ui';

export function ImportModal({ targetId, onClose, onDone }: { targetId?: number; onClose: () => void; onDone: (r: Resume) => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!file && !text.trim()) return toast('Escolha um arquivo ou cole o texto.', 'error');
    setLoading(true);
    try {
      const body = file ? { fileBase64: await fileToBase64(file), filename: file.name } : { text };
      const r = await api.resumes.import({ ...body, targetId });
      toast('Currículo importado! Revise os campos.');
      onDone(r);
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={targetId ? 'Importar e substituir este currículo' : 'Importar currículo'}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="ai" icon={<Sparkles size={15} />} loading={loading} onClick={run}>
            Importar com IA
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">A IA lê seu currículo atual e preenche os campos estruturados. Nada é inventado — revise depois.</p>
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-6 text-sm text-slate-500 hover:border-indigo-400 hover:bg-indigo-50/40">
        <Upload size={22} />
        {file ? <span className="font-medium text-slate-800">{file.name}</span> : 'Clique para escolher um PDF, DOCX ou TXT'}
        <input type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <p className="my-3 text-center text-xs text-slate-400">— ou cole o texto —</p>
      <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} disabled={!!file} placeholder="Cole aqui o conteúdo do seu currículo" />
    </Modal>
  );
}

export function TailorModal({
  base,
  onClose,
  onDone,
}: {
  base: Resume;
  onClose: () => void;
  onDone: (out: { resume: Resume; changes: string[]; match: MatchAnalysis | null }) => void;
}) {
  const { jobs, refresh } = useData();
  const toast = useToast();
  const [mode, setMode] = useState<'link' | 'card' | 'texto'>('link');
  const [url, setUrl] = useState('');
  const [jobId, setJobId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const body = mode === 'card' ? { jobId: Number(jobId) } : mode === 'link' ? { url } : { title, company, description };
      const out = await api.resumes.tailor(base.id, body);
      await refresh(['resumes', 'jobs', 'companies']);
      toast('Versão adaptada criada e vinculada à vaga no quadro.');
      onDone(out);
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const valid = mode === 'card' ? !!jobId : mode === 'link' ? /^https?:\/\//.test(url.trim()) : description.trim().length > 50;

  return (
    <Modal
      open
      onClose={onClose}
      title="Adaptar currículo para uma vaga"
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="ai" icon={<Sparkles size={15} />} loading={loading} disabled={!valid} onClick={run}>
            Gerar versão adaptada
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        Base: <b>{base.name}</b>. Uma nova versão será criada (o original não muda) e vinculada ao card da vaga no quadro.
      </p>
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
        {(
          [
            ['link', 'Colar link da vaga'],
            ['card', 'Vaga do quadro'],
            ['texto', 'Colar descrição'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setMode(k)} className={`flex-1 rounded-md px-3 py-1.5 font-medium ${mode === k ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'}`}>
            {l}
          </button>
        ))}
      </div>
      {mode === 'link' && (
        <Field label="Link da vaga" hint="LinkedIn (linkedin.com/jobs/view/…), Gupy ou outro site. Se não estiver no quadro, um card é criado em “Salvas”.">
          <Input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </Field>
      )}
      {mode === 'card' && (
        <Field label="Vaga">
          <Select value={jobId} onChange={(e) => setJobId(e.target.value)}>
            <option value="">Selecione…</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id} disabled={!j.description}>
                {j.company_name ? `${j.company_name} · ` : ''}
                {j.title}
                {!j.description ? ' (sem descrição)' : ''}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {mode === 'texto' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Cargo">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Empresa">
            <Input value={company} onChange={(e) => setCompany(e.target.value)} />
          </Field>
          <Field label="Descrição da vaga" className="sm:col-span-2">
            <Textarea rows={8} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
      )}
      {loading && <p className="mt-3 text-xs text-slate-500">Isso pode levar até 1 minuto…</p>}
    </Modal>
  );
}

const SEVERITY_COLORS = { alta: '#dc2626', media: '#d97706', baixa: '#64748b' };

export function ReviewModal({ review, onClose }: { review: ResumeReview; onClose: () => void }) {
  const color = review.score >= 75 ? '#16a34a' : review.score >= 50 ? '#d97706' : '#dc2626';
  return (
    <Modal open onClose={onClose} title="Revisão geral do currículo" width="max-w-3xl" footer={<Button onClick={onClose}>Fechar</Button>}>
      <div className="mb-4 flex items-center gap-4">
        <div className="grid size-16 shrink-0 place-items-center rounded-full border-4 text-xl font-bold" style={{ borderColor: color, color }}>
          {review.score}
        </div>
        <p className="text-sm text-slate-700">{review.summary}</p>
      </div>
      <ul className="space-y-2">
        {[...(review.items ?? [])]
          .sort((a, b) => ['alta', 'media', 'baixa'].indexOf(a.severity) - ['alta', 'media', 'baixa'].indexOf(b.severity))
          .map((it, i) => (
            <li key={i} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-1 flex items-center gap-2">
                <Badge color={SEVERITY_COLORS[it.severity] ?? '#64748b'}>{it.severity}</Badge>
                <span className="text-xs font-semibold text-slate-500 uppercase">{it.section}</span>
              </div>
              <p className="text-sm text-slate-800">{it.issue}</p>
              <p className="mt-1 text-sm text-emerald-700">→ {it.suggestion}</p>
            </li>
          ))}
      </ul>
    </Modal>
  );
}

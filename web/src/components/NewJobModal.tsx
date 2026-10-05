import { useState } from 'react';
import { AlertTriangle, Link2, Wand2 } from 'lucide-react';
import { navigate } from '../App';
import { api } from '../lib/api';
import { useData } from '../lib/store';
import { useToast } from '../lib/toast';
import JobFields, { emptyJobForm, type JobFormState } from './JobFields';
import { Button, Field, Input, Modal } from './ui';

export default function NewJobModal({ onClose }: { onClose: () => void }) {
  const { settings, refresh } = useData();
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [form, setForm] = useState<JobFormState>(emptyJobForm(settings?.kanbanColumns[0]?.key));
  const [loadingScrape, setLoadingScrape] = useState(false);
  const [saving, setSaving] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<number | null>(null);
  const [fetched, setFetched] = useState(false);

  const scrape = async () => {
    if (!url.trim()) return;
    setLoadingScrape(true);
    setWarning(null);
    try {
      const s = await api.jobs.scrape(url);
      setExistingId(s.existingJobId);
      setForm((f) => ({
        ...f,
        url: s.url || url,
        platform: s.platform,
        title: s.title || f.title,
        company: s.company || f.company,
        location: s.location || f.location,
        work_model: s.workModel || f.work_model,
        description: s.description || f.description,
        apply_email: s.applyEmail || f.apply_email,
      }));
      setWarning(s.warning ?? null);
      setFetched(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoadingScrape(false);
    }
  };

  const save = async () => {
    if (!form.title.trim() && !form.company.trim()) return toast('Preencha ao menos o cargo ou a empresa.', 'error');
    setSaving(true);
    try {
      const job = await api.jobs.create({ ...form, url: form.url || url || null });
      await refresh(['jobs', 'companies']);
      toast('Vaga adicionada ao quadro');
      onClose();
      navigate('vagas', { job: job.id });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Nova vaga"
      width="max-w-3xl"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={saving} onClick={save}>
            Adicionar ao quadro
          </Button>
        </>
      }
    >
      <Field label="Link da vaga (LinkedIn, Gupy, RioVagas, Vagas.com, Indeed ou outro site)">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Link2 size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <Input
              autoFocus
              className="pl-9"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && scrape()}
              placeholder="Link do LinkedIn, Gupy, RioVagas, Vagas.com, Indeed…"
            />
          </div>
          <Button variant="primary" icon={<Wand2 size={16} />} loading={loadingScrape} onClick={scrape}>
            Buscar dados
          </Button>
        </div>
      </Field>

      {existingId && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle size={16} /> Essa vaga já está no quadro.
          <button className="font-semibold underline" onClick={() => (onClose(), navigate('vagas', { job: existingId }))}>
            Abrir
          </button>
        </div>
      )}
      {warning && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle size={16} className="shrink-0" /> {warning}
        </div>
      )}

      <div className="mt-4 border-t border-slate-200 pt-4">
        {!fetched && <p className="mb-3 text-xs text-slate-500">Cole o link e clique em “Buscar dados”, ou preencha manualmente.</p>}
        <JobFields form={form} onChange={setForm} />
      </div>
    </Modal>
  );
}

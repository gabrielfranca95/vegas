import type { Platform } from '../../../shared/types';
import { PLATFORMS } from '../../../shared/types';
import { useData } from '../lib/store';
import { Field, Input, Select, Textarea } from './ui';

export interface JobFormState {
  title: string;
  company: string;
  url: string;
  platform: Platform;
  status: string;
  location: string;
  work_model: string;
  salary: string;
  apply_email: string;
  description: string;
  notes: string;
}

export const emptyJobForm = (status = 'salvas'): JobFormState => ({
  title: '',
  company: '',
  url: '',
  platform: 'linkedin',
  status,
  location: '',
  work_model: '',
  salary: '',
  apply_email: '',
  description: '',
  notes: '',
});

export default function JobFields({ form, onChange }: { form: JobFormState; onChange: (f: JobFormState) => void }) {
  const { settings, companies } = useData();
  const set = <K extends keyof JobFormState>(k: K, v: JobFormState[K]) => onChange({ ...form, [k]: v });

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Cargo">
        <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Desenvolvedor Frontend Pleno" />
      </Field>
      <Field label="Empresa">
        <Input list="companies-list-job" value={form.company} onChange={(e) => set('company', e.target.value)} />
        <datalist id="companies-list-job">
          {companies.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
      </Field>
      <Field label="Plataforma">
        <Select value={form.platform} onChange={(e) => set('platform', e.target.value as Platform)}>
          {PLATFORMS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Coluna">
        <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
          {settings?.kanbanColumns.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Local">
        <Input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="São Paulo, SP" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Modelo">
          <Select value={form.work_model} onChange={(e) => set('work_model', e.target.value)}>
            <option value="">—</option>
            <option value="remoto">Remoto</option>
            <option value="híbrido">Híbrido</option>
            <option value="presencial">Presencial</option>
          </Select>
        </Field>
        <Field label="Salário">
          <Input value={form.salary} onChange={(e) => set('salary', e.target.value)} placeholder="R$ / faixa" />
        </Field>
      </div>
      <Field label="E-mail para candidatura" hint="Preenchido automaticamente quando a vaga pede “envie seu currículo para…”" className="sm:col-span-2">
        <Input type="email" value={form.apply_email} onChange={(e) => set('apply_email', e.target.value)} placeholder="rh@empresa.com.br" />
      </Field>
      <Field label="Descrição da vaga" className="sm:col-span-2" hint="Usada pela IA para adaptar o currículo e as mensagens.">
        <Textarea rows={8} value={form.description} onChange={(e) => set('description', e.target.value)} className="font-mono text-xs" />
      </Field>
      <Field label="Minhas anotações" className="sm:col-span-2">
        <Textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </div>
  );
}

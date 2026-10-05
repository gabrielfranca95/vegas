import { useState } from 'react';
import type { Contact, Platform, RoleCategory } from '../../../shared/types';
import { PLATFORMS, ROLE_CATEGORIES } from '../../../shared/types';
import { api, type ContactInput } from '../lib/api';
import { useData } from '../lib/store';
import { useToast } from '../lib/toast';
import { Button, Field, Input, Modal, Select, Textarea } from './ui';

interface Props {
  open: boolean;
  onClose: () => void;
  contact?: Contact | null;
  defaults?: { jobId?: number | null; company?: string | null };
  onSaved?: (c: Contact) => void;
}

export default function ContactForm({ open, onClose, contact, defaults, onSaved }: Props) {
  const { jobs, companies, refresh, upsertContact } = useData();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    name: contact?.name ?? '',
    linkedin_url: contact?.linkedin_url ?? '',
    role_category: (contact?.role_category ?? 'recrutador') as RoleCategory,
    role_title: contact?.role_title ?? '',
    company: contact?.company_name ?? defaults?.company ?? '',
    job_id: contact?.job_id ?? defaults?.jobId ?? null,
    platform: (contact?.platform ?? 'linkedin') as Platform,
    notes: contact?.notes ?? '',
    already_connected: false,
  }));

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const onJobChange = (value: string) => {
    const id = value ? Number(value) : null;
    const job = jobs.find((j) => j.id === id);
    setForm((f) => ({ ...f, job_id: id, company: job?.company_name ?? f.company }));
  };

  const jobsForCompany = form.company
    ? [...jobs].sort((a, b) => Number(b.company_name?.toLowerCase() === form.company.toLowerCase()) - Number(a.company_name?.toLowerCase() === form.company.toLowerCase()))
    : jobs;

  const save = async () => {
    if (!form.name.trim()) return toast('Informe o nome.', 'error');
    setSaving(true);
    try {
      const payload: ContactInput = { ...form, job_id: form.job_id };
      const saved = contact ? await api.contacts.update(contact.id, payload) : await api.contacts.create(payload);
      upsertContact(saved);
      await refresh(['jobs', 'companies']);
      toast(contact ? 'Contato atualizado' : 'Contato adicionado');
      onSaved?.(saved);
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={contact ? `Editar ${contact.name}` : 'Nova pessoa'}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={saving} onClick={save}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nome *">
          <Input autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Maria Souza" />
        </Field>
        <Field label="Perfil do LinkedIn (link)" hint="Pode colar o link completo ou só o usuário">
          <Input value={form.linkedin_url} onChange={(e) => set('linkedin_url', e.target.value)} placeholder="linkedin.com/in/maria-souza" />
        </Field>
        <Field label="Tipo de pessoa (define a abordagem)">
          <Select value={form.role_category} onChange={(e) => set('role_category', e.target.value as RoleCategory)}>
            {ROLE_CATEGORIES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cargo exato">
          <Input value={form.role_title} onChange={(e) => set('role_title', e.target.value)} placeholder="Tech Recruiter, Engineering Manager…" />
        </Field>
        <Field label="Empresa">
          <Input list="companies-list" value={form.company} onChange={(e) => set('company', e.target.value)} placeholder="Nome da empresa" />
          <datalist id="companies-list">
            {companies.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </Field>
        <Field label="Vaga relacionada">
          <Select value={form.job_id ?? ''} onChange={(e) => onJobChange(e.target.value)}>
            <option value="">— nenhuma / interesse geral —</option>
            {jobsForCompany.map((j) => (
              <option key={j.id} value={j.id}>
                {j.company_name ? `${j.company_name} · ` : ''}
                {j.title || 'Sem título'}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Canal">
          <Select value={form.platform} onChange={(e) => set('platform', e.target.value as Platform)}>
            {PLATFORMS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        {!contact && (
          <label className="mt-6 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.already_connected} onChange={(e) => set('already_connected', e.target.checked)} className="size-4 accent-indigo-600" />
            Já é minha conexão (pular convite)
          </label>
        )}
        <Field label="Anotações sobre a pessoa" className="sm:col-span-2" hint="A IA usa isso para personalizar (ex.: postou sobre X, estudou na Y, vaga que ela divulgou…)">
          <Textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

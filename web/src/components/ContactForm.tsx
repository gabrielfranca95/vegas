import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardPaste, Wand2 } from 'lucide-react';
import type { Contact, Platform, ProfileData, RoleCategory } from '../../../shared/types';
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

  // ---- Leitura do perfil do LinkedIn ----
  const [fetching, setFetching] = useState(false);
  const [found, setFound] = useState<{ profile: ProfileData; existingContactId: number | null; jobTitle: string | null } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const lastFetched = useRef('');

  const applyProfile = (out: Awaited<ReturnType<typeof api.contacts.parseProfile>>) => {
    const p = out.profile;
    setForm((f) => ({
      ...f,
      linkedin_url: p.url || f.linkedin_url,
      name: p.name || f.name,
      role_title: p.roleTitle || p.headline || f.role_title,
      company: p.company || f.company,
      role_category: p.roleTitle || p.headline ? p.roleCategory : f.role_category,
      job_id: f.job_id ?? out.suggestedJob?.id ?? null,
      notes: f.notes.trim() ? f.notes : out.notes,
    }));
    setFound({ profile: p, existingContactId: contact ? null : out.existingContactId, jobTitle: out.suggestedJob?.title ?? null });
    if (p.warning) setPasteOpen(true);
  };

  const fetchProfile = async (url = form.linkedin_url) => {
    if (!/linkedin\.com\/in\//i.test(url) || lastFetched.current === url) return;
    lastFetched.current = url;
    setFetching(true);
    try {
      applyProfile(await api.contacts.parseProfile({ url }));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setFetching(false);
    }
  };

  const extractFromText = async () => {
    setFetching(true);
    try {
      applyProfile(await api.contacts.parseProfile({ url: form.linkedin_url, text: pasteText }));
      setPasteOpen(false);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setFetching(false);
    }
  };

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
      <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
        <Field label="Perfil do LinkedIn" hint="Cole o link: nome, cargo, empresa e tipo de pessoa são preenchidos automaticamente.">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              autoFocus={!contact}
              value={form.linkedin_url}
              onChange={(e) => set('linkedin_url', e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text');
                setTimeout(() => fetchProfile(text.trim()), 0);
              }}
              onBlur={() => fetchProfile()}
              placeholder="https://www.linkedin.com/in/maria-souza"
            />
            <Button
              variant="primary"
              icon={<Wand2 size={15} />}
              loading={fetching}
              disabled={!form.linkedin_url.trim()}
              onClick={() => {
                lastFetched.current = '';
                fetchProfile();
              }}
              className="shrink-0"
            >
              Buscar dados
            </Button>
          </div>
        </Field>
        {found && !found.profile.warning && (
          <p className="mt-2 flex items-start gap-1.5 text-sm text-emerald-700">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <span>
              Encontrado: <b>{found.profile.name}</b>
              {found.profile.roleTitle && ` — ${found.profile.roleTitle}`}
              {found.profile.company && ` @ ${found.profile.company}`}
              {found.jobTitle && <span className="text-slate-600"> · vinculado à vaga “{found.jobTitle}”</span>}
            </span>
          </p>
        )}
        {found?.profile.warning && (
          <p className="mt-2 flex items-start gap-1.5 text-sm text-amber-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {found.profile.warning}
          </p>
        )}
        {found?.existingContactId && (
          <p className="mt-2 flex items-start gap-1.5 text-sm text-red-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> Essa pessoa já está cadastrada — salve só se quiser duplicar.
          </p>
        )}
        <button type="button" onClick={() => setPasteOpen((o) => !o)} className="mt-2 flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline">
          <ClipboardPaste size={13} /> {pasteOpen ? 'Fechar' : 'Ou cole o texto do perfil (se o LinkedIn bloquear)'}
        </button>
        {pasteOpen && (
          <div className="mt-2 space-y-2">
            <Textarea
              rows={5}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="No perfil da pessoa, selecione tudo (Ctrl+A), copie (Ctrl+C) e cole aqui."
            />
            <Button size="sm" variant="ai" icon={<Wand2 size={13} />} loading={fetching} disabled={pasteText.trim().length < 40} onClick={extractFromText}>
              Extrair com IA
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nome *">
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Maria Souza" />
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

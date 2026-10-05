import { useState } from 'react';
import { CheckCircle2, KeyRound, Plug, Plus, Save, Trash2 } from 'lucide-react';
import type { AIProvider, PublicSettings, RoleCategory } from '../../../shared/types';
import { AI_PROVIDERS, ROLE_CATEGORIES } from '../../../shared/types';
import { Button, Field, Input, Textarea } from '../components/ui';
import { api } from '../lib/api';
import { useData } from '../lib/store';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-0.5 mb-4 text-sm text-slate-500">{description}</p>}
      {!description && <div className="mb-4" />}
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const { settings, setSettings, refresh } = useData();
  const toast = useToast();
  const [form, setForm] = useState<PublicSettings>(() => structuredClone(settings!));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<AIProvider | null>(null);
  const [daysText, setDaysText] = useState(form.followup.days.join(', '));
  const [fallbackText, setFallbackText] = useState<Record<AIProvider, string>>(
    () => Object.fromEntries(AI_PROVIDERS.map((p) => [p.key, (form.ai.fallbacks?.[p.key] ?? []).join(', ')])) as Record<AIProvider, string>,
  );

  const save = async () => {
    setSaving(true);
    try {
      const days = daysText
        .split(/[,;\s]+/)
        .map(Number)
        .filter((n) => n > 0);
      const fallbacks = Object.fromEntries(
        AI_PROVIDERS.map((p) => [
          p.key,
          fallbackText[p.key]
            .split(/[,;\n]+/)
            .map((m) => m.trim())
            .filter(Boolean),
        ]),
      ) as Record<AIProvider, string[]>;
      const { hasKey: _h, ...patch } = { ...form, ai: { ...form.ai, fallbacks }, followup: { ...form.followup, days: days.length ? days : [3] } };
      const saved = await api.settings.save(patch);
      setSettings(saved);
      setForm(structuredClone(saved));
      await refresh(['contacts', 'jobs']);
      toast('Configurações salvas');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const test = async (p: AIProvider) => {
    setTesting(p);
    try {
      // Salva antes de testar para usar a chave recém-digitada.
      await save();
      const r = await api.settings.testAI(p);
      toast(
        r.failed.length
          ? `Funcionou com o reserva ${r.model} (${r.ms} ms).\nIndisponíveis agora:\n${r.failed.join('\n')}`
          : `Conexão OK com ${r.model} (${r.ms} ms) — resposta: "${r.reply}"`,
        r.failed.length ? 'info' : 'success',
      );
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setTesting(null);
    }
  };

  const setAI = (patch: Partial<PublicSettings['ai']>) => setForm((f) => ({ ...f, ai: { ...f.ai, ...patch } }));
  const setProfile = (k: keyof PublicSettings['profile'], v: string) => setForm((f) => ({ ...f, profile: { ...f.profile, [k]: v } }));

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-5 p-3 md:p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">Configurações</h1>
          <Button variant="primary" icon={<Save size={16} />} loading={saving} onClick={save}>
            Salvar tudo
          </Button>
        </div>

        <Card title="Inteligência artificial" description="As chaves ficam salvas só no seu computador (pasta data/ do projeto). Escolha qual provedor usar.">
          <div className="space-y-3">
            {AI_PROVIDERS.map((p) => {
              const active = form.ai.provider === p.key;
              return (
                <div key={p.key} className={`rounded-lg border p-3 ${active ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-200'}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex w-full items-center gap-2 font-medium text-slate-800 sm:w-48">
                      <input type="radio" name="provider" checked={active} onChange={() => setAI({ provider: p.key })} className="accent-indigo-600" />
                      {p.label}
                      {form.hasKey[p.key] && <CheckCircle2 size={15} className="text-emerald-500" />}
                    </label>
                    <div className="relative w-full sm:w-auto sm:min-w-60 sm:flex-1">
                      <KeyRound size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
                      <Input
                        className="pl-8 font-mono text-xs"
                        type="password"
                        autoComplete="off"
                        placeholder="Cole a chave de API"
                        value={form.ai.keys[p.key]}
                        onChange={(e) => setAI({ keys: { ...form.ai.keys, [p.key]: e.target.value } })}
                      />
                    </div>
                    <Input
                      className="flex-1 font-mono text-xs sm:w-48 sm:flex-none"
                      value={form.ai.models[p.key]}
                      onChange={(e) => setAI({ models: { ...form.ai.models, [p.key]: e.target.value } })}
                      title="Modelo"
                      placeholder={p.defaultModel}
                    />
                    <Button size="sm" icon={<Plug size={13} />} loading={testing === p.key} onClick={() => test(p.key)} disabled={!form.ai.keys[p.key]}>
                      Testar
                    </Button>
                  </div>
                  <label className="mt-2 flex flex-col gap-1 text-xs text-slate-600 sm:flex-row sm:items-center">
                    <span className="shrink-0 sm:w-48">Modelos reserva (em ordem)</span>
                    <Input
                      className="flex-1 font-mono text-xs"
                      value={fallbackText[p.key]}
                      onChange={(e) => setFallbackText((f) => ({ ...f, [p.key]: e.target.value }))}
                      placeholder="usados se o principal estiver sobrecarregado — separados por vírgula"
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Meu perfil" description="Usado pela IA para escrever as mensagens com a sua voz.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nome">
              <Input value={form.profile.name} onChange={(e) => setProfile('name', e.target.value)} />
            </Field>
            <Field label="Headline">
              <Input value={form.profile.headline} onChange={(e) => setProfile('headline', e.target.value)} placeholder="Desenvolvedor Full Stack | React · Node" />
            </Field>
            <Field label="Cargos que procuro" className="sm:col-span-2">
              <Input value={form.profile.targetRoles} onChange={(e) => setProfile('targetRoles', e.target.value)} placeholder="Desenvolvedor Frontend Pleno/Sênior, Full Stack…" />
            </Field>
            <Field label="Pitch (2–3 frases sobre você)" className="sm:col-span-2">
              <Textarea rows={3} value={form.profile.pitch} onChange={(e) => setProfile('pitch', e.target.value)} />
            </Field>
            <Field label="Tom das mensagens" className="sm:col-span-2">
              <Input value={form.profile.tone} onChange={(e) => setProfile('tone', e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card
          title="Estratégia de influência"
          description="Diretrizes aplicadas a TODAS as mensagens geradas: postura de protagonista, STAR, reciprocidade via EV etc. Uma por linha."
        >
          <Textarea rows={8} autoGrow value={form.strategy} onChange={(e) => setForm((f) => ({ ...f, strategy: e.target.value }))} />
        </Card>

        <Card title="Abordagem por tipo de pessoa" description="Diretrizes que a IA segue para cada perfil. Ajuste à vontade.">
          <div className="space-y-3">
            {ROLE_CATEGORIES.map((r) => (
              <Field key={r.key} label={r.label}>
                <Textarea
                  rows={2}
                  autoGrow
                  value={form.approach[r.key]}
                  onChange={(e) => setForm((f) => ({ ...f, approach: { ...f.approach, [r.key as RoleCategory]: e.target.value } }))}
                />
              </Field>
            ))}
          </div>
        </Card>

        <Card title="Follow-up" description="Define quando o sistema sinaliza que é hora de agir.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Dias sem aceite do convite até sinalizar">
              <Input type="number" min={1} value={form.followup.inviteStaleDays} onChange={(e) => setForm((f) => ({ ...f, followup: { ...f.followup, inviteStaleDays: Number(e.target.value) || 1 } }))} />
            </Field>
            <Field label="Dias de espera antes de cada follow-up" hint="Ex.: 3, 5, 7 → 1º follow-up 3 dias após a mensagem, 2º 5 dias após o 1º…">
              <Input value={daysText} onChange={(e) => setDaysText(e.target.value)} />
            </Field>
            <Field label="Máximo de follow-ups sem resposta">
              <Input type="number" min={0} value={form.followup.maxFollowups} onChange={(e) => setForm((f) => ({ ...f, followup: { ...f.followup, maxFollowups: Number(e.target.value) } }))} />
            </Field>
            <Field label="Limite de caracteres da nota do convite" hint="LinkedIn: 200 (conta gratuita) / 300 (Premium)">
              <Input type="number" min={50} value={form.followup.inviteNoteLimit} onChange={(e) => setForm((f) => ({ ...f, followup: { ...f.followup, inviteNoteLimit: Number(e.target.value) || 200 } }))} />
            </Field>
          </div>
        </Card>

        <Card title="Meta de resultado" description="Referência usada na aba Indicadores.">
          <Field label="Interações completas esperadas por proposta" hint="Interação completa = a pessoa respondeu ou você encerrou o ciclo.">
            <Input
              type="number"
              min={1}
              value={form.goal.interactionsPerOffer}
              onChange={(e) => setForm((f) => ({ ...f, goal: { interactionsPerOffer: Number(e.target.value) || 200 } }))}
              className="w-40"
            />
          </Field>
        </Card>

        <Card title="Colunas do quadro de vagas" description="Renomeie, mude a cor ou adicione colunas. Vagas em colunas removidas vão para a primeira.">
          <div className="space-y-2">
            {form.kanbanColumns.map((c, i) => (
              <div key={c.key} className="flex items-center gap-2">
                <input
                  type="color"
                  value={c.color}
                  onChange={(e) => setForm((f) => ({ ...f, kanbanColumns: f.kanbanColumns.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)) }))}
                  className="size-9 cursor-pointer rounded border border-slate-300"
                />
                <Input value={c.label} onChange={(e) => setForm((f) => ({ ...f, kanbanColumns: f.kanbanColumns.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))} />
                <code className="w-28 shrink-0 text-xs text-slate-400">{c.key}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 size={14} />}
                  disabled={form.kanbanColumns.length <= 1}
                  onClick={() => setForm((f) => ({ ...f, kanbanColumns: f.kanbanColumns.filter((_, j) => j !== i) }))}
                />
              </div>
            ))}
            <Button
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => setForm((f) => ({ ...f, kanbanColumns: [...f.kanbanColumns, { key: `col_${Date.now().toString(36)}`, label: 'Nova coluna', color: '#64748b' }] }))}
            >
              Coluna
            </Button>
          </div>
        </Card>

        <EmailCard />

        <PasswordCard />

        <div className="flex justify-end pb-6">
          <Button variant="primary" icon={<Save size={16} />} loading={saving} onClick={save}>
            Salvar tudo
          </Button>
        </div>
      </div>
    </div>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [loading, setLoading] = useState(false);
  const change = async () => {
    setLoading(true);
    try {
      await api.auth.changePassword(current, next);
      setCurrent('');
      setNext('');
      toast('Senha alterada');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };
  return (
    <Card title="Minha senha">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input type="password" placeholder="Senha atual" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        <Input type="password" placeholder="Nova senha (mín. 6)" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        <Button loading={loading} disabled={!current || next.length < 6} onClick={change} className="shrink-0">
          Alterar senha
        </Button>
      </div>
    </Card>
  );
}

function EmailCard() {
  const { user } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState(user.username.includes('@') ? user.username : '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const save = async () => {
    setLoading(true);
    try {
      await api.auth.changeEmail(email, password);
      toast('E-mail atualizado. Use-o para entrar.');
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };
  return (
    <Card title="Meu e-mail (login)" description={`Hoje você entra com: ${user.username}`}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input type="email" placeholder="voce@email.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <Input type="password" placeholder="Senha atual" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        <Button loading={loading} disabled={!email || !password || email === user.username} onClick={save} className="shrink-0">
          Salvar e-mail
        </Button>
      </div>
    </Card>
  );
}

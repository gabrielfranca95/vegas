import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type {
  ResumeCertification,
  ResumeData,
  ResumeEducation,
  ResumeExperience,
  ResumeLanguage,
  ResumeProject,
  ResumeSkillGroup,
} from '../../../../shared/types';
import { uid } from '../../lib/format';
import { Button, Field, Input, Textarea } from '../ui';
import AIButton from './AIButton';

type ListKey = 'experiences' | 'education' | 'skills' | 'languages' | 'certifications' | 'projects';

const str = (v: unknown) => (v === null || v === undefined ? '' : Array.isArray(v) ? v.map(String).join('\n') : String(v));

/** Converte o retorno da IA em texto (aceita string, {text} ou lista). */
const coerceText = (raw: unknown) => (typeof raw === 'object' && raw && !Array.isArray(raw) ? str((raw as Record<string, unknown>).text ?? Object.values(raw)[0]) : str(raw));

/** Mescla o objeto da IA no item atual, mantendo id e campos que a IA não devolveu. */
function coerceItem<T extends { id: string }>(raw: unknown, current: T): T {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return current;
  const out = { ...current } as Record<string, unknown>;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k === 'id' || !(k in current)) continue;
    out[k] = typeof current[k as keyof T] === 'boolean' ? Boolean(v) : str(v);
  }
  return out as T;
}

function coerceSkills(raw: unknown, current: ResumeSkillGroup[]): ResumeSkillGroup[] {
  const list = Array.isArray(raw) ? raw : (raw as { skills?: unknown[] })?.skills;
  if (!Array.isArray(list)) return current;
  return list.map((s: any, i) => ({
    id: typeof s?.id === 'string' ? s.id : current[i]?.id ?? uid(),
    category: str(s?.category),
    items: Array.isArray(s?.items) ? s.items.join(', ') : str(s?.items),
  }));
}

const textRender = (t: string) => <p className="whitespace-pre-line">{t}</p>;

function Section({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </div>
      {children}
    </section>
  );
}

function ItemShell({ children, onUp, onDown, onRemove, extra }: { children: ReactNode; onUp: () => void; onDown: () => void; onRemove: () => void; extra?: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-2 flex justify-end gap-1">
        {extra}
        <Button size="sm" variant="ghost" icon={<ArrowUp size={13} />} onClick={onUp} title="Subir" />
        <Button size="sm" variant="ghost" icon={<ArrowDown size={13} />} onClick={onDown} title="Descer" />
        <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={onRemove} title="Remover" />
      </div>
      {children}
    </div>
  );
}

export default function ResumeEditor({ resumeId, data, onChange }: { resumeId: number; data: ResumeData; onChange: (d: ResumeData) => void }) {
  const setPersonal = (k: keyof ResumeData['personal'], v: string) => onChange({ ...data, personal: { ...data.personal, [k]: v } });

  function listOps<K extends ListKey>(key: K) {
    type Item = ResumeData[K][number];
    const list = data[key] as Item[];
    const set = (next: Item[]) => onChange({ ...data, [key]: next });
    return {
      list,
      add: (item: Item) => set([...list, item]),
      update: (id: string, patch: Partial<Item>) => set(list.map((x) => (x.id === id ? { ...x, ...patch } : x))),
      replace: (id: string, item: Item) => set(list.map((x) => (x.id === id ? item : x))),
      remove: (id: string) => set(list.filter((x) => x.id !== id)),
      move: (id: string, dir: -1 | 1) => {
        const i = list.findIndex((x) => x.id === id);
        const j = i + dir;
        if (j < 0 || j >= list.length) return;
        const copy = [...list];
        [copy[i], copy[j]] = [copy[j], copy[i]];
        set(copy);
      },
      setAll: set,
    };
  }

  const exp = listOps('experiences');
  const edu = listOps('education');
  const skills = listOps('skills');
  const langs = listOps('languages');
  const certs = listOps('certifications');
  const projects = listOps('projects');

  const p = data.personal;

  return (
    <div className="space-y-4">
      <Section title="Dados pessoais">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nome completo">
            <Input value={p.name} onChange={(e) => setPersonal('name', e.target.value)} />
          </Field>
          <Field label="Título / headline">
            <Input value={p.headline} onChange={(e) => setPersonal('headline', e.target.value)} placeholder="Desenvolvedor Full Stack | React · Node" />
          </Field>
          <Field label="E-mail">
            <Input value={p.email} onChange={(e) => setPersonal('email', e.target.value)} />
          </Field>
          <Field label="Telefone">
            <Input value={p.phone} onChange={(e) => setPersonal('phone', e.target.value)} />
          </Field>
          <Field label="Cidade / UF">
            <Input value={p.location} onChange={(e) => setPersonal('location', e.target.value)} />
          </Field>
          <Field label="LinkedIn">
            <Input value={p.linkedin} onChange={(e) => setPersonal('linkedin', e.target.value)} placeholder="linkedin.com/in/…" />
          </Field>
          <Field label="GitHub">
            <Input value={p.github} onChange={(e) => setPersonal('github', e.target.value)} />
          </Field>
          <Field label="Site / portfólio">
            <Input value={p.website} onChange={(e) => setPersonal('website', e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section
        title="Resumo profissional"
        actions={
          <AIButton resumeId={resumeId} section="Resumo profissional (texto)" content={data.summary} coerce={coerceText} render={textRender} onApply={(v) => onChange({ ...data, summary: v })} />
        }
      >
        <Textarea autoGrow rows={4} value={data.summary} onChange={(e) => onChange({ ...data, summary: e.target.value })} placeholder="3–4 linhas: quem você é, especialidade, principais resultados e o que busca." />
      </Section>

      <Section
        title="Experiência profissional"
        actions={
          <Button size="sm" icon={<Plus size={13} />} onClick={() => exp.add({ id: uid(), company: '', role: '', location: '', start: '', end: '', current: false, description: '' })}>
            Adicionar
          </Button>
        }
      >
        <div className="space-y-3">
          {exp.list.length === 0 && <p className="text-sm text-slate-400">Nenhuma experiência.</p>}
          {(exp.list as ResumeExperience[]).map((e) => (
            <ItemShell
              key={e.id}
              onUp={() => exp.move(e.id, -1)}
              onDown={() => exp.move(e.id, 1)}
              onRemove={() => exp.remove(e.id)}
              extra={
                <AIButton
                  resumeId={resumeId}
                  section="Uma experiência profissional (objeto; o campo description tem um bullet por linha)"
                  content={e}
                  coerce={(raw, cur) => coerceItem(raw, cur)}
                  render={(v) => (
                    <div>
                      <p className="font-semibold">
                        {v.role} — {v.company}
                      </p>
                      {textRender(v.description)}
                    </div>
                  )}
                  onApply={(v) => exp.replace(e.id, v)}
                />
              }
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input value={e.role} onChange={(ev) => exp.update(e.id, { role: ev.target.value })} placeholder="Cargo" />
                <Input value={e.company} onChange={(ev) => exp.update(e.id, { company: ev.target.value })} placeholder="Empresa" />
                <Input value={e.location} onChange={(ev) => exp.update(e.id, { location: ev.target.value })} placeholder="Local / remoto" />
                <div className="flex items-center gap-2">
                  <Input value={e.start} onChange={(ev) => exp.update(e.id, { start: ev.target.value })} placeholder="Início (Jan 2022)" />
                  <Input value={e.current ? '' : e.end} disabled={e.current} onChange={(ev) => exp.update(e.id, { end: ev.target.value })} placeholder={e.current ? 'Atual' : 'Fim'} />
                  <label className="flex shrink-0 items-center gap-1 text-xs text-slate-600">
                    <input type="checkbox" checked={e.current} onChange={(ev) => exp.update(e.id, { current: ev.target.checked })} className="accent-indigo-600" />
                    Atual
                  </label>
                </div>
                <Textarea
                  autoGrow
                  rows={3}
                  className="sm:col-span-2"
                  value={e.description}
                  onChange={(ev) => exp.update(e.id, { description: ev.target.value })}
                  placeholder="Um bullet por linha: verbo de ação + o que fez + resultado"
                />
              </div>
            </ItemShell>
          ))}
        </div>
      </Section>

      <Section
        title="Habilidades"
        actions={
          <>
            <AIButton
              resumeId={resumeId}
              section="Lista de grupos de habilidades [{id, category, items (separados por vírgula)}]"
              content={data.skills}
              coerce={coerceSkills}
              render={(v) => (
                <div>
                  {v.map((s) => (
                    <p key={s.id}>
                      <b>{s.category}:</b> {s.items}
                    </p>
                  ))}
                </div>
              )}
              onApply={(v) => skills.setAll(v)}
            />
            <Button size="sm" icon={<Plus size={13} />} onClick={() => skills.add({ id: uid(), category: '', items: '' })}>
              Grupo
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          {(skills.list as ResumeSkillGroup[]).map((s) => (
            <div key={s.id} className="flex gap-2">
              <Input className="w-44" value={s.category} onChange={(e) => skills.update(s.id, { category: e.target.value })} placeholder="Categoria (Front-end)" />
              <Input value={s.items} onChange={(e) => skills.update(s.id, { items: e.target.value })} placeholder="React, TypeScript, Next.js" />
              <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => skills.remove(s.id)} />
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Projetos"
        actions={
          <Button size="sm" icon={<Plus size={13} />} onClick={() => projects.add({ id: uid(), name: '', link: '', description: '' })}>
            Adicionar
          </Button>
        }
      >
        <div className="space-y-3">
          {(projects.list as ResumeProject[]).map((x) => (
            <ItemShell
              key={x.id}
              onUp={() => projects.move(x.id, -1)}
              onDown={() => projects.move(x.id, 1)}
              onRemove={() => projects.remove(x.id)}
              extra={
                <AIButton
                  resumeId={resumeId}
                  section="Um projeto (objeto; description com um bullet por linha)"
                  content={x}
                  coerce={(raw, cur) => coerceItem(raw, cur)}
                  render={(v) => (
                    <div>
                      <p className="font-semibold">{v.name}</p>
                      {textRender(v.description)}
                    </div>
                  )}
                  onApply={(v) => projects.replace(x.id, v)}
                />
              }
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input value={x.name} onChange={(e) => projects.update(x.id, { name: e.target.value })} placeholder="Nome do projeto" />
                <Input value={x.link} onChange={(e) => projects.update(x.id, { link: e.target.value })} placeholder="Link" />
                <Textarea autoGrow rows={2} className="sm:col-span-2" value={x.description} onChange={(e) => projects.update(x.id, { description: e.target.value })} placeholder="Um bullet por linha" />
              </div>
            </ItemShell>
          ))}
        </div>
      </Section>

      <Section
        title="Formação"
        actions={
          <Button size="sm" icon={<Plus size={13} />} onClick={() => edu.add({ id: uid(), institution: '', degree: '', start: '', end: '', description: '' })}>
            Adicionar
          </Button>
        }
      >
        <div className="space-y-3">
          {(edu.list as ResumeEducation[]).map((e) => (
            <ItemShell key={e.id} onUp={() => edu.move(e.id, -1)} onDown={() => edu.move(e.id, 1)} onRemove={() => edu.remove(e.id)}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input value={e.degree} onChange={(ev) => edu.update(e.id, { degree: ev.target.value })} placeholder="Curso (Bacharelado em …)" />
                <Input value={e.institution} onChange={(ev) => edu.update(e.id, { institution: ev.target.value })} placeholder="Instituição" />
                <Input value={e.start} onChange={(ev) => edu.update(e.id, { start: ev.target.value })} placeholder="Início" />
                <Input value={e.end} onChange={(ev) => edu.update(e.id, { end: ev.target.value })} placeholder="Conclusão (ou previsão)" />
                <Textarea rows={1} autoGrow className="sm:col-span-2" value={e.description} onChange={(ev) => edu.update(e.id, { description: ev.target.value })} placeholder="Detalhes (opcional)" />
              </div>
            </ItemShell>
          ))}
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Certificações"
          actions={
            <Button size="sm" icon={<Plus size={13} />} onClick={() => certs.add({ id: uid(), name: '', issuer: '', year: '' })}>
              Adicionar
            </Button>
          }
        >
          <div className="space-y-2">
            {(certs.list as ResumeCertification[]).map((c) => (
              <div key={c.id} className="flex gap-2">
                <Input value={c.name} onChange={(e) => certs.update(c.id, { name: e.target.value })} placeholder="Nome" />
                <Input className="w-32" value={c.issuer} onChange={(e) => certs.update(c.id, { issuer: e.target.value })} placeholder="Emissor" />
                <Input className="w-20" value={c.year} onChange={(e) => certs.update(c.id, { year: e.target.value })} placeholder="Ano" />
                <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => certs.remove(c.id)} />
              </div>
            ))}
          </div>
        </Section>
        <Section
          title="Idiomas"
          actions={
            <Button size="sm" icon={<Plus size={13} />} onClick={() => langs.add({ id: uid(), name: '', level: '' })}>
              Adicionar
            </Button>
          }
        >
          <div className="space-y-2">
            {(langs.list as ResumeLanguage[]).map((l) => (
              <div key={l.id} className="flex gap-2">
                <Input value={l.name} onChange={(e) => langs.update(l.id, { name: e.target.value })} placeholder="Inglês" />
                <Input value={l.level} onChange={(e) => langs.update(l.id, { level: e.target.value })} placeholder="Avançado" />
                <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => langs.remove(l.id)} />
              </div>
            ))}
          </div>
        </Section>
      </div>
      <Section title="Texto final (opcional)">
        <div className="space-y-2">
          <Input
            value={data.closing?.title ?? ''}
            onChange={(e) => onChange({ ...data, closing: { title: e.target.value, text: data.closing?.text ?? '' } })}
            placeholder="Título (ex.: Filosofia profissional)"
          />
          <Textarea
            rows={3}
            autoGrow
            value={data.closing?.text ?? ''}
            onChange={(e) => onChange({ ...data, closing: { title: data.closing?.title ?? '', text: e.target.value } })}
            placeholder="Texto que fecha o currículo (aparece no final do PDF/Word)"
          />
        </div>
      </Section>
    </div>
  );
}

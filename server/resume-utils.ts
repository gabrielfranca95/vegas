import { randomUUID } from 'node:crypto';
import type { ResumeData } from '../shared/types.ts';

export function emptyResume(): ResumeData {
  return {
    lang: 'pt',
    personal: { name: '', headline: '', email: '', phone: '', location: '', linkedin: '', github: '', website: '' },
    summary: '',
    experiences: [],
    education: [],
    skills: [],
    languages: [],
    certifications: [],
    projects: [],
    closing: { title: '', text: '' },
  };
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const id = (v: unknown) => (typeof v === 'string' && v ? v : randomUUID());

/** Garante que um JSON (vindo da IA ou do front) tenha exatamente o formato de ResumeData. */
export function normalizeResume(input: any): ResumeData {
  const base = emptyResume();
  const p = input?.personal ?? {};
  return {
    lang: input?.lang === 'en' ? 'en' : 'pt',
    personal: Object.fromEntries(Object.keys(base.personal).map((k) => [k, str(p[k])])) as ResumeData['personal'],
    summary: str(input?.summary),
    experiences: arr(input?.experiences).map((e) => ({
      id: id(e?.id),
      company: str(e?.company),
      role: str(e?.role),
      location: str(e?.location),
      start: str(e?.start),
      end: str(e?.end),
      current: Boolean(e?.current),
      description: Array.isArray(e?.description) ? e.description.map(str).join('\n') : str(e?.description),
    })),
    education: arr(input?.education).map((e) => ({
      id: id(e?.id),
      institution: str(e?.institution),
      degree: str(e?.degree),
      start: str(e?.start),
      end: str(e?.end),
      description: str(e?.description),
    })),
    skills: arr(input?.skills).map((s) => ({
      id: id(s?.id),
      category: str(s?.category),
      items: Array.isArray(s?.items) ? s.items.map(str).join(', ') : str(s?.items),
    })),
    languages: arr(input?.languages).map((l) => ({ id: id(l?.id), name: str(l?.name), level: str(l?.level) })),
    certifications: arr(input?.certifications).map((c) => ({
      id: id(c?.id),
      name: str(c?.name),
      issuer: str(c?.issuer),
      year: str(c?.year),
    })),
    projects: arr(input?.projects).map((x) => ({
      id: id(x?.id),
      name: str(x?.name),
      link: str(x?.link),
      description: str(x?.description),
    })),
    closing: { title: str(input?.closing?.title), text: str(input?.closing?.text) },
  };
}

export const SECTION_LABELS = {
  pt: {
    summary: 'Resumo profissional',
    experiences: 'Experiência profissional',
    education: 'Formação acadêmica',
    skills: 'Habilidades',
    languages: 'Idiomas',
    certifications: 'Certificações',
    projects: 'Projetos',
    current: 'Atual',
  },
  en: {
    summary: 'Professional summary',
    experiences: 'Professional experience',
    education: 'Education',
    skills: 'Skills',
    languages: 'Languages',
    certifications: 'Certifications',
    projects: 'Projects',
    current: 'Present',
  },
} as const;

export const bullets = (text: string) =>
  text
    .split('\n')
    .map((l) => l.replace(/^\s*[-•*–]\s*/, '').trim())
    .filter(Boolean);

export const period = (start: string, end: string, current: boolean, lang: 'pt' | 'en') => {
  const fim = current ? SECTION_LABELS[lang].current : end;
  return [start, fim].filter(Boolean).join(' – ');
};

export const contactLine = (p: ResumeData['personal']) =>
  [p.location, p.phone, p.email, p.linkedin, p.github, p.website].map((s) => s.trim()).filter(Boolean);

export function safeFileName(name: string) {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'curriculo'
  );
}

const normalizeWords = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !['de', 'da', 'do', 'em', 'para', 'com'].includes(w));

const GENERIC_COMPANY = /^(grupo|holding|do|da|de|ramo|empresa|companhia|cia|s\.?a\.?|ltda)$/i;

const titleCase = (t: string) => t.replace(/\p{L}+/gu, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());

function slug(text: string, max: number) {
  const out = safeFileName(titleCase(text));
  return out.length > max ? out.slice(0, max).replace(/_+[^_]*$/, '') || out.slice(0, max) : out;
}

/**
 * Nome de arquivo curto e único por vaga:
 *   oficial  → "Nome_Sobrenome_CV"
 *   adaptado → "Nome_Sobrenome_CV_Empresa" (+ cargo resumido e, se preciso, o id quando houver outro igual)
 */
export function resumeFileName(
  personName: string,
  target: { id: number; company: string | null; title: string | null } | null,
  siblings: { id: number; company: string | null; title: string | null }[] = [],
) {
  const parts = personName.trim().split(/\s+/).filter(Boolean);
  const person = safeFileName(parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : parts[0] ?? 'Curriculo').slice(0, 24);
  const base = `${person}_CV`;
  if (!target) return base;

  const companyKey = (c: string | null) =>
    slug(
      (c ?? '')
        .split(/\s+/)
        .filter((w) => !GENERIC_COMPANY.test(w))
        .slice(0, 2)
        .join(' ') || c || 'Vaga',
      16,
    );
  const withCompany = `${base}_${companyKey(target.company)}`;
  const others = siblings.filter((x) => x.id !== target.id);
  const sameCompany = others.filter((x) => `${base}_${companyKey(x.company)}` === withCompany);
  if (!sameCompany.length) return withCompany;

  // Usa as palavras do cargo que o diferenciam das outras vagas da mesma empresa.
  const titleWords = (t: string | null) => normalizeWords(shortJobTitle(t ?? '', 60));
  const shared = new Set(sameCompany.flatMap((x) => titleWords(x.title)));
  const own = titleWords(target.title);
  const distinct = own.filter((w) => !shared.has(w));
  const titleKey = (words: string[]) => slug(words.join(' '), 22);
  const withTitle = `${withCompany}_${titleKey(distinct.length ? distinct : own)}`;
  const clash = sameCompany.some((x) => {
    const w = titleWords(x.title);
    const d = w.filter((word) => !own.includes(word));
    return `${withCompany}_${titleKey(d.length ? d : w)}` === withTitle;
  });
  return clash ? `${withTitle}_${target.id}` : withTitle;
}

/** Título curto de vaga: só o cargo (títulos do RioVagas trazem empresa, salário e bairro separados por "–"). */
export function shortJobTitle(title: string, max = 40) {
  const first = title.split(/\s+[–—-]\s+/)[0].trim() || title.trim();
  return first.length > max ? `${first.slice(0, max - 1).trim()}…` : first;
}

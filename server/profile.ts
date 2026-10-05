import * as cheerio from 'cheerio';
import type { ProfileData, RoleCategory } from '../shared/types.ts';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

/** Deduz o tipo de pessoa pelo cargo (ordem importa: "Talent Acquisition Manager" é recrutador). */
export function guessRoleCategory(title: string): RoleCategory {
  const t = ` ${title.toLowerCase()} `;
  if (/recruit|recrut|talent|talento|headhunt|\bhr\b|\brh\b|human resources|recursos humanos|people|gente e gest|aquisição de talentos|seleção/.test(t)) return 'recrutador';
  if (/founder|fundador|fundadora|co-?founder|\bceo\b|owner|\bsóci[oa]\b|\bdon[oa]\b|propriet/.test(t)) return 'dono';
  if (/director|diretor|diretora|\bvp\b|vice[- ]president|\bcto\b|\bcio\b|\bcpo\b|\bcoo\b|chief|c-level/.test(t)) return 'diretor';
  if (/tech lead|tech-lead|technical lead|líder técnic|lider técnic|staff engineer|principal engineer|architect|arquitet|engineering lead|lead engineer|lead developer/.test(t)) return 'lider_tecnico';
  if (/manager|gerente|\bhead\b|coordenador|coordenadora|coordinator|supervisor|gestor|gestora/.test(t)) return 'gerente';
  return 'funcionario';
}

/** Normaliza para https://www.linkedin.com/in/<slug>/ (aceita link com subdomínio, query ou só o usuário). */
export function canonicalProfileUrl(raw: string): string | null {
  const s = raw.trim();
  const m = s.match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  const slug = m ? m[1] : /^[\w%-]{3,100}$/.test(s) ? s : null;
  return slug ? `https://www.linkedin.com/in/${slug}/` : null;
}

/** Nome aproximado a partir do slug ("maria-souza-1a2b3c" → "Maria Souza"). */
function nameFromSlug(url: string) {
  const slug = decodeURIComponent(url.match(/\/in\/([^/]+)/)?.[1] ?? '');
  return slug
    .split('-')
    .filter((p) => p && !/\d/.test(p))
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(' ');
}

const asArray = <T>(v: T | T[] | undefined): T[] => (Array.isArray(v) ? v : v ? [v] : []);

function emptyProfile(url: string, warning: string): ProfileData {
  return {
    url,
    name: nameFromSlug(url),
    headline: '',
    roleTitle: '',
    company: '',
    location: '',
    about: '',
    previousCompanies: [],
    roleCategory: 'funcionario',
    warning,
  };
}

/** Lê os dados públicos de um perfil (JSON-LD "Person" + metatags), sem login. */
export async function scrapeLinkedInProfile(rawUrl: string): Promise<ProfileData> {
  const url = canonicalProfileUrl(rawUrl);
  if (!url) return emptyProfile(rawUrl, 'Link de perfil inválido. Use algo como linkedin.com/in/nome-da-pessoa.');

  let html: string;
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, 'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8', accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return emptyProfile(url, `O LinkedIn não liberou o perfil (${res.status}). Cole o texto do perfil para a IA extrair.`);
    html = await res.text();
  } catch (err) {
    return emptyProfile(url, `Não consegui abrir o perfil (${(err as Error).message}). Cole o texto do perfil para a IA extrair.`);
  }

  const $ = cheerio.load(html);
  let person: any = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (person) return;
    try {
      const parsed = JSON.parse($(el).text());
      const items = Array.isArray(parsed) ? parsed : parsed['@graph'] ?? [parsed];
      person = items.find((i: any) => i?.['@type'] === 'Person') ?? null;
    } catch {
      /* JSON-LD inválido: ignora */
    }
  });

  // og:title = "Nome - Headline | LinkedIn"
  const ogTitle = $('meta[property="og:title"]').attr('content') ?? '';
  const [ogName, ...rest] = ogTitle.replace(/\s*\|\s*LinkedIn\s*$/i, '').split(' - ');
  const headline = rest.join(' - ').trim();

  if (!person && !ogName) return emptyProfile(url, 'O LinkedIn pediu login para ver esse perfil. Cole o texto do perfil para a IA extrair.');

  const works = asArray<any>(person?.worksFor).filter((w) => w?.name && !w?.member?.endDate);
  const current = works[0];
  const jobTitles = asArray<string>(person?.jobTitle);
  const roleTitle = jobTitles[0] ?? headline.split(/ at | na | no | @ /i)[0] ?? '';
  const previousCompanies = asArray<any>(person?.alumniOf)
    .filter((o) => o?.['@type'] === 'Organization' && o?.name)
    .map((o) => String(o.name))
    .slice(0, 5);
  const address = person?.address;
  const location = typeof address === 'string' ? address : address?.addressLocality ?? '';

  return {
    url,
    name: String(person?.name ?? ogName ?? '').trim() || nameFromSlug(url),
    headline,
    roleTitle: String(roleTitle).trim(),
    company: String(current?.name ?? '').trim(),
    location: String(location).trim(),
    about: String(person?.description ?? '').trim().slice(0, 1200),
    previousCompanies,
    roleCategory: guessRoleCategory(`${roleTitle} ${headline}`),
  };
}

/** Anotações úteis para a IA personalizar as mensagens. */
export function profileNotes(p: ProfileData): string {
  return [
    p.headline && `Headline: ${p.headline}`,
    p.location && `Local: ${p.location}`,
    p.previousCompanies.length ? `Empresas anteriores: ${p.previousCompanies.join(', ')}` : '',
    p.about && `Sobre: ${p.about}`,
  ]
    .filter(Boolean)
    .join('\n');
}

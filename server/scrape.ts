import * as cheerio from 'cheerio';
import type { Platform, ScrapedJob } from '../shared/types.ts';

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

export function detectPlatform(url: string): Platform {
  const host = safeHost(url);
  if (host.includes('linkedin.')) return 'linkedin';
  if (host.includes('gupy.io')) return 'gupy';
  if (host.includes('riovagas.')) return 'riovagas';
  if (host.includes('indeed.')) return 'indeed';
  if (host.includes('vagas.com')) return 'vagascom';
  return 'outro';
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** Converte HTML em texto preservando quebras de parágrafo e listas. */
export function htmlToText(html: string): string {
  const $ = cheerio.load(`<div id="__root">${html}</div>`);
  $('script, style, noscript, svg').remove();
  $('br').replaceWith('\n');
  $('li').each((_, el) => {
    $(el).prepend('• ').append('\n');
  });
  $('p, div, h1, h2, h3, h4, h5, h6, ul, ol, section, tr').each((_, el) => {
    $(el).append('\n');
  });
  return $('#__root')
    .text()
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchHtml(url: string) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, 'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8', accept: 'text/html,*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`A página respondeu ${res.status}`);
  return res.text();
}

function linkedinJobId(url: string): string | null {
  const m =
    url.match(/linkedin\.[^/]+\/jobs\/view\/(?:[^/?#]*-)?(\d{6,})/i) ??
    url.match(/[?&]currentJobId=(\d{6,})/i) ??
    url.match(/jobPosting\/(\d{6,})/i);
  return m ? m[1] : null;
}

async function scrapeLinkedIn(url: string): Promise<ScrapedJob> {
  const id = linkedinJobId(url);
  if (!id) {
    return empty(url, 'linkedin', 'Não encontrei o ID da vaga no link. Use um link do tipo linkedin.com/jobs/view/123456.');
  }
  const canonical = `https://www.linkedin.com/jobs/view/${id}/`;
  const html = await fetchHtml(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`);
  const $ = cheerio.load(html);
  const title = $('.top-card-layout__title, .topcard__title').first().text().trim();
  const company = $('.topcard__org-name-link, a.topcard__org-name-link, .topcard__flavor a').first().text().trim();
  const location = $('.topcard__flavor--bullet').first().text().trim();
  const descHtml = $('.show-more-less-html__markup, .description__text').first().html() ?? '';
  const criteria = $('.description__job-criteria-item')
    .map((_, el) => `${$(el).find('h3').text().trim()}: ${$(el).find('span').text().trim()}`)
    .get()
    .join('\n');
  const description = [htmlToText(descHtml), criteria].filter(Boolean).join('\n\n');
  const job: ScrapedJob = {
    url: canonical,
    platform: 'linkedin',
    title,
    company,
    location,
    workModel: guessWorkModel(`${title} ${location} ${description}`),
    description,
    applyEmail: findApplyEmail(description),
  };
  if (!title && !description) job.warning = 'O LinkedIn não liberou os dados dessa vaga sem login. Cole a descrição manualmente.';
  return job;
}

function findJobPostingLd($: cheerio.CheerioAPI): any | null {
  let found: any = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return;
    try {
      const parsed = JSON.parse($(el).text());
      const items = Array.isArray(parsed) ? parsed : parsed['@graph'] ?? [parsed];
      found = items.find((i: any) => i?.['@type'] === 'JobPosting') ?? null;
    } catch {
      /* JSON-LD inválido: ignora */
    }
  });
  return found;
}

function ldLocation(ld: any): string {
  const loc = Array.isArray(ld?.jobLocation) ? ld.jobLocation[0] : ld?.jobLocation;
  const a = loc?.address;
  if (!a) return '';
  if (typeof a === 'string') return a;
  return [a.addressLocality, a.addressRegion, a.addressCountry?.name ?? a.addressCountry].filter(Boolean).join(', ');
}

function gupyFromNextData($: cheerio.CheerioAPI): Partial<ScrapedJob> | null {
  const raw = $('#__NEXT_DATA__').text();
  if (!raw) return null;
  try {
    const props = JSON.parse(raw)?.props?.pageProps;
    const job = props?.job ?? props?.jobData ?? props?.data?.job;
    if (!job) return null;
    const parts = [
      job.description && `Descrição\n${htmlToText(job.description)}`,
      job.responsibilities && `Responsabilidades\n${htmlToText(job.responsibilities)}`,
      job.prerequisites && `Requisitos\n${htmlToText(job.prerequisites)}`,
      job.relevantExperiences && `Diferenciais\n${htmlToText(job.relevantExperiences)}`,
      job.additionalInformation && `Informações adicionais\n${htmlToText(job.additionalInformation)}`,
    ].filter(Boolean);
    return {
      title: String(job.name ?? job.title ?? '').trim(),
      company: job.careerPage?.name ?? props?.careerPage?.name ?? job.careerPageName ?? job.company?.name ?? '',
      location: [job.addressCity, job.addressState].filter(Boolean).join(', '),
      workModel: job.workplaceType ?? (job.isRemoteWork ? 'remoto' : ''),
      description: parts.join('\n\n'),
    };
  } catch {
    return null;
  }
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const APPLY_HINT = /curr[íi]culo|\bcv\b|candidat|interessad|envi(e|ar)|encaminh|mande|aplicar|portf[óo]lio/i;

/**
 * E-mail de candidatura citado no texto. Só aceita e-mails com contexto de candidatura
 * por perto (evita pegar e-mail de rodapé, suporte etc.).
 */
export function findApplyEmail(text: string): string {
  for (const m of text.matchAll(EMAIL_RE)) {
    const around = text.slice(Math.max(0, m.index! - 160), m.index! + m[0].length + 60);
    if (APPLY_HINT.test(around)) return m[0].replace(/[.,;:]+$/, '').toLowerCase();
  }
  return '';
}

/** Títulos do RioVagas seguem "Cargo – Empresa/segmento – Salário – Bairro – N vagas". */
function splitRioVagasTitle(raw: string) {
  const parts = raw.replace(/\s*-\s*RIOVAGAS.*$/i, '').split(/\s+[–-]\s+/).map((p) => p.trim()).filter(Boolean);
  const location = parts.length >= 3 ? parts.filter((p) => !/R\$|vagas?$|^até/i.test(p)).slice(-1)[0] ?? '' : '';
  return { title: parts[0] ?? raw, company: parts[1] ?? '', location: location !== parts[0] && location !== parts[1] ? location : '' };
}

async function scrapeRioVagas(url: string): Promise<ScrapedJob> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const content = $('article .entry-content').first();
  content.find('.vce-share-bar, .meks_ess, .veja-tambem, form, .btn-candidatar, .k-ad, .clever-core-ads, script, style, ins').remove();
  const description = htmlToText(content.html() ?? '');
  const rawTitle = $('h1.entry-title').first().text().trim() || $('meta[property="og:title"]').attr('content') || '';
  const { title, company, location } = splitRioVagasTitle(rawTitle);
  return {
    url,
    platform: 'riovagas',
    title: rawTitle.replace(/\s*-\s*RIOVAGAS.*$/i, '').trim() || title,
    company,
    location: location ? `${location}, RJ` : 'Rio de Janeiro, RJ',
    workModel: guessWorkModel(`${rawTitle} ${description}`),
    description,
    applyEmail: findApplyEmail(description),
    warning: description ? undefined : 'Não encontrei a descrição na página. Cole manualmente.',
  };
}

async function scrapeGeneric(url: string, platform: Platform): Promise<ScrapedJob> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const fromNext = platform === 'gupy' ? gupyFromNextData($) : null;
  const ld = findJobPostingLd($);

  const title =
    fromNext?.title || ld?.title || $('meta[property="og:title"]').attr('content') || $('h1').first().text() || $('title').text();
  const company =
    fromNext?.company ||
    ld?.hiringOrganization?.name ||
    $('meta[property="og:site_name"]').attr('content') ||
    (platform === 'gupy' ? safeHost(url).split('.')[0] : '');
  const location = fromNext?.location || ldLocation(ld);
  let description = fromNext?.description || (ld?.description ? htmlToText(ld.description) : '');
  let warning: string | undefined;
  if (!description) {
    $('header, nav, footer, script, style, noscript').remove();
    description = htmlToText($('main').html() ?? $('body').html() ?? '').slice(0, 15000);
    warning = 'Extraí o texto bruto da página; revise a descrição.';
  }
  const workModel =
    fromNext?.workModel || (ld?.jobLocationType === 'TELECOMMUTE' ? 'remoto' : '') || guessWorkModel(`${title} ${location} ${description}`);

  return {
    url,
    platform,
    title: String(title).trim(),
    company: String(company).trim(),
    location,
    workModel: normalizeWorkModel(workModel),
    description,
    applyEmail: findApplyEmail(description),
    warning,
  };
}

function normalizeWorkModel(v: string) {
  const s = v.toLowerCase();
  if (/remot|remote|home/.test(s)) return 'remoto';
  if (/h[íi]brid|hybrid/.test(s)) return 'híbrido';
  if (/presencial|on-?site|in office/.test(s)) return 'presencial';
  return '';
}

function guessWorkModel(text: string) {
  return normalizeWorkModel(text.slice(0, 3000));
}

function empty(url: string, platform: Platform, warning: string): ScrapedJob {
  return { url, platform, title: '', company: '', location: '', workModel: '', description: '', applyEmail: '', warning };
}

export async function scrapeJob(rawUrl: string): Promise<ScrapedJob> {
  const url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) return empty(url, 'outro', 'Link inválido (precisa começar com http).');
  const platform = detectPlatform(url);
  try {
    if (platform === 'linkedin') return await scrapeLinkedIn(url);
    if (platform === 'riovagas') return await scrapeRioVagas(url);
    return await scrapeGeneric(url, platform);
  } catch (err) {
    const blocked = platform === 'indeed' ? ' A Indeed costuma bloquear leitura automática.' : '';
    return empty(url, platform, `Não consegui ler a página (${(err as Error).message}).${blocked} Cole a descrição manualmente.`);
  }
}

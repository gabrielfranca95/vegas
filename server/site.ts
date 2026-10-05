import * as cheerio from 'cheerio';
import { htmlToText } from './scrape.ts';

/** Texto público da página inicial de uma empresa (título, descrição e corpo), para dar contexto à IA. */
export async function fetchSiteText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const $ = cheerio.load(await res.text());
    $('script, style, noscript, svg, nav, footer').remove();
    const meta = [$('title').text(), $('meta[name="description"]').attr('content') ?? ''].filter(Boolean).join(' — ');
    return `${meta}\n\n${htmlToText($('body').html() ?? '')}`.slice(0, 8000);
  } catch {
    return null;
  }
}

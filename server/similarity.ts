/** Comparação de vagas para detectar possíveis duplicatas (mesma vaga em sites diferentes ou cadastrada duas vezes). */

const STOP = new Set(
  'a o as os de da do das dos e em no na nos nas um uma para por com sem que se ao à às é ou the and of to in for with on at as is are be will you we our your this that'.split(
    ' ',
  ),
);

export function normalizeText(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9+#.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(s: string) {
  return normalizeText(s)
    .split(' ')
    .filter((w) => w.length > 1 && !STOP.has(w));
}

function jaccard<T>(a: Set<T>, b: Set<T>) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Semelhança de títulos por palavras (0–1). */
export function titleSimilarity(a: string, b: string) {
  return jaccard(new Set(words(a)), new Set(words(b)));
}

/** Semelhança de descrições por trigramas de palavras (0–1); robusta a reordenação de parágrafos. */
export function textSimilarity(a: string, b: string) {
  const grams = (s: string) => {
    const w = words(s);
    const out = new Set<string>();
    for (let i = 0; i + 2 < w.length; i++) out.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  // Usa a menor descrição como referência: a mesma vaga costuma vir com mais ou menos texto em cada site.
  if (!ga.size || !gb.size) return 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return inter / Math.min(ga.size, gb.size);
}

/** Nome de empresa sem sufixos societários e pontuação ("Americanas S.A." == "americanas"). */
export function normalizeCompany(s: string) {
  return normalizeText(s)
    .replace(/\b(s\.?a\.?|ltda\.?|me|eireli|inc\.?|llc|group|grupo|holding|brasil|brazil)\b/g, ' ')
    .replace(/[.\s]+/g, ' ')
    .trim();
}

/** Chave estável do link da vaga: ID do LinkedIn/Gupy/Vagas.com, ou URL sem rastreamento e sem barra final. */
export function jobUrlKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const li = s.match(/linkedin\.[^/]+\/jobs\/view\/(?:[^/?#]*-)?(\d{6,})/i) ?? s.match(/[?&]currentJobId=(\d{6,})/i);
  if (li) return `linkedin:${li[1]}`;
  const gupy = s.match(/([a-z0-9-]+)\.gupy\.io\/jobs?\/(\d+)/i);
  if (gupy) return `gupy:${gupy[2]}`;
  const vagas = s.match(/vagas\.com\.br\/vagas\/v(\d+)/i);
  if (vagas) return `vagascom:${vagas[1]}`;
  try {
    const u = new URL(s);
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|ref|trk|refId|trackingId|jobBoardSource|source)/i.test(k)) u.searchParams.delete(k);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}${u.search}`.toLowerCase();
  } catch {
    return s.toLowerCase();
  }
}

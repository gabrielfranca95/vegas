import { get, nowIso, run } from './db.ts';
import { normalizeText } from './similarity.ts';

/**
 * Geocodificação via OpenStreetMap (Nominatim), com cache no banco para respeitar a política de uso
 * (no máximo 1 requisição por segundo e identificação no User-Agent).
 */

const UA = 'VagasCRM/1.0 (+https://github.com/gabrielfranca95/vegas)';
let lastCall = 0;

export interface GeoPoint {
  lat: number;
  lon: number;
  label: string;
}

async function throttle() {
  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

export async function geocode(place: string): Promise<GeoPoint | null> {
  const query = place.trim();
  if (!query) return null;
  const withCountry = /brasil|brazil/i.test(query) ? query : `${query}, Brasil`;
  const key = normalizeText(withCountry);
  const cached = await get<{ lat: number | null; lon: number | null; label: string | null }>('SELECT lat, lon, label FROM geocache WHERE query = ?', key);
  if (cached) return cached.lat === null || cached.lon === null ? null : { lat: cached.lat, lon: cached.lon, label: cached.label ?? query };

  await throttle();
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(withCountry)}`;
    const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'pt-BR' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    const hit = data[0];
    const point = hit ? { lat: Number(hit.lat), lon: Number(hit.lon), label: hit.display_name } : null;
    await run(
      'INSERT INTO geocache (query, lat, lon, label, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (query) DO NOTHING',
      key,
      point?.lat ?? null,
      point?.lon ?? null,
      point?.label ?? null,
      nowIso(),
    );
    return point;
  } catch {
    return null;
  }
}

/** Distância em km entre dois pontos (fórmula de haversine). */
export function distanceKm(a: GeoPoint, b: GeoPoint) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Endereço (dentre os informados) mais próximo do local da vaga; null se não der para localizar. */
export async function nearestAddress(addresses: string[], jobPlace: string): Promise<{ address: string; km: number } | null> {
  const target = await geocode(jobPlace);
  if (!target) return null;
  let best: { address: string; km: number } | null = null;
  for (const address of addresses) {
    const p = await geocode(address);
    if (!p) continue;
    const km = distanceKm(p, target);
    if (!best || km < best.km) best = { address, km };
  }
  return best;
}

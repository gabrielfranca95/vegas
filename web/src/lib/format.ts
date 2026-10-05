export function relativeTime(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '';
  const diffMs = new Date(iso).getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const min = Math.round(abs / 60_000);
  const h = Math.round(abs / 3_600_000);
  const d = Math.round(abs / 86_400_000);
  const txt = min < 1 ? 'agora' : min < 60 ? `${min} min` : h < 24 ? `${h} h` : d === 1 ? '1 dia' : `${d} dias`;
  if (txt === 'agora') return txt;
  return diffMs < 0 ? `há ${txt}` : `em ${txt}`;
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Converte ISO para o valor de <input type="datetime-local"> no fuso local. */
export function toLocalInput(iso: string | null | undefined) {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string) {
  return v ? new Date(v).toISOString() : new Date().toISOString();
}

export function formatHours(h: number | null | undefined) {
  if (h === null || h === undefined) return '—';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)} h`;
  return `${(h / 24).toFixed(1)} dias`;
}

export function formatPct(x: number | null | undefined) {
  if (x === null || x === undefined) return '—';
  return `${Math.round(x * 100)}%`;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const uid = () => crypto.randomUUID();

export type DueTone = 'late' | 'today' | 'soon' | 'later';

/** Texto curto de prazo: "atrasado 3 dias", "hoje", "amanhã", "em 4 dias (09/10)". */
export function dueInfo(iso: string | null | undefined, now = new Date()): { text: string; tone: DueTone } | null {
  if (!iso) return null;
  const due = new Date(iso);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(due) - startOf(now)) / 86_400_000);
  const dm = due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  if (due.getTime() <= now.getTime() && days < 0) return { text: `atrasado ${-days === 1 ? '1 dia' : `${-days} dias`}`, tone: 'late' };
  if (days <= 0) return { text: 'hoje', tone: 'today' };
  if (days === 1) return { text: `amanhã (${dm})`, tone: 'soon' };
  return { text: `em ${days} dias (${dm})`, tone: days <= 2 ? 'soon' : 'later' };
}

export function shortDate(iso: string | null | undefined) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

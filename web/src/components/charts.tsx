import { useState } from 'react';

// Tokens de gráfico (paleta de referência validada): uma cor de destaque + cinza de contexto.
export const VIZ = {
  accent: '#2a78d6',
  accentTrack: '#cde2fb',
  deemphasis: '#c3c2b7',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  muted: '#898781',
  text: '#0b0b0b',
  textSecondary: '#52514e',
};

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

function niceMax(v: number) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => v / s <= 4) ?? 10 * pow;
  return Math.ceil(v / step) * step;
}

/** Colunas de uma única série ao longo do tempo, com tooltip por coluna. */
export function ColumnChart({ title, data, height = 150 }: { title: string; data: { label: string; tooltip: string; value: number }[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const ticks = [0, max / 2, max];
  const w = 100 / Math.max(1, data.length);
  const total = data.reduce((s, d) => s + d.value, 0);
  const last = data[data.length - 1]?.value ?? 0;

  return (
    <figure className="rounded-xl border border-slate-200 bg-white p-4">
      <figcaption className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        <span className="text-xs text-slate-500">
          total {fmt(total)} · esta semana <b className="text-slate-800">{fmt(last)}</b>
        </span>
      </figcaption>
      <div className="relative flex" style={{ height }}>
        <div className="flex w-7 shrink-0 flex-col justify-between pr-1 text-right text-[10px] tabular-nums" style={{ color: VIZ.muted }}>
          {[...ticks].reverse().map((t) => (
            <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {fmt(t)}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 h-px" style={{ bottom: `${(t / max) * 100}%`, backgroundColor: t === 0 ? VIZ.axis : VIZ.grid }} />
          ))}
          <div className="absolute inset-0 flex items-end">
            {data.map((d, i) => (
              <div
                key={i}
                className="relative flex h-full items-end justify-center"
                style={{ width: `${w}%` }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={() => setHover(hover === i ? null : i)}
              >
                {hover === i && <div className="absolute inset-y-0 inset-x-[2px] rounded bg-slate-100" />}
                <div
                  className="relative w-[70%] max-w-6 rounded-t"
                  style={{ height: `${(d.value / max) * 100}%`, backgroundColor: hover === null || hover === i ? VIZ.accent : VIZ.deemphasis, minHeight: d.value ? 2 : 0 }}
                />
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full z-10 mb-1 rounded-md bg-slate-900 px-2 py-1 text-[11px] whitespace-nowrap text-white shadow">
                    {d.tooltip}: <b>{fmt(d.value)}</b>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-1 ml-7 flex text-[10px]" style={{ color: VIZ.muted }}>
        {data.map((d, i) => (
          <span key={i} className="text-center" style={{ width: `${w}%` }}>
            {(data.length - 1 - i) % Math.ceil(data.length / 6) === 0 ? d.label : ''}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Barras horizontais de um funil (uma cor), com valor na ponta e % em relação à primeira etapa. */
export function FunnelBars({ steps }: { steps: { label: string; value: number }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  const base = steps[0]?.value || 0;
  return (
    <ul className="space-y-2">
      {steps.map((s) => (
        <li key={s.label} className="grid grid-cols-[7.5rem_1fr] items-center gap-2 sm:grid-cols-[10rem_1fr]">
          <span className="truncate text-xs text-slate-600" title={s.label}>
            {s.label}
          </span>
          <div className="flex items-center gap-2" title={`${s.label}: ${s.value}`}>
            <div className="h-5 rounded-r" style={{ width: `${(s.value / max) * 100}%`, minWidth: s.value ? 3 : 0, maxWidth: 'calc(100% - 5.5rem)', backgroundColor: VIZ.accent }} />
            <span className="text-xs whitespace-nowrap text-slate-800 tabular-nums">
              <b>{fmt(s.value)}</b>
              {base > 0 && s !== steps[0] && <span className="text-slate-500"> · {Math.round((s.value / base) * 100)}%</span>}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Comparação de duas taxas: o grupo em foco na cor de destaque, o outro em cinza. */
export function CompareBars({ items }: { items: { label: string; rate: number | null; detail: string; emphasis?: boolean }[] }) {
  return (
    <ul className="space-y-3">
      {items.map((it) => (
        <li key={it.label}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="font-medium text-slate-700">{it.label}</span>
            <span className="text-slate-500">{it.detail}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-5 flex-1 rounded-r" style={{ backgroundColor: '#f1f0ec' }}>
              <div className="h-full rounded-r" style={{ width: `${(it.rate ?? 0) * 100}%`, backgroundColor: it.emphasis ? VIZ.accent : VIZ.deemphasis }} />
            </div>
            <span className="w-10 text-right text-sm font-semibold text-slate-800 tabular-nums">{it.rate === null ? '—' : `${Math.round(it.rate * 100)}%`}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Mini tendência de 12 pontos: histórico em cinza, ponto atual em destaque. */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const W = 100;
  const H = 28;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 3 - (v / max) * (H - 6)] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-7 w-full overflow-visible" preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke={VIZ.deemphasis} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={3} fill={VIZ.accent} stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function StatTile({ label, value, sub, trend }: { label: string; value: string; sub?: string; trend?: number[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
      {trend && (
        <div className="mt-2">
          <Sparkline values={trend} />
        </div>
      )}
    </div>
  );
}

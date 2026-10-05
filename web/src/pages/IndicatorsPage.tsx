import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Target, TrendingDown } from 'lucide-react';
import type { Indicators, MetricsBucket, WeeklyPoint } from '../../../shared/types';
import { PLATFORMS, ROLE_CATEGORIES } from '../../../shared/types';
import { ColumnChart, CompareBars, FunnelBars, StatTile, VIZ } from '../components/charts';
import { api } from '../lib/api';
import { formatHours, formatPct } from '../lib/format';
import { useData } from '../lib/store';
import { useToast } from '../lib/toast';

const RANGES = [
  { weeks: 8, label: '8 semanas' },
  { weeks: 12, label: '12 semanas' },
  { weeks: 26, label: '6 meses' },
  { weeks: 52, label: '1 ano' },
];

const weekLabel = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

const series = (weekly: WeeklyPoint[], key: keyof Omit<WeeklyPoint, 'weekStart'>, name: string) =>
  weekly.map((w) => ({ label: weekLabel(w.weekStart), tooltip: `${name} · semana de ${weekLabel(w.weekStart)}`, value: w[key] }));

export default function IndicatorsPage() {
  const { contacts, jobs, evs } = useData();
  const toast = useToast();
  const [weeks, setWeeks] = useState(12);
  const [data, setData] = useState<Indicators | null>(null);

  useEffect(() => {
    api.indicators(weeks).then(setData).catch((e) => toast((e as Error).message, 'error'));
  }, [weeks, contacts, jobs, evs, toast]);

  if (!data) {
    return (
      <div className="grid h-full place-items-center text-slate-500">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const g = data.goal;
  const progress = g.completed % g.interactionsPerOffer;
  const cycles = Math.floor(g.completed / g.interactionsPerOffer);
  const onTrack = g.offers >= Math.floor(g.expectedOffers);
  const w = data.weekly;

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-4 p-3 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-slate-900">Indicadores</h1>
          <div className="flex rounded-lg bg-white p-0.5 text-xs shadow-sm ring-1 ring-slate-200">
            {RANGES.map((r) => (
              <button
                key={r.weeks}
                onClick={() => setWeeks(r.weeks)}
                className={`rounded-md px-2.5 py-1.5 font-medium ${weeks === r.weeks ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Meta principal */}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start gap-6">
            <div>
              <p className="flex items-center gap-1.5 text-sm text-slate-500">
                <Target size={15} /> Interações completas
              </p>
              <p className="text-5xl font-semibold text-slate-900">{g.completed}</p>
              <p className="mt-1 text-xs text-slate-500">pessoa respondeu ou o ciclo foi encerrado</p>
            </div>
            <div className="min-w-64 flex-1">
              <p className="mb-1 text-sm text-slate-700">
                Rumo à próxima meta: <b>{progress}</b> de {g.interactionsPerOffer} {cycles > 0 && <span className="text-slate-500">({cycles} ciclo(s) completo(s))</span>}
              </p>
              <div className="h-3 overflow-hidden rounded-full" style={{ backgroundColor: VIZ.accentTrack }} role="meter" aria-valuenow={progress} aria-valuemax={g.interactionsPerOffer}>
                <div className="h-full rounded-full" style={{ width: `${(progress / g.interactionsPerOffer) * 100}%`, backgroundColor: VIZ.accent }} />
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">Referência</p>
                  <p className="font-semibold text-slate-800">1 proposta / {g.interactionsPerOffer}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">Esperado até agora</p>
                  <p className="font-semibold text-slate-800">{g.expectedOffers.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} proposta(s)</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">Obtido</p>
                  <p className="font-semibold text-slate-800">
                    {g.offers} proposta(s)
                    {g.actualPerOffer !== null && <span className="font-normal text-slate-500"> · 1 a cada {Math.round(g.actualPerOffer)}</span>}
                  </p>
                </div>
              </div>
              {g.completed > 0 && (
                <p className={`mt-2 flex items-center gap-1.5 text-xs font-medium ${onTrack ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {onTrack ? <CheckCircle2 size={14} /> : <TrendingDown size={14} />}
                  {onTrack ? 'Dentro ou acima da referência' : 'Abaixo da referência — revise abordagem, EV e público'}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Respostas" value={String(data.funnel.find((f) => f.key === 'replied')?.value ?? 0)} sub={`no período: ${w.reduce((s, x) => s + x.replies, 0)}`} trend={w.map((x) => x.replies)} />
          <StatTile label="EVs entregues" value={String(data.funnel.find((f) => f.key === 'ev')?.value ?? 0)} sub={`no período: ${w.reduce((s, x) => s + x.evs, 0)}`} trend={w.map((x) => x.evs)} />
          <StatTile label="Entrevistas" value={String(g.interviews)} sub={`no período: ${w.reduce((s, x) => s + x.interviews, 0)}`} trend={w.map((x) => x.interviews)} />
          <StatTile label="Propostas" value={String(g.offers)} sub={`no período: ${w.reduce((s, x) => s + x.offers, 0)}`} trend={w.map((x) => x.offers)} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Funil (desde o início)</h2>
            <FunnelBars steps={data.funnel} />
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-1 text-sm font-semibold text-slate-800">Efeito da Entrega de Valor</h2>
            <p className="mb-3 text-xs text-slate-500">Taxa de resposta de quem recebeu mensagem, com e sem EV. É uma correlação — fica mais confiável com volume.</p>
            <CompareBars
              items={[
                { label: 'Com EV', rate: data.ev.withEV.rate, detail: `${data.ev.withEV.replied} de ${data.ev.withEV.contacts}`, emphasis: true },
                { label: 'Sem EV', rate: data.ev.withoutEV.rate, detail: `${data.ev.withoutEV.replied} de ${data.ev.withoutEV.contacts}` },
              ]}
            />
          </section>
        </div>

        <h2 className="pt-2 text-sm font-semibold text-slate-700">Evolução semanal</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <ColumnChart title="Mensagens enviadas" data={series(w, 'messages', 'Mensagens')} />
          <ColumnChart title="Respostas recebidas" data={series(w, 'replies', 'Respostas')} />
          <ColumnChart title="Interações completas" data={series(w, 'completed', 'Interações completas')} />
          <ColumnChart title="Convites enviados" data={series(w, 'invites', 'Convites')} />
          <ColumnChart title="EVs entregues" data={series(w, 'evs', 'EVs')} />
          <ColumnChart title="Candidaturas (vagas em Aplicado)" data={series(w, 'applications', 'Candidaturas')} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Por plataforma da vaga</h2>
            {data.byPlatform.length === 0 ? (
              <p className="text-sm text-slate-500">Sem vagas ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead className="text-left text-xs text-slate-500">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Plataforma</th>
                      <th className="pr-3 font-medium">Vagas</th>
                      <th className="pr-3 font-medium">Aplicadas</th>
                      <th className="pr-3 font-medium">Entrevistas</th>
                      <th className="font-medium">Propostas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byPlatform.map((p) => (
                      <tr key={p.platform} className="border-t border-slate-100">
                        <td className="py-1.5 pr-3">{PLATFORMS.find((x) => x.key === p.platform)?.label ?? p.platform}</td>
                        <td className="pr-3">{p.jobs}</td>
                        <td className="pr-3">{p.applied}</td>
                        <td className="pr-3">{p.interviews}</td>
                        <td>{p.offers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <RoleTable metrics={data.metrics} />
        </div>

        <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <summary className="cursor-pointer font-semibold text-slate-800">Tabela semanal completa</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead className="text-left text-slate-500">
                <tr>
                  {['Semana', 'Convites', 'Aceites', 'Mensagens', 'Respostas', 'EVs', 'Completas', 'Entrevistas', 'Propostas', 'Vagas novas', 'Candidaturas'].map((h) => (
                    <th key={h} className="py-1 pr-3 font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...w].reverse().map((x) => (
                  <tr key={x.weekStart} className="border-t border-slate-100">
                    <td className="py-1 pr-3">{weekLabel(x.weekStart)}</td>
                    <td className="pr-3">{x.invites}</td>
                    <td className="pr-3">{x.accepted}</td>
                    <td className="pr-3">{x.messages}</td>
                    <td className="pr-3">{x.replies}</td>
                    <td className="pr-3">{x.evs}</td>
                    <td className="pr-3">{x.completed}</td>
                    <td className="pr-3">{x.interviews}</td>
                    <td className="pr-3">{x.offers}</td>
                    <td className="pr-3">{x.jobsAdded}</td>
                    <td>{x.applications}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </div>
  );
}

function RoleTable({ metrics }: { metrics: Indicators['metrics'] }) {
  const rows: [string, MetricsBucket][] = [
    ['Geral', metrics.overall],
    ...ROLE_CATEGORIES.filter((r) => metrics.byRole[r.key]).map((r) => [r.label.split(' / ')[0], metrics.byRole[r.key]!] as [string, MetricsBucket]),
  ];
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-800">Por tipo de pessoa</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1 pr-3 font-medium">Perfil</th>
              <th className="pr-3 font-medium">Aceite</th>
              <th className="pr-3 font-medium">Tempo aceite</th>
              <th className="pr-3 font-medium">Resposta</th>
              <th className="font-medium">Tempo resposta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, b], i) => (
              <tr key={label} className={`border-t border-slate-100 ${i === 0 ? 'font-semibold' : ''}`}>
                <td className="py-1.5 pr-3 whitespace-nowrap">{label}</td>
                <td className="pr-3">{formatPct(b.acceptRate)}</td>
                <td className="pr-3">{formatHours(b.medianAcceptHours)}</td>
                <td className="pr-3">{formatPct(b.replyRate)}</td>
                <td>{formatHours(b.medianReplyHours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Tempos = mediana.</p>
    </section>
  );
}

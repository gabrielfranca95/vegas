import type { MatchAnalysis } from '../../../shared/types';

function List({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-semibold tracking-wide uppercase" style={{ color }}>
        {title}
      </p>
      <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">
        {items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

export default function MatchView({ match, changes }: { match: MatchAnalysis | null; changes?: string[] }) {
  if (!match && !changes?.length) return null;
  const score = match?.score ?? 0;
  const color = score >= 75 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626';
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      {match && (
        <div className="flex items-center gap-3">
          <div className="grid size-14 place-items-center rounded-full border-4 text-lg font-bold" style={{ borderColor: color, color }}>
            {score}
          </div>
          <div>
            <p className="font-semibold text-slate-800">Aderência estimada à vaga</p>
            <p className="text-xs text-slate-500">Estimativa da IA — use como guia, não como verdade absoluta.</p>
          </div>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {match && <List title="Pontos fortes" items={match.strengths} color="#16a34a" />}
        {match && <List title="Lacunas (não adicionadas ao CV)" items={match.gaps} color="#dc2626" />}
        {match && <List title="Palavras-chave ausentes" items={match.missingKeywords} color="#d97706" />}
        {match && <List title="Dicas" items={match.tips} color="#4f46e5" />}
        {changes && <List title="O que a IA mudou no currículo" items={changes} color="#7c3aed" />}
      </div>
    </div>
  );
}

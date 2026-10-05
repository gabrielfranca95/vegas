import type { ResumeData } from '../../../../shared/types';

const LABELS = {
  pt: { summary: 'Resumo profissional', experiences: 'Experiência profissional', education: 'Formação acadêmica', skills: 'Habilidades', languages: 'Idiomas', certifications: 'Certificações', projects: 'Projetos', current: 'Atual' },
  en: { summary: 'Professional summary', experiences: 'Professional experience', education: 'Education', skills: 'Skills', languages: 'Languages', certifications: 'Certifications', projects: 'Projects', current: 'Present' },
};

const bullets = (t: string) =>
  t
    .split('\n')
    .map((l) => l.replace(/^\s*[-•*–]\s*/, '').trim())
    .filter(Boolean);

function H({ children }: { children: string }) {
  return <h3 className="mt-4 mb-1.5 border-b border-slate-300 pb-0.5 text-[11px] font-bold tracking-[0.08em] text-blue-900 uppercase">{children}</h3>;
}

/** Prévia em HTML que espelha o layout do PDF exportado. */
export default function ResumePreview({ data }: { data: ResumeData }) {
  const L = LABELS[data.lang];
  const p = data.personal;
  const contacts = [p.location, p.phone, p.email, p.linkedin, p.github, p.website].filter((s) => s.trim());
  return (
    <div className="mx-auto min-h-[860px] w-full max-w-[640px] bg-white px-10 py-9 text-[11px] leading-snug text-slate-800 shadow-md">
      <h1 className="text-2xl font-bold text-slate-900">{p.name || 'Seu nome'}</h1>
      {p.headline && <p className="text-[13px] text-blue-900">{p.headline}</p>}
      {contacts.length > 0 && <p className="mt-1 text-[10px] text-slate-500">{contacts.join('   |   ')}</p>}

      {data.summary.trim() && (
        <>
          <H>{L.summary}</H>
          <p className="text-justify">{data.summary}</p>
        </>
      )}

      {data.experiences.length > 0 && (
        <>
          <H>{L.experiences}</H>
          {data.experiences.map((e) => (
            <div key={e.id} className="mb-2">
              <div className="flex justify-between gap-2">
                <p className="font-bold">{[e.role, e.company].filter(Boolean).join(' — ')}</p>
                <p className="shrink-0 text-slate-500">{[e.start, e.current ? L.current : e.end].filter(Boolean).join(' – ')}</p>
              </div>
              {e.location && <p className="text-slate-500 italic">{e.location}</p>}
              <ul className="mt-0.5 list-disc pl-4">
                {bullets(e.description).map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}

      {data.projects.length > 0 && (
        <>
          <H>{L.projects}</H>
          {data.projects.map((x) => (
            <div key={x.id} className="mb-1.5">
              <p className="font-bold">{x.name}</p>
              {x.link && <p className="text-slate-500 italic">{x.link}</p>}
              <ul className="list-disc pl-4">
                {bullets(x.description).map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}

      {data.skills.length > 0 && (
        <>
          <H>{L.skills}</H>
          {data.skills.map((s) => (
            <p key={s.id}>
              {s.category && <b>{s.category}: </b>}
              {s.items}
            </p>
          ))}
        </>
      )}

      {data.education.length > 0 && (
        <>
          <H>{L.education}</H>
          {data.education.map((e) => (
            <div key={e.id} className="mb-1">
              <div className="flex justify-between gap-2">
                <p className="font-bold">{[e.degree, e.institution].filter(Boolean).join(' — ')}</p>
                <p className="shrink-0 text-slate-500">{[e.start, e.end].filter(Boolean).join(' – ')}</p>
              </div>
              {e.description && (
                <ul className="list-disc pl-4">
                  {bullets(e.description).map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </>
      )}

      {data.certifications.length > 0 && (
        <>
          <H>{L.certifications}</H>
          {data.certifications.map((c) => (
            <p key={c.id}>• {[c.name, c.issuer, c.year].filter(Boolean).join(' — ')}</p>
          ))}
        </>
      )}

      {data.languages.length > 0 && (
        <>
          <H>{L.languages}</H>
          <p>{data.languages.map((l) => (l.level ? `${l.name} (${l.level})` : l.name)).join('   •   ')}</p>
        </>
      )}

      {data.closing?.text.trim() && (
        <>
          <H>{data.closing.title.trim() || (data.lang === 'en' ? 'Professional philosophy' : 'Filosofia profissional')}</H>
          <p className="text-justify">{data.closing.text}</p>
        </>
      )}
    </div>
  );
}

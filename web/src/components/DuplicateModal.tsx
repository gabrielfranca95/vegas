import { AlertTriangle, ExternalLink, FileText, Users } from 'lucide-react';
import type { DuplicateCandidate } from '../../../shared/types';
import { PLATFORMS } from '../../../shared/types';
import { formatDate } from '../lib/format';
import { useData } from '../lib/store';
import { Badge, Button, Modal, PLATFORM_COLORS } from './ui';

/** Aviso de possível vaga repetida antes de adicioná-la ao quadro. */
export default function DuplicateModal({
  candidates,
  newLink,
  onCancel,
  onAddAnyway,
  onSameJob,
}: {
  candidates: DuplicateCandidate[];
  newLink: string;
  onCancel: () => void;
  onAddAnyway: () => void;
  onSameJob: (existingId: number) => void;
}) {
  const { settings } = useData();
  const column = (key: string) => settings?.kanbanColumns.find((c) => c.key === key);
  return (
    <Modal
      open
      onClose={onCancel}
      width="max-w-2xl"
      title={
        <span className="flex items-center gap-2 text-amber-700">
          <AlertTriangle size={18} /> Essa vaga pode já estar no seu quadro
        </span>
      }
      footer={
        <>
          <Button onClick={onCancel}>Cancelar</Button>
          <Button onClick={onAddAnyway}>
            São vagas diferentes — adicionar mesmo assim
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        Pode ser a mesma vaga publicada em outro site (ou cadastrada antes). Também pode ser outra vaga parecida da mesma empresa. Confira para não enviar o currículo duas vezes.
      </p>
      <ul className="space-y-3">
        {candidates.map(({ job, score, reasons }) => {
          const col = column(job.status);
          return (
            <li key={job.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase">{job.company_name || 'Empresa?'}</p>
                  <p className="font-semibold text-slate-900">{job.title || 'Sem título'}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${score >= 0.8 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                  {Math.round(score * 100)}% parecida
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <Badge color={PLATFORM_COLORS[job.platform]}>{PLATFORMS.find((p) => p.key === job.platform)?.label ?? job.platform}</Badge>
                {col && <Badge color={col.color}>{col.label}</Badge>}
                {job.applied_at && <span className="font-semibold text-red-700">Você aplicou em {formatDate(job.applied_at)}</span>}
                {job.tailored_resume_id && (
                  <span className="flex items-center gap-1">
                    <FileText size={12} /> CV gerado
                  </span>
                )}
                {job.contacts_count > 0 && (
                  <span className="flex items-center gap-1">
                    <Users size={12} /> {job.contacts_count} pessoa(s)
                  </span>
                )}
                {job.url && (
                  <a href={job.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-indigo-600 hover:underline">
                    <ExternalLink size={12} /> ver vaga existente
                  </a>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-500">{reasons.join(' · ')}</p>
              <Button size="sm" variant="primary" className="mt-2" onClick={() => onSameJob(job.id)}>
                É a mesma vaga — abrir a existente{newLink ? ' e guardar o novo link nela' : ''}
              </Button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

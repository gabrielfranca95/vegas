import { useState, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import type { ResumeAIAction } from '../../../../shared/types';
import { RESUME_AI_ACTIONS } from '../../../../shared/types';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { Button, Dropdown, MenuItem, Modal, Textarea } from '../ui';

interface Props<T> {
  resumeId: number;
  section: string;
  content: T;
  onApply: (value: T) => void;
  /** Normaliza o retorno da IA para o formato esperado. */
  coerce: (raw: unknown, current: T) => T;
  render: (value: T) => ReactNode;
  label?: string;
}

/** Botão "✨ IA" de uma seção: escolhe a ação, chama a IA e mostra antes/depois para aplicar ou descartar. */
export default function AIButton<T>({ resumeId, section, content, onApply, coerce, render, label = 'IA' }: Props<T>) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [suggestion, setSuggestion] = useState<{ value: T; notes?: string } | null>(null);

  const run = async (action: ResumeAIAction, instr?: string) => {
    setLoading(true);
    try {
      const out = await api.resumes.aiSection(resumeId, { section, content, action, instruction: instr });
      setSuggestion({ value: coerce(out.result, content), notes: out.notes });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dropdown
        align="right"
        trigger={(toggle) => (
          <Button size="sm" variant="ai" icon={<Sparkles size={13} />} loading={loading} onClick={toggle}>
            {label}
          </Button>
        )}
      >
        {(close) =>
          RESUME_AI_ACTIONS.map((a) => (
            <MenuItem
              key={a.key}
              onClick={() => {
                close();
                if (a.key === 'custom') setCustomOpen(true);
                else run(a.key);
              }}
            >
              {a.label}
            </MenuItem>
          ))
        }
      </Dropdown>

      <Modal
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        title="Instrução para a IA"
        footer={
          <Button
            variant="ai"
            icon={<Sparkles size={15} />}
            disabled={!instruction.trim()}
            onClick={() => {
              setCustomOpen(false);
              run('custom', instruction);
            }}
          >
            Gerar
          </Button>
        }
      >
        <Textarea autoFocus rows={4} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="ex.: destaque minha experiência com liderança e reduza para 3 bullets" />
      </Modal>

      <Modal
        open={!!suggestion}
        onClose={() => setSuggestion(null)}
        title="Sugestão da IA"
        width="max-w-5xl"
        footer={
          <>
            <Button onClick={() => setSuggestion(null)}>Descartar</Button>
            <Button
              variant="primary"
              onClick={() => {
                onApply(suggestion!.value);
                setSuggestion(null);
                toast('Sugestão aplicada');
              }}
            >
              Aplicar sugestão
            </Button>
          </>
        }
      >
        {suggestion && (
          <div className="space-y-3">
            {suggestion.notes && <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-800">{suggestion.notes}</p>}
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Atual</p>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">{render(content)}</div>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold tracking-wide text-emerald-600 uppercase">Sugestão</p>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-sm">{render(suggestion.value)}</div>
              </div>
            </div>
            <p className="text-xs text-slate-500">Confira se nada foi inventado. Marcadores como [X%] são para você preencher com o número real.</p>
          </div>
        )}
      </Modal>
    </>
  );
}

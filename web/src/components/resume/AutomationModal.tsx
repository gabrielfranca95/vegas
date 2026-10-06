import { useState } from 'react';
import { ShieldCheck, Sparkles, Wand2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useData } from '../../lib/store';
import { useToast } from '../../lib/toast';
import { Button, Modal, Textarea } from '../ui';
import AddressFields from '../AddressFields';

const EXAMPLE = `Sou profissional de [área] com foco em [especialidades]. Ao adaptar para cada vaga:
- Se for vaga de [cargo A], destaque [experiências/temas A]; se for [cargo B], destaque [temas B].
- Use as palavras-chave que os recrutadores da vaga procuram.
- Também domino (mesmo que não esteja no currículo base): [ferramentas e competências reais].
- Endereços que posso usar no cabeçalho: [bairro/cidade 1], [bairro/cidade 2]. Escolha o mais próximo da vaga (ou o mais vantajoso se for híbrido/presencial).
- No final, inclua a seção "Filosofia profissional" com o texto: "[seu texto]".`;

export default function AutomationModal({ onClose }: { onClose: () => void }) {
  const { settings, setSettings, jobs, resumes, refresh } = useData();
  const toast = useToast();
  const [instructions, setInstructions] = useState(settings?.resumeAutomation.instructions ?? '');
  const [auto, setAuto] = useState(settings?.resumeAutomation.autoOnNewJob ?? true);
  const [flexibleTitles, setFlexibleTitles] = useState(settings?.resumeAutomation.flexibleTitles ?? false);
  const [estimateDates, setEstimateDates] = useState(settings?.resumeAutomation.estimateDates ?? false);
  const [addresses, setAddresses] = useState<string[]>(settings?.profile.addresses ?? []);
  const [saving, setSaving] = useState(false);
  const [queuing, setQueuing] = useState(false);

  const official = resumes.find((r) => r.is_official);
  const pending = jobs.filter((j) => j.description && j.resumes_count === 0 && j.status !== 'encerrado' && !j.tailoring).length;

  const save = async () => {
    setSaving(true);
    try {
      setSettings(
        await api.settings.save({
          resumeAutomation: { instructions, autoOnNewJob: auto, flexibleTitles, estimateDates },
          profile: { ...settings!.profile, addresses: addresses.map((a) => a.trim()).filter(Boolean) },
        }),
      );
      toast('Automação salva');
      return true;
    } catch (e) {
      toast((e as Error).message, 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const runPending = async () => {
    if (!(await save())) return;
    setQueuing(true);
    try {
      const { queued } = await api.jobs.tailorPending();
      await refresh(['jobs']);
      toast(queued ? `${queued} vaga(s) na fila. Os currículos aparecem na lista conforme ficam prontos.` : 'Nenhuma vaga pendente.', 'info');
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setQueuing(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Automação do currículo"
      width="max-w-3xl"
      footer={
        <>
          <Button onClick={onClose}>Fechar</Button>
          <Button icon={<Wand2 size={15} />} loading={queuing} disabled={!pending || !official} onClick={runPending}>
            Adaptar vagas pendentes ({pending})
          </Button>
          <Button variant="primary" loading={saving} onClick={async () => (await save()) && onClose()}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
          <p>
            <b>Como funciona:</b> o currículo <b>oficial (★)</b> é a base. Para cada vaga com descrição, a IA cria a versão adaptada seguindo as suas instruções abaixo e ela
            aparece na lista de currículos e no card da vaga, pronta para PDF/Word.
          </p>
          {!official && <p className="mt-1 font-medium text-amber-700">Você ainda não tem currículo oficial — cadastre ou importe primeiro.</p>}
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="size-4 accent-indigo-600" />
          Adaptar automaticamente toda vaga nova que entrar no quadro com descrição
        </label>

        <div>
          <p className="mb-1 text-xs font-semibold text-slate-600">Suas instruções de adaptação (o seu prompt)</p>
          <Textarea rows={12} autoGrow value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder={EXAMPLE} className="text-sm" />
          {!instructions.trim() && (
            <button type="button" onClick={() => setInstructions(EXAMPLE)} className="mt-1 flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline">
              <Sparkles size={12} /> Usar o modelo como ponto de partida
            </button>
          )}
        </div>

        <AddressFields value={addresses} onChange={setAddresses} />

        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input type="checkbox" checked={flexibleTitles} onChange={(e) => setFlexibleTitles(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-indigo-600" />
            <span>
              <b>Meus cargos não tinham nome formal</b> — a IA pode nomear cada cargo pelo que eu realmente fazia, usando o vocabulário da vaga quando corresponder (sem subir a
              senioridade).
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input type="checkbox" checked={estimateDates} onChange={(e) => setEstimateDates(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-indigo-600" />
            <span>
              <b>Não lembro as datas exatas</b> — quando faltar data no currículo base, a IA estima o período (só o ano), coerente com a ordem das experiências.
            </span>
          </label>
          <p className="text-xs text-slate-500">Cargos renomeados e datas estimadas aparecem em “Revisar antes de enviar”, nas notas de cada currículo adaptado.</p>
        </div>

        <div className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 text-xs text-emerald-900">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" />
          <p>
            A IA segue as suas instruções usando o currículo base + o que você declarar aqui (ex.: “também domino RD Station”). Ela não inventa empresas, formações, números ou
            ferramentas. O que a vaga pede e você não declarou aparece como “Lacunas” na versão adaptada, para você decidir se acrescenta aqui.
          </p>
        </div>
      </div>
    </Modal>
  );
}

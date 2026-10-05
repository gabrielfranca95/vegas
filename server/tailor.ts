import type { MatchAnalysis, Resume } from '../shared/types.ts';
import { completeJson } from './ai.ts';
import { get, nowIso, run } from './db.ts';
import { buildTailorPrompt } from './prompts.ts';
import { createResume, getOfficialResume, getResume, ownJob } from './repo.ts';
import { normalizeResume } from './resume-utils.ts';
import { getSettings } from './settings.ts';
import { statusByJob } from './tailor-status.ts';

export interface TailorResult {
  resume: Resume;
  changes: string[];
  match: MatchAnalysis | null;
}

/**
 * Adapta o currículo base (o oficial, se não for informado) para uma vaga do quadro.
 * Se a vaga já tem um currículo adaptado, ele é atualizado em vez de criar outro.
 */
export async function tailorForJob(userId: number, jobId: number, baseResumeId?: number): Promise<TailorResult> {
  const job = await ownJob(userId, jobId);
  if (!job) throw new Error('Vaga não encontrada');
  if (!job.description?.trim()) throw new Error('A vaga não tem descrição — busque pelo link ou cole a descrição.');
  const base = baseResumeId ? await getResume(userId, baseResumeId) : await getOfficialResume(userId);
  if (!base) throw new Error('Cadastre o currículo base (oficial) na aba Currículo.');

  const settings = await getSettings(userId);
  const { system, prompt } = buildTailorPrompt(
    base.data,
    { title: job.title, company: job.company_name, description: job.description, location: job.location, workModel: job.work_model },
    settings.resumeAutomation.instructions,
    { flexibleTitles: settings.resumeAutomation.flexibleTitles, estimateDates: settings.resumeAutomation.estimateDates },
  );
  const out = await completeJson<{ resume: unknown; changes?: string[]; match?: MatchAnalysis }>({ userId, system, prompt, maxTokens: 16000 });
  if (!out.resume) throw new Error('A IA não retornou o currículo adaptado. Tente novamente.');

  const data = normalizeResume(out.resume);
  // O texto final do currículo base (ex.: filosofia profissional) é mantido exatamente igual em todas as versões.
  if (base.data.closing.text.trim()) data.closing = { ...base.data.closing };
  const name = `${job.company_name ?? 'Vaga'} · ${job.title}`.slice(0, 120);
  // Cargos renomeados e datas estimadas ficam destacados para o candidato conferir.
  const toReview = (out.changes ?? []).filter((c) => /^(cargo renomeado|data estimada)/i.test(c.trim()));
  const otherChanges = (out.changes ?? []).filter((c) => !toReview.includes(c));
  const notes = [
    toReview.length ? `Revisar antes de enviar:\n- ${toReview.join('\n- ')}` : '',
    out.match ? `Aderência estimada: ${out.match.score}%` : '',
    otherChanges.length ? `Mudanças:\n- ${otherChanges.join('\n- ')}` : '',
    out.match?.gaps?.length ? `Lacunas (a vaga pede e o currículo não demonstra):\n- ${out.match.gaps.join('\n- ')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const existing = await get<{ id: number }>(
    'SELECT id FROM resumes WHERE user_id = ? AND job_id = ? AND is_official = 0 ORDER BY updated_at DESC LIMIT 1',
    userId,
    jobId,
  );
  let resume: Resume;
  if (existing) {
    await run('UPDATE resumes SET name = ?, data = ?, notes = ?, updated_at = ? WHERE id = ?', name, JSON.stringify(data), notes, nowIso(), existing.id);
    resume = (await getResume(userId, existing.id))!;
  } else {
    resume = await createResume(userId, name, data, { official: false, jobId, notes });
  }
  return { resume, changes: out.changes ?? [], match: out.match ?? null };
}

// ---------- Fila de adaptação automática ----------

const queues = new Map<number, number[]>();
const running = new Set<number>();

async function drain(userId: number) {
  if (running.has(userId)) return;
  running.add(userId);
  try {
    const queue = queues.get(userId) ?? [];
    while (queue.length) {
      const jobId = queue.shift()!;
      statusByJob.set(jobId, { status: 'running', error: null });
      try {
        await tailorForJob(userId, jobId);
        statusByJob.delete(jobId);
      } catch (err) {
        statusByJob.set(jobId, { status: 'error', error: (err as Error).message });
        console.warn(`[curriculo] adaptação da vaga ${jobId} falhou: ${(err as Error).message}`);
      }
    }
  } finally {
    running.delete(userId);
  }
}

/** Coloca vagas na fila de adaptação (uma por vez por usuário, para respeitar limites da IA). */
export function enqueueTailoring(userId: number, jobIds: number[]) {
  const queue = queues.get(userId) ?? [];
  for (const id of jobIds) {
    if (queue.includes(id) || statusByJob.get(id)?.status === 'running') continue;
    queue.push(id);
    statusByJob.set(id, { status: 'queued', error: null });
  }
  queues.set(userId, queue);
  void drain(userId);
}

/** Dispara a adaptação automática de uma vaga nova, se o usuário ativou e tudo o que ela precisa existe. */
export async function maybeAutoTailor(userId: number, jobId: number) {
  const settings = await getSettings(userId);
  if (!settings.resumeAutomation.autoOnNewJob || !settings.ai.keys[settings.ai.provider]) return;
  const job = await ownJob(userId, jobId);
  if (!job?.description?.trim()) return;
  if (!(await getOfficialResume(userId))) return;
  const has = await get('SELECT id FROM resumes WHERE user_id = ? AND job_id = ? LIMIT 1', userId, jobId);
  if (has) return;
  enqueueTailoring(userId, [jobId]);
}

/** Estado da adaptação automática por vaga (em memória: some ao reiniciar, o que só apaga avisos antigos). */
export type TailorStatus = { status: 'queued' | 'running' | 'error'; error: string | null };

export const statusByJob = new Map<number, TailorStatus>();

export function tailoringStatus(jobId: number): TailorStatus | null {
  return statusByJob.get(jobId) ?? null;
}

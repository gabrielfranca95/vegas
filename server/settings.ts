import type { AIProvider, PublicSettings, Settings } from '../shared/types.ts';
import { get, run } from './db.ts';

const keyFor = (userId: number) => `app:${userId}`;

const PROVIDERS: AIProvider[] = ['gemini', 'openai', 'anthropic', 'deepseek'];

const ENV_KEYS: Record<AIProvider, string> = {
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
};

export const DEFAULT_SETTINGS: Settings = {
  ai: {
    provider: 'gemini',
    keys: { gemini: '', openai: '', anthropic: '', deepseek: '' },
    models: {
      gemini: 'gemini-3.5-flash',
      openai: 'gpt-5-mini',
      anthropic: 'claude-sonnet-5-5',
      deepseek: 'deepseek-chat',
    },
    fallbacks: {
      gemini: ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest'],
      openai: [],
      anthropic: [],
      deepseek: [],
    },
  },
  profile: {
    name: '',
    headline: '',
    targetRoles: '',
    pitch: '',
    tone: 'profissional, cordial e direto, sem parecer robótico',
  },
  strategy: [
    'Postura de protagonista: fale como quem resolve problemas e gera resultado, não como quem pede um favor. Nada de "gostaria de uma oportunidade"; mostre o que você faz e o que a empresa ganha.',
    'Método STAR: ao citar experiência, use 1–2 frases com Situação/Tarefa, Ação e Resultado concreto tirado do currículo (nunca invente números).',
    'Reciprocidade: sempre que possível entregue algo útil ANTES de pedir (a Entrega de Valor — EV). Quem recebe valor tende a querer retribuir.',
    'Interesse do outro: deixe claro o ganho da pessoa (ex.: para o recrutador, um candidato forte que fecha a vaga mais rápido; para o gestor, alguém que resolve o problema do time).',
    'Diga menos do que o necessário: mensagens curtas, uma ideia por mensagem, termine com uma pergunta fácil de responder.',
    'Micro-compromissos: peça primeiro algo pequeno (uma opinião, uma confirmação) antes do pedido maior (conversa, indicação, entrevista).',
    'Faça a pessoa se sentir competente e valorizada citando algo específico dela ou da empresa, sem bajulação.',
    'Limites: nunca minta, não invente urgência, outras propostas ou contatos em comum.',
  ].join('\n'),
  goal: { interactionsPerOffer: 200 },
  resumeAutomation: { instructions: '', autoOnNewJob: true },
  approach: {
    recrutador:
      'Seja direto e objetivo. Cite a vaga específica (ou a área), resuma em uma frase por que o perfil encaixa (stack principal + tempo de experiência) e pergunte sobre o processo/próximos passos. Facilite o trabalho do recrutador: ofereça enviar o currículo.',
    funcionario:
      'Tom de colega de área. Demonstre curiosidade genuína sobre o time, a cultura e o dia a dia. Não peça indicação logo de cara: primeiro gere conexão; a indicação vem depois, se a conversa evoluir.',
    lider_tecnico:
      'Tom técnico e de igual para igual. Mostre domínio da stack/problemas que o time provavelmente resolve, cite brevemente um projeto ou resultado relevante e pergunte sobre os desafios técnicos do time.',
    gerente:
      'Foque em impacto e resultado para o time/negócio. Seja breve, mostre como pode contribuir e pergunte se faz sentido conversar sobre a vaga ou quem é a melhor pessoa para falar.',
    diretor:
      'Extremamente curto e respeitoso com o tempo. Foco em valor estratégico e resultados. Peça direcionamento para a pessoa certa em vez de pedir algo grande.',
    dono:
      'Curto e humano. Interesse genuíno pelo produto/empresa (cite algo específico se possível) e como você pode gerar valor. Sem formalidade excessiva.',
    outro: 'Profissional e cordial, objetivo, deixando claro o interesse e o motivo do contato.',
  },
  followup: {
    inviteStaleDays: 7,
    days: [3, 5, 7],
    maxFollowups: 2,
    inviteNoteLimit: 200,
  },
  kanbanColumns: [
    { key: 'salvas', label: 'Salvas', color: '#64748b' },
    { key: 'aplicar', label: 'Para aplicar', color: '#0ea5e9' },
    { key: 'aplicado', label: 'Aplicado', color: '#6366f1' },
    { key: 'contato', label: 'Em contato', color: '#a855f7' },
    { key: 'entrevista', label: 'Entrevistas', color: '#f59e0b' },
    { key: 'teste', label: 'Teste técnico', color: '#f97316' },
    { key: 'proposta', label: 'Proposta', color: '#22c55e' },
    { key: 'encerrado', label: 'Encerrado', color: '#ef4444' },
  ],
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Merge profundo: objetos são mesclados, arrays e primitivos são substituídos. */
function deepMerge<T>(base: T, patch: unknown): T {
  if (!isObject(base) || !isObject(patch)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = k in out ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

export async function getSettings(userId: number): Promise<Settings> {
  const row = await get<{ value: string }>('SELECT value FROM settings WHERE key = ?', keyFor(userId));
  const stored = row ? JSON.parse(row.value) : {};
  const settings = deepMerge(structuredClone(DEFAULT_SETTINGS), stored);
  for (const p of PROVIDERS) {
    if (!settings.ai.keys[p] && process.env[ENV_KEYS[p]]) settings.ai.keys[p] = process.env[ENV_KEYS[p]]!;
  }
  return settings;
}

async function saveSettings(userId: number, settings: Settings) {
  await run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    keyFor(userId),
    JSON.stringify(settings),
  );
}

const MASK = '••••';

export function maskKey(key: string) {
  if (!key) return '';
  return MASK + key.slice(-4);
}

export function toPublic(settings: Settings): PublicSettings {
  const keys = {} as Record<AIProvider, string>;
  const hasKey = {} as Record<AIProvider, boolean>;
  for (const p of PROVIDERS) {
    keys[p] = maskKey(settings.ai.keys[p]);
    hasKey[p] = Boolean(settings.ai.keys[p]);
  }
  return { ...settings, ai: { ...settings.ai, keys }, hasKey };
}

/** Aplica um patch vindo do front. Chaves mascaradas (inalteradas) são ignoradas. */
export async function updateSettings(userId: number, patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings(userId);
  const incomingKeys = patch.ai?.keys;
  if (patch.ai) {
    const { keys: _ignored, ...restAi } = patch.ai;
    patch = { ...patch, ai: restAi as Settings['ai'] };
  }
  const merged = deepMerge(current, patch);
  if (incomingKeys) {
    for (const p of PROVIDERS) {
      const v = incomingKeys[p];
      if (typeof v === 'string' && !v.startsWith(MASK)) merged.ai.keys[p] = v.trim();
    }
  }
  await saveSettings(userId, merged);
  return merged;
}

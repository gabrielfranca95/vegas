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
    addresses: [],
  },
  strategy: [
    'INTENÇÃO CLARA E ELEGANTE: com recrutador/RH, deixe claro que o candidato está mapeando o mercado para o próximo desafio profissional na área dele. Nunca peça vaga ou CV diretamente; o fechamento abre a porta ("explorarmos possíveis oportunidades de colaboração no time").',
    'ESPECIFICIDADE: cite pelo nome 1-2 iniciativas, produtos, áreas ou frentes REAIS da empresa (do site, da vaga ou das anotações). Proibido texto que serviria para qualquer empresa ("recentes movimentos sobre transformação digital", "admiro o trabalho da empresa").',
    'VALOR NA PRÓPRIA MENSAGEM: traga 1-2 resultados reais do currículo, com número quando existir, ligados ao setor/desafio da empresa. O material anexo (Flash Report) reforça, mas a mensagem precisa ter valor mesmo se o PDF não for aberto. Nunca "identifiquei alguns pontos" sem dizer quais.',
    'PONTE: conecte a experiência do candidato aos desafios ou ao setor da empresa ("atuo nos mesmos setores críticos que vocês").',
    'MATERIAL CERTO PARA QUEM RECEBE: recrutador recebe fit executivo (como o candidato resolve desafios do time, com resultados); tech lead/gestor recebe perspectiva técnica; diretor/dono recebe visão de negócio. "Reflexão estratégica" só para diretor/dono.',
    'FOLLOW-UP: pergunta curta, fácil e dentro da área de quem recebe. Para recrutador: "quais características vocês consideram essenciais no perfil de <cargo> na <empresa>?". Proibido perguntas abstratas sobre o futuro da tecnologia ou do mercado.',
    'CONVERSA: responda o cumprimento ("estou bem, e você?"), depois responda exatamente o que foi perguntado com prova concreta. Pretensão salarial: se a senioridade/escopo não foi informado, pergunte isso antes; se já foi, responda com uma faixa.',
    'QUALIDADE: português impecável, sem "novamente"/"de novo" na abertura, sem emojis soltos, sem bajulação. Frases curtas. Nunca a mesma mensagem para duas pessoas da mesma empresa.',
    'LIMITES: nunca invente números, projetos, iniciativas da empresa, urgência ou contatos em comum.',
  ].join('\n'),
  examples: [
    'FUNCIONOU — 1ª mensagem para Talent Acquisition (FCamara), com PDF anexo:',
    '"Olá, Eduarda. Tudo bem? Sou Engenheiro de Software e, ao mapear o mercado para o meu próximo desafio profissional focado em Engenharia e IA, o ecossistema da FCamara (especialmente o trabalho do Núcleo de IA e o Digital Value Creation) destacou-se imediatamente no meu radar. Como tenho forte atuação nos mesmos setores críticos que vocês, decidi compartilhar um Executive Flash Report (anexo) com algumas perspectivas técnicas. Nele, abordo como o uso estratégico da AWS e de linguagens como Clojure e Python tem me permitido reduzir custos de nuvem em até 40% (FinOps) e blindar integrações de IA (RAG) contra alucinações. Acredito que essa visão de eficiência e código limpo tem total sinergia com os pilares operacionais de vocês. Fico à disposição para trocarmos ideias e explorarmos possíveis oportunidades de colaboração no time."',
    'FUNCIONOU — follow-up 7 dias depois: "Olá Eduarda, espero que esteja bem. Gostaria de saber quais características você considera essenciais para o perfil de um Engenheiro de Software na FCamara. Aprecio a oportunidade de entender melhor o que valorizam na equipe." → ela ofereceu uma vaga.',
    'FUNCIONOU — pretensão: perguntaram a pretensão; resposta: "Olá Eduarda, estou bem, e você como está? Qual o nível de senioridade da vaga? Com base nisso consigo pensar na minha faixa de pretensão com mais equilíbrio." → informou a faixa depois → conversa marcada.',
    'NÃO FUNCIONOU (8 de 8 ignoradas ou "se inscreva no site") — EVITE: "Olá novamente Ana. Acompanhando os recentes movimentos da LWSA sobre transformação digital, preparei uma análise com perspectivas que podem ser relevantes para as próximas decisões. Com base em minha experiência na área de tecnologia, identifiquei alguns pontos que talvez agreguem à reflexão estratégica. Fico à disposição para trocar ideias quando for conveniente." (genérica, sem intenção, sem iniciativa real citada, sem resultado concreto, "reflexão estratégica" para uma recrutadora).',
    'NÃO FUNCIONOU — follow-ups abstratos: "Como você vê o futuro do desenvolvimento back end na BRQ?", "Como a evolução da tecnologia vai afetar o mercado de trabalho?".',
  ].join('\n'),
  goal: { interactionsPerOffer: 200 },
  resumeAutomation: { instructions: '', autoOnNewJob: true, flexibleTitles: false, estimateDates: false },
  approach: {
    recrutador:
      'Deixe clara a intenção (próximo desafio na área), cite iniciativas reais da empresa e mostre fit com resultados concretos. Material: fit executivo. Follow-up: pergunte quais características valorizam no perfil do cargo na empresa. Quando ela trouxer uma vaga, responda com objetividade.',
    funcionario:
      'Tom de colega de área. Mostre que conhece o trabalho do time (cite algo real) e faça uma pergunta genuína sobre o dia a dia ou desafios do time. Indicação só se a conversa evoluir.',
    lider_tecnico:
      'Tom técnico, de igual para igual. Cite uma frente técnica real da empresa e um resultado técnico concreto do candidato ligado a ela. Material: perspectiva técnica específica.',
    gerente:
      'Foco em impacto no time e no negócio: ligue um resultado concreto do candidato (prazo, custo, qualidade, receita) a um desafio real da área dele. Curto.',
    diretor: 'Extremamente curto e de negócio: uma iniciativa real da empresa + um resultado concreto do candidato que conversa com ela. Material: visão estratégica.',
    dono: 'Curto e humano: interesse genuíno por algo específico do produto/empresa + uma ideia prática de valor baseada na experiência real.',
    outro: 'Profissional e cordial, específico sobre a empresa, com intenção clara e sem pedir nada diretamente.',
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


/** Textos padrão antigos: contas que nunca os editaram recebem os padrões novos automaticamente. */
const LEGACY_DEFAULTS = {
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
  if (stored.strategy === LEGACY_DEFAULTS.strategy) delete stored.strategy;
  for (const [k, v] of Object.entries(LEGACY_DEFAULTS.approach)) {
    if (stored.approach?.[k] === v) delete stored.approach[k];
  }
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

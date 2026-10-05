// Tipos compartilhados entre o servidor (server/) e o front (web/).
// Importados sempre com `import type`, então não geram código em runtime.

export type AIProvider = 'gemini' | 'openai' | 'anthropic' | 'deepseek';

export const AI_PROVIDERS: { key: AIProvider; label: string; defaultModel: string }[] = [
  { key: 'gemini', label: 'Google Gemini', defaultModel: 'gemini-3.5-flash' },
  { key: 'openai', label: 'OpenAI (ChatGPT)', defaultModel: 'gpt-5-mini' },
  { key: 'anthropic', label: 'Anthropic (Claude)', defaultModel: 'claude-sonnet-5-5' },
  { key: 'deepseek', label: 'DeepSeek', defaultModel: 'deepseek-chat' },
];

export type RoleCategory =
  | 'recrutador'
  | 'funcionario'
  | 'lider_tecnico'
  | 'gerente'
  | 'diretor'
  | 'dono'
  | 'outro';

export const ROLE_CATEGORIES: { key: RoleCategory; label: string }[] = [
  { key: 'recrutador', label: 'Recrutador / RH / Talent' },
  { key: 'funcionario', label: 'Funcionário (colega de área)' },
  { key: 'lider_tecnico', label: 'Líder técnico / Tech Lead' },
  { key: 'gerente', label: 'Gerente / Head / Coordenador' },
  { key: 'diretor', label: 'Diretor / VP / C-level' },
  { key: 'dono', label: 'Dono / Fundador / CEO' },
  { key: 'outro', label: 'Outro' },
];

export type Platform = 'linkedin' | 'gupy' | 'riovagas' | 'indeed' | 'vagascom' | 'email' | 'whatsapp' | 'outro';

export const PLATFORMS: { key: Platform; label: string }[] = [
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'gupy', label: 'Gupy' },
  { key: 'riovagas', label: 'RioVagas' },
  { key: 'indeed', label: 'Indeed' },
  { key: 'vagascom', label: 'Vagas.com' },
  { key: 'email', label: 'E-mail' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'outro', label: 'Outro' },
];

export type ContactStage = 'novo' | 'convite_enviado' | 'conectado' | 'aguardando' | 'conversa' | 'encerrado';

export const CONTACT_STAGES: { key: ContactStage; label: string }[] = [
  { key: 'novo', label: 'A abordar' },
  { key: 'convite_enviado', label: 'Convite enviado' },
  { key: 'conectado', label: 'Conectado' },
  { key: 'aguardando', label: 'Aguardando resposta' },
  { key: 'conversa', label: 'Em conversa' },
  { key: 'encerrado', label: 'Encerrado' },
];

export type EventType =
  | 'invite_sent'
  | 'invite_accepted'
  | 'message_sent'
  | 'followup_sent'
  | 'reply_received'
  | 'ev_delivered'
  | 'interview'
  | 'offer'
  | 'note'
  | 'closed'
  | 'reopened';

export const EVENT_LABELS: Record<EventType, string> = {
  invite_sent: 'Convite enviado',
  invite_accepted: 'Aceitou o convite',
  message_sent: 'Mensagem enviada',
  followup_sent: 'Follow-up enviado',
  reply_received: 'Respondeu',
  ev_delivered: 'EV entregue',
  interview: 'Entrevista marcada',
  offer: 'Proposta recebida',
  note: 'Anotação',
  closed: 'Encerrado',
  reopened: 'Reaberto',
};

export type MessageKind = 'invite_note' | 'first_message' | 'ev_delivery' | 'followup' | 'reply' | 'direct';

export const MESSAGE_KINDS: { key: MessageKind; label: string }[] = [
  { key: 'invite_note', label: 'Nota do convite de conexão' },
  { key: 'first_message', label: 'Primeira mensagem (após aceitar)' },
  { key: 'ev_delivery', label: 'Entrega de Valor (EV)' },
  { key: 'followup', label: 'Follow-up' },
  { key: 'reply', label: 'Responder a mensagem dele(a)' },
  { key: 'direct', label: 'Mensagem direta (InMail / e-mail)' },
];

export interface KanbanColumn {
  key: string;
  label: string;
  color: string;
}

export interface Settings {
  ai: {
    provider: AIProvider;
    keys: Record<AIProvider, string>;
    models: Record<AIProvider, string>;
    /** Modelos reserva, tentados em ordem quando o principal está indisponível. */
    fallbacks: Record<AIProvider, string[]>;
  };
  profile: {
    name: string;
    headline: string;
    targetRoles: string;
    pitch: string;
    tone: string;
  };
  /** Diretrizes de influência aplicadas a todas as mensagens (postura, STAR, reciprocidade…). */
  strategy: string;
  approach: Record<RoleCategory, string>;
  goal: {
    /** Meta de referência: quantas interações completas por proposta. */
    interactionsPerOffer: number;
  };
  followup: {
    inviteStaleDays: number;
    days: number[];
    maxFollowups: number;
    inviteNoteLimit: number;
  };
  kanbanColumns: KanbanColumn[];
}

/** Settings como o front recebe: chaves mascaradas + flag indicando se existem. */
export interface PublicSettings extends Settings {
  hasKey: Record<AIProvider, boolean>;
}

export interface Company {
  id: number;
  name: string;
  website: string | null;
  linkedin_url: string | null;
  notes: string | null;
}

export interface Job {
  id: number;
  company_id: number | null;
  company_name: string | null;
  title: string;
  url: string | null;
  platform: Platform;
  status: string;
  position: number;
  location: string | null;
  work_model: string | null;
  salary: string | null;
  description: string | null;
  notes: string | null;
  apply_email: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
  contacts_count: number;
  urgent_contacts: number;
  resumes_count: number;
}

export interface ContactEvent {
  id: number;
  contact_id: number;
  type: EventType;
  content: string | null;
  occurred_at: string;
}

export type NextActionKind =
  | 'invite'
  | 'wait_invite'
  | 'invite_stale'
  | 'first_message'
  | 'reply'
  | 'followup'
  | 'wait_reply'
  | 'close_suggest'
  | 'in_process'
  | 'snoozed'
  | 'none';

export interface NextAction {
  kind: NextActionKind;
  label: string;
  dueAt: string | null;
  urgent: boolean;
  suggestedMessage: MessageKind | null;
}

export type CadenceStatus = 'done' | 'current' | 'upcoming' | 'skipped';

/** Uma etapa da jornada de abordagem de uma pessoa. */
export interface CadenceStep {
  key: string;
  label: string;
  status: CadenceStatus;
  /** Quando aconteceu (etapas concluídas). */
  at: string | null;
  /** Prazo/previsão (etapa atual e próximas). */
  dueAt: string | null;
  hint: string | null;
  messageKind: MessageKind | null;
}

export interface Cadence {
  phase: 'abordagem' | 'conversa' | 'encerrado';
  steps: CadenceStep[];
  currentIndex: number;
  /** Número da etapa atual dentro da fase de abordagem e total de etapas dela. */
  stepNumber: number;
  stepTotal: number;
}

export interface ProfileData {
  url: string;
  name: string;
  headline: string;
  roleTitle: string;
  company: string;
  location: string;
  about: string;
  previousCompanies: string[];
  roleCategory: RoleCategory;
  warning?: string;
}

export interface Contact {
  id: number;
  name: string;
  linkedin_url: string | null;
  role_category: RoleCategory;
  role_title: string | null;
  company_id: number | null;
  company_name: string | null;
  job_id: number | null;
  job_title: string | null;
  platform: Platform;
  stage: ContactStage;
  notes: string | null;
  snooze_until: string | null;
  draft: string | null;
  created_at: string;
  updated_at: string;
  events: ContactEvent[];
  nextAction: NextAction;
  cadence: Cadence;
  lastActivityAt: string;
}

export interface MetricsBucket {
  contacts: number;
  invitesSent: number;
  invitesAccepted: number;
  acceptRate: number | null;
  avgAcceptHours: number | null;
  medianAcceptHours: number | null;
  messaged: number;
  replied: number;
  replyRate: number | null;
  avgReplyHours: number | null;
  medianReplyHours: number | null;
  repliedAfterFollowup: number;
}

export interface Metrics {
  overall: MetricsBucket;
  byRole: Partial<Record<RoleCategory, MetricsBucket>>;
}

// ---------- Currículo ----------

export interface ResumeExperience {
  id: string;
  company: string;
  role: string;
  location: string;
  start: string;
  end: string;
  current: boolean;
  description: string; // uma linha por bullet
}

export interface ResumeEducation {
  id: string;
  institution: string;
  degree: string;
  start: string;
  end: string;
  description: string;
}

export interface ResumeSkillGroup {
  id: string;
  category: string;
  items: string; // separado por vírgula
}

export interface ResumeLanguage {
  id: string;
  name: string;
  level: string;
}

export interface ResumeCertification {
  id: string;
  name: string;
  issuer: string;
  year: string;
}

export interface ResumeProject {
  id: string;
  name: string;
  link: string;
  description: string;
}

export interface ResumeData {
  lang: 'pt' | 'en';
  personal: {
    name: string;
    headline: string;
    email: string;
    phone: string;
    location: string;
    linkedin: string;
    github: string;
    website: string;
  };
  summary: string;
  experiences: ResumeExperience[];
  education: ResumeEducation[];
  skills: ResumeSkillGroup[];
  languages: ResumeLanguage[];
  certifications: ResumeCertification[];
  projects: ResumeProject[];
}

export interface Resume {
  id: number;
  name: string;
  is_official: boolean;
  job_id: number | null;
  job_title: string | null;
  company_name: string | null;
  data: ResumeData;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MatchAnalysis {
  score: number;
  strengths: string[];
  gaps: string[];
  missingKeywords: string[];
  tips: string[];
}

export interface ResumeReview {
  score: number;
  summary: string;
  items: { section: string; severity: 'alta' | 'media' | 'baixa'; issue: string; suggestion: string }[];
}

export type ResumeAIAction = 'improve' | 'impact' | 'concise' | 'ats' | 'translate_en' | 'translate_pt' | 'custom';

export const RESUME_AI_ACTIONS: { key: ResumeAIAction; label: string }[] = [
  { key: 'improve', label: 'Melhorar a escrita' },
  { key: 'impact', label: 'Mais impacto e resultados' },
  { key: 'concise', label: 'Deixar mais conciso' },
  { key: 'ats', label: 'Otimizar para ATS (palavras-chave)' },
  { key: 'translate_en', label: 'Traduzir para inglês' },
  { key: 'translate_pt', label: 'Traduzir para português' },
  { key: 'custom', label: 'Instrução personalizada…' },
];

export interface ScrapedJob {
  url: string;
  platform: Platform;
  title: string;
  company: string;
  location: string;
  workModel: string;
  description: string;
  applyEmail: string;
  warning?: string;
}

// ---------- Login ----------

export interface User {
  id: number;
  username: string;
  name: string;
}

export interface AuthStatus {
  user: User | null;
  canRegister: boolean;
  hasUsers: boolean;
  /** Cadastro exige código de convite (ambiente publicado). */
  needsCode: boolean;
}

// ---------- EV (Entrega de Valor) ----------

export type EVKind = 'flash_report' | 'analise_vaga' | 'diagnostico' | 'plano_30_60_90' | 'benchmark' | 'poc' | 'conteudo' | 'outro';

export const EV_KINDS: { key: EVKind; label: string; hint: string }[] = [
  { key: 'flash_report', label: 'Flash Report (PDF)', hint: 'Relatório de 1 página sobre a empresa/área com achados e oportunidades.' },
  { key: 'analise_vaga', label: 'Leitura da vaga', hint: 'O que o time provavelmente precisa resolver e como você atacaria (com STAR).' },
  { key: 'diagnostico', label: 'Diagnóstico rápido', hint: 'Observações sobre produto, site, app ou processo público da empresa, com sugestões.' },
  { key: 'plano_30_60_90', label: 'Plano 30-60-90', hint: 'Como seriam seus primeiros 90 dias no cargo.' },
  { key: 'benchmark', label: 'Benchmark / tendências', hint: 'Como concorrentes e o mercado estão resolvendo um tema relevante para eles.' },
  { key: 'poc', label: 'Prova de conceito', hint: 'Um protótipo, script ou snippet que resolve um pedaço de um problema deles.' },
  { key: 'conteudo', label: 'Conteúdo curado', hint: 'Material útil e específico para a pessoa (artigo, checklist, guia).' },
  { key: 'outro', label: 'Outro', hint: 'Formato livre.' },
];

export type EVStatus = 'ideia' | 'pronto' | 'entregue';

export const EV_STATUSES: { key: EVStatus; label: string }[] = [
  { key: 'ideia', label: 'Ideia' },
  { key: 'pronto', label: 'Pronto para entregar' },
  { key: 'entregue', label: 'Entregue' },
];

export interface EV {
  id: number;
  contact_id: number | null;
  contact_name: string | null;
  job_id: number | null;
  job_title: string | null;
  company_id: number | null;
  company_name: string | null;
  kind: EVKind;
  title: string;
  summary: string | null;
  content: string;
  status: EVStatus;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EVIdea {
  kind: EVKind;
  title: string;
  summary: string;
  whyItWorks: string;
  effort: 'baixo' | 'medio' | 'alto';
}

// ---------- Indicadores ----------

export interface WeeklyPoint {
  weekStart: string;
  invites: number;
  accepted: number;
  messages: number;
  replies: number;
  evs: number;
  completed: number;
  interviews: number;
  offers: number;
  jobsAdded: number;
  applications: number;
}

export interface Indicators {
  goal: {
    interactionsPerOffer: number;
    completed: number;
    offers: number;
    interviews: number;
    /** Interações completas por proposta obtida (null se ainda não houve proposta). */
    actualPerOffer: number | null;
    expectedOffers: number;
  };
  funnel: { key: string; label: string; value: number }[];
  weekly: WeeklyPoint[];
  byPlatform: { platform: Platform; jobs: number; applied: number; interviews: number; offers: number }[];
  ev: {
    withEV: { contacts: number; replied: number; rate: number | null };
    withoutEV: { contacts: number; replied: number; rate: number | null };
  };
  metrics: Metrics;
}

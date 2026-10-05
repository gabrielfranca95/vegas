import type {
  Contact,
  EventType,
  Job,
  MatchAnalysis,
  MessageKind,
  Metrics,
  PublicSettings,
  Resume,
  ResumeAIAction,
  ResumeData,
  ResumeReview,
  ScrapedJob,
  Settings,
  Company,
  AuthStatus,
  User,
  EV,
  EVIdea,
  EVKind,
  EVStatus,
  Indicators,
  ProfileData,
  JobChatMessage,
} from '../../../shared/types';

/** Disparado quando a sessão expira, para o app voltar à tela de login. */
export const UNAUTHORIZED_EVENT = 'vagas:unauthorized';

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  if (res.status === 401 && !url.startsWith('/auth/')) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);
  return data as T;
}

const get = <T>(url: string) => request<T>('GET', url);
const post = <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {});
const put = <T>(url: string, body: unknown) => request<T>('PUT', url, body);
const del = (url: string) => request<void>('DELETE', url);

export type JobInput = Partial<Omit<Job, 'id' | 'company_name'>> & { company?: string };
export type ContactInput = Partial<Omit<Contact, 'id' | 'company_name' | 'events' | 'nextAction'>> & {
  company?: string;
  already_connected?: boolean;
};

export type EVInput = {
  title?: string;
  kind?: EVKind;
  summary?: string | null;
  content?: string;
  status?: EVStatus;
  contact_id?: number | null;
  job_id?: number | null;
  company?: string;
};

export const api = {
  auth: {
    status: () => get<AuthStatus>('/auth/status'),
    login: (email: string, password: string) => post<{ user: User }>('/auth/login', { email, password }),
    register: (email: string, name: string, password: string, code?: string) => post<{ user: User }>('/auth/register', { email, name, password, code }),
    changeEmail: (email: string, password: string) => post<{ user: User }>('/auth/email', { email, password }),
    logout: () => post<void>('/auth/logout'),
    changePassword: (current: string, next: string) => post<void>('/auth/password', { current, next }),
  },
  evs: {
    list: () => get<EV[]>('/evs'),
    create: (input: EVInput) => post<EV>('/evs', input),
    update: (id: number, input: EVInput) => put<EV>(`/evs/${id}`, input),
    remove: (id: number) => del(`/evs/${id}`),
    ideas: (body: { contact_id?: number | null; job_id?: number | null; company?: string; company_url?: string; instruction?: string }) =>
      post<{ ideas: EVIdea[]; usedCompanySite: boolean }>('/evs/ideas', body),
    generate: (id: number, body: { instruction?: string; company_url?: string }) => post<{ ev: EV; usedCompanySite: boolean }>(`/evs/${id}/generate`, body),
    pdfUrl: (id: number, inline = false) => `/api/evs/${id}/pdf${inline ? '?inline=1' : ''}`,
  },
  indicators: (weeks = 12) => get<Indicators>(`/indicators?weeks=${weeks}`),
  settings: {
    get: () => get<PublicSettings>('/settings'),
    save: (patch: Partial<Settings>) => put<PublicSettings>('/settings', patch),
    testAI: (provider: string) => post<{ ok: boolean; reply: string; ms: number; model: string; failed: string[] }>('/settings/test-ai', { provider }),
  },
  jobs: {
    list: () => get<Job[]>('/jobs'),
    companies: () => get<Company[]>('/jobs/companies'),
    updateCompany: (id: number, input: { website?: string; linkedin_url?: string; notes?: string }) => put<Company>(`/jobs/companies/${id}`, input),
    scrape: (url: string) => post<ScrapedJob & { existingJobId: number | null }>('/jobs/scrape', { url }),
    create: (input: JobInput) => post<Job>('/jobs', input),
    update: (id: number, input: JobInput) => put<Job>(`/jobs/${id}`, input),
    reorder: (status: string, ids: number[]) => post<Job[]>('/jobs/reorder', { status, ids }),
    remove: (id: number) => del(`/jobs/${id}`),
    match: (id: number) => post<MatchAnalysis>(`/jobs/${id}/match`),
    tailor: (id: number) => post<Job>(`/jobs/${id}/tailor`),
    tailorPending: () => post<{ queued: number }>('/jobs/tailor-pending'),
    chat: (id: number) => get<JobChatMessage[]>(`/jobs/${id}/chat`),
    sendChat: (id: number, message: string) => post<{ messages: JobChatMessage[]; model: string; failed: string[] }>(`/jobs/${id}/chat`, { message }),
    clearChat: (id: number) => del(`/jobs/${id}/chat`),
  },
  contacts: {
    list: () => get<Contact[]>('/contacts'),
    metrics: () => get<Metrics>('/contacts/metrics'),
    parseProfile: (body: { url?: string; text?: string }) =>
      post<{ profile: ProfileData; notes: string; existingContactId: number | null; suggestedJob: { id: number; title: string } | null }>('/contacts/parse-profile', body),
    create: (input: ContactInput) => post<Contact>('/contacts', input),
    update: (id: number, input: ContactInput) => put<Contact>(`/contacts/${id}`, input),
    remove: (id: number) => del(`/contacts/${id}`),
    addEvent: (id: number, ev: { type: EventType; content?: string; occurred_at?: string; ev_id?: number }) => post<Contact>(`/contacts/${id}/events`, ev),
    updateEvent: (eventId: number, ev: { type?: EventType; content?: string; occurred_at?: string }) => put<Contact>(`/contacts/events/${eventId}`, ev),
    removeEvent: (eventId: number) => request<Contact>('DELETE', `/contacts/events/${eventId}`),
    generate: (id: number, kind: MessageKind, instruction?: string, evId?: number) =>
      post<{ variants: string[]; usedAI: boolean; notice?: string; jobUsed?: string | null; model?: string | null; failed?: string[] }>(`/contacts/${id}/generate`, {
        kind,
        instruction,
        ev_id: evId,
      }),
  },
  resumes: {
    list: () => get<Resume[]>('/resumes'),
    create: (input: { name: string; fromId?: number; data?: ResumeData; official?: boolean }) => post<Resume>('/resumes', input),
    update: (id: number, input: { name?: string; data?: ResumeData; notes?: string | null; job_id?: number | null }) => put<Resume>(`/resumes/${id}`, input),
    setOfficial: (id: number) => post<Resume[]>(`/resumes/${id}/official`),
    remove: (id: number) => del(`/resumes/${id}`),
    exportUrl: (id: number, format: 'pdf' | 'docx', inline = false) => `/api/resumes/${id}/export?format=${format}${inline ? '&inline=1' : ''}`,
    aiSection: (id: number, body: { section: string; content: unknown; action: ResumeAIAction; instruction?: string }) =>
      post<{ result: unknown; notes?: string }>(`/resumes/${id}/ai/section`, body),
    review: (id: number) => post<ResumeReview>(`/resumes/${id}/ai/review`),
    tailor: (id: number, body: { jobId?: number; url?: string; description?: string; title?: string; company?: string }) =>
      post<{ resume: Resume; changes: string[]; match: MatchAnalysis | null; jobId: number }>(`/resumes/${id}/tailor`, body),
    import: (body: { text?: string; fileBase64?: string; filename?: string; name?: string; targetId?: number }) => post<Resume>('/resumes/import', body),
  },
};

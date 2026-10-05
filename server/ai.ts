import type { AIProvider } from '../shared/types.ts';
import { getSettings } from './settings.ts';

export class AIError extends Error {
  status: number;
  /** Erros em que vale tentar outro modelo: indisponível, sobrecarregado, cota ou tempo esgotado. */
  retryable: boolean;
  constructor(message: string, status = 502, retryable = false) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

/** Traduz o status HTTP do provedor numa mensagem curta em português. */
function describeStatus(status: number, model: string, detail: string) {
  if (status === 503 || status === 500 || status === 502 || status === 504) return `${model}: sobrecarregado no provedor (alta demanda)`;
  if (status === 429) return `${model}: limite de uso/cota da chave atingido`;
  if (status === 404) return `${model}: modelo não disponível para esta chave`;
  if (status === 401 || status === 403) return 'chave inválida ou sem permissão';
  return `${model}: ${detail}`;
}

interface CompleteOptions {
  userId: number;
  system: string;
  prompt: string;
  json?: boolean;
  maxTokens?: number;
  provider?: AIProvider;
}

const TIMEOUT_MS = 90_000;

async function postJson(url: string, headers: Record<string, string>, body: unknown, model: string) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timeout = (err as Error).name === 'TimeoutError';
    throw new AIError(timeout ? `${model}: demorou demais para responder` : `${model}: falha de conexão`, 504, true);
  }
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const raw = Array.isArray(data) ? data[0] : data;
    const msg = String(raw?.error?.message ?? raw?.message ?? raw?.raw ?? res.statusText).slice(0, 300);
    const retryable = res.status === 404 || res.status === 429 || res.status >= 500;
    const keyProblem = res.status === 401 || res.status === 403;
    throw new AIError(describeStatus(res.status, model, msg), keyProblem || res.status === 400 ? 400 : 502, retryable);
  }
  return data;
}

async function callOpenAICompatible(baseUrl: string, key: string, model: string, o: CompleteOptions, tokenParam: 'max_tokens' | 'max_completion_tokens') {
  const data = await postJson(
    `${baseUrl}/chat/completions`,
    { authorization: `Bearer ${key}` },
    {
      model,
      messages: [
        { role: 'system', content: o.system },
        { role: 'user', content: o.prompt },
      ],
      [tokenParam]: o.maxTokens,
      ...(o.json ? { response_format: { type: 'json_object' } } : {}),
    },
    model,
  );
  return String(data?.choices?.[0]?.message?.content ?? '');
}

async function callGemini(key: string, model: string, o: CompleteOptions) {
  const data = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { 'x-goog-api-key': key },
    {
      systemInstruction: { parts: [{ text: o.system }] },
      contents: [{ role: 'user', parts: [{ text: o.prompt }] }],
      generationConfig: {
        maxOutputTokens: o.maxTokens,
        ...(o.json ? { responseMimeType: 'application/json' } : {}),
      },
    },
    model,
  );
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p: { text?: string }) => p.text ?? '').join('');
  if (!text) {
    const reason = data?.candidates?.[0]?.finishReason ?? data?.promptFeedback?.blockReason ?? 'resposta vazia';
    // Resposta vazia (ex.: MAX_TOKENS consumido pelo raciocínio interno) também justifica tentar outro modelo.
    throw new AIError(`${model}: não retornou texto (${reason})`, 502, true);
  }
  return text;
}

async function callAnthropic(key: string, model: string, o: CompleteOptions) {
  const data = await postJson(
    'https://api.anthropic.com/v1/messages',
    { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    {
      model,
      max_tokens: o.maxTokens,
      system: o.json ? `${o.system}\n\nResponda SOMENTE com um objeto JSON válido, sem texto antes ou depois.` : o.system,
      messages: [{ role: 'user', content: o.prompt }],
    },
    model,
  );
  return (data?.content ?? [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('');
}

function callModel(provider: AIProvider, key: string, model: string, opts: CompleteOptions & { maxTokens: number }) {
  switch (provider) {
    case 'openai':
      return callOpenAICompatible('https://api.openai.com/v1', key, model, opts, 'max_completion_tokens');
    case 'deepseek':
      return callOpenAICompatible('https://api.deepseek.com', key, model, opts, 'max_tokens');
    case 'gemini':
      return callGemini(key, model, opts);
    case 'anthropic':
      return callAnthropic(key, model, opts);
  }
}

export interface CompletionResult {
  text: string;
  /** Modelo que efetivamente respondeu. */
  model: string;
  /** Modelos tentados antes que falharam, com o motivo. */
  failed: string[];
}

/**
 * Chama o modelo principal e, se ele estiver indisponível (sobrecarga, cota, 404, tempo esgotado ou
 * resposta vazia), tenta os modelos reserva configurados, na ordem. Erros de chave interrompem na hora.
 */
export async function completeWithModel(o: CompleteOptions): Promise<CompletionResult> {
  const settings = await getSettings(o.userId);
  const provider = o.provider ?? settings.ai.provider;
  const key = settings.ai.keys[provider];
  if (!key) {
    throw new AIError(`Nenhuma chave de API configurada para ${provider}. Vá em Configurações → IA.`, 400);
  }
  const chain = [...new Set([settings.ai.models[provider], ...(settings.ai.fallbacks?.[provider] ?? [])].map((m) => m?.trim()).filter(Boolean))];
  const opts = { ...o, maxTokens: o.maxTokens ?? 8000 };
  const failed: string[] = [];
  for (const model of chain) {
    try {
      const text = await callModel(provider, key, model, opts);
      return { text, model, failed };
    } catch (err) {
      if (!(err instanceof AIError) || !err.retryable) throw err;
      // Só modelo e motivo no log (nunca a chave nem o conteúdo), para diagnosticar cota x sobrecarga.
      console.warn(`[ia] ${provider} falhou: ${err.message}`);
      failed.push(err.message);
    }
  }
  throw new AIError(
    `Nenhum modelo respondeu agora. ${failed.join(' · ')}. Tente de novo em alguns minutos ou ajuste os modelos em Configurações → IA.`,
    503,
  );
}

export async function complete(o: CompleteOptions): Promise<string> {
  return (await completeWithModel(o)).text;
}

/** Extrai o primeiro objeto JSON de uma resposta (tolera cercas ``` e texto ao redor). */
export function parseJsonLoose<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        /* cai no erro abaixo */
      }
    }
    throw new AIError('A IA retornou um formato inesperado. Tente novamente.');
  }
}

export async function completeJson<T>(o: Omit<CompleteOptions, 'json'>): Promise<T> {
  const text = await complete({ ...o, json: true });
  return parseJsonLoose<T>(text);
}

export async function completeJsonWithModel<T>(o: Omit<CompleteOptions, 'json'>): Promise<{ data: T; model: string; failed: string[] }> {
  const r = await completeWithModel({ ...o, json: true });
  return { data: parseJsonLoose<T>(r.text), model: r.model, failed: r.failed };
}

import type { AIProvider } from '../shared/types.ts';
import { getSettings } from './settings.ts';

export class AIError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

interface CompleteOptions {
  userId: number;
  system: string;
  prompt: string;
  json?: boolean;
  maxTokens?: number;
  provider?: AIProvider;
}

const TIMEOUT_MS = 120_000;

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.error?.message ?? data?.message ?? data?.raw ?? res.statusText;
    throw new AIError(`Erro do provedor (${res.status}): ${String(msg).slice(0, 400)}`, res.status === 401 || res.status === 403 ? 400 : 502);
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
  );
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p: { text?: string }) => p.text ?? '').join('');
  if (!text) {
    const reason = data?.candidates?.[0]?.finishReason ?? data?.promptFeedback?.blockReason ?? 'resposta vazia';
    throw new AIError(`Gemini não retornou texto (${reason}).`);
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
  );
  return (data?.content ?? [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('');
}

export async function complete(o: CompleteOptions): Promise<string> {
  const settings = getSettings(o.userId);
  const provider = o.provider ?? settings.ai.provider;
  const key = settings.ai.keys[provider];
  const model = settings.ai.models[provider];
  if (!key) {
    throw new AIError(`Nenhuma chave de API configurada para ${provider}. Vá em Configurações → IA.`, 400);
  }
  const opts = { ...o, maxTokens: o.maxTokens ?? 8000 };
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

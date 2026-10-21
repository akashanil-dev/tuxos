// The AI providers a learner can use with their own key. They all speak OpenAI's chat-completions format at
// their own address; the learner picks the provider and one of its models. A custom address (any
// OpenAI-compatible server) exists only where the server enables it, because the server makes the request:
// see net-guard.ts for how every request is kept away from private networks.

import { guardedFetch, type FetchPolicy } from './net-guard.ts';

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  /** Where the learner creates a key. */
  keysUrl: string;
  /** Whether it offers free use (some models, with limits). */
  free: boolean;
  /**
   * How to check a key without spending anything: list models (most), a key endpoint (OpenRouter), or a
   * one-token chat with the chosen model (NVIDIA lists models without a key and has no key endpoint).
   */
  check: 'models' | 'key' | 'chat';
  /** Options only OpenAI accepts, such as reasoning_effort. */
  openai?: boolean;
}

export const PROVIDERS: readonly Provider[] = [
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', keysUrl: 'https://console.groq.com/keys', free: true, check: 'models' },
  { id: 'nvidia', name: 'NVIDIA', baseUrl: 'https://integrate.api.nvidia.com/v1', keysUrl: 'https://build.nvidia.com/settings/api-keys', free: true, check: 'chat' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', keysUrl: 'https://openrouter.ai/settings/keys', free: true, check: 'key' },
  { id: 'gemini', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', keysUrl: 'https://aistudio.google.com/apikey', free: true, check: 'models' },
  { id: 'cerebras', name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1', keysUrl: 'https://cloud.cerebras.ai/platform', free: true, check: 'models' },
  { id: 'mistral', name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', keysUrl: 'https://console.mistral.ai/api-keys', free: true, check: 'models' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', keysUrl: 'https://platform.openai.com/api-keys', free: false, check: 'models', openai: true },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', keysUrl: 'https://platform.deepseek.com/api_keys', free: false, check: 'models' },
  { id: 'together', name: 'Together AI', baseUrl: 'https://api.together.xyz/v1', keysUrl: 'https://api.together.ai/settings/api-keys', free: false, check: 'models' },
];

/** What the server allows beyond the presets. Both default to off; production keeps them off. */
export interface AiPolicy {
  /** ALLOW_CUSTOM_AI_URL=1: learners may enter their own OpenAI-compatible address (public https only). */
  customAllowed: boolean;
  /** ALLOW_PRIVATE_AI_URL=1: a custom address may also be http or private (a local server, in development). */
  privateAllowed: boolean;
}

/** A learner's AI settings: which provider, which model, their key, and the address for a custom one. */
export interface AiSettings {
  provider: string;
  model: string;
  key: string;
  baseUrl?: string;
}

/** Where one learner's AI calls go, and how they may be made. */
export interface ResolvedProvider {
  id: string;
  name: string;
  baseUrl: string;
  check: Provider['check'];
  openai: boolean;
  /** A custom server's error text is not shown to the learner: it could be anything the address returned. */
  custom: boolean;
  fetch: typeof fetch;
}

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
/** Keys are single tokens of letters, digits and - _ . (OpenAI sk-, Groq gsk_, NVIDIA nvapi-, Gemini AIza...). */
const KEY_SHAPE = /^[A-Za-z0-9_.-]{10,400}$/;
const MODEL_SHAPE = /^[A-Za-z0-9_./:@+-]{1,200}$/;

export function validKey(value: unknown): value is string {
  return typeof value === 'string' && KEY_SHAPE.test(value);
}

export function validModel(value: unknown): value is string {
  return typeof value === 'string' && MODEL_SHAPE.test(value);
}

/** Enough of a key to recognise it in Settings, never enough to use it. */
export function keyHint(key: string): string {
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/** Removes anything that looks like an API key (and the given key itself) from text that is logged or shown. */
export function redactKeys(text: string, key?: string): string {
  let clean = key && key.length >= 8 ? text.split(key).join('[redacted]') : text;
  clean = clean.replace(/\b(sk-|gsk_|nvapi-|AIza|xai-|csk-)[A-Za-z0-9_*.-]{6,}/g, '$1[redacted]');
  return clean;
}

/** The list sent to the browser for Settings. */
export function publicProviders(policy: AiPolicy) {
  return {
    providers: PROVIDERS.map(({ id, name, keysUrl, free }) => ({ id, name, keysUrl, free })),
    custom: policy.customAllowed,
  };
}

/** A custom address, cleaned, or an error message. */
export function customBaseUrl(value: unknown, policy: AiPolicy): { url: string } | { error: string } {
  if (!policy.customAllowed) return { error: 'Custom AI addresses are not enabled on this server.' };
  if (typeof value !== 'string' || value.length > 300) return { error: 'Enter the API address, for example https://example.com/v1.' };
  let url: URL;
  try { url = new URL(value.trim()); } catch { return { error: 'That is not a valid address.' }; }
  if (url.protocol !== 'https:' && !(policy.privateAllowed && url.protocol === 'http:')) return { error: 'The address must start with https://.' };
  if (url.username || url.password || url.search || url.hash) return { error: 'The address may not contain a user name, password, query or #.' };
  // On public servers only the standard https port: other ports are where internal services tend to listen.
  if (url.port && !policy.privateAllowed) return { error: 'The address must use the standard https port.' };
  return { url: `${url.origin}${url.pathname}`.replace(/\/+$/, '') };
}

/** Checks the shape of settings sent by a learner and resolves the provider, or says what is wrong. */
export function resolveSettings(value: unknown, policy: AiPolicy, options: { requireModel: boolean } = { requireModel: true }):
  { settings: AiSettings; provider: ResolvedProvider } | { error: string } {
  const input = (value ?? {}) as Record<string, unknown>;
  if (!validKey(input.key)) return { error: 'That does not look like an API key.' };
  if (options.requireModel && !validModel(input.model)) return { error: 'Choose a model.' };
  const model = validModel(input.model) ? input.model : '';
  if (input.provider === 'custom') {
    const custom = customBaseUrl(input.baseUrl, policy);
    if ('error' in custom) return custom;
    return {
      settings: { provider: 'custom', model, key: input.key, baseUrl: custom.url },
      provider: {
        id: 'custom', name: new URL(custom.url).host, baseUrl: custom.url, check: 'models', openai: false, custom: true,
        fetch: guardedFetch({ allowPrivate: policy.privateAllowed, maxBytes: MAX_RESPONSE_BYTES }),
      },
    };
  }
  const preset = PROVIDERS.find((provider) => provider.id === input.provider);
  if (!preset) return { error: 'Choose an AI provider.' };
  const fetchPolicy: FetchPolicy = { allowPrivate: false, maxBytes: MAX_RESPONSE_BYTES };
  return {
    settings: { provider: preset.id, model, key: input.key },
    provider: { id: preset.id, name: preset.name, baseUrl: preset.baseUrl, check: preset.check, openai: !!preset.openai, custom: false, fetch: guardedFetch(fetchPolicy) },
  };
}

export type Check = { ok: true } | { ok: false; status: number; error: string };

/** Whether the provider accepts the key, without spending anything (or one token, for NVIDIA). */
export async function checkKey(provider: ResolvedProvider, key: string, model: string, fetcher: typeof fetch = provider.fetch): Promise<Check> {
  let response: Response;
  try {
    const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
    response = provider.check === 'key'
      ? await fetcher(`${provider.baseUrl}/key`, { headers, signal: AbortSignal.timeout(15_000) })
      : provider.check === 'chat'
        ? await fetcher(`${provider.baseUrl}/chat/completions`, {
          method: 'POST', headers, signal: AbortSignal.timeout(30_000),
          body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 1 }),
        })
        : await fetcher(`${provider.baseUrl}/models`, { headers, signal: AbortSignal.timeout(15_000) });
  } catch {
    return { ok: false, status: 502, error: `Could not reach ${provider.name} to check the key. Try again.` };
  }
  if (response.ok) return { ok: true };
  // Gemini reports a bad key as 400; the others as 401 or 403.
  if ([400, 401, 403].includes(response.status) && provider.check !== 'chat') {
    return { ok: false, status: 400, error: `${provider.name} did not accept this key. Check that you copied all of it.` };
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, status: 400, error: `${provider.name} did not accept this key. Check that you copied all of it.` };
  }
  if (response.status === 404 || response.status === 410) {
    return { ok: false, status: 400, error: `${provider.name} does not offer this model any more. Choose another.` };
  }
  if (response.status === 429) return { ok: false, status: 400, error: `This key is rate limited or out of credits at ${provider.name}. Try again in a minute.` };
  return { ok: false, status: 502, error: `${provider.name} could not check the key (HTTP ${response.status}). Try again.` };
}

/** The provider's chat models, for the learner to choose from. Needs the key where the list is private. */
export async function listModels(provider: ResolvedProvider, key: string, fetcher: typeof fetch = provider.fetch):
  Promise<{ ok: true; models: { id: string; free: boolean }[] } | { ok: false; status: number; error: string }> {
  let response: Response;
  try {
    response = await fetcher(`${provider.baseUrl}/models`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
  } catch {
    return { ok: false, status: 502, error: `Could not reach ${provider.name}. Try again.` };
  }
  if ([400, 401, 403].includes(response.status)) return { ok: false, status: 400, error: `${provider.name} did not accept this key. Check that you copied all of it.` };
  if (!response.ok) return { ok: false, status: 502, error: `${provider.name} could not list its models (HTTP ${response.status}).` };
  const data = await response.json().catch(() => null) as { data?: unknown } | null;
  const entries = Array.isArray(data?.data) ? data.data as { id?: unknown; pricing?: { prompt?: unknown; completion?: unknown } }[] : [];
  const models = entries
    .filter((entry) => validModel(entry?.id))
    // Embedding, reranking and safety models can't chat.
    .filter((entry) => !/(embed|rerank|guard|safety|reward|whisper|tts|dall-e|moderation|clip|-vl-1b)/i.test(entry.id as string))
    .map((entry) => ({
      id: entry.id as string,
      free: /:free$/.test(entry.id as string) || (entry.pricing?.prompt === '0' && entry.pricing?.completion === '0'),
    }))
    .slice(0, 1000)
    .sort((a, b) => Number(b.free) - Number(a.free) || a.id.localeCompare(b.id));
  return { ok: true, models };
}

/** One chat-completions call: the response, and the provider's error text (already redacted) if it failed. */
export async function chat(provider: ResolvedProvider, key: string, body: Record<string, unknown>, timeoutMs: number, fetcher: typeof fetch = provider.fetch):
  Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null; detail: string }> {
  const response = await fetcher(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  const error = data?.error as { message?: unknown } | string | undefined;
  const raw = typeof error === 'string' ? error : typeof error?.message === 'string' ? error.message : '';
  return { ok: response.ok, status: response.status, data, detail: redactKeys(raw, key).slice(0, 300) };
}

/** A failed call, in words a learner can act on. A custom server's own text is never echoed. */
export function failureMessage(provider: ResolvedProvider, status: number, detail: string): string {
  if (status === 401 || status === 403) return `${provider.name} did not accept your API key. Check it in Settings → AI.`;
  if (status === 429) return `${provider.name} says you've hit its rate limit (free plans allow only a few requests a minute). Wait a minute and try again.`;
  if (status === 404 || status === 410) return `${provider.name} does not offer the chosen model any more. Choose another in Settings → AI.`;
  const shown = provider.custom || !detail ? '' : `: ${detail}`;
  return `${provider.name} returned an error (HTTP ${status})${shown}.`;
}

/** A provider's limit on request size or context length, so the call can be retried with less history. */
export function tooLarge(status: number, detail: string): boolean {
  return status === 413 || (status === 400 && /context|too (large|long)|maximum.*tokens|token.*limit|reduce the length/i.test(detail));
}

/** A model that can't use tools (or JSON mode) says so with a 400 that names them. */
export function unsupported(status: number, detail: string, feature: 'tools' | 'json'): boolean {
  if (status !== 400 && status !== 422 && status !== 404) return false;
  return feature === 'tools' ? /tool|function/i.test(detail) : /response_format|json/i.test(detail);
}

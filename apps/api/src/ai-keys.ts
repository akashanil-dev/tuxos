// Learners bring their own AI provider and key; the server has none of its own. A guest's settings stay in
// their browser and go with each AI request in headers, and are never stored here. A signed-in learner's
// settings (provider, model, key) are saved in their account, encrypted so the people running the server
// cannot read them:
//   - each account has a random vault key. The database holds it only wrapped twice: once with a key derived
//     from the learner's password (scrypt), and once per session with a key derived from that session's
//     cookie token. The server keeps neither: the password is never stored and only a hash of the token is.
//   - the settings are sealed (AES-256-GCM) with the vault key.
// So a copy of the database, the server's files and its configuration together reveal no keys. A key is
// decrypted only in memory, for a request that carries the learner's own session cookie, and is never
// logged or sent back. Forgetting the password loses only the saved key: the learner enters it again.
//   GET    /api/ai/providers          -> {available, custom, providers} for Settings
//   POST   /api/ai/models  {provider, key | useSaved, baseUrl?} -> the provider's models to choose from
//   GET    /api/ai/key                -> {saved, provider, model, hint, enabled, locked?} for the account
//   PUT    /api/ai/key  {provider, model, key?, baseUrl?} -> checks the key and model, then saves them
//   DELETE /api/ai/key                -> forgets them
//   PUT    /api/ai/settings {enabled} -> turns the account's AI features on or off
//   POST   /api/ai/test {provider, model, key, baseUrl?} -> checks settings without saving them (guests)
// While the server's AI_FEATURES switch is off, nothing here (or anywhere) calls a provider.

import { createCipheriv, createDecipheriv, createHmac, randomBytes, scrypt } from 'node:crypto';
import {
  checkKey, keyHint, listModels, publicProviders, resolveSettings, type AiPolicy, type AiSettings, type ResolvedProvider,
} from './providers.ts';

/** The headers a guest's browser sends its settings in. */
export const AI_HEADERS = { key: 'x-ai-key', provider: 'x-ai-provider', model: 'x-ai-model', baseUrl: 'x-ai-base-url' } as const;

/** Said whenever AI is asked for while the server has it switched off. */
export const AI_UNAVAILABLE = 'AI features are being rebuilt for a better experience and are switched off for now.';

/** Seals text with a 32-byte key (AES-256-GCM). A sealed value is `v2.<iv>.<tag>.<ciphertext>`, base64url. */
export class KeyBox {
  private readonly secret: Buffer;

  constructor(secret: Buffer) {
    if (secret.length !== 32) throw new Error('a KeyBox key must be 32 bytes');
    this.secret = secret;
  }

  seal(text: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.secret, iv);
    const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return ['v2', ...[iv, cipher.getAuthTag(), data].map((part) => part.toString('base64url'))].join('.');
  }

  /** The text, or undefined if it was sealed with another key or has been tampered with. */
  open(sealed: string): string | undefined {
    const [version, iv, tag, data] = sealed.split('.');
    if (version !== 'v2' || !iv || !tag || !data) return undefined;
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.secret, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
      return undefined;
    }
  }
}

/** Wraps a vault key (bytes) in a box; unwrap returns undefined unless it is a 32-byte key sealed by that box. */
export function wrapVault(box: KeyBox, vault: Buffer): string {
  return box.seal(vault.toString('base64'));
}

export function unwrapVault(box: KeyBox, wrapped: string | null | undefined): Buffer | undefined {
  const opened = wrapped ? box.open(wrapped) : undefined;
  const vault = opened === undefined ? undefined : Buffer.from(opened, 'base64');
  return vault?.length === 32 ? vault : undefined;
}

const SCRYPT = { N: 16384, r: 8, p: 1 };

/** The key that wraps an account's vault, from the learner's password. Only the learner knows the password. */
export function passwordBox(password: string, salt: Buffer): Promise<KeyBox> {
  return new Promise((resolve, reject) => {
    scrypt(password, Buffer.concat([Buffer.from('tuxos-vault:'), salt]), 32, SCRYPT, (error, key) => {
      if (error) reject(error);
      else resolve(new KeyBox(key));
    });
  });
}

/**
 * The key that wraps a session's copy of the vault, from the session token in the learner's cookie. The
 * database stores sha256(token) to find the session; this is an unrelated HMAC, so that hash can't open it.
 */
export function sessionBox(token: string): KeyBox {
  return new KeyBox(createHmac('sha256', token).update('tuxos session vault').digest());
}

/** The signed-in learner's sealed AI settings and switch, reached only through their own session (accounts.ts). */
export interface KeyStore {
  /** The decrypted settings text, or undefined if none is saved or this session can't unlock it. */
  aiSecret(cookieHeader: string | undefined): string | undefined;
  /** False when this session has no vault (it began before vaults existed): sign in again to save. */
  setAiSecret(cookieHeader: string | undefined, secret: string): boolean;
  removeAiSecret(cookieHeader: string | undefined): void;
  hasAiSecret(cookieHeader: string | undefined): boolean;
  canUnlock(cookieHeader: string | undefined): boolean;
  aiEnabled(cookieHeader: string | undefined): boolean;
  setAiEnabled(cookieHeader: string | undefined, enabled: boolean): void;
}

/** The account's saved settings, if this session can unlock them. */
export function savedSettings(store: KeyStore, cookieHeader: string | undefined): AiSettings | undefined {
  const secret = store.aiSecret(cookieHeader);
  if (!secret) return undefined;
  try {
    const value = JSON.parse(secret) as AiSettings;
    return typeof value?.provider === 'string' && typeof value.model === 'string' && typeof value.key === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Checks a learner's key and model with the provider. */
async function verify(settings: AiSettings, provider: ResolvedProvider, fetcher?: typeof fetch): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (provider.check === 'models') {
    // Listing models checks the key, and shows whether the chosen model is one of them.
    const listed = await listModels(provider, settings.key, fetcher);
    if (!listed.ok) return listed;
    if (listed.models.length && !listed.models.some((model) => model.id === settings.model)) {
      return { ok: false, status: 400, error: `${provider.name} does not offer the model ${settings.model}. Choose one from the list.` };
    }
    return { ok: true };
  }
  if (provider.check === 'key') {
    const key = await checkKey(provider, settings.key, settings.model, fetcher);
    if (!key.ok) return key;
    const listed = await listModels(provider, settings.key, fetcher);
    if (listed.ok && listed.models.length && !listed.models.some((model) => model.id === settings.model)) {
      return { ok: false, status: 400, error: `${provider.name} does not offer the model ${settings.model}. Choose one from the list.` };
    }
    return { ok: true };
  }
  // A one-token request checks the key and the model together.
  return checkKey(provider, settings.key, settings.model, fetcher);
}

/** The /api/ai/* routes. `signedIn` says whether the cookie belongs to a live session. */
export async function handleAiKey(
  method: string, path: string, body: unknown, cookieHeader: string | undefined, signedIn: boolean,
  store: KeyStore, policy: AiPolicy & { available: boolean }, fetcher?: typeof fetch,
): Promise<{ status: number; body: unknown }> {
  const value = (body ?? {}) as Record<string, unknown>;
  const route = `${method} ${path}`;
  if (route === 'GET /api/ai/providers') return { status: 200, body: { available: policy.available, ...publicProviders(policy) } };

  const callsProvider = route === 'POST /api/ai/models' || route === 'POST /api/ai/test' || route === 'PUT /api/ai/key';
  if (callsProvider && !policy.available) return { status: 503, body: { error: AI_UNAVAILABLE } };

  if (route === 'POST /api/ai/models') {
    // A signed-in learner changing model reuses their saved key rather than sending it again.
    const saved = value.useSaved === true ? savedSettings(store, cookieHeader) : undefined;
    if (value.useSaved === true && !saved) return { status: 400, body: { error: 'There is no saved key to use. Enter your key.' } };
    const resolved = resolveSettings(saved ?? value, policy, { requireModel: false });
    if ('error' in resolved) return { status: 400, body: { error: resolved.error } };
    if (resolved.provider.check === 'key') {
      const key = await checkKey(resolved.provider, resolved.settings.key, '', fetcher);
      if (!key.ok) return { status: key.status, body: { error: key.error } };
    }
    const listed = await listModels(resolved.provider, resolved.settings.key, fetcher);
    return listed.ok ? { status: 200, body: { models: listed.models } } : { status: listed.status, body: { error: listed.error } };
  }
  if (route === 'POST /api/ai/test') {
    const resolved = resolveSettings(value, policy);
    if ('error' in resolved) return { status: 400, body: { error: resolved.error } };
    const check = await verify(resolved.settings, resolved.provider, fetcher);
    return check.ok ? { status: 200, body: { ok: true, hint: keyHint(resolved.settings.key) } } : { status: check.status, body: { error: check.error } };
  }

  if (path !== '/api/ai/key' && path !== '/api/ai/settings') return { status: 404, body: { error: 'Not found.' } };
  if (!signedIn) return { status: 401, body: { error: 'Not signed in.' } };
  if (path === '/api/ai/settings') {
    if (method !== 'PUT') return { status: 405, body: { error: 'Method not allowed.' } };
    if (typeof value.enabled !== 'boolean') return { status: 400, body: { error: 'Expected { enabled: true | false }.' } };
    store.setAiEnabled(cookieHeader, value.enabled);
    return { status: 200, body: { enabled: value.enabled } };
  }
  if (method === 'GET') {
    const enabled = store.aiEnabled(cookieHeader);
    const saved = savedSettings(store, cookieHeader);
    if (saved) {
      return { status: 200, body: { saved: true, provider: saved.provider, model: saved.model, hint: keyHint(saved.key), ...(saved.baseUrl ? { baseUrl: saved.baseUrl } : {}), enabled } };
    }
    // Settings exist but this session began before vaults: they can't be read until the learner signs in again.
    const locked = store.hasAiSecret(cookieHeader) || !store.canUnlock(cookieHeader);
    return { status: 200, body: { saved: false, enabled, ...(locked ? { locked: true } : {}) } };
  }
  if (method === 'PUT') {
    if (!store.canUnlock(cookieHeader)) return { status: 409, body: { error: LOCKED } };
    // Without a new key, keep the saved one: only for the same provider (and address), so a key never goes
    // to a provider it wasn't made for.
    const saved = savedSettings(store, cookieHeader);
    const sameProvider = saved && saved.provider === value.provider && (saved.provider !== 'custom' || saved.baseUrl === value.baseUrl);
    const key = value.key === undefined && sameProvider ? saved.key : value.key;
    if (value.key === undefined && !sameProvider) return { status: 400, body: { error: 'Enter your API key for this provider.' } };
    const resolved = resolveSettings({ ...value, key }, policy);
    if ('error' in resolved) return { status: 400, body: { error: resolved.error } };
    const check = await verify(resolved.settings, resolved.provider, fetcher);
    if (!check.ok) return { status: check.status, body: { error: check.error } };
    if (!store.setAiSecret(cookieHeader, JSON.stringify(resolved.settings))) return { status: 409, body: { error: LOCKED } };
    const { provider, model, baseUrl } = resolved.settings;
    return { status: 200, body: { saved: true, provider, model, hint: keyHint(resolved.settings.key), ...(baseUrl ? { baseUrl } : {}) } };
  }
  if (method === 'DELETE') {
    store.removeAiSecret(cookieHeader);
    return { status: 200, body: { saved: false } };
  }
  return { status: 405, body: { error: 'Method not allowed.' } };
}

const LOCKED = 'Your AI settings are locked with your password. Sign out and sign in again, then save them.';

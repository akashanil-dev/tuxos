// The learner's own AI provider, model and key (apps/api/src/ai-keys.ts). A signed-in learner's settings are
// saved, encrypted, in their account and the browser never sees the key again; a guest's stay in this browser
// and go with each AI request in headers. The server has no key of its own: without settings, AI is off.
// The AI switch is off until the learner turns it on: for an account it is kept on the server (so it follows
// the learner, and the server refuses to use the key); for a guest, in this browser. And while the server
// doesn't offer AI at all (it is being rebuilt), the switch can't be turned on.

import type { AiKeyStore, AiModelInfo, AiProviderInfo, AiSettingsInput, AiStatus } from '@tuxos/system';

const GUEST_SETTINGS = 'tuxos.ai';
const GUEST_SWITCH = 'tuxos.ai-enabled';
/** Keys kept by older versions, before providers: removed so no stray key stays in the browser. */
const OLD_GUEST_KEY = 'tuxos.openai-key';
const HEADERS = { key: 'x-ai-key', provider: 'x-ai-provider', model: 'x-ai-model', baseUrl: 'x-ai-base-url' } as const;
const UNAVAILABLE = 'AI features are being rebuilt for a better experience and are switched off for now.';

export interface WebAiKeys extends AiKeyStore {
  /** Reload the status for a guest or a signed-in account; call before booting that learner's system. */
  load(signedIn: boolean): Promise<void>;
}

interface GuestSettings {
  provider: string;
  model: string;
  key: string;
  baseUrl?: string;
}

function readGuest(): GuestSettings | null {
  try {
    const value = JSON.parse(localStorage.getItem(GUEST_SETTINGS) ?? 'null') as GuestSettings | null;
    return value && typeof value.provider === 'string' && typeof value.model === 'string' && typeof value.key === 'string' ? value : null;
  } catch {
    return null;
  }
}

function readGuestSwitch(): boolean {
  try { return localStorage.getItem(GUEST_SWITCH) === '1'; } catch { return false; }
}

async function call(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error('The server is not reachable. Check your connection.');
  }
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : `The server failed (HTTP ${response.status}).`);
  return data;
}

const hintOf = (key: string) => `${key.slice(0, 4)}…${key.slice(-4)}`;

export function webAiKeys(): WebAiKeys {
  let signedIn = false;
  let available = false;
  let catalog: { providers: AiProviderInfo[]; custom: boolean } = { providers: [], custom: false };
  let account: { provider: string; model: string; hint: string; baseUrl?: string } | undefined;
  let accountOn = false;
  let locked = false;
  const listeners = new Set<(status: AiStatus) => void>();

  const status = (): AiStatus => {
    const on = available && (signedIn ? accountOn : readGuestSwitch());
    const base = { available, on, signedIn, ...(signedIn && locked ? { locked: true } : {}) };
    if (signedIn && account) {
      const { baseUrl, ...rest } = account;
      return { ...base, enabled: on, source: 'account', ...rest, ...(baseUrl ? { baseUrl } : {}) };
    }
    const guest = signedIn ? null : readGuest();
    if (guest) {
      return {
        ...base, enabled: on, source: 'browser', provider: guest.provider, model: guest.model, hint: hintOf(guest.key),
        ...(guest.baseUrl ? { baseUrl: guest.baseUrl } : {}),
      };
    }
    return { ...base, enabled: false, source: null };
  };
  const changed = () => {
    const now = status();
    for (const listener of listeners) listener(now);
    return now;
  };
  const requireAvailable = () => { if (!available) throw new Error(UNAVAILABLE); };

  return {
    status,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    providers: () => catalog,
    async load(isAccount) {
      signedIn = isAccount;
      account = undefined;
      accountOn = false;
      locked = false;
      try { localStorage.removeItem(OLD_GUEST_KEY); } catch { /* nothing stored */ }
      // If the server can't be asked, AI stays off: the built-in lessons still work.
      const [offered, saved] = await Promise.all([
        call('GET', '/api/ai/providers').catch(() => ({} as Record<string, unknown>)),
        isAccount ? call('GET', '/api/ai/key').catch(() => ({} as Record<string, unknown>)) : Promise.resolve({} as Record<string, unknown>),
      ]);
      available = offered.available === true;
      catalog = {
        providers: Array.isArray(offered.providers) ? offered.providers as AiProviderInfo[] : [],
        custom: offered.custom === true,
      };
      if (saved.saved === true) {
        account = {
          provider: String(saved.provider ?? ''), model: String(saved.model ?? ''), hint: String(saved.hint ?? ''),
          ...(typeof saved.baseUrl === 'string' ? { baseUrl: saved.baseUrl } : {}),
        };
      }
      accountOn = saved.enabled === true;
      locked = saved.locked === true;
      changed();
    },
    async models({ provider, key, baseUrl }) {
      requireAvailable();
      const guest = signedIn ? null : readGuest();
      // Without a new key, use the one already kept for this provider.
      const keep = !key && (signedIn ? account?.provider === provider : guest?.provider === provider);
      const body = keep && signedIn ? { useSaved: true }
        : { provider, key: key ?? (keep ? guest?.key : undefined), ...(baseUrl ? { baseUrl } : {}) };
      const reply = await call('POST', '/api/ai/models', body);
      return Array.isArray(reply.models) ? reply.models as AiModelInfo[] : [];
    },
    async save(input: AiSettingsInput) {
      requireAvailable();
      const settings = { ...input, key: input.key?.trim() || undefined, baseUrl: input.baseUrl?.trim() || undefined };
      if (signedIn) {
        const reply = await call('PUT', '/api/ai/key', settings);
        account = {
          provider: String(reply.provider), model: String(reply.model), hint: String(reply.hint ?? ''),
          ...(typeof reply.baseUrl === 'string' ? { baseUrl: reply.baseUrl } : {}),
        };
        locked = false;
      } else {
        const previous = readGuest();
        const key = settings.key ?? (previous?.provider === settings.provider ? previous.key : undefined);
        if (!key) throw new Error('Enter your API key for this provider.');
        const guest: GuestSettings = { provider: settings.provider, model: settings.model, key, ...(settings.baseUrl ? { baseUrl: settings.baseUrl } : {}) };
        await call('POST', '/api/ai/test', guest);
        try { localStorage.setItem(GUEST_SETTINGS, JSON.stringify(guest)); } catch { throw new Error('This browser would not store the settings (private window?).'); }
      }
      return changed();
    },
    async remove() {
      if (signedIn) {
        await call('DELETE', '/api/ai/key', {});
        account = undefined;
      } else {
        try { localStorage.removeItem(GUEST_SETTINGS); } catch { /* nothing stored */ }
      }
      return changed();
    },
    async setOn(on) {
      if (on) requireAvailable();
      if (signedIn) {
        await call('PUT', '/api/ai/settings', { enabled: on });
        accountOn = on;
      } else {
        try { localStorage.setItem(GUEST_SWITCH, on ? '1' : '0'); } catch { throw new Error('This browser would not store the setting (private window?).'); }
      }
      return changed();
    },
    headers(): Record<string, string> {
      // While AI is off or unavailable, a guest's key never leaves this browser.
      if (signedIn || !status().enabled) return {};
      const guest = readGuest();
      if (!guest) return {};
      return {
        [HEADERS.key]: guest.key, [HEADERS.provider]: guest.provider, [HEADERS.model]: guest.model,
        ...(guest.baseUrl ? { [HEADERS.baseUrl]: guest.baseUrl } : {}),
      };
    },
  };
}

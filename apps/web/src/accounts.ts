// Accounts in the browser: talks to the API's /api/auth and /api/save (apps/api/src/accounts.ts), and gives the
// system a storage that saves to the account when signed in, or to this browser for guests.

import type { KeyValueStorage } from '@tuxos/system';

export interface AccountsClient {
  /** The signed-in account from an earlier visit (the session cookie), if any. */
  me(): Promise<string | null>;
  register(username: string, password: string): Promise<void>;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  /** Checks the signed-in account's password, for Vasu's sudo request. */
  verify(password: string): Promise<boolean>;
  /** Storage that keeps the saved system in the account. */
  storage(): KeyValueStorage;
}

/** Thrown with the server's own words, e.g. "That username is taken." */
async function call(method: string, path: string, body?: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error('The account service is not reachable. Check your connection, or try without an account.');
  }
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { status: response.status, data };
}

const failure = (data: Record<string, unknown>, status: number) =>
  new Error(typeof data.error === 'string' ? data.error : `The account service failed (HTTP ${status}).`);

export function httpAccounts(): AccountsClient {
  let version = 0;
  // Saves go out one at a time: each needs the version the previous one returned.
  let queue: Promise<unknown> = Promise.resolve();

  const signIn = async (path: string, username: string, password: string) => {
    const { status, data } = await call('POST', path, { username, password });
    if (status >= 300) throw failure(data, status);
  };

  return {
    async me() {
      try {
        const { status, data } = await call('GET', '/api/auth/me');
        return status === 200 && typeof data.username === 'string' ? data.username : null;
      } catch {
        return null;
      }
    },
    register: (username, password) => signIn('/api/auth/register', username, password),
    login: (username, password) => signIn('/api/auth/login', username, password),
    async logout() {
      await call('POST', '/api/auth/logout', {});
    },
    async verify(password) {
      const { status, data } = await call('POST', '/api/auth/verify', { password });
      if (status === 200) return true;
      if (status === 403) return false;
      throw failure(data, status);
    },
    storage() {
      const put = (data: string) => {
        const run = queue.then(async () => {
          const reply = await call('PUT', '/api/save', { data, version });
          if (reply.status !== 200) throw failure(reply.data, reply.status);
          version = reply.data.version as number;
        });
        queue = run.catch(() => undefined);
        return run;
      };
      return {
        async get() {
          const { status, data } = await call('GET', '/api/save');
          if (status !== 200) throw failure(data, status);
          version = data.version as number;
          return typeof data.data === 'string' && data.data ? data.data : null;
        },
        set: (_key, value) => put(value),
        remove: () => put(''),
      };
    },
  };
}

/**
 * The system's storage, pointed at this browser (guests) or the signed-in account before each boot. The
 * system keeps one storage object for its whole life, so this forwards to whichever is current.
 */
export function switchableStorage(local: KeyValueStorage) {
  let current = local;
  return {
    storage: {
      get: (key) => current.get(key),
      set: (key, value) => current.set(key, value),
      remove: (key) => current.remove(key),
    } satisfies KeyValueStorage,
    use(target: KeyValueStorage) {
      current = target;
    },
  };
}

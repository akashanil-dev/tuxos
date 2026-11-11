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
    throw new Error('The account service is not reachable. Check your connection and try again. Your account is required to save progress.');
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
    await queue;
    const { status, data } = await call('POST', path, { username, password });
    if (status >= 300) throw failure(data, status);
    version = 0;
  };

  return {
    async me() {
      const { status, data } = await call('GET', '/api/auth/me');
      if (status === 401) return null;
      if (status !== 200) throw failure(data, status);
      return typeof data.username === 'string' ? data.username : null;
    },
    register: (username, password) => signIn('/api/auth/register', username, password),
    login: (username, password) => signIn('/api/auth/login', username, password),
    async logout() {
      await queue;
      await call('POST', '/api/auth/logout', {});
      version = 0;
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
  let switching = false;
  const pending = new Set<Promise<unknown>>();
  const track = <T>(operation: (target: KeyValueStorage) => Promise<T>): Promise<T> => {
    if (switching) return Promise.reject(new Error('Storage is switching accounts. Try saving again when it finishes.'));
    // Capture the destination now. An asynchronous operation must never follow a later account switch.
    const target = current;
    const task = Promise.resolve().then(() => operation(target));
    pending.add(task);
    void task.then(() => pending.delete(task), () => pending.delete(task));
    return task;
  };
  return {
    storage: {
      get: (key) => track(target => target.get(key)),
      set: (key, value) => track(target => target.set(key, value)),
      remove: (key) => track(target => target.remove(key)),
    } satisfies KeyValueStorage,
    async use(target: KeyValueStorage) {
      if (switching) throw new Error('Another storage transition is in progress.');
      switching = true;
      try {
        const results = await Promise.allSettled([...pending]);
        const failed = results.find(result => result.status === 'rejected');
        if (failed?.status === 'rejected') throw failed.reason;
        current = target;
      } finally { switching = false; }
    },
  };
}

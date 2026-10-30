import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createLocalSystem, type KeyValueStorage } from '@tuxos/system';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { settings } from '../../../modules/settings/src/index';
import { httpAccounts, switchableStorage, type AccountsClient } from './accounts';
import { App, type AccountsWiring } from './app';

const SLOW = { timeout: 4000 };

function memory(): KeyValueStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  };
}

/** An in-memory account service with the same rules as the real one (apps/api/src/accounts.ts). */
function fakeService(signedIn: string | null = null) {
  const users = new Map<string, string>([['grace', 'pw']]);
  const saves = new Map<string, { data: string; version: number }>();
  let session = signedIn;
  let version = 0;
  const client: AccountsClient = {
    me: async () => session,
    async register(username, password) {
      if (users.has(username)) throw new Error('That username is taken.');
      users.set(username, password);
      session = username;
    },
    async login(username, password) {
      if (users.get(username) !== password) throw new Error('Wrong username or password.');
      session = username;
    },
    logout: vi.fn(async () => { session = null; }),
    verify: async (password) => users.get(session!) === password,
    storage: () => ({
      async get() {
        const save = saves.get(session!);
        version = save?.version ?? 0;
        return save?.data || null;
      },
      async set(_key, data) {
        version += 1;
        saves.set(session!, { data, version });
      },
      async remove() { saves.delete(session!); },
    }),
  };
  return { client, saves, users };
}

function setup(service: ReturnType<typeof fakeService>, local = memory()) {
  const { storage, use } = switchableStorage(local);
  const accountStorage = service.client.storage();
  const accounts: AccountsWiring = {
    client: service.client,
    use: (target) => use(target === 'account' ? accountStorage : local),
    localSave: () => local.get('tuxos.save'),
  };
  const system = createLocalSystem({
    storage,
    modules: [{ manifest: settings.manifest, load: async () => settings }],
  });
  render(<App system={system} accounts={accounts} start="greeter" />);
  return { system, local };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('accounts', () => {
  it('creates an account with a username and password, and saves progress to it', async () => {
    const service = fakeService();
    const { system } = setup(service);
    expect(await screen.findByText('Create account', { selector: '.sddm-name' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'ada' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('button', { name: 'Application Launcher' }, SLOW);
    await system.flush();
    expect(service.users.get('ada')).toBe('secret');
    expect(JSON.parse(service.saves.get('ada')!.data)).toMatchObject({ username: 'ada' });
  });

  it('moves a guest\'s progress in this browser into the account they create', async () => {
    const local = memory();
    const guest = createLocalSystem({ storage: local, modules: [] });
    await guest.boot('ada');
    await guest.dispatch('fs.write', { path: '/home/ada/notes.txt', content: 'mine' });
    await guest.flush();

    const service = fakeService();
    const { system } = setup(service, local);
    await screen.findByRole('button', { name: 'Create account' });
    expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('ada');
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('button', { name: 'Application Launcher' }, SLOW);
    expect(await system.dispatch('fs.read', { path: '/home/ada/notes.txt' })).toMatchObject({ ok: true, value: 'mine' });
  });

  it('refuses a wrong password, and signs in with the right one', async () => {
    setup(fakeService());
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'grace' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Wrong username or password.');
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await screen.findByRole('button', { name: 'Application Launcher' }, SLOW);
  });

  it('keeps the sign-in form, not the password-only unlock screen, while the system boots', async () => {
    const { system } = setup(fakeService());
    let finishBoot!: () => void;
    const boot = system.boot.bind(system);
    vi.spyOn(system, 'boot').mockImplementation(async (name) => {
      await new Promise<void>((resolve) => { finishBoot = resolve; });
      return boot(name);
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'grace' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(system.boot).toHaveBeenCalled());
    expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('grace');
    finishBoot();
    await screen.findByRole('button', { name: 'Application Launcher' }, SLOW);
  });

  it('asks a still-signed-in account for its password, and signs out on log out', async () => {
    const service = fakeService('grace');
    setup(service);
    expect(await screen.findByText('grace', { selector: '.sddm-name' })).toBeTruthy();
    // Coming back (after a lock or a restart) needs the password, not just the remembered session.
    expect(screen.queryByLabelText('Username')).toBeNull();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Wrong password. Try again.');
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }, SLOW));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Log Out' }));
    await waitFor(() => expect(service.client.logout).toHaveBeenCalled());
    expect(await screen.findByText('Create account', { selector: '.sddm-name' }, SLOW)).toBeTruthy();
  }, 15_000);

  it('requires an account and offers no guest route or pre-login desktop selector', async () => {
    setup(fakeService());
    await screen.findByRole('button', { name: 'Create account' });
    expect(screen.queryByText('Try without an account')).toBeNull();
    expect(screen.queryByRole('button', { name: /Desktop Session/ })).toBeNull();
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });
  it('keeps users at sign-in when the account service is unavailable, with a retry', async () => {
    const service = fakeService();
    service.client.me = vi.fn().mockRejectedValueOnce(new Error('Account service unavailable')).mockResolvedValue(null);
    setup(service);
    expect((await screen.findByRole('alert')).textContent).toContain('Account service unavailable');
    expect(screen.queryByLabelText('Username')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
    await screen.findByRole('button', { name: 'Create account' });
  });
});

describe('account storage over HTTP', () => {
  it('sends saves one at a time with the version from the previous save', async () => {
    const sent: { version: number }[] = [];
    let version = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        const body = JSON.parse(init.body as string) as { version: number };
        sent.push(body);
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (body.version !== version) return Response.json({ error: 'conflict' }, { status: 409 });
        version += 1;
        return Response.json({ version });
      }
      return Response.json({ data: null, version });
    }));
    const storage = httpAccounts().storage();
    await storage.get('tuxos.save');
    await Promise.all([storage.set('tuxos.save', 'a'), storage.set('tuxos.save', 'b'), storage.set('tuxos.save', 'c')]);
    expect(sent.map((body) => body.version)).toEqual([0, 1, 2]);
    vi.unstubAllGlobals();
  });
});

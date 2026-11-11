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

function setup(service: ReturnType<typeof fakeService>, local = memory(), auth = true) {
  const { storage, use } = switchableStorage(local);
  const accountStorage = service.client.storage();
  const accounts: AccountsWiring = {
    client: service.client,
    use: (target) => use(target === 'account' ? accountStorage : local),
    localSave: () => local.get('tuxos.save'),
    backup: (value, label) => local.set(`backup.${label}`, value),
  };
  const system = createLocalSystem({
    storage,
    modules: [{ manifest: settings.manifest, load: async () => settings }],
  });
  render(<App system={system} accounts={accounts} start="greeter" />);
  if (auth) fireEvent.click(screen.getByRole('button', { name: /Sign in or create an account/ }));
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
    fireEvent.click(await screen.findByRole('button', { name: 'Use browser progress' }));
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
    expect(await screen.findByRole('button', { name: 'Explore TuxOS' }, SLOW)).toBeTruthy();
  }, 15_000);

  it('explores without an account and retains a local system', async () => {
    const service = fakeService();
    const { system, local } = setup(service, memory(), false);
    const explore = await screen.findByRole('button', { name: 'Explore TuxOS' });
    await waitFor(() => expect((explore as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByLabelText('Password')).toBeNull();
    fireEvent.click(explore);
    await screen.findByRole('button', { name: 'Application Launcher' }, SLOW);
    await system.dispatch('fs.write', { path: '/home/explorer/note.txt', content: 'local progress' });
    await system.flush();
    expect(JSON.parse(local.values.get('tuxos.save')!).username).toBe('explorer');
    expect(service.saves.size).toBe(0);
    expect(screen.getByRole('button', { name: 'Save to an account' })).toBeTruthy();
  });
  it('keeps guest entry available when account discovery never responds', async () => {
    const service = fakeService();
    service.client.me = () => new Promise(() => {});
    const { local } = setup(service, memory(), false);
    const explore = screen.getByRole('button', { name: 'Explore TuxOS' });
    await waitFor(() => expect((explore as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(explore);
    await screen.findByRole('button', { name: 'Application Launcher' }, SLOW);
    expect(local.values.has('tuxos.save')).toBe(true);
  });

  it('transfers an explorer guest into a differently named authenticated account with explicit preview and unchanged personal text', async () => {
    const service = fakeService();
    const { system, local } = setup(service, memory(), false);
    const explore = await screen.findByRole('button', { name: 'Explore TuxOS' });
    await waitFor(() => expect((explore as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(explore);
    await screen.findByRole('button', { name: 'Application Launcher' }, SLOW);
    await system.dispatch('fs.write', { path: '/home/explorer/note.txt', content: 'Personal reference: /home/explorer' }); await system.flush();
    fireEvent.click(screen.getByRole('button', { name: 'Save to an account' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'grace' } }); fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose saved progress' });
    expect(dialog.textContent).toContain('from explorer to grace'); expect(dialog.textContent).toContain('virtual files');
    expect(service.saves.size).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Use browser progress' }));
    await screen.findByRole('button', { name: 'Application Launcher' }, SLOW);
    expect(await system.user()).toBe('grace');
    expect(await system.dispatch('fs.read', { path: '/home/grace/note.txt' })).toMatchObject({ ok: true, value: 'Personal reference: /home/explorer' });
    expect(await system.dispatch('fs.stat', { path: '/home/grace/note.txt' })).toMatchObject({ ok: true, value: { owner: 'grace' } });
    expect(JSON.parse(local.values.get('tuxos.save')!).username).toBe('explorer');
    expect(JSON.parse(service.saves.get('grace')!.data).username).toBe('grace');
  });
  it('offers an account retry without blocking exploration', async () => {
    const service = fakeService();
    service.client.me = vi.fn().mockRejectedValueOnce(new Error('Account service unavailable')).mockResolvedValue(null);
    setup(service);
    await screen.findByText('Account connection unavailable. You can still explore as a guest.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
    await screen.findByRole('button', { name: 'Create account' });
    await waitFor(() => expect(screen.queryByText('Account connection unavailable. You can still explore as a guest.')).toBeNull());
  });

  it('previews a guest/account conflict, cancels safely, and backs up before an explicit replacement', async () => {
    const local = memory();
    const guest = createLocalSystem({ storage: local, modules: [] });
    await guest.boot('grace');
    await guest.dispatch('fs.write', { path: '/home/grace/note.txt', content: 'guest work' });
    await guest.flush();
    const remote = memory();
    const cloud = createLocalSystem({ storage: remote, modules: [] });
    await cloud.boot('grace');
    await cloud.dispatch('fs.write', { path: '/home/grace/note.txt', content: 'account work' });
    await cloud.flush();
    const original = remote.values.get('tuxos.save')!;
    const service = fakeService();
    service.saves.set('grace', { data: original, version: 3 });
    const { system } = setup(service, local, false);
    const resume = await screen.findByRole('button', { name: 'Resume TuxOS' });
    fireEvent.click(resume);
    await screen.findByRole('button', { name: 'Application Launcher' }, SLOW);
    fireEvent.click(screen.getByRole('button', { name: 'Save to an account' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'grace' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await screen.findByRole('dialog', { name: 'Choose saved progress' });
    expect(service.saves.get('grace')!.data).toBe(original);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel transfer' }));
    await screen.findByText('Transfer cancelled. Both saved systems are unchanged.');
    expect(service.saves.get('grace')!.data).toBe(original);
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Back up account and use browser progress' }));
    await screen.findByRole('button', { name: 'Application Launcher' }, SLOW);
    expect(local.values.get('backup.account-grace')).toBe(original);
    expect(await system.dispatch('fs.read', { path: '/home/grace/note.txt' })).toMatchObject({ ok: true, value: 'guest work' });
    expect(local.values.has('tuxos.save')).toBe(true);
  }, 15000);
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

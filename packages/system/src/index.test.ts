import { afterEach, describe, expect, it, vi } from 'vitest';
import { bashPrompt, createLocalSystem, type KeyValueStorage } from './index';
import { about } from '../../../modules/about/src/index';

function storage(): KeyValueStorage & { value: string; writes: number } {
  return {
    value: '',
    writes: 0,
    async get() { return this.value || null; },
    async set(_key, value) { this.value = value; this.writes += 1; },
    async remove() { this.value = ''; },
  };
}

function system(store: KeyValueStorage) {
  return createLocalSystem({ storage: store, modules: [{ manifest: about.manifest, load: async () => about }] });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('local system client', () => {
  it('boots, exposes apps and activates an app before opening it', async () => {
    const client = system(storage());
    await client.boot('ada');
    expect(await client.apps()).toEqual([expect.objectContaining({ id: 'about', moduleId: 'about' })]);
    expect(await client.openApp('about')).toEqual({ ok: true, value: 'window-1' });
    expect((await client.session()).focusedId).toBe('window-1');
    const terminal = await client.createTerminal();
    expect(await terminal.run('uname -a')).toMatchObject({
      code: 0, stdout: expect.stringContaining('Linux tuxos'),
    });
  });

  it('passes open arguments through to the window', async () => {
    const client = system(storage());
    await client.boot('ada');
    await client.openApp('about', { path: '/etc/hostname' });
    expect((await client.session()).windows[0]?.args).toEqual({ path: '/etc/hostname' });
  });

  it('gives each terminal its own shell but the same commands and files', async () => {
    const client = system(storage());
    await client.boot('ada');
    const one = await client.createTerminal();
    const two = await client.createTerminal();
    await one.run('cd /tmp; echo shared > note');
    expect(await one.cwd()).toBe('/tmp');
    expect(await two.cwd()).toBe('/home/ada');
    expect(await two.run('cat /tmp/note; uname')).toMatchObject({ stdout: 'shared\nLinux\n' });
    expect(await one.history()).toEqual(['cd /tmp; echo shared > note']);
    expect(await two.complete('una', 3)).toEqual({ start: 0, candidates: ['uname'] });
  });

  it('builds the bash prompt from user, host and directory', async () => {
    const client = system(storage());
    await client.boot('ada');
    const terminal = await client.createTerminal();
    expect(await terminal.prompt()).toBe('ada@tuxos:~$ ');
    await terminal.run('cd Documents');
    expect(await terminal.prompt()).toBe('ada@tuxos:~/Documents$ ');
    expect(bashPrompt('root', 'box', '/etc', '/root')).toBe('root@box:/etc# ');
    expect(bashPrompt('ada', 'box', '/home/adam', '/home/ada')).toBe('ada@box:/home/adam$ ');
  });

  it('does not make the learner wait for a save', async () => {
    vi.useFakeTimers();
    const store = storage();
    const client = system(store);
    await client.boot('ada');
    const terminal = await client.createTerminal();
    await terminal.run('echo hi > f');
    expect(store.writes).toBe(0);
    await vi.advanceTimersByTimeAsync(499);
    expect(store.writes).toBe(0);
    await terminal.run('echo again >> f');
    await vi.advanceTimersByTimeAsync(500);
    expect(store.writes).toBe(1);
  });

  it('restores a save for the same username only', async () => {
    const store = storage();
    const first = system(store);
    await first.boot('ada');
    await first.dispatch('session.open', { appId: 'about', title: 'About' });
    await first.flush();

    const second = system(store);
    expect(await second.hasSave()).toBe('ada');
    await second.boot('ada');
    expect((await second.session()).windows).toHaveLength(1);

    const third = system(store);
    await third.boot('grace');
    expect((await third.session()).windows).toHaveLength(0);
  });

  it('reports storage failures to listeners and from flush', async () => {
    vi.useFakeTimers();
    const store = storage();
    store.set = async () => { throw new Error('storage unavailable'); };
    const client = system(store);
    const errors: string[] = [];
    client.onSaveError((error) => errors.push(error.message));
    await client.boot('ada');
    await client.dispatch('session.open', { appId: 'about', title: 'About' });
    await vi.advanceTimersByTimeAsync(500);
    expect(errors).toEqual(['storage unavailable']);
    await expect(client.flush()).rejects.toThrow('storage unavailable');
  });

  it('notifies change listeners for successful mutations only', async () => {
    const client = system(storage());
    await client.boot('ada');
    const seen: string[] = [];
    client.onChange((event) => seen.push(event.action.type));
    await client.dispatch('fs.list', { path: '/' });
    await client.dispatch('fs.write', { path: '/etc/x', content: '' });
    await (await client.createTerminal()).run('touch made');
    expect(seen).toEqual(['fs.write']);
  });
});


describe('restart learning', () => {
  it('replaces the saved simulation, keeps the username, and remains reset after another boot', async () => {
    const saved = storage();
    const client = createLocalSystem({ storage: saved, modules: [], journey: true });
    await client.boot('ada');
    const shell = await client.createTerminal();
    await shell.run('echo old-practice > old-note.txt');
    await client.flush();
    const restarted = vi.fn();
    client.onRestart(restarted);
    await client.restartLearning();
    expect(restarted).toHaveBeenCalledOnce();
    expect(await client.user()).toBe('ada');
    expect((await client.session()).journey).toMatchObject({ lessons: [], steps: [], acknowledged: [], installedDesktops: [] });
    expect((await client.dispatch('fs.read', { path: '/home/ada/old-note.txt' })).ok).toBe(false);
    await client.flush();
    await client.boot('ada');
    expect((await client.session()).journey!.steps).toEqual([]);
    expect((await client.dispatch('fs.read', { path: '/home/ada/old-note.txt' })).ok).toBe(false);
    await client.reset();
  });

  it('keeps the running session and saved history when the account rejects the reset', async () => {
    const saved = storage();
    const client = createLocalSystem({ storage: saved, modules: [], journey: true });
    await client.boot('ada');
    await (await client.createTerminal()).run('echo keep > note.txt');
    await client.flush();
    const previousSave = saved.value;
    const write = vi.spyOn(saved, 'set').mockRejectedValueOnce(new Error('Account offline'));
    const restarted = vi.fn();
    client.onRestart(restarted);
    await expect(client.restartLearning()).rejects.toThrow('Account offline');
    expect(restarted).not.toHaveBeenCalled();
    expect(saved.value).toBe(previousSave);
    expect(await client.dispatch('fs.read', { path: '/home/ada/note.txt' })).toMatchObject({ ok: true, value: 'keep\n' });
    write.mockRestore();
    await client.reset();
  });
});

it('focuses concurrent singleton launches and preserves separate terminals and document identities', async () => {
  const { terminal } = await import('../../../modules/terminal/src/index');
  const { editor } = await import('../../../modules/editor/src/index');
  const client = createLocalSystem({ storage: storage(), modules: [about, terminal, editor].map(m => ({ manifest: m.manifest, load: async () => m })) });
  await client.boot('ada');
  client.tutor().setCapabilities(['session:control']);
  const launches = await Promise.all([client.openApp('about'), client.openApp('about'), client.tutor().openApp('about')]);
  expect(launches).toEqual(Array(3).fill({ ok: true, value: 'window-1' }));
  await client.openApp('terminal'); await client.openApp('terminal');
  await client.openApp('editor', { path: '/tmp/a' }); await client.openApp('editor', { path: '/tmp/a' });
  await client.openApp('editor', { path: '/tmp/b' }); await client.openApp('editor'); await client.openApp('editor');
  const windows = (await client.session()).windows;
  expect(windows.filter(w => w.appId === 'terminal')).toHaveLength(2);
  expect(windows.filter(w => w.appId === 'editor')).toHaveLength(4);
  await client.reset();
});

it('resumes bounded cwd, environment and history without awarding lesson progress', async () => {
  const store = storage();
  const client = system(store);
  await client.boot('ada');
  const one = await client.createTerminal({ learningModule: 'learn-linux', cwd: '/tmp' });
  await one.run('export PROJECT=hello');
  await one.run('touch saved-note');
  await client.flush();
  await client.boot('ada');
  const resumed = await client.createTerminal({ learningModule: 'learn-linux' });
  expect(await resumed.cwd()).toBe('/tmp');
  expect(await resumed.history()).toEqual(['export PROJECT=hello', 'touch saved-note']);
  expect(await resumed.run('echo $PROJECT; ls')).toMatchObject({ code: 0, stdout: expect.stringContaining('hello\nsaved-note') });
  const independent = await client.createTerminal();
  expect(await independent.cwd()).toBe('/home/ada');
  expect(await independent.history()).toEqual([]);
  await client.reset();
});

it('activates restored window modules before boot returns without opening duplicates or unopened apps', async () => {
  const values = new Map<string, string>();
  const storage = { get: async (key: string) => values.get(key) ?? null, set: async (key: string, value: string) => { values.set(key, value); }, remove: async (key: string) => { values.delete(key); } };
  let activations = 0, unopened = 0;
  const manifest: import('@tuxos/sdk').ModuleManifest = { id: 'resumable', version: '1.0.0', title: 'Resumable', capabilities: ['fs:read'], activation: ['onApp:resumable'], contributes: { apps: [{ id: 'resumable', title: 'Resumable', icon: 'game' }] } };
  const lazy = { manifest, activate(ctx: import('@tuxos/sdk').ModuleContext) { activations++; ctx.registerAction({ type: 'resumable.status', capability: 'fs:read', description: 'Resume probe', mutates: false, run: () => 'ready' }); } };
  const idle: import('@tuxos/sdk').ModuleDefinition = { manifest: { ...manifest, id: 'unopened', activation: ['onApp:unopened'], contributes: { apps: [{ id: 'unopened', title: 'Unopened', icon: 'game' }] } }, activate() { unopened++; } };
  const client = createLocalSystem({ storage, modules: [lazy, idle].map(module => ({ manifest: module.manifest, load: async () => module })) });
  await client.boot('ada'); expect(activations).toBe(0);
  await client.openApp('resumable'); expect(activations).toBe(1);
  await client.flush(); await client.boot('ada'); expect(activations).toBe(2); expect(unopened).toBe(0);
  expect(await client.dispatch('resumable.status', {})).toEqual({ ok: true, value: 'ready' });
  expect((await client.session()).windows.filter(window => window.appId === 'resumable')).toHaveLength(1);
  await client.reset();
});

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

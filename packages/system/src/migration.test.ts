// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createKernel } from '@tuxos/kernel';
import { createLocalSystem, type KeyValueStorage } from './index';
import { backupStore } from './backups';
import { previewImport } from '@tuxos/migration';
import { readFileSync } from 'node:fs';
import { exploration } from '../../../modules/exploration/src/index';
import { learnAdventure } from '../../../modules/learn-adventure/src/index';
import { apt } from '../../../modules/apt/src/index';

function memory() {
  const values = new Map<string, string>();
  return { values, get: async (key: string) => values.get(key) ?? null, set: vi.fn(async (key: string, value: string) => { values.set(key, value); }), remove: vi.fn(async (key: string) => { values.delete(key); }) } satisfies KeyValueStorage & { values: Map<string, string> };
}
async function setup() {
  const storage = memory(), backups = memory();
  const client = createLocalSystem({ storage, backupStorage: backups, modules: [], journey: true });
  await client.boot('ada'); await (await client.createTerminal()).run('echo valuable > notes.txt'); await client.flush();
  const expected = client.exportSave!(), replacement = JSON.stringify({ username: 'ada', snapshot: createKernel({ username: 'ada', journey: true }).snapshot() });
  return { client, storage, backups, expected, replacement };
}
describe('recoverable save replacement', () => {
  it('backs up, imports, verifies the running filesystem and restores without deleting the recovery copy', async () => {
    const { client, storage, expected, replacement } = await setup();
    const restart = vi.fn(); client.onRestart(restart);
    const info = await client.replaceSave!(replacement, expected, 'Before import');
    expect(await client.readBackup!(info.id)).toBe(expected);
    expect((await client.dispatch('fs.read', { path: '/home/ada/notes.txt' })).ok).toBe(false);
    expect(storage.values.get('tuxos.save')).toBe(replacement);
    await client.replaceSave!(await client.readBackup!(info.id), client.exportSave!(), 'Before restore');
    expect(await client.dispatch('fs.read', { path: '/home/ada/notes.txt' })).toMatchObject({ ok: true, value: 'valuable\n' });
    expect(await client.backups!()).toHaveLength(2); expect(restart).toHaveBeenCalledTimes(2);
    await client.reset();
  });
  it('leaves both target and running work intact when backup storage is full or the destination write fails', async () => {
    const { client, storage, backups, expected, replacement } = await setup();
    backups.set.mockRejectedValueOnce(new Error('Browser quota exceeded'));
    await expect(client.replaceSave!(replacement, expected, 'Before import')).rejects.toThrow('quota');
    expect(storage.values.get('tuxos.save')).toBe(expected); expect(client.exportSave!()).toBe(expected);
    storage.set.mockRejectedValueOnce(new Error('Account offline'));
    await expect(client.replaceSave!(replacement, expected, 'Before import')).rejects.toThrow('Account offline');
    expect(storage.values.get('tuxos.save')).toBe(expected); expect(client.exportSave!()).toBe(expected);
    expect(await client.backups!()).toHaveLength(1);
    expect(await (await client.createTerminal()).run('echo still usable')).toMatchObject({ code: 0, stdout: 'still usable\n' });
    await client.reset();
  });
  it('rejects stale previews and leave-guard cancellation before writing anything', async () => {
    const { client, storage, backups, expected, replacement } = await setup();
    const unregister = client.registerLeaveGuard!('editor', () => false);
    await expect(client.replaceSave!(replacement, expected, 'Before import')).rejects.toThrow('cancelled'); unregister();
    await (await client.createTerminal()).run('echo newer > notes.txt');
    await expect(client.replaceSave!(replacement, expected, 'Before import')).rejects.toThrow('changed after the preview');
    expect(backups.set).not.toHaveBeenCalled(); expect(storage.values.get('tuxos.save')).toBe(expected);
    await client.reset();
  });
  it('restores the old target if reading the newly committed save fails during startup', async () => {
    const { client, storage, expected, replacement } = await setup();
    const read = storage.get; let interrupted = false;
    vi.spyOn(storage, 'get').mockImplementation(async key => {
      if (key === 'tuxos.save' && storage.values.get(key) === replacement && !interrupted) { interrupted = true; throw new Error('Interrupted startup read'); }
      return read(key);
    });
    const restarted = vi.fn(); client.onRestart(restarted);
    await expect(client.replaceSave!(replacement, expected, 'Before interrupted import')).rejects.toThrow('original system was restored');
    expect(storage.values.get('tuxos.save')).toBe(expected); expect(client.exportSave!()).toBe(expected);
    expect(await client.backups!()).toHaveLength(1); expect(restarted).toHaveBeenCalledOnce();
    expect(await (await client.createTerminal()).run('cat notes.txt')).toMatchObject({ code: 0, stdout: 'valuable\n' });
    await client.reset();
  });
  it('quiesces late shell writes and refuses overlapping replacements while the backup is being stored', async () => {
    const { client, backups, expected, replacement } = await setup();
    let release!: () => void, entered!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    backups.set.mockImplementationOnce(async (key, value) => { entered(); await new Promise<void>(resolve => { release = resolve; }); backups.values.set(key, value); });
    const terminal = await client.createTerminal();
    const operation = client.replaceSave!(replacement, expected, 'Before import'); await waiting;
    expect(await terminal.run('echo late > notes.txt')).toMatchObject({ code: 1 });
    await expect(client.replaceSave!(replacement, expected, 'Overlap')).rejects.toThrow('progress');
    release(); await operation;
    expect(await client.backups!()).toHaveLength(1); await client.reset();
  });
  it('keeps full-reset recovery, filters backups by learner, and does not replace when index persistence fails', async () => {
    const { client, backups, expected, replacement } = await setup();
    const foreign = await backupStore(backups).create('foreign', 'grace', 'Other learner');
    await expect(client.readBackup!(foreign.id)).rejects.toThrow('different learner');
    const original = backups.set.getMockImplementation()!;
    backups.set.mockImplementationOnce(original).mockRejectedValueOnce(new Error('Index quota exceeded'));
    await expect(client.replaceSave!(replacement, expected, 'Before import')).rejects.toThrow('Index quota');
    expect(await client.backups!()).toEqual([]); expect(client.exportSave!()).toBe(expected);
    backups.set.mockImplementation(original);
    await client.restartLearning();
    const [backup] = await client.backups!(); expect(backup!.label).toBe('Before full system reset'); expect(await client.readBackup!(backup!.id)).toBe(expected);
    await client.reset();
  });
  it('opens imported adventure data and package commands through real modules, then survives a fresh boot', async () => {
    const storage = memory();
    const client = createLocalSystem({ storage, backupStorage: memory(), journey: true, modules: [exploration, learnAdventure, apt].map(m => ({ manifest: m.manifest, load: async () => m })) });
    await client.boot('ada');
    const source = JSON.parse(readFileSync(new URL('../../../docs/migration/fixtures/tuxplore-partial.json', import.meta.url), 'utf8')); source.installed = { cowsay: true };
    const expected = client.exportSave!(), preview = await previewImport(JSON.stringify(source), expected, { now: 200, preferences: 'source', adventure: 'source', files: 'replace' });
    await client.replaceSave!(preview.data, expected, 'Before import');
    expect((await client.openApp('learn-adventure')).ok).toBe(true);
    expect(await client.dispatch('exploration.status', {})).toMatchObject({ ok: true, value: { adventure: { done: { hello: expect.any(Number) } } } });
    expect(await (await client.createTerminal()).run('cat ~/Documents/personal.txt; cowsay Welcome')).toMatchObject({ code: 0, stdout: expect.stringContaining('A personal file') });
    await client.flush(); await client.boot('ada');
    expect((await client.session()).journey!.lessons).toEqual([]); expect(await client.backups!()).toHaveLength(1);
    await client.reset();
  });
});

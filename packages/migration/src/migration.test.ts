// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createKernel } from '@tuxos/kernel';
import { previewImport, nativeSave, parseBounded, renameNative, MAX_BYTES } from './index';
import { nodeAt } from './validate';

const fixture = (name = 'partial') => JSON.parse(readFileSync(new URL(`../../../docs/migration/fixtures/tuxplore-${name}.json`, import.meta.url), 'utf8'));
const baseline = (user = 'ada') => JSON.stringify({ username: user, snapshot: createKernel({ username: user, journey: true, now: () => 100 }).snapshot() });
const opts = { now: 200, preferences: 'source', adventure: 'source', files: 'keep' } as const;
const read = (data: string, path: string) => nodeAt(JSON.parse(data).snapshot.state.fs, path);

describe('Tuxplore conversion', () => {
  it.each(['fresh', 'partial', 'complete'])('converts the %s source without changing it or granting course mastery', async name => {
    const source = fixture(name), raw = JSON.stringify(source);
    const preview = await previewImport(raw, baseline(), opts);
    const result = nativeSave(parseBounded(preview.data));
    expect(JSON.stringify(source)).toBe(raw);
    expect(result.username).toBe('ada'); expect(result.snapshot.version).toBe(2);
    expect(result.snapshot.state.session.journey?.lessons).toEqual([]);
    expect(Object.keys(result.snapshot.state.exploration!.adventure.done)).toHaveLength(name === 'complete' ? 10 : name === 'partial' ? 1 : 0);
    expect(read(preview.data, '/etc/passwd')).toMatchObject({ content: expect.stringContaining('/home/ada') });
    expect(read(preview.data, '/etc/passwd')).not.toMatchObject({ content: expect.stringContaining('explorer') });
    if (name !== 'fresh') expect(read(preview.data, '/home/ada/Documents/personal.txt')).toMatchObject({ owner: 'ada', mode: 0o640, content: 'A personal file that migration must preserve.\n' });
    expect(createKernel({ snapshot: result.snapshot }).user).toBe('ada');
  });
  it.each([['kde', 'plasma'], ['gnome', 'gnome'], ['retro', 'cde'], ['tiling', 'hyprland']])('maps %s to %s and preserves explicit wallpaper/sound/boot preferences', async (from, to) => {
    const source = fixture(); source.theme = from; source.wallpaper = 'kde-30th';
    const { data } = await previewImport(JSON.stringify(source), baseline(), opts), state = JSON.parse(data).snapshot.state;
    expect(state.session).toMatchObject({ desktop: to, wallpaper: 'kde-30th', preferences: { fastBoot: false }, appearanceGrants: ['anniversary'] });
    expect(state.exploration.runner).toMatchObject({ rapidBest: 230, infiniteHigh: 1400, sound: false, legacyBest: 120, family: 'Debian' });
  });
  it('preserves old undifferentiated best without assigning it to a modern game mode', async () => {
    const source = fixture(); source.runner = { best: 999, family: 'arch' };
    const { data } = await previewImport(JSON.stringify(source), baseline(), opts);
    expect(JSON.parse(data).snapshot.state.exploration.runner).toMatchObject({ legacyBest: 999, rapidBest: 0, infiniteHigh: 0, family: 'Arch' });
  });
  it('is idempotent across envelopes, field ordering and export timestamps', async () => {
    const source = fixture(), first = await previewImport(JSON.stringify(source), baseline(), opts);
    const envelope = { format: 'tuxplore-export', version: 1, exportedAt: 500, save: Object.fromEntries(Object.entries(source).reverse()) };
    const retry = await previewImport(JSON.stringify(envelope), first.data, { ...opts, now: 600, files: 'replace' });
    expect(retry.id).toBe(first.id); expect(retry.alreadyImported).toBe(true); expect(retry.data).toBe(first.data);
    expect(JSON.parse(retry.data).snapshot.state.exploration.imports).toHaveLength(1);
  });
  it('previews file/folder collisions and supports keep, replace and recoverable renamed copies', async () => {
    const k = createKernel({ username: 'ada', journey: true, now: () => 100 });
    k.dispatch({ type: 'fs.write', payload: { path: '/home/ada/Documents/personal.txt', content: 'Current personal work' } });
    k.dispatch({ type: 'fs.write', payload: { path: '/home/ada/dungeon', content: 'A personal file occupies this folder' } });
    const target = JSON.stringify({ username: 'ada', snapshot: k.snapshot() }), raw = JSON.stringify(fixture());
    const keep = await previewImport(raw, target, opts);
    expect(keep.conflicts.some(c => c.path === '/home/ada/dungeon' && c.kind === 'folder')).toBe(true);
    expect(read(keep.data, '/home/ada/Documents/personal.txt')).toMatchObject({ content: 'Current personal work' });
    const replace = await previewImport(raw, target, { ...opts, files: 'replace' });
    expect(read(replace.data, '/home/ada/dungeon')).toMatchObject({ kind: 'dir' });
    const both = await previewImport(raw, target, { ...opts, files: 'both' });
    expect(read(both.data, '/home/ada/dungeon')).toMatchObject({ kind: 'file' });
    const conflict = both.conflicts.find(c => c.path === '/home/ada/dungeon')!;
    expect(read(both.data, conflict.copyPath!)).toMatchObject({ kind: 'dir' });
    expect(target).toContain('Current personal work');
  });
  it('keeps monotonic records and chooses partial quest state instead of combining objectives', async () => {
    const target = JSON.parse(baseline()), e = target.snapshot.state.exploration;
    e.adventure.progress.hello = [true, false, false]; e.adventure.done.letter = 50; e.runner.infiniteHigh = 8000;
    e.achievements.first_boot = 20;
    const source = fixture(); source.quests = { done: {}, progress: { hello: [false, true, false] } };
    const keep = await previewImport(JSON.stringify(source), JSON.stringify(target), { ...opts, adventure: 'keep' });
    expect(JSON.parse(keep.data).snapshot.state.exploration.adventure.progress.hello).toEqual([true, false, false]);
    const replace = await previewImport(JSON.stringify(source), JSON.stringify(target), opts), result = JSON.parse(replace.data).snapshot.state.exploration;
    expect(result.adventure.progress.hello).toEqual([false, true, false]); expect(result.adventure.done.hello).toBeUndefined(); expect(result.adventure.done.letter).toBe(50);
    expect(result.runner.infiniteHigh).toBe(8000); expect(result.achievements.first_boot).toBe(20);
  });
  it('uses the actual package resolver, retains full history and refuses to run serialized metadata', async () => {
    const source = fixture(); source.installed = { cowsay: true, fortune: true, cmatrix: true, unavailable: true };
    source.history = Array.from({ length: 120 }, (_, i) => `echo ${i} /home/explorer`);
    source.fs.ch.home.ch.explorer.ch['note.txt'] = { t: 'f', o: 'user', m: '644', c: '/home/explorer is literal personal text', run: 'throw new Error("never execute")' };
    const preview = await previewImport(JSON.stringify(source), baseline(), opts);
    expect(read(preview.data, '/home/ada/note.txt')).toMatchObject({ content: '/home/explorer is literal personal text' });
    expect(read(preview.data, '/home/ada/note.txt')).not.toHaveProperty('run');
    expect(read(preview.data, '/usr/bin/cowsay')).toMatchObject({ mode: 0o755 });
    expect(read(preview.data, '/var/lib/dpkg/status')).toMatchObject({ content: expect.stringContaining('Package: fortunes-min') });
    expect(preview.report.unsupported).toContain('Package unavailable: retained in the original export; no compatible package was installed.');
    expect(JSON.parse(preview.data).snapshot.state.session.terminals.legacy.history).toHaveLength(100);
    expect(read(preview.data, `/home/ada/tuxplore-history-${preview.id.slice(-8)}.txt`)).toMatchObject({ content: source.history.join('\n') + '\n' });
  });
  it('reports unknown historical records and excludes credential/unknown fields', async () => {
    const source = fixture(); source.password = 'do-not-import'; source.token = 'secret-token'; source.achievements.unknown = 123;
    source.quests.done.future = 100; source.pipe.solved.future = 100; source.tracks.active = 'old-track';
    const result = await previewImport(JSON.stringify(source), baseline(), opts);
    expect(result.data).not.toContain('do-not-import'); expect(result.data).not.toContain('secret-token');
    expect(JSON.parse(result.data).snapshot.state.exploration.achievements.unknown).toBe(123);
    expect(result.report.unsupported.join(' ')).toMatch(/Unknown quest future/);
    expect(result.report.unsupported.join(' ')).toMatch(/Legacy track/);
  });
  it('accepts never-started and missing/edited-file exports without inventing missing personal content', async () => {
    const empty = await previewImport(JSON.stringify({ username: null, fs: null }), baseline(), opts);
    expect(empty.report.quests).toBe(0);
    const source = fixture(); delete source.fs.ch.home.ch.explorer.ch['welcome.txt'];
    source.fs.ch.home.ch.explorer.ch.dungeon.ch['gate.sh'].c = 'Personal edited script';
    const edited = await previewImport(JSON.stringify(source), baseline(), opts);
    expect(read(edited.data, '/home/ada/dungeon/gate.sh')).toMatchObject({ content: 'Personal edited script' });
    expect(read(edited.data, '/home/ada/welcome.txt')).toBeUndefined();
  });
});

describe('external save boundaries', () => {
  it('rejects traversal, reserved keys, malformed nodes, oversized/deep input and future versions before conversion', async () => {
    const cases = [
      '{"__proto__":{"polluted":true}}',
      JSON.stringify({ format: 'tuxplore-export', version: 200, save: fixture() }),
      JSON.stringify({ ...fixture(), fs: { t: 'd', o: 'root', m: '755', ch: { '../escape': { t: 'f', o: 'user', m: '644', c: 'x' } } } }),
      JSON.stringify({ ...fixture(), fs: { t: 'f', o: 'user', m: '999', c: 'x' } }),
      JSON.stringify({ ...fixture(), quests: { progress: { hello: ['yes'] } } }),
      JSON.stringify({ ...fixture(), runner: { rapidBest: -1 } }),
      JSON.stringify({ username: 'ada', extra: 'a'.repeat(MAX_BYTES) }),
      '{"x":'.repeat(90) + '0' + '}'.repeat(90),
    ];
    for (const raw of cases) await expect(previewImport(raw, baseline(), opts)).rejects.toThrow();
    expect(({} as any).polluted).toBeUndefined();
  });
  it('rejects native identity mismatch and corrupt session/progress before kernel construction', () => {
    for (const modify of [
      (n: any) => { n.username = 'grace'; },
      (n: any) => { n.snapshot.version = 99; },
      (n: any) => { n.snapshot.state.session.journey.lessons = {}; },
      (n: any) => { n.snapshot.state.exploration.runner.sound = 'yes'; },
      (n: any) => { n.snapshot.state.exploration.adventure.seen = []; },
      (n: any) => { n.snapshot.state.session.windows = [{}]; },
    ]) { const n = JSON.parse(baseline()); modify(n); expect(() => nativeSave(n)).toThrow(); }
  });
  it('renames native identity/ownership/session metadata without changing personal text or creating another learner', async () => {
    const kernel = createKernel({ username: 'explorer', journey: true });
    kernel.dispatch({ type: 'fs.write', payload: { path: '/home/explorer/notes.txt', content: 'Keep /home/explorer literal' } });
    const source = { username: 'explorer', snapshot: kernel.snapshot() };
    source.snapshot.state.session.terminals = { 'window-1': { cwd: '/home/explorer', env: { HOME: '/home/explorer', USER: 'explorer', CUSTOM: 'explorer' }, history: ['cat /home/explorer/notes.txt'] } };
    const renamed = renameNative(source, 'ada');
    expect(renamed.snapshot.state.users.explorer).toBeUndefined(); expect(renamed.snapshot.state.users.ada).toEqual({ home: '/home/ada', uid: 1000 });
    expect(renamed.snapshot.state.session.terminals!['window-1']).toMatchObject({ cwd: '/home/ada', env: { HOME: '/home/ada', USER: 'ada', CUSTOM: 'explorer' }, history: ['cat /home/explorer/notes.txt'] });
    expect(nodeAt(renamed.snapshot.state.fs, '/home/ada/notes.txt')).toMatchObject({ owner: 'ada', content: 'Keep /home/explorer literal' });
    const preview = await previewImport(JSON.stringify(source), baseline(), opts);
    expect(createKernel({ snapshot: JSON.parse(preview.data).snapshot }).user).toBe('ada');
  });
});

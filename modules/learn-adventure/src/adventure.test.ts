import { expect, it } from 'vitest';
import { createLocalSystem } from '@tuxos/system';
import { createKernel } from '@tuxos/kernel';
import type { ModuleDefinition } from '@tuxos/sdk';
import { exploration } from '../../exploration/src';
import { pipeDream } from '../../pipe-dream/src';
import { apt } from '../../apt/src';
import { LEVELS } from '../../pipe-dream/src/levels';
import { learnAdventure, type AdventureStatus } from './index';
import { course } from './course';
import { GATE, preview, seed } from './assets';

// The guide's window-open event is the graduation contract; its content has its own module checks.
const guide: ModuleDefinition = { manifest: { id: 'try-linux', title: 'Guide', version: '1.0.0', capabilities: [], activation: [], contributes: { apps: [{ id: 'try-linux', title: 'Try Linux', icon: 'linux' }] } }, activate() {} };
async function setup(saved?: string) {
  let value = saved ?? null;
  const system = createLocalSystem({ journey: true, storage: { get: async () => value, set: async (_, next) => { value = next; }, remove: async () => { value = null; } }, modules: [exploration, learnAdventure, pipeDream, apt, guide].map(m => ({ manifest: m.manifest, load: async () => m })) });
  await system.boot('ada');
  const status = async () => { const result = await system.dispatch<AdventureStatus>('learn-adventure.status', {}); if (!result.ok) throw new Error(result.error.message); return result.value; };
  const run = async (type: string, payload: unknown = {}) => { const result = await system.dispatch(type, payload); expect(result.ok, !result.ok ? result.error.message : '').toBe(true); };
  const start = async () => { await run('learn-adventure.prepare'); await run('learn-adventure.start'); };
  return { system, status, run, start, saved: () => value! };
}

it('completes all ten quests through actual terminal, Files reads, puzzles and app actions', async () => {
  const { system, status, start, run } = await setup();
  await start();
  const shell = await system.createTerminal();
  const command = async (line: string) => { const result = await shell.run(line); expect(result.code, `${line}: ${result.stderr}`).toBe(0); await Promise.resolve(); return result; };
  // A Files preview done before the letter quest is remembered.
  await run('fs.read', { path: '/home/ada/welcome.txt' });
  await command('ls'); await command('pwd'); await command('whoami');
  expect((await status()).lesson.active?.lesson.id).toBe('dungeon');
  await command('cd ~/dungeon'); await command('ls -a'); await command('cat .map');
  expect((await status()).lesson.active?.lesson.id).toBe('library');
  await command('grep -r secret library');
  expect((await shell.run('./gate.sh freedom')).code).toBe(126);
  await command('chmod +x gate.sh');
  expect((await shell.run('./gate.sh incorrect')).code).toBe(126);
  await command('./gate.sh freedom');
  expect((await status()).lesson.active?.lesson.id).toBe('goblins');
  await command('cd crypt');
  expect((await shell.run('./stairs.sh')).code).toBe(126);
  await command('rm goblins/*'); await command('./stairs.sh');
  expect((await status()).lesson.active?.lesson.id).toBe('crown');
  expect((await shell.run('cat /root/crown.txt')).code).not.toBe(0);
  await command('sudo cat /root/crown.txt'); await command('mkdir ~/trophies'); await command('sudo cp /root/crown.txt ~/trophies/');
  expect((await status()).lesson.active?.lesson.id).toBe('pipes');
  await system.openApp('pipe-dream');
  for (const level of LEVELS.slice(0,3)) await run('pipe-dream.play', { id: level.id, stages: level.solution.map(stage => level.blocks.findIndex(block => JSON.stringify(block) === JSON.stringify(stage))) });
  // Existing TuxOS sample logs have zero ERRORs; don't overwrite them just for the quest.
  await command('grep ERROR /var/log/syslog | wc -l');
  expect((await status()).lesson.active?.lesson.id).toBe('packages');
  await command('sudo apt update'); await command('sudo apt install -y cowsay'); await command('cowsay Hello!');
  expect((await status()).lesson.active?.lesson.id).toBe('graduate');
  await command('sudo apt install -y neofetch'); await command('neofetch');
  await system.openApp('try-linux');
  const completed = await status();
  expect(Object.keys(completed.progress.done)).toHaveLength(10);
  expect(completed.lesson.active).toBeNull();
  expect((await system.session()).journey?.lessons).toEqual([]);
  const discoveries = await system.dispatch<any>('exploration.status', {});
  expect(discoveries.ok && discoveries.value.achievements.quest_all).toBeGreaterThan(0);
  await system.reset();
});

it('resumes out-of-order objectives and keeps their timestamps through restart', async () => {
  const first = await setup(); await first.start();
  const shell = await first.system.createTerminal();
  await shell.run('ls');
  expect((await first.status()).progress.progress.hello).toEqual([false,false,true]);
  await first.system.flush();
  const next = await setup(first.saved());
  const resumed = await next.system.createTerminal();
  expect((await next.status()).lesson.active?.step.id).toBe('who');
  await resumed.run('pwd'); await resumed.run('whoami');
  const completed = (await next.status()).progress.done.hello;
  expect(completed).toBeGreaterThan(0);
  await next.system.dispatch('learn-adventure.start', {});
  expect((await next.status()).progress.done.hello).toBe(completed);
  await first.system.reset(); await next.system.reset();
});

it('does not credit failed commands, tutor actions or untrusted record/script actions', async () => {
  const { system, start, status } = await setup(); await start();
  const shell = await system.createTerminal();
  await shell.run('ls /does-not-exist; whoami');
  expect((await status()).progress.progress.hello).toEqual([true,false,false]);
  const tutor = system.tutor(); tutor.setCapabilities(['*']);
  await tutor.dispatch('shell.ran', { line: 'pwd; ls', cwd: '/home/ada', commands: ['pwd','ls'], successfulCommands: ['pwd','ls'], code: 0, stdout: '', stderr: '' });
  expect((await status()).progress.progress.hello).toEqual([true,false,false]);
  expect((await system.dispatch('learn-adventure.record', { completed: { hello: ['who','where','look'] } })).ok).toBe(false);
  expect((await tutor.dispatch('learn-adventure.script', { path: '/home/ada/dungeon/gate.sh', args: ['freedom'] })).ok).toBe(false);
  expect((await shell.run('echo "untrusted script" > ~/dungeon/gate.sh')).code).toBe(0);
  await shell.run('chmod +x ~/dungeon/gate.sh');
  expect((await shell.run('~/dungeon/gate.sh freedom')).stderr).toContain('never executed');
  expect((await system.dispatch('fs.stat', { path: '/home/ada/dungeon/crypt' })).ok).toBe(false);
  expect((await shell.run('/tmp/arbitrary.sh')).stderr).toContain('only the adventure');
  await system.reset();
});

it('previews, backs up and reverses scoped repair without losing personal files or progress', async () => {
  const { system, status, run, start } = await setup();
  await run('fs.write', { path: '/home/ada/welcome.txt', content: 'my own letter' });
  await start();
  const original = await system.dispatch('fs.read', { path: '/home/ada/welcome.txt' });
  expect(original).toMatchObject({ ok: true, value: 'my own letter' });
  await run('fs.write', { path: '/home/ada/dungeon/my-notes.txt', content: 'keep this' });
  await run('fs.write', { path: '/home/ada/dungeon/gate.sh', content: 'edited gate' });
  const shell = await system.createTerminal(); await shell.run('whoami');
  const before = (await status()).progress.progress;
  const paths = (await status()).repair.map(item => item.path);
  expect((await system.dispatch('learn-adventure.repair', { paths: [] })).ok).toBe(false);
  await run('learn-adventure.repair', { paths });
  expect(await system.dispatch('fs.read', { path: '/home/ada/dungeon/gate.sh' })).toMatchObject({ ok: true, value: GATE });
  expect(await system.dispatch('fs.read', { path: '/home/ada/dungeon/my-notes.txt' })).toMatchObject({ ok: true, value: 'keep this' });
  expect((await status()).progress.progress).toEqual(before);
  await run('learn-adventure.undoRepair');
  expect(await system.dispatch('fs.read', { path: '/home/ada/welcome.txt' })).toMatchObject({ ok: true, value: 'my own letter' });
  expect(await system.dispatch('fs.read', { path: '/home/ada/dungeon/gate.sh' })).toMatchObject({ ok: true, value: 'edited gate' });
  await run('learn-adventure.undoRepair');
  expect(await system.dispatch('fs.read', { path: '/home/ada/dungeon/gate.sh' })).toMatchObject({ ok: true, value: GATE });
  await system.reset();
});

it('keeps incompatible personal directories and reports blocked asset paths', () => {
  const kernel = createKernel({ username: 'ada' });
  kernel.dispatch({ type: 'fs.write', payload: { path: '/home/ada/dungeon', content: 'personal work' } });
  const state = kernel.snapshot().state;
  seed(state, 'ada', 1);
  expect(preview(state, 'ada').some(item => item.state === 'blocked')).toBe(true);
  expect(state.fs.children.home?.kind).toBe('dir');
  expect(kernel.dispatch({ type: 'fs.read', payload: { path: '/home/ada/dungeon' } })).toMatchObject({ ok: true, value: 'personal work' });
  expect(course.lessons).toHaveLength(10);
});

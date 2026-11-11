import { expect, it } from 'vitest';
import { createLocalSystem } from '@tuxos/system';
import { apt } from './index';
import { exploration } from '../../exploration/src/index';
import type { ExplorationProgress } from '@tuxos/sdk';

async function setup() {
  const values = new Map<string,string>();
  const system = createLocalSystem({ storage: { get: async key => values.get(key) ?? null, set: async (key,value) => { values.set(key,value); }, remove: async key => { values.delete(key); } }, modules: [apt, exploration].map(module => ({ manifest: module.manifest, load: async () => module })) });
  await system.boot('ada'); return { system, shell: await system.createTerminal({ resumeKey: 'course:package-family' }) };
}
it('requires an explicit family and preserves apt while completing both package exercises', async () => {
  const { system, shell } = await setup();
  const aptBefore = await system.dispatch('fs.read', { path: '/var/lib/dpkg/status' });
  expect((await shell.run('sudo dnf install cowsay')).code).toBe(1);
  for (const family of ['fedora','arch']) {
    expect((await shell.run(`pkg-lab ${family}`)).code).toBe(0);
    const prefix = family === 'fedora' ? 'dnf' : 'pacman';
    expect((await shell.run(`${prefix} ${family === 'fedora' ? 'search' : '-Ss'} cowsay`)).stdout).toContain('cowsay');
    const install = `${prefix} ${family === 'fedora' ? 'install' : '-S'} cowsay`;
    expect((await shell.run(install)).code).toBe(1);
    expect((await shell.run(`sudo ${install}`, { readLine: async () => 'n' })).code).toBe(1);
    expect((await shell.run('pkg-lab run cowsay hello')).code).toBe(1);
    expect((await shell.run(`sudo ${install}`, { readLine: async () => 'y' })).code).toBe(0);
    expect((await shell.run('pkg-lab run cowsay hello')).stdout).toContain('< hello >');
    expect((await shell.run(`${prefix} ${family === 'fedora' ? 'list --installed' : '-Q'}`)).stdout).toContain('cowsay');
    expect((await shell.run(`sudo ${prefix} ${family === 'fedora' ? 'remove' : '-R'} cowsay`)).code).toBe(0);
    expect((await shell.run('pkg-lab run cowsay hello')).code).toBe(1);
    expect((await shell.run('pkg-lab status')).stdout).toContain('Completed practice: search, install, run, list, remove');
  }
  expect(await system.dispatch('fs.read', { path: '/var/lib/dpkg/status' })).toEqual(aptBefore);
  expect((await shell.run('cowsay hello')).code).toBe(127);
  await system.flush(); await system.boot('ada');
  expect((await (await system.createTerminal({ resumeKey: 'course:package-family' })).run('pkg-lab status')).stdout).toContain('Arch / pacman');
  await system.reset();
});
it('backs up and restores scoped exercise state and refuses stale transactions', async () => {
  const { system, shell } = await setup();
  await shell.run('pkg-lab fedora'); await shell.run('sudo dnf install cowsay');
  await shell.run('echo personal > notes.txt');
  expect((await shell.run('pkg-lab reset', { readLine: async () => 'n' })).code).toBe(1);
  expect((await shell.run('pkg-lab reset', { readLine: async () => 'y' })).code).toBe(0);
  expect((await shell.run('pkg-lab run cowsay hi')).code).toBe(1);
  expect((await shell.run('pkg-lab restore', { readLine: async () => 'y' })).code).toBe(0);
  expect((await shell.run('pkg-lab run cowsay hi')).code).toBe(0);
  expect((await shell.run('cat notes.txt')).stdout).toBe('personal\n');
  expect((await shell.run('sudo dnf install tree', { readLine: async () => {
    await system.dispatch('fs.write', { path: '/home/ada/.local/share/tuxos/package-labs/fedora.json', content: JSON.stringify({ version:1, installed:['sl'], updated:false, tasks:[] }) }); return 'y';
  } })).code).toBe(1);
  expect((await shell.run('pkg-lab status')).stdout).toContain('Installed: sl');
  await system.reset();
});
it('keeps examples plain in pipes, provides Tux cowsay, and awards Matrix after Ctrl+C without teaching failed commands', async () => {
  const { system, shell } = await setup();
  await shell.run('sudo apt update'); await shell.run('sudo apt install -y lolcat cowsay cmatrix');
  expect((await shell.run('echo rainbow | lolcat > colors.txt')).code).toBe(0);
  expect((await shell.run('cat colors.txt')).stdout).toBe('rainbow\n');
  expect((await shell.run('cowsay -f tux hello')).stdout).toContain('|o_o |');
  const signal = new AbortController();
  const rain = shell.run('cmatrix', { terminal:{ columns:40, rows:10 }, signal:signal.signal, stdout: text => { if (text.includes('Ctrl+C')) signal.abort(); } });
  expect((await rain).code).toBe(130);
  const result = await system.dispatch<ExplorationProgress>('exploration.status', {});
  expect(result.ok && result.value.achievements.matrix).toBeGreaterThan(0);
  expect(result.ok && result.value.learned.cmatrix).toBeUndefined();
  await system.reset();
});

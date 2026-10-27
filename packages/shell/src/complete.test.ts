import { createKernel } from '@tuxos/kernel';
import { describe, expect, it } from 'vitest';
import { createCommandRegistry, createShell } from './index';

async function setup() {
  const kernel = createKernel({ username: 'ada' });
  const registry = createCommandRegistry();
  const shell = createShell(kernel, { registry });
  await shell.run('mkdir -p projects/alpha Pictures; touch notes.txt .bashrc projects/plan.md');
  return { kernel, registry, shell };
}

describe('command registry', () => {
  it('shares commands between shells while each keeps its own cwd', async () => {
    const { kernel, registry, shell } = await setup();
    const other = createShell(kernel, { registry });
    registry.register({
      name: 'docker', summary: 'containers', usage: 'docker', run: (ctx) => { ctx.stdout('ok\n'); return 0; },
    });

    await shell.run('cd projects');
    expect(shell.cwd).toBe('/home/ada/projects');
    expect(other.cwd).toBe('/home/ada');
    expect(await other.run('docker')).toMatchObject({ stdout: 'ok\n', code: 0 });
  });

  it('refuses a duplicate command name', () => {
    const registry = createCommandRegistry();
    expect(() => registry.register({ name: 'ls', summary: '', usage: 'ls', run: () => 0 }))
      .toThrow(/already registered/);
  });
});

describe('completion', () => {
  it('completes command names in command position', async () => {
    const { shell } = await setup();
    expect(shell.complete('mk', 2)).toEqual({ start: 0, candidates: ['mkdir'] });
    expect(shell.complete('ls | so', 7)).toEqual({ start: 5, candidates: ['sort'] });
    expect(shell.complete('sudo wh', 7)).toEqual({ start: 5, candidates: ['whoami'] });
  });

  it('completes paths everywhere else, marking directories with a slash', async () => {
    const { shell } = await setup();
    expect(shell.complete('cat no', 6)).toEqual({ start: 4, candidates: ['notes.txt'] });
    expect(shell.complete('cd P', 4)).toEqual({ start: 3, candidates: ['Pictures/', 'Public/'] });
    expect(shell.complete('ls projects/', 12).candidates).toEqual(['projects/alpha/', 'projects/plan.md']);
    expect(shell.complete('ls ~/pro', 8).candidates).toEqual(['~/projects/']);
    expect(shell.complete('ls /e', 5).candidates).toEqual(['/etc/']);
  });

  it('only offers hidden files when the prefix starts with a dot', async () => {
    const { shell } = await setup();
    expect(shell.complete('cat ', 4).candidates).not.toContain('.bashrc');
    expect(shell.complete('cat .b', 6).candidates).toEqual(['.bashrc']);
  });

  it('completes the word at the cursor, not the end of the line', async () => {
    const { shell } = await setup();
    expect(shell.complete('cat no > out.txt', 6)).toEqual({ start: 4, candidates: ['notes.txt'] });
  });

  it('offers nothing for an unreadable or missing directory', async () => {
    const { shell } = await setup();
    expect(shell.complete('ls /root/', 9).candidates).toEqual([]);
    expect(shell.complete('ls nope/', 8).candidates).toEqual([]);
  });

  it('returns candidates in byte order', async () => {
    const { shell } = await setup();
    expect(shell.complete('ls ', 3).candidates).toEqual(['Desktop/', 'Documents/', 'Downloads/', 'Music/', 'Pictures/', 'Public/', 'Templates/', 'Videos/', 'notes.txt', 'projects/']);
  });
});

describe('history', () => {
  it('keeps run lines, skipping blanks and immediate repeats', async () => {
    const shell = createShell(createKernel({ username: 'ada' }));
    for (const line of ['ls', 'ls', '  ', 'pwd', 'ls']) await shell.run(line);
    expect(shell.history()).toEqual(['ls', 'pwd', 'ls']);
  });
});

describe('shell.ran record', () => {
  it('logs each line with its commands, cwd, exit code and output', async () => {
    const kernel = createKernel({ username: 'ada' });
    const shell = createShell(kernel);
    await shell.run('cd /tmp; echo hi | sort; sudo cat /etc/shadow > /dev/null; cat nope');
    await shell.run('   ');
    const ran = kernel.events().filter((event) => event.action.type === 'shell.ran');
    expect(ran).toHaveLength(1);
    expect(ran[0]?.action.payload).toEqual({
      line: 'cd /tmp; echo hi | sort; sudo cat /etc/shadow > /dev/null; cat nope',
      cwd: '/tmp',
      code: 1,
      stdout: 'hi\n',
      stderr: 'cat: nope: No such file or directory\n',
      commands: ['cd', 'echo', 'sort', 'sudo', 'cat', 'cat'],
    });
  });

  it('caps very long output', async () => {
    const kernel = createKernel({ username: 'ada' });
    const shell = createShell(kernel);
    await shell.run(`echo ${'x'.repeat(5000)}`);
    const payload = kernel.events().at(-1)?.action.payload as { stdout: string };
    expect(payload.stdout).toHaveLength(4001);
  });
});

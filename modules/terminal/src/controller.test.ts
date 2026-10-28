import { describe, expect, it, vi } from 'vitest';
import { apt } from '../../apt/src/index';
import { createLocalSystem, type KeyValueStorage } from '@tuxos/system';
import { TerminalController, titleFor, toTerminal } from './controller';
import { terminal } from './index';

const memory = (): KeyValueStorage => {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  };
};

async function setup(colourOutput = false) {
  const system = createLocalSystem({
    storage: memory(),
    modules: [{ manifest: terminal.manifest, load: async () => terminal }, { manifest: apt.manifest, load: async () => apt }],
  });
  await system.boot('ada');
  let output = '';
  let cleared = 0;
  const window = { closed: false, titles: [] as string[] };
  const screen = { write: (data: string) => { output += data; }, clear: () => { cleared += 1; }, cols: 80 };
  const controller = new TerminalController(screen, await system.createTerminal(), {
    close: () => { window.closed = true; },
    setTitle: (title) => window.titles.push(title),
  }, { colourOutput });
  return { system, controller, window, read: () => output, reset: () => { output = ''; }, cleared: () => cleared };
}

describe('TerminalController', () => {
  it('colours learning output without changing file contents or the next prompt', async () => {
    const { controller, read, system } = await setup(true);
    await controller.start();
    await controller.input('echo Hello world > greeting.txt; cat greeting.txt\r');
    expect(read()).toContain('\x1b[96mHello world\r\n\x1b[0m');
    expect(read().endsWith('ada@tuxos:~$ ')).toBe(true);
    expect(await system.dispatch('fs.read', { path: '/home/ada/greeting.txt' })).toMatchObject({ ok: true, value: 'Hello world\n' });
  });
  it('accepts an apt answer as input rather than another shell command', async () => {
    const { controller, read } = await setup();
    await controller.start();
    await controller.input('sudo apt update\r');
    const installing = controller.input('sudo apt install cowsay\r');
    await vi.waitFor(() => expect(read()).toContain('Do you want to continue? [Y/n] '));
    await controller.input('y\r');
    await installing;
    expect(read().match(/Setting up cowsay/g)).toHaveLength(1);
    await controller.input('cowsay hi\r');
    expect(read()).toContain('< hi >');
    expect(read()).not.toContain('y: command not found');
  });

  it.each(['\x03', '\x04'])('cancels an apt prompt with %j and keeps the terminal open', async (key) => {
    const { controller, window, read, system } = await setup();
    await controller.start();
    await controller.input('sudo apt update\r');
    const installing = controller.input('sudo apt install cowsay\r');
    await vi.waitFor(() => expect(read()).toContain('Do you want to continue?'));
    await controller.input(key);
    await installing;
    expect(window.closed).toBe(false);
    expect(read()).toContain('Abort.');
    const other = await system.createTerminal();
    expect((await other.run('cowsay hi')).code).toBe(127);
    expect((await other.run('sudo apt install tree')).code).toBe(0);
  });

  it('closing a terminal aborts a pending package install and releases its lock', async () => {
    const { controller, read, system } = await setup();
    await controller.start();
    await controller.input('sudo apt update\r');
    const installing = controller.input('sudo apt install cowsay\r');
    await vi.waitFor(() => expect(read()).toContain('Do you want to continue?'));
    controller.dispose();
    await installing;
    const other = await system.createTerminal();
    expect((await other.run('cowsay hi')).code).toBe(127);
    expect((await other.run('sudo apt install tree')).code).toBe(0);
  });

  it('returns to the prompt when Ctrl+C stops cmatrix', async () => {
    const { controller, read } = await setup();
    await controller.start();
    await controller.input('sudo apt update && sudo apt install cmatrix\r');
    const animation = controller.input('cmatrix\r');
    await vi.waitFor(() => expect(read()).toContain('Ctrl+C to exit'));
    await controller.input('\x03');
    await animation;
    expect(read().endsWith('ada@tuxos:~$ ')).toBe(true);
  });

  it('prints the motd and a bash prompt, and titles the window', async () => {
    const { controller, window, read } = await setup();
    await controller.start('Welcome');
    expect(read()).toBe('Welcome\r\nada@tuxos:~$ ');
    expect(window.titles).toEqual(['ada@tuxos: ~']);
  });

  it('runs a typed command and shows its output with terminal line endings', async () => {
    const { controller, read, reset } = await setup();
    await controller.start();
    reset();
    await controller.input('echo hi > f; cat f; cat nope\r');
    expect(read()).toContain('\r\nhi\r\ncat: nope: No such file or directory\r\nada@tuxos:~$ ');
  });

  it('updates the prompt and title after cd', async () => {
    const { controller, window, read } = await setup();
    await controller.start();
    await controller.input('cd Documents\r');
    expect(read().endsWith('ada@tuxos:~/Documents$ ')).toBe(true);
    expect(window.titles).toEqual(['ada@tuxos: ~', 'ada@tuxos: ~/Documents']);
    await controller.input('ls\r');
    expect(window.titles).toHaveLength(2);
  });

  it('completes with Tab through the shell', async () => {
    const { controller, read } = await setup();
    await controller.start();
    await controller.input('cd Doc\t');
    expect(read()).toMatch(/cd Documents\/\x1b\[J\r\x1b\[\d+C$/);
  });

  it('closes the window on exit and on Ctrl+D at an empty prompt', async () => {
    const first = await setup();
    await first.controller.start();
    await first.controller.input('exit\r');
    expect(first.window.closed).toBe(true);

    const second = await setup();
    await second.controller.start();
    await second.controller.input('\x04');
    expect(second.window.closed).toBe(true);
  });

  it('clears the screen with Ctrl+L and with the clear command from this module', async () => {
    const { controller, read, cleared } = await setup();
    await controller.start();
    await controller.input('\x0c');
    expect(cleared()).toBe(1);
    await controller.input('clear\r');
    expect(read()).toContain('\x1b[H\x1b[2J\x1b[3J');
  });

  it('gives a fresh prompt on Ctrl+C', async () => {
    const { controller, read, reset } = await setup();
    await controller.start();
    reset();
    await controller.input('half typed\x03');
    expect(read().endsWith('^C\r\nada@tuxos:~$ ')).toBe(true);
  });
});

describe('helpers', () => {
  it('converts newlines for xterm', () => {
    expect(toTerminal('a\nb\r\nc')).toBe('a\r\nb\r\nc');
  });

  it('turns a prompt into a window title', () => {
    expect(titleFor('root@box:/etc# ')).toBe('root@box: /etc');
    expect(titleFor('weird')).toBe('Terminal');
  });
});

describe('trainer feedback', () => {
  it('is set apart from the output, coloured, wrapped and followed by what to do next', async () => {
    const { formatFeedback } = await import('./controller');
    const wrong = formatFeedback({ correct: false, text: 'pwd prints the folder you are in; ls lists what is inside it, which is a different question.' }, 40);
    const plain = wrong.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('┃ ✗ Not quite');
    expect(plain).toContain('Try again, or type /hint');
    expect(Math.max(...plain.split('\r\n').map((line) => line.length))).toBeLessThanOrEqual(40);
    expect(formatFeedback({ correct: true, text: 'Yes.' }, 80)).toContain('\x1b[1;32m');
  });
});

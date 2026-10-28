import { createLocalSystem, type KeyValueStorage, type SystemClient, type TerminalSession } from '@tuxos/system';
import { describe, expect, it, vi } from 'vitest';
import { apt } from './index';

const memory = (): KeyValueStorage => {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  };
};

async function boot(storage = memory()): Promise<{ system: SystemClient; sh: TerminalSession }> {
  const system = createLocalSystem({ storage, modules: [{ manifest: apt.manifest, load: async () => apt }] });
  await system.boot('ada');
  return { system, sh: await system.createTerminal() };
}

const read = async (system: SystemClient, path: string) => {
  const result = await system.dispatch<string>('fs.read', { path });
  return result.ok ? result.value : undefined;
};

describe('apt', () => {
  it('starts with the base system in dpkg\'s database', async () => {
    const { system, sh } = await boot();
    expect(await read(system, '/var/lib/dpkg/status')).toContain('Package: coreutils\nStatus: install ok installed');
    const listing = await sh.run('dpkg -l');
    expect(listing.stdout).toMatch(/^ii {2}bash +5\.2\.21-2ubuntu4 +amd64 +GNU Bourne Again SHell$/m);
    expect(listing.stdout).not.toContain('tree');
  });

  it('says how to install a missing program, and hides it from help until then', async () => {
    const { sh } = await boot();
    expect(await sh.run('tree')).toEqual({
      stdout: '', code: 127, stderr: "Command 'tree' not found, but can be installed with:\nsudo apt install tree\n",
    });
    expect((await sh.run('help')).stdout).not.toMatch(/^tree\t/m);
    expect((await sh.run('which tree')).code).toBe(1);
  });

  it('needs root to change packages, with apt\'s own errors', async () => {
    const { sh } = await boot();
    const install = await sh.run('apt install tree');
    expect(install.code).toBe(100);
    expect(install.stderr).toContain('E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)');
    expect(install.stderr).toContain('are you root?');
    expect((await sh.run('apt update')).stderr).toContain('E: Unable to lock directory /var/lib/apt/lists/');
  });

  it('knows no packages until apt update fetches the lists', async () => {
    const { sh } = await boot();
    const before = await sh.run('sudo apt install tree');
    expect(before.code).toBe(100);
    expect(before.stderr).toContain('E: Unable to locate package tree\n');
    expect(before.stderr).toContain('sudo apt update');
    const update = await sh.run('sudo apt update');
    expect(update.code).toBe(0);
    expect(update.stdout).toContain('Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease');
    expect(update.stdout).toContain('All packages are up to date.');
  });

  it('installs a package: its program works, owns its files and shows in dpkg', async () => {
    const { system, sh } = await boot();
    await sh.run('sudo apt update');
    const install = await sh.run('sudo apt install tree');
    expect(install.code).toBe(0);
    expect(install.stdout).toContain('The following NEW packages will be installed:\n  tree\n');
    expect(install.stdout).toContain('Get:1 http://archive.ubuntu.com/ubuntu noble/universe amd64 tree amd64 2.1.1-2 [48 kB]');
    expect(install.stdout).toContain('Setting up tree (2.1.1-2) ...');
    expect((await system.dispatch<{ mode: number; owner: string }>('fs.stat', { path: '/usr/bin/tree' }))).toMatchObject({ ok: true, value: { mode: 0o755, owner: 'root' } });
    expect((await sh.run('which tree')).stdout).toBe('/usr/bin/tree\n');
    expect((await sh.run('help')).stdout).toMatch(/^tree\t/m);
    expect((await sh.run('dpkg -L tree')).stdout).toBe('/.\n/usr/bin/tree\n/usr/share/doc/tree/copyright\n');
    expect((await sh.run('dpkg -s tree')).stdout).toContain('Status: install ok installed\n');
    expect((await sh.run('apt list --installed')).stdout).toContain('tree/noble,now 2.1.1-2 amd64 [installed]\n');
    expect((await sh.run('sudo apt install tree')).stdout).toContain('tree is already the newest version (2.1.1-2).');

    await sh.run('mkdir -p Documents/notes');
    await sh.run('echo hi > Documents/notes/a.txt');
    await sh.run('cd Documents');
    expect((await sh.run('tree')).stdout).toBe('.\n└── notes\n    └── a.txt\n\n1 directory, 1 file\n');
    expect((await sh.run('tree -d')).stdout).toBe('.\n└── notes\n\n1 directory\n');
  });

  it('installs dependencies too, asks first, and installs with -y', async () => {
    const { system, sh } = await boot();
    await sh.run('sudo apt update');
    const asked = await sh.run('sudo apt install fortune-mod');
    expect(asked.code).toBe(1);
    expect(asked.stdout).toContain('The following additional packages will be installed:\n  fortunes-min librecode0\n');
    expect(asked.stdout).toContain('The following NEW packages will be installed:\n  fortune-mod fortunes-min librecode0\n');
    expect(asked.stdout).toContain('Do you want to continue? [Y/n] Abort.');
    expect(asked.stderr).toContain('sudo apt install -y fortune-mod');
    expect((await sh.run('fortune')).code).toBe(127);

    expect((await sh.run('sudo apt install -y fortune-mod')).code).toBe(0);
    const saying = await sh.run('fortune');
    expect(saying.code).toBe(0);
    expect(saying.stdout.length).toBeGreaterThan(5);
    expect(await read(system, '/var/lib/apt/extended_states')).toContain('Package: fortunes-min\nArchitecture: amd64\nAuto-Installed: 1');
    expect((await sh.run('apt list --installed')).stdout).toContain('librecode0/noble,now 3.6-26 amd64 [installed,automatic]');
  });

  it('removes packages, says what is left over, and autoremove cleans it up', async () => {
    const { system, sh } = await boot();
    await sh.run('sudo apt update');
    await sh.run('sudo apt install -y fortune-mod');
    const asked = await sh.run('sudo apt remove fortune-mod');
    expect(asked.stdout).toContain('Do you want to continue? [Y/n] Abort.');
    const removed = await sh.run('sudo apt remove -y fortune-mod');
    expect(removed.code).toBe(0);
    expect(removed.stdout).toContain('The following packages were automatically installed and are no longer required:\n  fortunes-min librecode0\nUse \'sudo apt autoremove\' to remove them.');
    expect(removed.stdout).toContain('Removing fortune-mod (1:1.99.1-7.3build1) ...');
    expect((await sh.run('fortune')).code).toBe(127);
    // remove keeps the documentation; the leftovers are still installed.
    expect(await read(system, '/usr/share/doc/fortune-mod/copyright')).toBeDefined();
    expect((await sh.run('dpkg -l fortunes-min')).code).toBe(0);
    const autoremove = await sh.run('sudo apt autoremove -y');
    expect(autoremove.stdout).toContain('The following packages will be REMOVED:\n  fortunes-min librecode0\n');
    expect(await read(system, '/usr/share/games/fortunes/fortunes')).toBeUndefined();
    expect((await sh.run('sudo apt remove -y tree')).stdout).toContain("Package 'tree' is not installed, so not removed");
  });

  it('removing a library removes what needs it; purge removes documentation too', async () => {
    const { system, sh } = await boot();
    await sh.run('sudo apt update');
    await sh.run('sudo apt install -y jq');
    const removed = await sh.run('sudo apt purge -y libonig5');
    expect(removed.stdout).toContain('The following packages will be REMOVED:\n  jq* libjq1* libonig5*\n');
    expect(await read(system, '/usr/share/doc/jq/copyright')).toBeUndefined();
    expect((await sh.run('jq .')).code).toBe(127);
  });

  it('refuses to remove the base system', async () => {
    const { sh } = await boot();
    const result = await sh.run('sudo apt remove -y bash');
    expect(result.code).toBe(100);
    expect(result.stderr).toContain('bash is part of the TuxOS base system');
  });

  it('searches and shows packages from the lists', async () => {
    const { sh } = await boot();
    expect((await sh.run('apt search cow')).stdout).toBe('Sorting... Done\nFull Text Search... Done\n');
    await sh.run('sudo apt update');
    expect((await sh.run('apt search cow')).stdout).toContain('cowsay/noble 3.03+dfsg2-8 amd64\n  configurable talking cow\n');
    const show = await sh.run('apt show jq');
    expect(show.stdout).toContain('Package: jq\nVersion: 1.7.1-3build1\n');
    expect(show.stdout).toContain('Depends: libjq1, libonig5\n');
    expect((await sh.run('apt show nosuch')).stderr).toBe('N: Unable to locate package nosuch\nE: No packages found\n');
    expect((await sh.run('apt frobnicate')).stderr).toBe('E: Invalid operation frobnicate\n');
    expect((await sh.run('apt-get search cow')).code).toBe(100);
  });

  it('keeps installed packages after a restart', async () => {
    const storage = memory();
    const first = await boot(storage);
    await first.sh.run('sudo apt update');
    await first.sh.run('sudo apt-get install hello');
    await first.system.flush();
    const second = await boot(storage);
    expect((await second.sh.run('hello')).stdout).toBe('Hello, world!\n');
  });

  it('installs cmatrix, exposes the command, persists it and removes it', async () => {
    const storage = memory();
    const { system, sh } = await boot(storage);
    expect((await sh.run('cmatrix')).code).toBe(127);
    await sh.run('sudo apt update');
    expect((await sh.run('sudo apt install cmatrix')).code).toBe(0);
    expect((await sh.run('which cmatrix')).stdout).toBe('/usr/bin/cmatrix\n');
    expect((await sh.run('cmatrix')).stdout).toContain('\x1b[');
    expect((await sh.run('apt search matrix')).stdout).toContain('cmatrix/noble,now');
    await system.flush();
    const restored = await boot(storage);
    expect((await restored.sh.run('cmatrix --help')).stdout).toContain('Ctrl+C');
    expect((await restored.sh.run('sudo apt remove cmatrix', { readLine: async () => 'y' })).code).toBe(0);
    expect((await restored.sh.run('cmatrix')).code).toBe(127);
  });

  it('explains when an updated practice repository does not have a package', async () => {
    const { sh } = await boot();
    await sh.run('sudo apt update');
    const result = await sh.run('sudo apt install nonexistent');
    expect(result.code).toBe(100);
    expect(result.stderr).toContain('small practice repository');
    expect(result.stderr).not.toContain('Hint: run sudo apt update');
  });

  it('waits for confirmation, streams the plan once through sudo, and locks concurrent changes', async () => {
    const { system, sh } = await boot();
    await sh.run('sudo apt update');
    let answer!: (line: string | null) => void;
    let output = '';
    const readLine = vi.fn(() => new Promise<string | null>((resolve) => { answer = resolve; }));
    const operation = sh.run('sudo apt install cowsay', { readLine, stdout: (text) => { output += text; } });
    await vi.waitFor(() => expect(readLine).toHaveBeenCalledOnce());
    expect(output.match(/Reading package lists/g)).toHaveLength(1);
    expect(await read(system, '/usr/bin/cowsay')).toBeUndefined();
    const other = await system.createTerminal();
    expect((await other.run('sudo apt install tree')).stderr).toContain('Another package operation');
    answer('');
    const result = await operation;
    expect(result.code).toBe(0);
    expect(output).toBe(result.stdout);
    expect((await sh.run('cowsay hello')).stdout).toContain('< hello >');
    expect((await other.run('sudo apt install tree')).code).toBe(0);
  });

  it.each(['n', null])('leaves files unchanged when confirmation is %s', async (answer) => {
    const { system, sh } = await boot();
    await sh.run('sudo apt update');
    const before = await read(system, '/var/lib/dpkg/status');
    const result = await sh.run('sudo apt install cowsay', { readLine: async () => answer });
    expect(result.code).toBe(1);
    expect(await read(system, '/var/lib/dpkg/status')).toBe(before);
    expect(await read(system, '/usr/bin/cowsay')).toBeUndefined();
  });

  it('supports piped confirmation and previews without changing package files', async () => {
    const { system, sh } = await boot();
    await sh.run('sudo apt update');
    expect((await sh.run('apt install -s cowsay')).stdout).toContain('Inst cowsay');
    expect(await read(system, '/usr/bin/cowsay')).toBeUndefined();
    expect((await sh.run('echo y | sudo apt install cowsay')).code).toBe(0);
    expect((await sh.run('apt remove --dry-run cowsay')).stdout).toContain('Remv cowsay');
    expect((await sh.run('cowsay hello')).code).toBe(0);
    expect((await sh.run('sudo apt remove --assume-no -y cowsay')).code).toBe(1);
    expect((await sh.run('cowsay hello')).code).toBe(0);
  });

  it('animates cmatrix until cancelled, then restores the terminal', async () => {
    const { sh } = await boot();
    await sh.run('sudo apt update && sudo apt install cmatrix');
    const controller = new AbortController();
    let output = '';
    const operation = sh.run('cmatrix', {
      signal: controller.signal, terminal: { columns: 40, rows: 12 },
      stdout: (text) => { output += text; },
    });
    await vi.waitFor(() => expect(output).toContain('Ctrl+C to exit'));
    controller.abort();
    expect((await operation).code).toBe(130);
    expect(output).toContain('\x1b[?1049h');
    expect(output.endsWith('\x1b[0m\x1b[?25h\x1b[?1049l')).toBe(true);
    expect((await sh.run('echo still working')).stdout).toBe('still working\n');
  });
});

describe('package programs', () => {
  async function withAll(): Promise<TerminalSession> {
    const { sh } = await boot();
    await sh.run('sudo apt update');
    await sh.run('sudo apt install -y hello cowsay jq neofetch sl');
    return sh;
  }

  it('hello greets, cowsay talks, sl and neofetch print', async () => {
    const sh = await withAll();
    expect((await sh.run('hello -g "Hi TuxOS"')).stdout).toBe('Hi TuxOS\n');
    expect((await sh.run('cowsay moo')).stdout).toBe(' _____\n< moo >\n -----\n        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\       )\\/\\\n                ||----w |\n                ||     ||\n');
    expect((await sh.run('echo piped in | cowsay')).stdout).toContain('< piped in >');
    expect((await sh.run('sl')).stdout).toContain('Choo choo!');
    const fetch = await sh.run('neofetch');
    expect(fetch.stdout).toContain('ada@tuxos');
    expect(fetch.stdout).toMatch(/Packages: \d+ \(dpkg\)/);
  });

  it('jq reads JSON from files and pipes', async () => {
    const sh = await withAll();
    await sh.run('echo \'{"name":"tux","tags":["linux","penguin"],"age":33}\' > pet.json');
    expect((await sh.run('jq .name pet.json')).stdout).toBe('"tux"\n');
    expect((await sh.run('jq -r .tags[0] pet.json')).stdout).toBe('linux\n');
    expect((await sh.run('cat pet.json | jq -r ".tags[]"')).stdout).toBe('linux\npenguin\n');
    expect((await sh.run('jq "keys" pet.json')).stdout).toBe('[\n  "age",\n  "name",\n  "tags"\n]\n');
    expect((await sh.run('jq ".tags | length" pet.json')).stdout).toBe('2\n');
    expect((await sh.run('jq -c . pet.json')).stdout).toBe('{"name":"tux","tags":["linux","penguin"],"age":33}\n');
    expect((await sh.run('jq "map(.x)" pet.json')).code).toBe(3);
    expect((await sh.run('echo nope | jq .')).code).toBe(5);
  });
});

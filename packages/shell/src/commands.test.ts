import { describe, expect, it } from 'vitest';
import { createKernel } from '@tuxos/kernel';
import { createShell, type CommandDefinition } from './index';

const make = () => createShell(createKernel({ username: 'ada' }));

async function run(shell: ReturnType<typeof make>, line: string) {
  return shell.run(line);
}

describe('built-in commands', () => {
  it('covers navigation, listing, environment and help', async () => {
    const shell = make();
    expect((await run(shell, 'pwd')).stdout).toBe('/home/ada\n');
    await run(shell, 'mkdir -p work/nested');
    await run(shell, 'touch work/a work/.hidden');
    expect((await run(shell, 'ls work')).stdout).toBe('a nested\n');
    expect((await run(shell, 'ls -a -1 work')).stdout).toContain('.hidden\n');
    expect((await run(shell, 'ls -l work/a')).stdout).toMatch(/^-rw-r--r--\s+1 ada ada\s+0 Oct \d+\s+\d\d:\d\d a\n$/);
    await run(shell, 'cd work');
    expect((await run(shell, 'cd -')).stdout).toBe('/home/ada\n');
    expect((await run(shell, 'whoami')).stdout).toBe('ada\n');
    await run(shell, 'export COURSE=linux');
    expect((await run(shell, 'env')).stdout).toContain('COURSE=linux\n');
    expect((await run(shell, 'help')).stdout).toContain('ls\tList directory contents');
  });

  it('covers file creation, reading, copying, moving and removal', async () => {
    const shell = make();
    await run(shell, 'mkdir -p source/deep; echo data > source/deep/file');
    expect((await run(shell, 'cat source/deep/file')).stdout).toBe('data\n');
    expect((await run(shell, 'cat missing')).code).toBe(1);
    await run(shell, 'cp -r source copy');
    expect((await run(shell, 'cat copy/deep/file')).stdout).toBe('data\n');
    await run(shell, 'mv copy moved');
    expect((await run(shell, 'cat moved/deep/file')).stdout).toBe('data\n');
    expect((await run(shell, 'rm -r moved')).code).toBe(0);
    expect((await run(shell, 'rm -f missing')).code).toBe(0);
  });

  it('covers chmod octal and symbolic modes', async () => {
    const shell = make();
    await run(shell, 'touch mode');
    await run(shell, 'chmod 777 mode');
    expect((await run(shell, 'ls -l mode')).stdout).toMatch(/^-rwxrwxrwx/);
    await run(shell, 'chmod go-w mode');
    expect((await run(shell, 'ls -l mode')).stdout).toMatch(/^-rwxr-xr-x/);
    await run(shell, 'chmod a=r mode');
    expect((await run(shell, 'ls -l mode')).stdout).toMatch(/^-r--r--r--/);
    await run(shell, 'chmod u+x mode');
    expect((await run(shell, 'ls -l mode')).stdout).toMatch(/^-r-xr--r--/);
  });

  it('covers text command options', async () => {
    const shell = make();
    const command: CommandDefinition = {
      name: 'fixture', summary: 'fixture', usage: 'fixture',
      run(ctx) { ctx.stdout('10 apple\n2 Banana\n2 Banana\n'); return 0; },
    };
    shell.register(command);
    await run(shell, 'fixture > words');
    expect((await run(shell, 'echo -n ok')).stdout).toBe('ok');
    expect((await run(shell, 'head -n 2 words')).stdout).toBe('10 apple\n2 Banana\n');
    expect((await run(shell, 'tail -n 1 words')).stdout).toBe('2 Banana\n');
    expect((await run(shell, 'wc -l -w -c words')).stdout).toBe('3 6 27 words\n');
    expect((await run(shell, 'grep -i -n Banana words')).stdout).toBe('2:2 Banana\n3:2 Banana\n');
    expect((await run(shell, 'grep -v -c Banana words')).stdout).toBe('1\n');
    await run(shell, 'echo Banana > other');
    expect((await run(shell, 'grep -c Banana words other')).stdout).toBe('words:2\nother:1\n');
    expect((await run(shell, 'grep -r -n apple .')).stdout).toContain('apple');
    expect((await run(shell, 'sort -n words')).stdout).toBe('2 Banana\n2 Banana\n10 apple\n');
    expect((await run(shell, 'uniq -c < words')).stdout).toBe('1 10 apple\n2 2 Banana\n');
  });

  it('supports true and false', async () => {
    const shell = make();
    expect((await run(shell, 'true')).code).toBe(0);
    expect((await run(shell, 'false')).code).toBe(1);
  });

  it('uses typed paths and GNU-style errno diagnostics', async () => {
    const shell = make();
    const cases: [string, string, number][] = [
      ['ls x', "ls: cannot access 'x': No such file or directory\n", 2],
      ['cat x', 'cat: x: No such file or directory\n', 1],
      ['cat .', 'cat: .: Is a directory\n', 1],
      ['cd x', 'bash: cd: x: No such file or directory\n', 1],
      ['cd /etc/hostname', 'bash: cd: /etc/hostname: Not a directory\n', 1],
      ['mkdir /home/ada', "mkdir: cannot create directory '/home/ada': File exists\n", 1],
      ['rm /tmp', "rm: cannot remove '/tmp': Is a directory\n", 1],
      ['cp x y', "cp: cannot stat 'x': No such file or directory\n", 1],
      ['cp . y', "cp: -r not specified; omitting directory '.'\n", 1],
      ['mv x y', "mv: cannot stat 'x': No such file or directory\n", 1],
      ['chmod 644 x', "chmod: cannot access 'x': No such file or directory\n", 1],
      ['head x', 'head: x: No such file or directory\n', 1],
      ['tail x', 'tail: x: No such file or directory\n', 1],
      ['wc x', 'wc: x: No such file or directory\n', 1],
      ['sort x', 'sort: x: No such file or directory\n', 1],
      ['grep a x', 'grep: x: No such file or directory\n', 2],
    ];
    for (const [command, stderr, code] of cases) expect(await run(shell, command)).toMatchObject({ stderr, code });
    expect(await run(shell, 'touch /etc/f')).toMatchObject({
      stderr: "touch: cannot touch '/etc/f': Permission denied\n", code: 1,
    });
    expect(await run(shell, 'echo x > /etc/f')).toMatchObject({
      stderr: 'bash: /etc/f: Permission denied\n', code: 1,
    });
    expect(await run(shell, 'chmod 000 .')).toMatchObject({ code: 0 });
    expect(await run(shell, 'ls .')).toMatchObject({
      stderr: "ls: cannot open directory '.': Permission denied\n", code: 2,
    });
  });

  it('copies multiple sources and moves directories into directories', async () => {
    const shell = make();
    await run(shell, 'touch a b; mkdir dest; cp a b dest');
    expect((await run(shell, 'ls -1 dest')).stdout).toBe('a\nb\n');
    expect(await run(shell, 'cp a b nowhere')).toMatchObject({
      stderr: "cp: target 'nowhere' is not a directory\n", code: 1,
    });
    await run(shell, 'mkdir -p source/child target; touch source/child/file');
    expect(await run(shell, 'mv source target')).toMatchObject({ code: 0 });
    expect((await run(shell, 'cat target/source/child/file')).stdout).toBe('');
    await run(shell, 'mkdir self');
    expect(await run(shell, 'mv self self')).toMatchObject({
      stderr: "mv: cannot move 'self' to a subdirectory of itself, 'self/self'\n", code: 1,
    });
  });

  it('lists hidden entries, byte-sorts names and aligns long rows', async () => {
    const shell = make();
    await run(shell, 'mkdir list-test; cd list-test; touch z A a; mkdir D d; echo 123456789 > long-name');
    expect((await run(shell, 'ls -a -1')).stdout.split('\n').slice(0, 4)).toEqual(['.', '..', 'A', 'D']);
    const lines = (await run(shell, 'ls -la')).stdout.trimEnd().split('\n').filter((line) => !line.startsWith('total'));
    expect(lines.find((line) => line.endsWith('long-name'))).toMatch(/\s+long-name$/);
    expect(lines.find((line) => line.endsWith('z'))).toMatch(/\s+z$/);
    const longLine = lines.find((line) => line.endsWith('long-name'))!;
    const shortLine = lines.find((line) => line.endsWith('z'))!;
    expect(longLine.indexOf('Oct')).toBe(shortLine.indexOf('Oct'));
  });

  it('rejects unsupported options for option-taking built-ins', async () => {
    const shell = make();
    const commands = [
      'cd', 'pwd', 'ls', 'cat', 'mkdir', 'touch', 'rm', 'cp', 'mv', 'chmod', 'head', 'tail',
      'wc', 'grep', 'sort', 'uniq', 'whoami', 'env', 'export', 'help', 'sudo', 'true', 'false',
    ];
    for (const command of commands) {
      const result = await run(shell, `${command} -z`);
      expect(result.code, command).toBe(command === 'ls' || command === 'grep' ? 2 : 1);
      if (command === 'cd' || command === 'export') {
        expect(result.stderr, command).toBe(`bash: ${command}: -z: invalid option\n`);
      } else {
        expect(result.stderr, command).toBe(
          `${command}: invalid option -- 'z'\nTry '${command} --help' for more information.\n`,
        );
      }
    }
  });

  it('treats -- and a lone dash as operands and supports ls -d totals', async () => {
    const shell = make();
    await run(shell, 'mkdir count-test; cd count-test; mkdir Documents; touch -- -z; mkdir deep; echo xx > f1; echo xx > f2; echo xx > f3');
    expect((await run(shell, 'ls -- -z')).stdout).toBe('-z\n');
    expect((await run(shell, 'cat -- -z')).stdout).toBe('');
    expect((await run(shell, 'echo -')).stdout).toBe('-\n');
    expect((await run(shell, 'ls -ld deep')).stdout).toMatch(/^[d-].* deep\n$/);
    expect((await run(shell, 'ls -l /')).stdout.split('\n')[0]).toBe('total 80');
    expect((await run(shell, 'ls -la')).stdout.split('\n')[0]).toBe('total 28');
  });

  it('matches Bash echo options and escape handling', async () => {
    const shell = make();
    expect((await run(shell, 'echo -e hi')).stdout).toBe('hi\n');
    expect((await run(shell, String.raw`echo -ne '\0141\n\tX'`)).stdout).toBe('a\n\tX');
    expect((await run(shell, String.raw`echo -e 'before\cafter'`)).stdout).toBe('before');
    expect((await run(shell, 'echo -z hi')).stdout).toBe('-z hi\n');
    expect((await run(shell, 'echo -- hi')).stdout).toBe('-- hi\n');
    expect((await run(shell, 'echo hi -e')).stdout).toBe('hi -e\n');
    expect((await run(shell, String.raw`echo -e "a\tb\nc"`)).stdout).toBe('a\tb\nc\n');
    expect((await run(shell, String.raw`echo "a\nb"`)).stdout).toBe(String.raw`a\nb` + '\n');
    expect((await run(shell, String.raw`echo "say \"hi\" \$HOME \\"`)).stdout)
      .toBe('say "hi" $HOME \\\n');
  });

  it('uses standard input for lone dash operands', async () => {
    const shell = make();
    await run(shell, 'echo a > a; echo b > b');
    expect((await run(shell, 'echo hi | cat a - b')).stdout).toBe('a\nhi\nb\n');
    expect((await run(shell, 'echo hi | head -')).stdout).toBe('hi\n');
    expect((await run(shell, 'echo hi | tail -')).stdout).toBe('hi\n');
    expect((await run(shell, 'echo hi | wc -c -')).stdout).toBe('3 -\n');
    expect((await run(shell, String.raw`echo -e 'b\na' | sort -`)).stdout).toBe('a\nb\n');
    expect((await run(shell, 'echo hi | grep hi -')).stdout).toBe('hi\n');
  });

  it('handles multiple file operands like GNU text commands', async () => {
    const shell = make();
    await run(shell, 'echo a > a; echo b > b; echo 2 > numbers');
    expect((await run(shell, 'cat a b')).stdout).toBe('a\nb\n');
    expect((await run(shell, 'echo 3 | sort - numbers')).stdout).toBe('2\n3\n');
    expect((await run(shell, 'head a b')).stdout).toBe('==> a <==\na\n\n==> b <==\nb\n');
    expect((await run(shell, 'tail a b')).stdout).toBe('==> a <==\na\n\n==> b <==\nb\n');
    expect((await run(shell, 'wc a b')).stdout).toBe('1 1 2 a\n1 1 2 b\n2 2 4 total\n');
    expect((await run(shell, 'grep a a b')).stdout).toBe('a:a\n');
  });
});

describe('chmod symbolic modes', () => {
  it.each([
    ['+x', 0o644, 0o755],
    ['u+x', 0o644, 0o744],
    ['go-r', 0o644, 0o600],
    ['u=rwx,go=', 0o644, 0o700],
    ['a=r', 0o644, 0o444],
    ['+w', 0o444, 0o644],
    ['o+w', 0o644, 0o646],
    ['0755', 0o644, 0o755],
  ])('chmod %s turns %o into %o', async (mode, from, to) => {
    const { parseMode } = await import('./commands/helpers');
    expect(parseMode(mode, from)).toBe(to);
  });

  it.each(['u+z', 'x', '888', '1777', 'u+x,,'])('rejects %s', async (mode) => {
    const { parseMode } = await import('./commands/helpers');
    expect(parseMode(mode, 0o644)).toBeUndefined();
  });
});

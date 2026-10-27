import { describe, expect, it } from 'vitest';
import { createKernel } from '@tuxos/kernel';
import { createShell } from './index';

const make = () => createShell(createKernel({ username: 'ada' }));

describe('executor', () => {
  it('streams terminal output once while keeping piped and redirected output out of the screen', async () => {
    const shell = make();
    let stdout = '';
    let stderr = '';
    const result = await shell.run('sudo echo saved > f; cat f | cat; sudo cat nope; missing-command', {
      stdout: (text) => { stdout += text; }, stderr: (text) => { stderr += text; },
    });
    expect(stdout).toBe('saved\n');
    expect(stdout).toBe(result.stdout);
    expect(stderr).toBe(result.stderr);
    expect(stderr).toContain('cat: nope: No such file or directory');
    expect(stderr).toContain('missing-command: command not found');
    expect((await shell.run('cat f')).stdout).toBe('saved\n');
  });

  it('streams parsing and redirection errors without prompting for terminal input', async () => {
    const shell = make();
    let stderr = '';
    const io = { stderr: (text: string) => { stderr += text; } };
    const parse = await shell.run('echo "', io);
    expect(stderr).toBe(parse.stderr);
    stderr = '';
    const redirected = await shell.run('cat < /missing', io);
    expect(stderr).toBe(redirected.stderr);
    expect(redirected.code).toBe(1);
  });

  it('routes learning slash commands while preserving ordinary absolute paths', async () => {
    const shell = make();
    shell.register({
      name: 'hint', summary: 'hint', usage: '/hint',
      run: (ctx) => { ctx.stdout('try pwd\n'); return 0; },
    });
    await expect(shell.run('/hint')).resolves.toMatchObject({ code: 0, stdout: 'try pwd\n' });
    await expect(shell.run('cat /etc/motd')).resolves.toMatchObject({ code: 0 });
  });

  it('expands status and exported variables at execution time', async () => {
    const shell = make();
    const result = await shell.run('cat /nope; echo $?');
    expect(result.stdout).toBe('1\n');
    expect(result.code).toBe(0);
    expect((await shell.run('export COURSE=linux; echo $COURSE')).stdout).toBe('linux\n');
  });

  it('updates status through &&, || and ; chains', async () => {
    const shell = make();
    expect((await shell.run('true && echo $?')).stdout).toBe('0\n');
    expect((await shell.run('false || echo $?')).stdout).toBe('1\n');
    expect((await shell.run('false && echo bad; echo $?')).stdout).toBe('1\n');
  });

  it('only expands unquoted tilde, glob characters and variables', async () => {
    const shell = make();
    await shell.run('touch alpha.txt beta.txt');
    expect((await shell.run('echo *.txt')).stdout).toBe('alpha.txt beta.txt\n');
    expect((await shell.run('echo "*"')).stdout).toBe('*\n');
    expect((await shell.run("echo '*' ")).stdout).toBe('*\n');
    expect((await shell.run('echo ~')).stdout).toBe('/home/ada\n');
    expect((await shell.run('echo "~"')).stdout).toBe('~\n');
    expect((await shell.run('echo $')).stdout).toBe('$\n');
    expect((await shell.run('echo "$"')).stdout).toBe('$\n');
    expect((await shell.run('echo $.')).stdout).toBe('$.\n');
    expect((await shell.run('echo a$')).stdout).toBe('a$\n');
  });

  it('rejects bad substitutions with a non-zero status and no execution', async () => {
    const shell = make();
    const result = await shell.run('touch marker; echo ${1bad}');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('bash: ${1bad}: bad substitution');
    expect((await shell.run('cat marker')).code).toBe(1);
  });

  it('connects pipelines and performs filesystem redirections', async () => {
    const shell = make();
    const pipeline = await shell.run('echo b; echo a');
    expect(pipeline.stdout).toBe('b\na\n');
    expect((await shell.run('echo saved > note && cat < note')).stdout).toBe('saved\n');
    expect((await shell.run('echo again >> note; cat note')).stdout).toBe('saved\nagain\n');
    const missing = await shell.run('cat < missing');
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain('No such file or directory');
  });

  it('returns syntax status 2 without executing a command', async () => {
    for (const line of ['| ls', 'ls &&', 'echo >', 'echo "unterminated']) {
      const shell = make();
      const result = await shell.run(`touch marker; ${line}`);
      expect(result.code).toBe(2);
      expect((await shell.run('cat marker')).stdout).toBe('');
    }
  });

  it('passes the command user through sudo', async () => {
    const shell = make();
    expect((await shell.run('whoami')).stdout).toBe('ada\n');
    expect((await shell.run('sudo whoami')).stdout).toBe('root\n');
    // Options after the command belong to the command, not to sudo.
    expect(await shell.run('sudo head -n 1 /etc/shadow')).toMatchObject({ code: 0, stdout: 'root:*:20000:0:99999:7:::\n' });
    expect(await shell.run('sudo -x whoami')).toMatchObject({ code: 1 });
  });

  it('expands wildcards in home-relative paths while preserving quoted wildcards', async () => {
    const shell = make();
    await shell.run('mkdir -p ~/logs; touch ~/logs/a.log ~/logs/b.log ~/logs/note.txt');
    expect((await shell.run('echo ~/logs/*.log')).stdout).toBe('/home/ada/logs/a.log /home/ada/logs/b.log\n');
    expect((await shell.run('echo "~/logs/*.log"')).stdout).toBe('~/logs/*.log\n');
  });

  it('honors tutor actor capability grants', async () => {
    const kernel = createKernel({ username: 'ada' });
    const shell = createShell(kernel, { actor: { kind: 'tutor', id: 't' } });
    const denied = await shell.run('touch note');
    expect(denied.code).toBe(1);
    expect(denied.stderr).toBe(
      "touch: cannot touch 'note': Operation not permitted\n",
    );
    kernel.grant({ kind: 'tutor', id: 't' }, ['fs:*']);
    expect((await shell.run('touch note')).code).toBe(0);
  });

  it('fails a protected redirection without writing the file', async () => {
    const shell = make();
    const result = await shell.run('echo x > /etc/f');
    expect(result.code).toBe(1);
    expect((await shell.run('cat /etc/f')).code).toBe(1);
  });

  it('rejects duplicate command registration', () => {
    const shell = make();
    expect(() => shell.register({
      name: 'ls', summary: 'x', usage: 'ls', run: () => 0,
    })).toThrow('command already registered: ls');
  });
});

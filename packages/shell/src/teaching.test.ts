import { expect, it } from 'vitest';
import { createKernel } from '@tuxos/kernel';
import { createShell } from './index';

it('gives teaching help and suggestions without substituting commands', async () => {
  const kernel = createKernel({ username: 'ada' });
  const shell = createShell(kernel);
  expect((await shell.run('man grep')).stdout).toContain('grep ERROR server.log');
  expect((await shell.run('help grep')).stdout).toContain('grep ERROR server.log');
  expect((await shell.run('whatis chmod nope')).code).toBe(1);
  expect((await shell.run('man vim')).stdout).toContain(':q!');
  await shell.run('echo keep > note');
  expect(await shell.run('del note')).toMatchObject({ code: 127, stderr: expect.stringContaining('try rm') });
  expect((await shell.run('cat note')).stdout).toBe('keep\n');
  expect((await shell.run('grpe')).code).toBe(127);
  expect((await shell.run('grrep')).stderr).toContain("'grep'");
});

it('edits through the filesystem, preserves permissions, and refuses lost updates', async () => {
  const kernel = createKernel({ username: 'ada' });
  const shell = createShell(kernel);
  expect((await shell.run('nano notes.txt')).code).toBe(1);
  expect((await shell.run('nano notes.txt', { editFile: async request => {
    expect(request.content).toBe(''); expect(request.save('first')).toEqual({ ok: true }); return true;
  } })).code).toBe(0);
  expect((await shell.run('cat notes.txt')).stdout).toBe('first');
  await shell.run('chmod 400 notes.txt');
  await shell.run('nano notes.txt', { editFile: async request => {
    expect(request.save('no')).toMatchObject({ ok: false, error: 'Permission denied' }); return true;
  } });
  expect((await shell.run('sudo vim notes.txt', { editFile: async request => {
    expect(request.save('root can save')).toEqual({ ok: true }); return true;
  } })).code).toBe(0);
  expect((await shell.run('cat notes.txt')).stdout).toBe('root can save');
  await shell.run('chmod 600 notes.txt');
  const other = createShell(kernel);
  await shell.run('vim notes.txt', { editFile: async request => {
    await other.run('echo newer > notes.txt');
    expect(request.save('stale')).toMatchObject({ ok: false, error: expect.stringContaining('another window') }); return true;
  } });
  expect((await shell.run('cat notes.txt')).stdout).toBe('newer\n');
});

it('keeps interrupted buffers and failed opens from changing files', async () => {
  const kernel = createKernel({ username: 'ada' });
  const shell = createShell(kernel);
  await shell.run('echo keep > notes.txt');
  expect((await shell.run('vim notes.txt', { editFile: async () => false })).code).toBe(130);
  expect((await shell.run('cat notes.txt')).stdout).toBe('keep\n');
  let opened = 0;
  const editFile = async () => { opened++; return true; };
  expect((await shell.run('vim /etc/shadow', { editFile })).code).toBe(1);
  expect((await shell.run('nano /home', { editFile })).code).toBe(1);
  expect((await shell.run('nano notes.txt | cat', { editFile })).stdout).toBe('');
  expect(opened).toBe(0);
  const abort = new AbortController();
  await shell.run('nano notes.txt', { signal: abort.signal, editFile: async request => {
    abort.abort(); expect(request.save('late')).toMatchObject({ ok: false }); return false;
  } });
  expect((await shell.run('cat notes.txt')).stdout).toBe('keep\n');
});

it('retains small exploration commands, protected empty-directory removal and quoted name search', async () => {
  const kernel = createKernel({ username: 'ada' }); const shell = createShell(kernel);
  await shell.run('mkdir -p notes/empty; echo first > notes/a.txt; echo second >> notes/a.txt');
  expect((await shell.run('find notes -name "*.txt" -type f')).stdout).toBe('notes/a.txt\n');
  expect((await shell.run('cat -n notes/a.txt')).stdout).toBe('     1\tfirst\n     2\tsecond\n');
  expect((await shell.run('rmdir notes/a.txt')).code).toBe(1);
  expect((await shell.run('rmdir notes')).code).toBe(1);
  expect((await shell.run('rmdir notes/empty')).code).toBe(0);
  expect((await shell.run('less notes/a.txt')).stdout).toBe('first\nsecond\n');
  expect((await shell.run('printenv HOME')).stdout).toBe('/home/ada\n');
  expect((await shell.run('history')).stdout).toContain('find notes');
  expect((await shell.run('make me a sandwich')).code).toBe(1);
  expect((await shell.run('sudo make me a sandwich')).stdout).toContain('Okay.');
});

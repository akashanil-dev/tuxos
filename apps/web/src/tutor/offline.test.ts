import type { KernelEvent } from '@tuxos/sdk';
import { describe, expect, it } from 'vitest';
import { offlineAnswer, type GuideCommand } from './offline';

const commands: GuideCommand[] = [
  { name: 'ls', summary: 'List directory contents', usage: 'ls [-la] [PATH ...]' },
  { name: 'chmod', summary: 'Change file permissions', usage: 'chmod MODE FILE ...' },
  { name: 'head', summary: 'Print the first lines of a file', usage: 'head [-n N] FILE' },
];

let seq = 0;
const ran = (line: string, code: number, stderr = '', actor: 'user' | 'tutor' = 'user'): KernelEvent => ({
  seq: ++seq, at: 0, ok: true, actor: { kind: actor, id: actor },
  action: { type: 'shell.ran', payload: { line, code, stdout: '', stderr, commands: [line.split(' ')[0]] } },
} as unknown as KernelEvent);

describe("Vasu's offline guide", () => {
  it('explains commands from their own help', () => {
    expect(offlineAnswer('what does ls do?', commands, [])).toBe('`ls`: List directory contents. Usage: `ls [-la] [PATH ...]`');
    // Everyday words that are also commands count only when quoted or asked alone.
    expect(offlineAnswer('how do I read the head of a file?', commands, [])).not.toContain('`head`:');
    expect(offlineAnswer('what is `head`?', commands, [])).toContain('Print the first lines');
    expect(offlineAnswer('head', commands, [])).toContain('Print the first lines');
  });

  it("explains the learner's last failed command from its error", () => {
    const recent = [
      ran('ls', 0),
      ran('cat /etc/shadow', 1, 'cat: /etc/shadow: Permission denied'),
      ran('pwd', 1, 'should be ignored', 'tutor'),
    ];
    const answer = offlineAnswer('My last commands failed. What went wrong, and what should I try?', commands, recent);
    expect(answer).toContain('was refused');
    expect(answer).toContain('Permission denied');
    expect(offlineAnswer('why did it fail?', commands, [ran('tree', 127, "Command 'tree' not found, but can be installed with:\nsudo apt install tree")]))
      .toContain('sudo apt install tree');
    expect(offlineAnswer('why error?', commands, [ran('cd nope', 1, 'cd: nope: No such file or directory')]))
      .toContain('`pwd`');
    expect(offlineAnswer('it failed', commands, [ran('chmod', 1, 'chmod: missing operand')]))
      .toContain('`chmod MODE FILE ...`');
  });

  it('covers the course topics and says what it can do otherwise', () => {
    expect(offlineAnswer('How do file permissions work?', commands, [])).toContain('chmod 600');
    expect(offlineAnswer('how do I install software', commands, [])).toContain('sudo apt install');
    expect(offlineAnswer('which commands are there', commands, [])).toContain('`chmod`');
    expect(offlineAnswer('tell me a joke', commands, [])).toContain('offline');
  });
});

it('uses the active adventure hint and actual shell suggestions without guessing installations',()=>{
  expect(offlineAnswer('adventure hint',commands,[],{adventure:{title:'The Library',task:'Find the secret word',hints:['Try grep -r secret library']}})).toContain('grep -r secret library');
  expect(offlineAnswer('why failed?',commands,[ran('grpe',127,"grpe: command not found\nDid you mean 'grep'? Use man COMMAND for help.")])).toContain("Did you mean 'grep'");
  expect(offlineAnswer('why failed?',commands,[ran('nonsense',127,'nonsense: command not found')])).not.toContain('apt install nonsense');
  expect(offlineAnswer('how do I paste?',commands,[])).toContain('without a selection interrupts');
  expect(offlineAnswer('pacman',commands,[])).toContain('pkg-lab arch');
});

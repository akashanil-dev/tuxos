import type { CommandDefinition } from './types';
import { stat, strerror } from './helpers';

const EXAMPLES: Record<string, string> = {
  ls: 'ls -la', pwd: 'pwd', cd: 'cd ~/Documents', cat: 'cat welcome.txt', mkdir: 'mkdir projects',
  touch: 'touch notes.txt', cp: 'cp notes.txt backup.txt', mv: 'mv old.txt new.txt', rm: 'rm unwanted.txt',
  grep: 'grep ERROR server.log', sort: 'sort names.txt', uniq: 'sort names.txt | uniq',
  wc: 'cat notes.txt | wc -l', head: 'head -n 3 notes.txt', tail: 'tail -n 3 notes.txt',
  chmod: 'chmod +x script.sh', sudo: 'sudo apt update', apt: 'sudo apt install tree', dpkg: 'dpkg -l',
  tr: 'echo linux | tr a-z A-Z', cut: 'cut -d, -f1 events.csv', nano: 'nano notes.txt', vim: 'vim notes.txt',
};
const NOTES: Record<string, string> = {
  nano: 'Teaching editor: edit text normally; Ctrl+O saves; Ctrl+X exits. A changed buffer asks whether to save. Buttons provide the same actions on touch screens.',
  vim: 'Teaching editor: i/a/o enter insert mode; Esc returns to normal mode; :w saves; :q exits; :wq saves and exits; :q! discards changes. This is a small practice subset, not full Vim.',
  rm: 'Removal has no trash. Check the path with pwd and ls first. TuxOS refuses recursive removal of the filesystem root.',
  sudo: 'Runs one simulated command as root. Inspect permissions with ls -l before using elevated access.',
  grep: 'Supports -i (ignore case), -v (invert), -n (line numbers), -r (recursive) and -c (count).',
};

export function teachingCommands(): CommandDefinition[] {
  return [...(['man', 'whatis'] as const).map(name => ({
    name, summary: name === 'man' ? 'Read a command’s teaching manual' : 'Describe commands in one line', usage: `${name} COMMAND ...`,
    run(ctx) {
      if (!ctx.args.length) { ctx.stderr(`Usage: ${name} COMMAND ...\n`); return 1; }
      let code = 0;
      for (const topic of ctx.args) {
        const command = ctx.shell.commands().find(item => item.name === topic);
        if (!command) { ctx.stderr(`No manual entry for ${topic}\n`); code = 1; continue; }
        if (name === 'whatis') { ctx.stdout(`${topic} — ${command.summary}\n`); continue; }
        ctx.stdout(`${topic.toUpperCase()}(1) — TuxOS teaching manual\n\nNAME\n  ${topic} — ${command.summary}\n\nUSAGE\n  ${command.usage ?? topic}\n`);
        if (EXAMPLES[topic]) ctx.stdout(`\nEXAMPLE\n  ${EXAMPLES[topic]}\n`);
        if (NOTES[topic]) ctx.stdout(`\nNOTES\n  ${NOTES[topic]}\n`);
        if (command.available?.() === false) ctx.stdout('\nThis optional program is not installed. Its command will explain how to install it.\n');
        ctx.stdout('\nSCOPE\n  These pages describe this browser simulation. Supported options may differ on a real Linux machine.\n');
      }
      return code;
    },
  } satisfies CommandDefinition)), ...(['nano', 'vim', 'vi', 'nvim'] as const).map(name => editor(name))];
}

function editor(name: 'nano' | 'vim' | 'vi' | 'nvim'): CommandDefinition {
  return { name, summary: 'Edit a virtual file in the terminal teaching editor', usage: `${name} FILE`, async run(ctx) {
    if (ctx.args[0] === '--help') { ctx.stdout(`${NOTES[name === 'nano' ? 'nano' : 'vim']}\n`); return 0; }
    if (ctx.args.length !== 1 || ctx.args[0]!.startsWith('-')) { ctx.stderr(`Usage: ${name} FILE\n`); return 1; }
    if (!ctx.editFile) { ctx.stderr(`${name}: an interactive terminal is required. Open Terminal to edit, or use the Text Editor app.\n`); return 1; }
    const path = ctx.resolve(ctx.args[0]!);
    const info = stat(ctx, path);
    if (!info.ok && info.error.code !== 'ENOENT') { ctx.stderr(`${name}: ${strerror(info.error.code)}\n`); return 1; }
    if (info.ok && info.value.kind === 'dir') { ctx.stderr(`${name}: Is a directory\n`); return 1; }
    const original = ctx.dispatch<string>('fs.read', { path });
    if (!original.ok && original.error.code !== 'ENOENT') { ctx.stderr(`${name}: ${strerror(original.error.code)}\n`); return 1; }
    let expected = original.ok ? original.value : null;
    const closed = await ctx.editFile({ mode: name === 'nano' ? 'nano' : 'vim', path, content: expected ?? '', signal: ctx.signal,
      save(content) {
        if (ctx.signal?.aborted) return { ok: false, error: 'Editor was interrupted. Reopen the file before saving.' };
        const current = ctx.dispatch<string>('fs.read', { path });
        if (!current.ok && current.error.code !== 'ENOENT') return { ok: false, error: strerror(current.error.code) };
        if ((current.ok ? current.value : null) !== expected) return { ok: false, error: 'This file changed in another window. Copy your text before reopening it; the newer file has been kept.' };
        const result = ctx.dispatch('fs.write', { path, content });
        if (!result.ok) return { ok: false, error: strerror(result.error.code) };
        expected = content; return { ok: true };
      },
    });
    if (closed && name !== 'nano') ctx.activity?.('vim-exit');
    return closed ? 0 : 130;
  } };
}

export const WINDOWS_COMMANDS: Record<string, string> = {
  dir: 'ls', cls: 'clear', copy: 'cp', move: 'mv', del: 'rm', erase: 'rm', type: 'cat', md: 'mkdir', rd: 'rmdir',
  ren: 'mv', ipconfig: 'ip addr', tasklist: 'ps', taskkill: 'kill', notepad: 'nano', chdir: 'cd',
};

/** Suggest only; never run a guessed command, especially a potentially destructive one. */
export function commandNotFound(name: string, available: string[]): string {
  const base = `${name}: command not found\n`;
  if (WINDOWS_COMMANDS[name.toLowerCase()]) return `${base}Windows habit? On Linux, try ${WINDOWS_COMMANDS[name.toLowerCase()]}. Read man ${WINDOWS_COMMANDS[name.toLowerCase()]!.split(' ')[0]} first; options and behaviour differ.\n`;
  if (name.length < 2 || name.length > 40 || name.includes('/')) return base;
  const ranked = available.map(candidate => ({ candidate, distance: editDistance(name, candidate) }))
    .filter(item => item.distance <= (name.length > 5 ? 2 : 1)).sort((a, b) => a.distance - b.distance || a.candidate.localeCompare(b.candidate));
  return ranked.length ? `${base}Did you mean ${ranked.slice(0, 3).map(item => `'${item.candidate}'`).join(' or ')}? Use man COMMAND for help.\n` : base;
}
function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  let previous: number[] | undefined;
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (previous && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) next[j] = Math.min(next[j]!, previous[j - 2]! + 1);
    }
    previous = row; row = next;
  }
  return row[b.length]!;
}

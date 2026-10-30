// The programs inside the packages. Each runs only once its package is installed; until then the shell says
// what Ubuntu's command-not-found says, including the apt command to get it.

import type { CommandContext } from '@tuxos/shell';
import { packageForCommand } from './catalog';
import { installed, type Files } from './dpkg';
import { filesFor } from './apt';
import { cmatrix } from './cmatrix';

type Program = (ctx: CommandContext, files: Files) => number | Promise<number>;

/** Whether the command's package has put it in /usr/bin. */
export function isInstalled(files: Files, command: string): boolean {
  return files.read(`/usr/bin/${command}`) !== undefined;
}

export function program(command: string, run: Program) {
  return (ctx: CommandContext): number | Promise<number> => {
    const files = filesFor(ctx);
    if (!isInstalled(files, command)) {
      ctx.stderr(`Command '${command}' not found, but can be installed with:\nsudo apt install ${packageForCommand(command)!.name}\n`);
      return 127;
    }
    return run(ctx, files);
  };
}

interface Entry {
  name: string;
  kind: 'file' | 'dir';
}

export const tree: Program = (ctx) => {
  const all = ctx.args.includes('-a');
  const dirsOnly = ctx.args.includes('-d');
  const levelAt = ctx.args.indexOf('-L');
  const maxDepth = levelAt >= 0 ? Number(ctx.args[levelAt + 1]) : Infinity;
  if (levelAt >= 0 && !(maxDepth >= 1)) {
    ctx.stderr('tree: Invalid level, must be greater than 0.\n');
    return 2;
  }
  const roots = ctx.args.filter((arg, index) => !arg.startsWith('-') && index !== levelAt + 1);
  let dirs = 0;
  let filesSeen = 0;
  const walk = (path: string, prefix: string, depth: number) => {
    const listed = ctx.dispatch<Entry[]>('fs.list', { path });
    if (!listed.ok) {
      ctx.stdout(` [error opening dir]\n`);
      return;
    }
    ctx.stdout('\n');
    const entries = listed.value
      .filter((entry) => (all || !entry.name.startsWith('.')) && (!dirsOnly || entry.kind === 'dir'))
      .sort((a, b) => a.name.localeCompare(b.name));
    entries.forEach((entry, index) => {
      const last = index === entries.length - 1;
      ctx.stdout(`${prefix}${last ? '└── ' : '├── '}${entry.name}`);
      if (entry.kind === 'dir') {
        dirs += 1;
        if (depth < maxDepth) walk(`${path === '/' ? '' : path}/${entry.name}`, `${prefix}${last ? '    ' : '│   '}`, depth + 1);
        else ctx.stdout('\n');
      } else {
        filesSeen += 1;
        ctx.stdout('\n');
      }
    });
  };
  let code = 0;
  for (const root of roots.length ? roots : ['.']) {
    const path = ctx.resolve(root);
    const stat = ctx.dispatch<Entry>('fs.stat', { path });
    if (!stat.ok || stat.value.kind !== 'dir') {
      ctx.stdout(`${root}  [error opening dir]\n`);
      code = 2;
      continue;
    }
    ctx.stdout(root);
    walk(path, '', 1);
  }
  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  ctx.stdout(`\n${plural(dirs, 'directory', 'directories')}${dirsOnly ? '' : `, ${plural(filesSeen, 'file', 'files')}`}\n`);
  return code;
};

export const hello: Program = (ctx) => {
  if (ctx.args.includes('--version') || ctx.args.includes('-v')) {
    ctx.stdout('hello (GNU Hello) 2.10\n');
    return 0;
  }
  const greetingAt = ctx.args.findIndex((arg) => arg === '-g' || arg === '--greeting');
  const inline = ctx.args.find((arg) => arg.startsWith('--greeting='));
  const greeting = inline?.slice('--greeting='.length)
    ?? (greetingAt >= 0 ? ctx.args[greetingAt + 1] : undefined)
    ?? (ctx.args.includes('-t') || ctx.args.includes('--traditional') ? 'hello, world' : 'Hello, world!');
  ctx.stdout(`${greeting}\n`);
  return 0;
};

/** Wrap text at `width` columns, breaking only between words when it can. */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && line.length + 1 + word.length > width) {
        lines.push(line);
        line = '';
      }
      for (let rest = word; rest; rest = rest.slice(width)) {
        if (rest.length > width) lines.push(rest.slice(0, width));
        else line = line ? `${line} ${rest}` : rest;
        if (rest.length <= width) break;
      }
    }
    lines.push(line);
  }
  return lines;
}

export const cowsay: Program = (ctx) => {
  const text = ctx.args.length ? ctx.args.join(' ') : ctx.stdin.replace(/\n$/, '');
  const lines = wrap(text, 40);
  const width = Math.max(...lines.map((line) => line.length));
  const body = lines.length === 1
    ? [`< ${lines[0]!.padEnd(width)} >`]
    : lines.map((line, index) => {
      const [open, close] = index === 0 ? ['/', '\\'] : index === lines.length - 1 ? ['\\', '/'] : ['|', '|'];
      return `${open} ${line.padEnd(width)} ${close}`;
    });
  ctx.stdout([
    ` ${'_'.repeat(width + 2)}`, ...body, ` ${'-'.repeat(width + 2)}`,
    '        \\   ^__^',
    '         \\  (oo)\\_______',
    '            (__)\\       )\\/\\',
    '                ||----w |',
    '                ||     ||',
  ].join('\n') + '\n');
  return 0;
};

export const sl: Program = (ctx) => {
  // The real sl drives this across the screen; here it pulls in and stops.
  ctx.stdout([
    '      ====        ________                ___________',
    '  _D _|  |_______/        \\__I_I_____===__|_________|',
    '   |(_)---  |   H\\________/ |   |        =|___ ___|',
    '   /     |  |   H  |  |     |   |         ||_| |_||',
    '  |      |  |   H  |__--------------------| [___] |',
    '  | ________|___H__/__|_____/[][]~\\_______|       |',
    '  |/ |   |-----------I_____I [][] []  D   |=======|__',
    '__/ =| o |=-~~\\  /~~\\  /~~\\  /~~\\ ____Y___________|__',
    ' |/-=|___|=    ||    ||    ||    |_____/~\\___/',
    '  \\_/      \\O=====O=====O=====O_/      \\_/',
    '',
    'You typed sl instead of ls. Choo choo!',
  ].join('\n') + '\n');
  return 0;
};

const DESKTOPS: Record<string, string> = { plasma: 'KDE Plasma', gnome: 'GNOME', cde: 'CDE', hyprland: 'Hyprland' };

export const neofetch: Program = (ctx, files) => {
  const state = ctx.kernel.getState();
  const title = `${ctx.user}@${state.hostname}`;
  const info = [
    title, '-'.repeat(title.length),
    'OS: TuxOS 1.0 (based on Ubuntu 24.04) x86_64',
    'Host: your web browser',
    'Kernel: 6.10.0-tuxos',
    `Packages: ${installed(files).size} (dpkg)`,
    'Shell: bash 5.2.21',
    `DE: ${DESKTOPS[state.session.desktop] ?? state.session.desktop}`,
    'Terminal: xterm.js',
  ];
  const logo = [
    '        #####', '       #######', '       ##O#O##', '       #######', '     ###########',
    '    #############', '   ###############', '   ################', '  #################',
    '#####################', '#####################', '  #################',
  ];
  const rows = Math.max(logo.length, info.length);
  ctx.stdout(Array.from({ length: rows }, (_, index) => `${(logo[index] ?? '').padEnd(24)}${info[index] ?? ''}`.trimEnd()).join('\n') + '\n');
  return 0;
};

export const fortune: Program = (ctx, files) => {
  const text = files.read('/usr/share/games/fortunes/fortunes');
  const sayings = text?.split(/\n%\n/).map((saying) => saying.trim()).filter(Boolean) ?? [];
  if (!sayings.length) {
    ctx.stderr('No fortunes found\n');
    return 1;
  }
  ctx.stdout(`${sayings[Math.floor(Math.random() * sayings.length)]}\n`);
  return 0;
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

class JqError extends Error {}

/** One filter step: `.`, a path such as `.a.b[0][]`, `keys` or `length`. Steps are joined with `|`. */
function applyStep(step: string, input: Json): Json[] {
  if (step === '.') return [input];
  if (step === 'keys') {
    if (Array.isArray(input)) return [input.map((_, index) => index)];
    if (input && typeof input === 'object') return [Object.keys(input).sort()];
    throw new JqError(`${typeName(input)} has no keys`);
  }
  if (step === 'length') {
    if (Array.isArray(input) || typeof input === 'string') return [input.length];
    if (input && typeof input === 'object') return [Object.keys(input).length];
    if (input === null) return [0];
    if (typeof input === 'number') return [Math.abs(input)];
    throw new JqError(`${typeName(input)} has no length`);
  }
  if (!step.startsWith('.')) throw new JqError(`unknown filter: ${step}`);
  const parts = pathParts(step);
  let values: Json[] = [input];
  for (const part of parts) {
    values = values.flatMap((value): Json[] => {
      if (part === '[]') {
        if (Array.isArray(value)) return value;
        if (value && typeof value === 'object') return Object.values(value);
        throw new JqError(`Cannot iterate over ${typeName(value)}`);
      }
      if (/^\[\d+\]$/.test(part)) {
        if (value === null) return [null];
        if (!Array.isArray(value)) throw new JqError(`Cannot index ${typeName(value)} with number`);
        return [value[Number(part.slice(1, -1))] ?? null];
      }
      const key = part.startsWith('["') ? part.slice(2, -2) : part;
      if (value === null) return [null];
      if (typeof value !== 'object' || Array.isArray(value)) throw new JqError(`Cannot index ${typeName(value)} with "${key}"`);
      return [value[key] ?? null];
    });
  }
  return values;
}

/** `.a.b[0][]` → a, b, [0], []. */
function pathParts(step: string): string[] {
  const parts: string[] = [];
  for (let rest = step; rest;) {
    const match = /^\.([A-Za-z_][A-Za-z0-9_]*)|^\.?(\[\d*\]|\["[^"]*"\])/.exec(rest);
    if (!match) throw new JqError(`unknown filter: ${step}`);
    parts.push(match[1] ?? match[2]!);
    rest = rest.slice(match[0].length);
  }
  return parts;
}

function typeName(value: Json): string {
  if (value === null) return 'null (null)';
  if (Array.isArray(value)) return 'array';
  return typeof value === 'object' ? 'object' : `${typeof value} (${JSON.stringify(value)})`;
}

export const jq: Program = (ctx) => {
  const raw = ctx.args.includes('-r') || ctx.args.includes('--raw-output');
  const compact = ctx.args.includes('-c') || ctx.args.includes('--compact-output');
  const [filter = '.', file] = ctx.args.filter((arg) => !arg.startsWith('-'));
  let text = ctx.stdin;
  if (file) {
    const read = ctx.dispatch<string>('fs.read', { path: ctx.resolve(file) });
    if (!read.ok) {
      ctx.stderr(`jq: error: Could not open ${file}: ${read.error.code === 'ENOENT' ? 'No such file or directory' : 'Permission denied'}\n`);
      return 2;
    }
    text = read.value;
  }
  let input: Json;
  try {
    input = JSON.parse(text) as Json;
  } catch {
    ctx.stderr('jq: error (at <stdin>:0): Cannot parse input: not valid JSON\n');
    return 5;
  }
  try {
    let values: Json[] = [input];
    for (const step of filter.split('|').map((part) => part.trim())) values = values.flatMap((value) => applyStep(step, value));
    for (const value of values) {
      ctx.stdout(`${raw && typeof value === 'string' ? value : JSON.stringify(value, null, compact ? undefined : 2)}\n`);
    }
    return 0;
  } catch (error) {
    if (error instanceof JqError && error.message.startsWith('unknown filter')) {
      ctx.stderr(`jq: error: ${error.message}\nThis TuxOS jq knows: .  .key  .key.sub  .[0]  .[]  keys  length, joined with |\n`);
      return 3;
    }
    ctx.stderr(`jq: error (at <stdin>:0): ${error instanceof Error ? error.message : String(error)}\n`);
    return 5;
  }
};

export const PROGRAMS: Record<string, Program> = { tree, hello, cowsay, sl, neofetch, fortune, jq, cmatrix };

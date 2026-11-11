import type { CommandContext } from './types';
import type { DispatchResult } from '@tuxos/sdk';

export interface Stat {
  name: string;
  kind: 'file' | 'dir';
  owner: string;
  mode: number;
  size: number;
  mtime: number;
}

export function options(ctx: Pick<CommandContext, 'args'>, supported = ''): {
  flags: Set<string>; args: string[]; unknown?: string;
} {
  const flags = new Set<string>();
  const args: string[] = [];
  let parsing = true;
  for (const arg of ctx.args) {
    if (arg === '--') {
      parsing = false;
      continue;
    }
    if (parsing && arg.startsWith('-') && arg !== '-') {
      for (const flag of arg.slice(1)) {
        if (!supported.includes(flag)) return { flags, args, unknown: flag };
        flags.add(flag);
      }
    } else {
      args.push(arg);
    }
  }
  return { flags, args };
}

export function invalidOption(
  ctx: Pick<CommandContext, 'stderr'>, name: string, option: string, code = 1, bashBuiltin = false,
): number {
  if (bashBuiltin) ctx.stderr(`bash: ${name}: ${option}: invalid option\n`);
  else {
    ctx.stderr(`${name}: invalid option -- '${option.slice(-1)}'\n`);
    ctx.stderr(`Try '${name} --help' for more information.\n`);
  }
  return code;
}

export function stat(ctx: Pick<CommandContext, 'dispatch'>, path: string): DispatchResult<Stat> {
  return ctx.dispatch<Stat>('fs.stat', { path });
}

export function read(ctx: Pick<CommandContext, 'dispatch'>, path: string): string | undefined {
  const result = ctx.dispatch<string>('fs.read', { path });
  return result.ok ? result.value : undefined;
}

export function readResult(ctx: Pick<CommandContext, 'dispatch'>, path: string): DispatchResult<string> {
  return ctx.dispatch<string>('fs.read', { path });
}

export function report(ctx: Pick<CommandContext, 'stderr'>, name: string, result: DispatchResult<unknown>): number {
  if (!result.ok) ctx.stderr(`${name}: ${strerror(result.error.code)}\n`);
  return result.ok ? 0 : 1;
}

export function strerror(code: string): string {
  return ({
    ENOENT: 'No such file or directory', EACCES: 'Permission denied', EEXIST: 'File exists',
    ENOTDIR: 'Not a directory', EISDIR: 'Is a directory', ENOTEMPTY: 'Directory not empty',
    EPERM: 'Operation not permitted', EINVAL: 'Invalid argument',
  } as Record<string, string>)[code] ?? 'Input/output error';
}

export function lines(text: string): string[] {
  if (!text) return [];
  const result = text.split('\n');
  if (result.at(-1) === '') result.pop();
  return result;
}

export function modeString(mode: number, kind: 'file' | 'dir'): string {
  const prefix = kind === 'dir' ? 'd' : '-';
  const permissions = [6, 3, 0].map((shift) => {
    return ['r', 'w', 'x']
      .map((character, index) => mode & (1 << (shift + 2 - index)) ? character : '-')
      .join('');
  });
  return prefix + permissions.join('');
}

/**
 * An octal mode (`755`) or GNU symbolic clauses (`u+x`, `go-w`, `+x`, `u=rw,o=`), applied to `current`.
 * With no u/g/o/a, a clause applies to everyone (GNU also masks with the umask, which is 022 here, so
 * `+w` only adds write for the owner).
 */
export function parseMode(value: string, current = 0): number | undefined {
  if (/^[0-7]{3,4}$/.test(value)) {
    const mode = Number.parseInt(value, 8);
    return mode <= 0o777 ? mode : undefined;
  }
  let result = current;
  for (const clause of value.split(',')) {
    const match = /^([ugoa]*)([+=-])([rwx]*)$/.exec(clause);
    if (!match) return undefined;
    const [, who, op, perms] = match as unknown as [string, string, string, string];
    const shifts = shiftsFor(who);
    let bits = 0;
    for (const shift of shifts) for (const flag of perms) bits |= (flag === 'r' ? 4 : flag === 'w' ? 2 : 1) << shift;
    if (!who) bits &= ~UMASK;
    if (op === '+') result |= bits;
    else if (op === '-') result &= ~bits;
    else for (const shift of shifts) result = (result & ~(7 << shift)) | (bits & (7 << shift));
  }
  return result;
}

const UMASK = 0o022;

function shiftsFor(who: string): number[] {
  if (!who || who.includes('a')) return [6, 3, 0];
  return [...new Set(who)].map((group) => (group === 'u' ? 6 : group === 'g' ? 3 : 0));
}

export function recursiveFiles(ctx: Pick<CommandContext, 'dispatch'>, path: string): string[] {
  const result = ctx.dispatch<Stat[]>('fs.list', { path });
  if (!result.ok) return [];
  const files: string[] = [];
  for (const entry of result.value) {
    const child = `${path === '/' ? '' : path}/${entry.name}`;
    if (entry.kind === 'dir') files.push(...recursiveFiles(ctx, child));
    else files.push(child);
  }
  return files;
}

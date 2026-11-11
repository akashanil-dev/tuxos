import type { CommandDefinition } from './types';
import { invalidOption, options, parseMode, read, report, stat, strerror } from './helpers';

export function fileCommands(): CommandDefinition[] {
  return [cat(), mkdir(), touch(), remove(), copy(), move(), chmod()];
}

function cat(): CommandDefinition {
  return {
    name: 'cat', summary: 'Concatenate files', usage: 'cat [-n] [FILE ...]',
    run(ctx) {
      const parsed = options(ctx, 'n');
      if (parsed.unknown) return invalidOption(ctx, 'cat', `-${parsed.unknown}`);
      let line = 0;
      const print = (value: string) => ctx.stdout(parsed.flags.has('n') ? value.replace(/[^\n]*\n|[^\n]+$/g, part => `${String(++line).padStart(6)}\t${part}`) : value);
      if (!parsed.args.length) {
        print(ctx.stdin);
        return 0;
      }
      let code = 0;
      for (const raw of parsed.args) {
        const value = raw === '-' ? ctx.stdin : read(ctx, ctx.resolve(raw));
        if (value === undefined) {
          const result = ctx.dispatch('fs.read', { path: ctx.resolve(raw) });
          ctx.stderr(`cat: ${raw}: ${strerror(result.ok ? 'EINVAL' : result.error.code)}\n`);
          code = 1;
        } else print(value);
      }
      return code;
    },
  };
}

function mkdir(): CommandDefinition {
  return {
    name: 'mkdir', summary: 'Create directories', usage: 'mkdir [-p] DIRECTORY ...',
    run(ctx) {
      const parsed = options(ctx, 'p');
      if (parsed.unknown) return invalidOption(ctx, 'mkdir', `-${parsed.unknown}`);
      const { flags, args } = parsed;
      if (!args.length) {
        ctx.stderr('mkdir: missing operand\n');
        return 1;
      }
      let code = 0;
      for (const raw of args) {
        const result = ctx.dispatch('fs.mkdir', { path: ctx.resolve(raw), parents: flags.has('p') });
        if (!result.ok) {
          ctx.stderr(`mkdir: cannot create directory '${raw}': ${strerror(result.error.code)}\n`);
          code = 1;
        }
      }
      return code;
    },
  };
}

function touch(): CommandDefinition {
  return {
    name: 'touch', summary: 'Create empty files', usage: 'touch FILE ...',
    run(ctx) {
      const parsed = options(ctx);
      if (parsed.unknown) return invalidOption(ctx, 'touch', `-${parsed.unknown}`);
      let code = 0;
      for (const raw of parsed.args) {
        const path = ctx.resolve(raw);
        const existing = stat(ctx, path);
        const result = existing.ok
          ? existing.value.kind === 'file'
            ? ctx.dispatch('fs.write', { path, content: '' })
            : { ok: false as const, error: { code: 'EISDIR', message: `${path}: Is a directory` } }
          : ctx.dispatch('fs.write', { path, content: '' });
        if (!result.ok) {
          ctx.stderr(`touch: cannot touch '${raw}': ${strerror(result.error.code)}\n`);
          code = 1;
        }
      }
      return code;
    },
  };
}

function remove(): CommandDefinition {
  return {
    name: 'rm', summary: 'Remove files or directories', usage: 'rm [-r] [-f] FILE ...',
    run(ctx) {
      const parsed = options(ctx, 'rf');
      if (parsed.unknown) return invalidOption(ctx, 'rm', `-${parsed.unknown}`);
      const { flags, args } = parsed;
      if (!args.length) {
        ctx.stderr('rm: missing operand\n');
        return 1;
      }
      if (flags.has('r') && args.some(raw => ctx.resolve(raw) === '/')) {
        ctx.activity?.('root-refused');
        ctx.stderr('rm: refusing to remove the filesystem root. Your files are safe. Practise removal inside a named exercise folder.\n'); return 1;
      }
      let code = 0;
      for (const raw of args) {
        const result = ctx.dispatch('fs.remove', { path: ctx.resolve(raw), recursive: flags.has('r') });
        if (!result.ok && !(flags.has('f') && result.error.code === 'ENOENT')) {
          ctx.stderr(`rm: cannot remove '${raw}': ${strerror(result.error.code)}\n`);
          code = 1;
        }
      }
      return code;
    },
  };
}

function copy(): CommandDefinition {
  return {
    name: 'cp', summary: 'Copy files and directories', usage: 'cp [-r] SOURCE DEST',
    run(ctx) {
      const parsed = options(ctx, 'r');
      if (parsed.unknown) return invalidOption(ctx, 'cp', `-${parsed.unknown}`);
      const { flags, args } = parsed;
      if (args.length < 2) {
        ctx.stderr('cp: missing file operand\n');
        return 1;
      }
      const destination = args.at(-1)!;
      const sources = args.slice(0, -1);
      const destinationInfo = stat(ctx, ctx.resolve(destination));
      if (sources.length > 1 && (!destinationInfo.ok || destinationInfo.value.kind !== 'dir')) {
        ctx.stderr(`cp: target '${destination}' is not a directory\n`);
        return 1;
      }
      for (const source of sources) {
        const target = destinationInfo.ok && destinationInfo.value.kind === 'dir'
          ? `${destination}/${source.split('/').at(-1)}` : destination;
        const code = copyPath(ctx, source, target, flags.has('r'));
        if (code) return code;
      }
      return 0;
    },
  };
}

function copyPath(
  ctx: Parameters<CommandDefinition['run']>[0], rawSource: string, rawDestination: string, recursive: boolean,
): number {
  const source = ctx.resolve(rawSource);
  let destination = ctx.resolve(rawDestination);
  const sourceInfo = stat(ctx, source);
  if (!sourceInfo.ok) {
    ctx.stderr(`cp: cannot stat '${rawSource}': ${strerror(sourceInfo.error.code)}\n`);
    return 1;
  }
  const destinationInfo = stat(ctx, destination);
  if (destinationInfo.ok && destinationInfo.value.kind === 'dir') {
    destination = `${destination}/${source.split('/').at(-1)}`;
  }
  if (sourceInfo.value.kind === 'file') {
    const value = read(ctx, source);
    if (value === undefined) {
      ctx.stderr(`cp: cannot stat '${rawSource}': No such file or directory\n`);
      return 1;
    }
    return report(ctx, 'cp', ctx.dispatch('fs.write', { path: destination, content: value }));
  }
  if (!recursive) {
    ctx.stderr(`cp: -r not specified; omitting directory '${rawSource}'\n`);
    return 1;
  }
  const created = ctx.dispatch('fs.mkdir', { path: destination, parents: false });
  if (!created.ok) {
    ctx.stderr(`cp: cannot create directory '${rawDestination}': ${strerror(created.error.code)}\n`);
    return 1;
  }
  const children = ctx.dispatch<typeof sourceInfo.value[]>('fs.list', { path: source });
  if (!children.ok) return report(ctx, 'cp', children);
  for (const child of children.value) {
    const code = copyPath(ctx, `${source}/${child.name}`, `${destination}/${child.name}`, true);
    if (code !== 0) return code;
  }
  return 0;
}

function move(): CommandDefinition {
  return {
    name: 'mv', summary: 'Move files and directories', usage: 'mv SOURCE DEST',
    run(ctx) {
      const parsed = options(ctx);
      if (parsed.unknown) return invalidOption(ctx, 'mv', `-${parsed.unknown}`);
      if (parsed.args.length < 2) {
        ctx.stderr('mv: missing file operand\n');
        return 1;
      }
      const rawDestination = parsed.args.at(-1)!;
      const sources = parsed.args.slice(0, -1);
      const destinationInfo = stat(ctx, ctx.resolve(rawDestination));
      if (sources.length > 1 && (!destinationInfo.ok || destinationInfo.value.kind !== 'dir')) {
        ctx.stderr(`mv: target '${rawDestination}' is not a directory\n`);
        return 1;
      }
      for (const rawSource of sources) {
        const target = destinationInfo.ok && destinationInfo.value.kind === 'dir'
          ? `${rawDestination}/${rawSource.split('/').at(-1)}` : rawDestination;
        const code = movePath(ctx, rawSource, target);
        if (code) return code;
      }
      return 0;
    },
  };
}

function movePath(ctx: Parameters<CommandDefinition['run']>[0], rawSource: string, rawDestination: string): number {
      const source = ctx.resolve(rawSource);
      let destination = ctx.resolve(rawDestination);
      const sourceInfo = stat(ctx, source);
      if (!sourceInfo.ok) {
        ctx.stderr(`mv: cannot stat '${rawSource}': ${strerror(sourceInfo.error.code)}\n`);
        return 1;
      }
      const destinationInfo = stat(ctx, destination);
      if (destinationInfo.ok && destinationInfo.value.kind === 'dir') {
        destination = `${destination}/${source.split('/').at(-1)}`;
      }
      if (sourceInfo.value.kind === 'dir' && (destination === source || destination.startsWith(`${source}/`))) {
        const target = rawDestination === rawSource
          ? `${rawDestination}/${source.split('/').at(-1)}` : rawDestination;
        ctx.stderr(`mv: cannot move '${rawSource}' to a subdirectory of itself, '${target}'\n`);
        return 1;
      }
      if (sourceInfo.value.kind === 'dir') {
        const copied = copyPath(ctx, source, destination, true);
        if (copied !== 0) return copied;
      } else {
        const value = read(ctx, source);
        if (value === undefined) return 1;
        const written = ctx.dispatch('fs.write', { path: destination, content: value });
        if (!written.ok) return report(ctx, 'mv', written);
      }
      return report(ctx, 'mv', ctx.dispatch('fs.remove', { path: source, recursive: sourceInfo.value.kind === 'dir' }));
}

function chmod(): CommandDefinition {
  return {
    name: 'chmod', summary: 'Change file mode bits', usage: 'chmod MODE FILE',
    run(ctx) {
      const parsed = options(ctx);
      if (parsed.unknown) return invalidOption(ctx, 'chmod', `-${parsed.unknown}`);
      if (parsed.args.length !== 2) {
        ctx.stderr('chmod: missing operand\n');
        return 1;
      }
      const path = ctx.resolve(parsed.args[1]!);
      const info = stat(ctx, path);
      if (!info.ok) {
        ctx.stderr(`chmod: cannot access '${parsed.args[1]}': ${strerror(info.error.code)}\n`);
        return 1;
      }
      const mode = parseMode(parsed.args[0]!, info.value.mode);
      if (mode === undefined) {
        ctx.stderr(`chmod: invalid mode: '${parsed.args[0]}'\n`);
        return 1;
      }
      const result = ctx.dispatch('fs.chmod', { path, mode });
      if (!result.ok) ctx.stderr(`chmod: cannot access '${parsed.args[1]}': ${strerror(result.error.code)}\n`);
      return result.ok ? 0 : 1;
    },
  };
}

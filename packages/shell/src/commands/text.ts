import type { CommandContext, CommandDefinition } from './types';
import { invalidOption, lines, options, read, readResult, recursiveFiles, strerror } from './helpers';

export type TextContext = Pick<CommandContext, 'args' | 'stdin' | 'stdout' | 'stderr' | 'dispatch' | 'resolve'>;
type TextCommand = Omit<CommandDefinition, 'run'> & { run(ctx: TextContext): number };

export function textCommands(): TextCommand[] {
  return [echo(), head(), tail(), wc(), grep(), sort(), uniq(), tr(), cut(), rev()];
}

function echo(): TextCommand {
  return {
    name: 'echo', summary: 'Write arguments to standard output', usage: 'echo [-n] [ARG ...]',
    run(ctx) {
      let noNewline = false;
      let interpret = false;
      let index = 0;
      while (index < ctx.args.length) {
        const arg = ctx.args[index]!;
        if (!/^-[neE]+$/.test(arg)) break;
        noNewline ||= arg.includes('n');
        interpret = arg.includes('e') && !arg.includes('E');
        index += 1;
      }
      const text = ctx.args.slice(index).join(' ');
      const result = interpret ? interpretEcho(text) : { text, stop: false };
      ctx.stdout(result.text + (noNewline || result.stop ? '' : '\n'));
      return 0;
    },
  };
}

function head(): TextCommand {
  return {
    name: 'head', summary: 'Output the first part of files', usage: 'head [-n N] [FILE]',
    run: (ctx) => slice(ctx, true),
  };
}

function tail(): TextCommand {
  return {
    name: 'tail', summary: 'Output the last part of files', usage: 'tail [-n N] [FILE]',
    run: (ctx) => slice(ctx, false),
  };
}

function slice(ctx: TextContext, first: boolean): number {
  const name = first ? 'head' : 'tail';
  const normalized = { ...ctx, args: ctx.args.flatMap(arg => /^-\d+$/.test(arg) ? ['-n', arg.slice(1)] : [arg]) };
  const parsed = options(normalized, 'n');
  if (parsed.unknown) return invalidOption(ctx, name, `-${parsed.unknown}`);
  const count = parsed.flags.has('n') ? Number(parsed.args[0]) : 10;
  if (!Number.isInteger(count) || count < 0) { ctx.stderr(`${name}: invalid line count\n`); return 1; }
  const files = parsed.flags.has('n') ? parsed.args.slice(1) : parsed.args;
  const inputs = files.length ? files : ['-'];
  let code = 0;
  for (const [index, file] of inputs.entries()) {
    const result = file === '-' ? { ok: true as const, value: ctx.stdin }
      : readResult(ctx, ctx.resolve(file));
    if (!result.ok) {
      ctx.stderr(`${name}: ${file}: ${strerror(result.error.code)}\n`);
      code = 1;
      continue;
    }
    if (inputs.length > 1) {
      if (index) ctx.stdout('\n');
      ctx.stdout(`==> ${file === '-' ? 'standard input' : file} <==\n`);
    }
    const selected = count === 0 ? [] : lines(result.value).slice(first ? 0 : -count, first ? count : undefined);
    ctx.stdout(selected.length ? `${selected.join('\n')}\n` : '');
  }
  return code;
}

function wc(): TextCommand {
  return {
    name: 'wc', summary: 'Print newline, word, and byte counts', usage: 'wc [-l] [-w] [-c] [FILE]',
    run(ctx) {
      const parsed = options(ctx, 'lwc');
      if (parsed.unknown) return invalidOption(ctx, 'wc', `-${parsed.unknown}`);
      const { flags, args } = parsed;
      const files = args.length ? args : ['-'];
      const rows: { file: string; counts: number[] }[] = [];
      let code = 0;
      for (const file of files) {
        const result = file === '-' ? { ok: true as const, value: ctx.stdin }
          : readResult(ctx, ctx.resolve(file));
        if (!result.ok) {
          ctx.stderr(`wc: ${file}: ${strerror(result.error.code)}\n`);
          code = 1;
          continue;
        }
        const text = result.value;
        const selected = flags.has('l') || flags.has('w') || flags.has('c');
        const counts = [
          flags.has('l') || !selected ? lines(text).length : undefined,
          flags.has('w') || !selected ? wordCount(text) : undefined,
          flags.has('c') || !selected ? text.length : undefined,
        ].filter((value): value is number => value !== undefined);
        rows.push({ file, counts });
      }
      for (const row of rows) ctx.stdout(`${row.counts.join(' ')}${args.length ? ` ${row.file}` : ''}\n`);
      if (rows.length > 1) {
        const totals = rows[0]!.counts.map((_, index) => rows.reduce((sum, row) => sum + row.counts[index]!, 0));
        ctx.stdout(`${totals.join(' ')} total\n`);
      }
      return code;
    },
  };
}

function grep(): TextCommand {
  return {
    name: 'grep', summary: 'Search for matching lines', usage: 'grep [-i] [-n] [-v] [-r] [-c] PATTERN [FILE]',
    run(ctx) {
      const parsed = options(ctx, 'inrvc');
      if (parsed.unknown) return invalidOption(ctx, 'grep', `-${parsed.unknown}`, 2);
      const { flags, args } = parsed;
      if (!args.length) {
        ctx.stderr('grep: missing pattern\n');
        return 2;
      }
      const files = args.slice(1);
      const prefixNames = flags.has('r') || files.length > 1;
      const contents: { name?: string; text: string }[] = [];
      if (!files.length) contents.push({ text: ctx.stdin });
      for (const raw of files) {
        if (raw === '-') {
          contents.push({ name: raw, text: ctx.stdin });
          continue;
        }
        const path = ctx.resolve(raw);
        const info = ctx.dispatch<{ kind: 'file' | 'dir' }>('fs.stat', { path });
        if (!info.ok) {
          ctx.stderr(`grep: ${raw}: ${strerror(info.error.code)}\n`);
          continue;
        }
        const paths = info.value.kind === 'dir' && flags.has('r') ? recursiveFiles(ctx, path) : [path];
        for (const file of paths) {
          const text = read(ctx, file);
          if (text !== undefined) contents.push({ name: info.value.kind === 'dir' ? file : raw, text });
        }
      }
      const pattern = new RegExp(args[0]!, flags.has('i') ? 'i' : '');
      let matches = 0;
      for (const file of contents) {
        const found = lines(file.text)
          .map((line, index) => ({ line, index }))
          .filter(({ line }) => flags.has('v') ? !pattern.test(line) : pattern.test(line));
        matches += found.length;
        if (flags.has('c')) {
          ctx.stdout(`${file.name && prefixNames ? `${file.name}:` : ''}${found.length}\n`);
        } else {
          for (const item of found) {
            const name = file.name && prefixNames ? `${file.name}:` : '';
            const number = flags.has('n') ? `${item.index + 1}:` : '';
            ctx.stdout(`${name}${number}${item.line}\n`);
          }
        }
      }
      return files.some((raw) => raw !== '-' && !ctx.dispatch('fs.stat', { path: ctx.resolve(raw) }).ok)
        ? 2 : matches ? 0 : 1;
    },
  };
}

function sort(): TextCommand {
  return {
    name: 'sort', summary: 'Sort lines of text', usage: 'sort [-r] [-n] [-u] [FILE]',
    run(ctx) {
      const parsed = options(ctx, 'rnu');
      if (parsed.unknown) return invalidOption(ctx, 'sort', `-${parsed.unknown}`);
      const { flags, args } = parsed;
      const files = args.length ? args : ['-'];
      let values: string[] = [];
      let code = 0;
      for (const file of files) {
        const result = file === '-' ? { ok: true as const, value: ctx.stdin }
          : readResult(ctx, ctx.resolve(file));
        if (!result.ok) {
          ctx.stderr(`sort: ${file}: ${strerror(result.error.code)}\n`);
          code = 1;
        } else values.push(...lines(result.value));
      }
      if (code) return code;
      if (flags.has('u')) values = [...new Set(values)];
      values.sort((left, right) => flags.has('n')
        ? Number.parseFloat(left) - Number.parseFloat(right)
        : left.localeCompare(right));
      if (flags.has('r')) values.reverse();
      ctx.stdout(values.length ? `${values.join('\n')}\n` : '');
      return 0;
    },
  };
}

function uniq(): TextCommand {
  return {
    name: 'uniq', summary: 'Report or omit repeated lines', usage: 'uniq [-c]',
    run(ctx) {
      const parsed = options(ctx, 'c');
      if (parsed.unknown) return invalidOption(ctx, 'uniq', `-${parsed.unknown}`);
      const { flags } = parsed;
      const output: string[] = [];
      for (const line of lines(ctx.stdin)) {
        const previous = output.at(-1);
        const previousLine = previous?.slice(previous.indexOf(' ') + 1);
        if (previous && (flags.has('c') ? previousLine : previous) === line) {
          if (flags.has('c')) {
            output[output.length - 1] = `${Number(previous.slice(0, previous.indexOf(' '))) + 1} ${line}`;
          }
        } else {
          output.push(flags.has('c') ? `1 ${line}` : line);
        }
      }
      ctx.stdout(output.length ? `${output.join('\n')}\n` : '');
      return 0;
    },
  };
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function interpretEcho(input: string): { text: string; stop: boolean } {
  const escapes: Record<string, string> = {
    a: '\u0007', b: '\b', n: '\n', r: '\r', t: '\t', v: '\u000b', '\\': '\\',
  };
  let text = '';
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] !== '\\' || index + 1 >= input.length) {
      text += input[index];
      continue;
    }
    const next = input[++index]!;
    if (next === 'c') return { text, stop: true };
    if (next === '0') {
      let digits = '';
      while (digits.length < 3 && /[0-7]/.test(input[index + 1] ?? '')) digits += input[++index];
      text += String.fromCharCode(Number.parseInt(digits || '0', 8));
    } else text += escapes[next] ?? `\\${next}`;
  }
  return { text, stop: false };
}

function tr(): TextCommand {
  return { name: 'tr', summary: 'Translate characters from standard input', usage: 'tr SET1 SET2', run(ctx) {
    if (ctx.args.length !== 2 || ctx.args.some(arg => arg.startsWith('-'))) { ctx.stderr('tr: this teaching implementation supports tr SET1 SET2, including a-z and A-Z ranges.\n'); return 1; }
    const expand = (set: string) => set.replace(/(.)-(.)/g, (_, a: string, b: string) => {
      const start = a.charCodeAt(0), end = b.charCodeAt(0);
      return end >= start && end - start <= 128 ? Array.from({ length: end - start + 1 }, (_, i) => String.fromCharCode(start + i)).join('') : a + '-' + b;
    });
    const from = expand(ctx.args[0]!), to = expand(ctx.args[1]!);
    if (!to.length) { ctx.stderr('tr: SET2 must not be empty\n'); return 1; }
    ctx.stdout([...ctx.stdin].map(char => { const i = from.indexOf(char); return i < 0 ? char : to[Math.min(i, to.length - 1)]; }).join(''));
    return 0;
  } };
}
function cut(): TextCommand {
  return { name: 'cut', summary: 'Select delimited fields', usage: 'cut -d DELIMITER -f FIELD[,FIELD] [FILE]', run(ctx) {
    let delimiter = '\t', fields: number[] = [], files: string[] = [];
    for (let i = 0; i < ctx.args.length; i++) {
      const arg = ctx.args[i]!;
      if (arg.startsWith('-d')) delimiter = arg.length === 2 ? ctx.args[++i] ?? '' : arg.slice(2);
      else if (arg.startsWith('-f')) { const spec = arg.length === 2 ? ctx.args[++i] ?? '' : arg.slice(2); fields = spec.split(',').map(Number); }
      else if (arg.startsWith('-') && arg !== '-') return invalidOption(ctx, 'cut', arg);
      else files.push(arg);
    }
    if (delimiter.length !== 1 || !fields.length || fields.some(n => !Number.isInteger(n) || n < 1)) { ctx.stderr('cut: use one delimiter and positive, comma-separated field numbers\n'); return 1; }
    if (!files.length) files = ['-'];
    for (const file of files) {
      const result = file === '-' ? { ok: true as const, value: ctx.stdin } : readResult(ctx, ctx.resolve(file));
      if (!result.ok) { ctx.stderr(`cut: ${file}: ${strerror(result.error.code)}\n`); return 1; }
      const selected = lines(result.value).map(line => !line.includes(delimiter) ? line : [...new Set(fields)].sort((a,b) => a-b).filter(n => n <= line.split(delimiter).length).map(n => line.split(delimiter)[n - 1]).join(delimiter));
      ctx.stdout(selected.length ? selected.join('\n') + '\n' : '');
    }
    return 0;
  } };
}
function rev(): TextCommand {
  return { name: 'rev', summary: 'Reverse the characters of each line', usage: 'rev [FILE]', run(ctx) {
    for (const file of ctx.args.length ? ctx.args : ['-']) {
      const result = file === '-' ? { ok: true as const, value: ctx.stdin } : readResult(ctx, ctx.resolve(file));
      if (!result.ok) { ctx.stderr(`rev: ${file}: ${strerror(result.error.code)}\n`); return 1; }
      const reversed = lines(result.value).map(line => [...line].reverse().join(''));
      ctx.stdout(reversed.length ? reversed.join('\n') + '\n' : '');
    }
    return 0;
  } };
}

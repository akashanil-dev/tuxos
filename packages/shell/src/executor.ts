import { Kernel, resolvePath, type Stat } from '@tuxos/kernel';
import type { Actor, DispatchResult } from '@tuxos/sdk';
import { parse, type ParsedCommand, type ParsedList, type ParsedWord, type WordSegment } from './parser';
import type {
  CommandContext,
  CommandDefinition,
  Completion,
  RunResult,
  ShellInternals,
  ShellOptions,
  ShellIO,
} from './commands';
import { strerror } from './commands/helpers';
import { complete } from './complete';
import { createCommandRegistry, type CommandRegistry } from './registry';

const HISTORY_LIMIT = 500;
const OUTPUT_LIMIT = 4000;

export class ShellImpl implements ShellInternals {
  readonly plugins;
  cwd: string;
  env: Record<string, string>;
  private readonly actor?: Actor;
  private readonly registry: CommandRegistry;
  private readonly lines: string[] = [];
  private lastStatus = 0;
  /** Command names run by the current line, for the shell.ran record. */
  private ran: string[] = [];

  constructor(readonly kernel: Kernel, options: ShellOptions = {}) {
    this.actor = options.actor;
    this.plugins = options.plugins;
    this.registry = options.registry ?? createCommandRegistry();
    this.cwd = `/home/${kernel.user}`;
    this.env = { HOME: this.cwd, USER: kernel.user, PWD: this.cwd, PATH: '/bin:/usr/bin' };
  }

  register(command: CommandDefinition): void {
    this.registry.register(command);
  }

  unregister(name: string): void { this.registry.unregister(name); }

  commands(): CommandDefinition[] {
    return this.registry.list();
  }

  async run(line: string, io: ShellIO = {}): Promise<RunResult> {
    this.remember(line);
    this.ran = [];
    // Slash commands are terminal-native learning controls. Ordinary absolute paths such as /etc/passwd
    // remain untouched; only the explicitly supported learning commands lose their leading slash.
    const executableLine = line.replace(/^(\s*)\/(hint|answer|task|next)(?=\s|$)/, '$1$2');
    const result = await this.runInternal(executableLine, this.kernel.user, io);
    if (line.trim()) this.record(line, result);
    return result;
  }

  history(): string[] {
    return [...this.lines];
  }

  complete(line: string, cursor: number): Completion {
    return complete({
      cwd: this.cwd,
      home: this.env.HOME ?? this.cwd,
      commandNames: () => this.registry.list().filter((command) => command.available?.() !== false).map((command) => command.name),
      list: (path) => {
        const result = this.dispatch<Stat[]>('fs.list', { path }, this.kernel.user);
        return result.ok ? result.value : undefined;
      },
    }, line, cursor);
  }

  async runAsCommand(args: string[], stdin: string, user: string, io: ShellIO = {}): Promise<RunResult> {
    this.ran.push(args[0]!);
    const definition = this.registry.get(args[0]!);
    if (!definition) {
      const stderr = `${args[0]}: command not found\n`;
      io.stderr?.(stderr);
      return { stdout: '', stderr, code: 127 };
    }
    return this.executeCommand(definition, args.slice(1), stdin, user, undefined, io);
  }

  private async runInternal(line: string, user: string, io: ShellIO): Promise<RunResult> {
    let parsed: ParsedList;
    try {
      parsed = parse(line);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'bash: syntax error';
      const code = error instanceof Error && 'code' in error && typeof error.code === 'number'
        ? error.code
        : 2;
      this.lastStatus = code;
      io.stderr?.(`${message}\n`);
      return { stdout: '', stderr: `${message}\n`, code };
    }

    let stdout = '';
    let stderr = '';
    let code = this.lastStatus;
    for (let index = 0; index < parsed.pipelines.length; index += 1) {
      if (io.signal?.aborted) { code = 130; this.lastStatus = code; break; }
      const operator = parsed.operators[index - 1];
      const shouldRun = index === 0
        || operator === ';'
        || (operator === '&&' ? code === 0 : operator === '||' ? code !== 0 : true);
      if (!shouldRun) continue;
      const result = await this.runPipeline(parsed.pipelines[index]!.commands, user, io);
      stdout += result.stdout;
      stderr += result.stderr;
      code = result.code;
      this.lastStatus = code;
    }
    return { stdout, stderr, code };
  }

  private async runPipeline(commands: ParsedCommand[], user: string, io: ShellIO): Promise<RunResult> {
    let input = '';
    let stderr = '';
    let code = 0;
    for (let index = 0; index < commands.length; index += 1) {
      const command = commands[index]!;
      const expanded = await this.expandWords(command.words, user);
      const name = expanded[0];
      if (!name) {
        const error = 'bash: syntax error near unexpected token `newline`\n';
        io.stderr?.(error);
        return { stdout: '', stderr: stderr + error, code: 2 };
      }
      this.ran.push(name);
      const definition = this.registry.get(name);
      if (!definition) {
        const error = `${name}: command not found\n`;
        io.stderr?.(error);
        return { stdout: '', stderr: stderr + error, code: 127 };
      }
      const terminalInput = index === 0 && !command.redirections.some((redirect) => redirect.op === '<');
      const terminalOutput = index === commands.length - 1 && !command.redirections.some((redirect) => redirect.op !== '<');
      const result = await this.executeCommand(definition, expanded.slice(1), input, user, command, {
        ...io, stdout: terminalOutput ? io.stdout : undefined,
        readLine: terminalInput ? io.readLine : undefined,
        terminal: terminalInput && terminalOutput ? io.terminal : undefined,
      });
      stderr += result.stderr;
      input = result.stdout;
      code = result.code;
    }
    return { stdout: input, stderr, code };
  }

  private async executeCommand(
    definition: CommandDefinition,
    args: string[],
    stdin: string,
    user: string,
    parsed?: ParsedCommand,
    io: ShellIO = {},
  ): Promise<RunResult> {
    let stdout = '';
    let stderr = '';
    if (parsed) {
      for (const redirection of parsed.redirections) {
        if (redirection.op !== '<') continue;
        const [rawPath] = this.expandWord(redirection.word, user);
        const path = resolvePath(rawPath!, this.cwd);
        const result = this.dispatch<string>('fs.read', { path }, user);
        if (!result.ok) {
          const error = `bash: ${rawPath}: ${strerror(result.error.code)}\n`;
          io.stderr?.(error);
          return { stdout: '', stderr: error, code: 1 };
        }
        stdin = result.value;
      }
    }

    const context: CommandContext = {
      args,
      stdin,
      user,
      stdout: (text) => {
        stdout += text;
        // Long-running screen animations stream live; do not retain every frame indefinitely.
        if (io.terminal && io.stdout && stdout.length > 100_000) stdout = stdout.slice(-100_000);
        io.stdout?.(text);
      },
      stderr: (text) => { stderr += text; io.stderr?.(text); },
      readLine: io.readLine,
      signal: io.signal,
      terminal: io.terminal,
      shell: this,
      kernel: this.kernel,
      dispatch: <R>(type: string, payload: unknown) => this.dispatch<R>(type, payload, user),
      resolve: (path) => resolvePath(path, this.cwd),
    };
    const code = await definition.run(context);

    if (parsed) {
      for (const redirection of parsed.redirections) {
        if (redirection.op === '<') continue;
        const [rawPath] = this.expandWord(redirection.word, user);
        const path = resolvePath(rawPath!, this.cwd);
        const result = this.dispatch(
          'fs.write',
          { path, content: stdout, append: redirection.op === '>>' },
          user,
        );
        if (!result.ok) {
          const error = `bash: ${rawPath}: ${strerror(result.error.code)}\n`;
          io.stderr?.(error);
          return { stdout: '', stderr: stderr + error, code: 1 };
        }
        stdout = '';
      }
    }
    return { stdout, stderr, code };
  }

  // Lessons and the tutor learn what happened from this record. Output is capped so the log stays small.
  private record(line: string, result: RunResult): void {
    const cap = (text: string) => (text.length > OUTPUT_LIMIT ? `${text.slice(0, OUTPUT_LIMIT)}…` : text);
    this.dispatch('shell.ran', {
      line,
      cwd: this.cwd,
      code: result.code,
      stdout: cap(result.stdout),
      stderr: cap(result.stderr),
      commands: this.ran,
      learningModule: this.env.TUXOS_LEARNING_MODULE,
    }, this.kernel.user);
  }

  // Like bash's HISTCONTROL=ignoredups: blank lines and immediate repeats are not stored.
  private remember(line: string): void {
    if (!line.trim() || this.lines.at(-1) === line) return;
    this.lines.push(line);
    if (this.lines.length > HISTORY_LIMIT) this.lines.shift();
  }

  private dispatch<R>(type: string, payload: unknown, user: string): DispatchResult<R> {
    return this.kernel.dispatch<R>({ type, payload }, { actor: this.actor, user });
  }

  private async expandWords(words: ParsedWord[], user: string): Promise<string[]> {
    const result: string[] = [];
    for (const word of words) result.push(...this.expandWord(word, user));
    return result;
  }

  private expandWord(word: ParsedWord, user: string): string[] {
    let pattern = '';
    let hasGlob = false;
    for (const [index, segment] of word.segments.entries()) {
      const value = this.expandSegment(segment);
      if (index === 0 && segment.quoted === 'none' && segment.type === 'text' && value.startsWith('~')) {
        pattern += this.env.HOME + value.slice(1);
        if (/[?*]/.test(value)) hasGlob = true;
      } else if (segment.quoted === 'none') {
        pattern += value;
        if (/[?*]/.test(value)) hasGlob = true;
      } else {
        pattern += escapeGlob(value);
      }
    }
    return hasGlob ? this.expandGlob(pattern, user) : [unescapeGlob(pattern)];
  }

  private expandSegment(segment: WordSegment): string {
    if (segment.type === 'text') return segment.value;
    return segment.value === '?' ? String(this.lastStatus) : this.env[segment.value] ?? '';
  }

  private expandGlob(pattern: string, user: string): string[] {
    const slash = pattern.lastIndexOf('/');
    const parent = slash < 0 ? this.cwd : pattern.slice(0, slash) || '/';
    const leaf = pattern.slice(slash + 1);
    const path = resolvePath(parent, this.cwd);
    const listed = this.dispatch<{ name: string; kind: 'file' | 'dir'; owner: string; mode: number; size: number }[]>(
      'fs.list',
      { path },
      user,
    );
    if (!listed.ok) return [pattern];
    const regex = new RegExp(`^${leaf.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
    const matches = listed.value
      .filter((entry) => regex.test(entry.name))
      .filter((entry) => !entry.name.startsWith('.') || leaf.startsWith('.'));
    if (!matches.length) return [pattern];
    return matches.map((entry) => unescapeGlob(pattern.startsWith('/')
      ? `${path === '/' ? '' : path}/${entry.name}`
      : `${slash < 0 ? '' : pattern.slice(0, slash + 1)}${entry.name}`));
  }
}

function escapeGlob(value: string): string {
  return value.replace(/[?*]/g, '\\$&');
}

function unescapeGlob(value: string): string {
  return value.replace(/\\([?*])/g, '$1');
}

// Connects a screen (xterm.js in the app, a fake in tests) to one shell session: prompt, line editing,
// running commands, completion, and the few things bash itself handles rather than a program (exit).

import type { TerminalSession } from '@tuxos/system';
import { LineEditor, type EditorEvent } from './line-editor';

export interface Screen {
  write(data: string): void;
  clear(): void;
  readonly cols: number;
  readonly rows?: number;
}

export interface WindowActions {
  close(): void;
  setTitle(title: string): void;
  runningChanged?(running: boolean): void;
}

const EXIT = /^\s*exit(\s+\d+)?\s*$/;

export class TerminalController {
  private readonly editor = new LineEditor();
  private busy = true;
  private pending = '';
  private title = '';
  private answer?: (line: string | null) => void;
  private running?: AbortController;
  private disposed = false;

  dispose(): void {
    this.disposed = true;
    this.pending = '';
    this.running?.abort();
    this.answer?.(null);
    this.answer = undefined;
  }

  constructor(
    private readonly screen: Screen,
    private readonly session: TerminalSession,
    private readonly window: WindowActions,
    private readonly options: { colourOutput?: boolean } = {},
  ) {}

  async start(motd?: string): Promise<void> {
    if (motd) this.screen.write(toTerminal(motd.endsWith('\n') ? motd : `${motd}\n`));
    await this.showPrompt();
  }

  /** Keystrokes typed while a command runs are kept and replayed at the next prompt, like a real tty. */
  async input(data: string): Promise<void> {
    if (this.disposed) return;
    if (this.answer) {
      this.editor.columns = this.screen.cols;
      const { output, events } = this.editor.input(data);
      this.screen.write(output);
      for (const event of events) {
        if (event.type === 'submit' || event.type === 'interrupt' || event.type === 'eof') {
          const resolve = this.answer;
          this.answer = undefined;
          if (event.type === 'interrupt') this.running?.abort();
          if (event.type === 'eof') this.screen.write('\r\n');
          resolve?.(event.type === 'submit' ? event.line : null);
          break;
        }
        if (event.type === 'clear-screen') {
          this.screen.clear();
          this.screen.write(this.editor.cleared());
        }
      }
      return;
    }
    if (this.busy) {
      if (data.includes('\x03')) {
        this.running?.abort();
        this.pending = '';
        return;
      }
      this.pending += data;
      return;
    }
    this.editor.columns = this.screen.cols;
    const { output, events } = this.editor.input(data);
    this.screen.write(output);
    for (const event of events) await this.handle(event);
  }

  private async handle(event: EditorEvent): Promise<void> {
    switch (event.type) {
      case 'submit':
        return this.submit(event.line);
      case 'interrupt':
        return this.showPrompt();
      case 'clear-screen':
        this.screen.clear();
        this.screen.write(this.editor.cleared());
        return;
      case 'eof':
        this.screen.write('exit\r\n');
        this.window.close();
        return;
      case 'complete': {
        const completion = await this.session.complete(event.line, event.cursor);
        this.editor.columns = this.screen.cols;
        this.screen.write(this.editor.applyCompletion(completion, this.screen.cols));
      }
    }
  }

  private async submit(line: string): Promise<void> {
    if (EXIT.test(line)) {
      this.window.close();
      return;
    }
    this.busy = true;
    this.running = new AbortController();
    this.window.runningChanged?.(true);
    const lessonHelp = /^\s*\/?(?:hint|answer|task)(?:\s|$)/.test(line);
    if (lessonHelp) this.screen.write('\r\n');
    let streamed = false;
    const paint = (text: string, error = false) => this.options.colourOutput && text && !text.includes('\x1b') ? `\x1b[${error ? '91' : '96'}m${text}\x1b[0m` : text;
    const write = (text: string, error = false) => {
      streamed = true;
      if (!this.disposed) this.screen.write(toTerminal(paint(text, error)));
    };
    try {
      const result = await this.session.run(line, {
        stdout: text => write(text), stderr: text => write(text, true), signal: this.running.signal,
        terminal: { columns: this.screen.cols, rows: this.screen.rows ?? 24 },
        readLine: (prompt) => {
          if (this.disposed || this.running?.signal.aborted) return Promise.resolve(null);
          return new Promise<string | null>((resolve) => {
            this.answer = resolve;
            this.editor.columns = this.screen.cols;
            this.screen.write(this.editor.start(prompt, []));
            if (this.pending) {
              const typed = this.pending;
              this.pending = '';
              void this.input(typed);
            }
          });
        },
      });
      if (!this.disposed) {
        if (!streamed) this.screen.write(toTerminal(paint(result.stdout) + paint(result.stderr, true)));
        if (result.feedback) this.screen.write(formatFeedback(result.feedback, this.screen.cols));
        else if (lessonHelp) this.screen.write('\r\n');
      }
    } catch (error) {
      write(`Terminal: ${error instanceof Error ? error.message : String(error)}\n`);
    } finally {
      this.running = undefined;
      this.answer = undefined;
      if (!this.disposed) this.window.runningChanged?.(false);
      if (!this.disposed) await this.showPrompt();
    }
  }

  private async showPrompt(): Promise<void> {
    this.busy = true;
    const prompt = await this.session.prompt();
    this.editor.columns = this.screen.cols;
    this.screen.write(this.editor.start(prompt, await this.session.history()));
    const title = titleFor(prompt);
    if (title !== this.title) this.window.setTitle((this.title = title));
    this.busy = false;
    if (this.pending) {
      const typed = this.pending;
      this.pending = '';
      await this.input(typed);
    }
  }
}

const GREEN = '\x1b[1;32m';
const RED = '\x1b[1;31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

/**
 * The trainer's verdict on a command, set apart from its output: a coloured "Correct" or "Not quite" heading,
 * the feedback wrapped to the terminal's width, and what to do next.
 */
export function formatFeedback(feedback: { correct: boolean; text: string }, cols: number): string {
  const width = Math.max(30, Math.min(cols, 78) - 4);
  const colour = feedback.correct ? GREEN : RED;
  const heading = feedback.correct ? '✓ Correct!' : '✗ Not quite';
  const next = feedback.correct ? 'Your next task is ready above.' : 'Try again, or type /hint for a nudge.';
  const lines = [
    '',
    '',
    `${colour}┃${RESET} ${colour}${heading}${RESET}`,
    ...wrap(feedback.text, width).map((line) => `${colour}┃${RESET} ${line}`),
    `${colour}┃${RESET} ${DIM}${next}${RESET}`,
    '',
    '',
  ];
  return lines.join('\r\n');
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.replace(/\s+/g, ' ').trim().split(' ')) {
    if (line && line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

/** xterm needs \r\n to return to the start of the line; programs print plain \n. */
export function toTerminal(text: string): string {
  return text.replace(/\r?\n/g, '\r\n');
}

/** `ada@tuxos:~/src$ ` becomes the window title `ada@tuxos: ~/src`, as GNOME Terminal shows it. */
export function titleFor(prompt: string): string {
  const match = /^(.*?):(.*)[$#] $/.exec(prompt);
  return match ? `${match[1]}: ${match[2]}` : 'Terminal';
}

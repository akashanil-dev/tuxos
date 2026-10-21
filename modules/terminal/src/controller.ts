// Connects a screen (xterm.js in the app, a fake in tests) to one shell session: prompt, line editing,
// running commands, completion, and the few things bash itself handles rather than a program (exit).

import type { TerminalSession } from '@tuxos/system';
import { LineEditor, type EditorEvent } from './line-editor';

export interface Screen {
  write(data: string): void;
  clear(): void;
  readonly cols: number;
}

export interface WindowActions {
  close(): void;
  setTitle(title: string): void;
}

const EXIT = /^\s*exit(\s+\d+)?\s*$/;

export class TerminalController {
  private readonly editor = new LineEditor();
  private busy = true;
  private pending = '';
  private title = '';

  constructor(
    private readonly screen: Screen,
    private readonly session: TerminalSession,
    private readonly window: WindowActions,
  ) {}

  async start(motd?: string): Promise<void> {
    if (motd) this.screen.write(toTerminal(motd.endsWith('\n') ? motd : `${motd}\n`));
    await this.showPrompt();
  }

  /** Keystrokes typed while a command runs are kept and replayed at the next prompt, like a real tty. */
  async input(data: string): Promise<void> {
    if (this.busy) {
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
    const result = await this.session.run(line);
    this.screen.write(toTerminal(result.stdout + result.stderr));
    if (result.feedback) this.screen.write(formatFeedback(result.feedback, this.screen.cols));
    await this.showPrompt();
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
    `${colour}┃${RESET} ${colour}${heading}${RESET}`,
    ...wrap(feedback.text, width).map((line) => `${colour}┃${RESET} ${line}`),
    `${colour}┃${RESET} ${DIM}${next}${RESET}`,
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

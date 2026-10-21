// The readline part of a terminal: turns keystrokes (as xterm.js reports them) into an edited line,
// and produces the escape sequences that redraw it. It knows nothing about the shell or the DOM,
// so it can be tested on its own.
//
// A prompt and line longer than the terminal is wide wrap onto several rows. Every redraw goes back up to the
// row the prompt starts on, clears from there down, writes the prompt and line once, and puts the cursor back,
// so the line is never printed again below itself (which, typed a key at a time, printed one copy per key).

import type { Completion } from '@tuxos/shell';

export type EditorEvent =
  | { type: 'submit'; line: string }
  | { type: 'complete'; line: string; cursor: number }
  | { type: 'interrupt' }
  | { type: 'clear-screen' }
  | { type: 'eof' };

export interface EditorResult {
  output: string;
  events: EditorEvent[];
}

const KEYS = {
  enter: '\r',
  backspace: '\x7f',
  ctrlH: '\x08',
  tab: '\t',
  ctrlA: '\x01',
  ctrlC: '\x03',
  ctrlD: '\x04',
  ctrlE: '\x05',
  ctrlL: '\x0c',
  ctrlU: '\x15',
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
  home: ['\x1b[H', '\x1bOH', '\x1b[1~'],
  end: ['\x1b[F', '\x1bOF', '\x1b[4~'],
  delete: '\x1b[3~',
};

export class LineEditor {
  line = '';
  cursor = 0;
  private prompt = '';
  private history: string[] = [];
  private historyIndex = 0;
  private draft = '';
  /** Consecutive Tab presses: bash lists the candidates on the second one. */
  private tabs = 0;
  /** The terminal's width in characters; the caller keeps it current (see TerminalController). */
  columns = 80;
  /** How many rows below the prompt's first row the terminal cursor is now. */
  private row = 0;

  /** Start a fresh line after a prompt, with the shell's history for Up/Down. */
  start(prompt: string, history: string[]): string {
    this.prompt = prompt;
    this.history = history;
    this.historyIndex = history.length;
    this.line = '';
    this.cursor = 0;
    this.draft = '';
    this.row = 0;
    return prompt + this.settle(width(prompt));
  }

  input(data: string): EditorResult {
    const events: EditorEvent[] = [];
    let output = '';
    for (const key of splitKeys(data)) {
      this.tabs = key === KEYS.tab ? this.tabs + 1 : 0;
      const result = this.key(key);
      output += result.output;
      events.push(...result.events);
      // Anything after Enter belongs to the next prompt, which the caller starts once the command ran.
      if (result.events.some((event) => event.type === 'submit')) break;
    }
    return { output, events };
  }

  /**
   * Apply the shell's completion. One candidate is inserted (with a space unless it is a directory).
   * Several candidates insert their common prefix; on a second Tab in a row they are listed in columns.
   */
  applyCompletion(completion: Completion, columns: number): string {
    const { candidates, start } = completion;
    if (!candidates.length) return '\x07';
    const typed = this.line.slice(start, this.cursor);
    if (candidates.length === 1) {
      const only = candidates[0]!;
      return this.replaceWord(start, only.endsWith('/') ? only : `${only} `);
    }
    const prefix = commonPrefix(candidates);
    if (prefix.length > typed.length) return this.replaceWord(start, prefix);
    if (this.tabs < 2) return '\x07';
    const below = `${this.toEnd()}\r\n${formatColumns(candidates.map(displayName), columns)}`;
    this.row = 0;
    return below + this.redraw();
  }

  /** Redraw the prompt and line in place: from the prompt's first row, whatever rows the line wraps onto. */
  redraw(): string {
    const up = this.row > 0 ? `\x1b[${this.row}A` : '';
    const end = width(this.prompt) + width(this.line);
    const written = `${up}\r${this.prompt}${this.line}${this.settle(end)}\x1b[J`;
    this.row = this.rowOf(end);
    return written + this.place(width(this.prompt) + width(this.line.slice(0, this.cursor)));
  }

  /** The screen was cleared, keeping only the row the cursor was on: the prompt starts there now. */
  cleared(): string {
    this.row = 0;
    return this.redraw();
  }

  /**
   * After writing up to an exact multiple of the width, a terminal leaves the cursor on the last column,
   * waiting to wrap. Make it wrap now, so the cursor's row is certain.
   */
  private settle(end: number): string {
    return end > 0 && end % this.width() === 0 ? ' \r\x1b[K' : '';
  }

  private width(): number {
    return Math.max(1, Math.floor(this.columns) || 80);
  }

  private rowOf(offset: number): number {
    return Math.floor(offset / this.width());
  }

  /** Moves the cursor from where it is to an offset from the start of the prompt, without redrawing. */
  private place(offset: number): string {
    const row = this.rowOf(offset);
    const column = offset % this.width();
    const vertical = row < this.row ? `\x1b[${this.row - row}A` : row > this.row ? `\x1b[${row - this.row}B` : '';
    this.row = row;
    return `${vertical}\r${column > 0 ? `\x1b[${column}C` : ''}`;
  }

  /** The cursor to the end of the line, so what follows starts below all of it. */
  private toEnd(): string {
    return this.place(width(this.prompt) + width(this.line));
  }

  private key(key: string): EditorResult {
    const none: EditorEvent[] = [];
    switch (key) {
      case KEYS.enter:
        return { output: `${this.toEnd()}\r\n`, events: [{ type: 'submit', line: this.line }] };
      case KEYS.backspace:
      case KEYS.ctrlH:
        return { output: this.edit(this.line.slice(0, Math.max(0, this.cursor - 1)) + this.line.slice(this.cursor),
          this.cursor - 1), events: none };
      case KEYS.delete:
        return { output: this.edit(this.line.slice(0, this.cursor) + this.line.slice(this.cursor + 1), this.cursor),
          events: none };
      case KEYS.left:
        return { output: this.moveTo(this.cursor - 1), events: none };
      case KEYS.right:
        return { output: this.moveTo(this.cursor + 1), events: none };
      case KEYS.ctrlA:
        return { output: this.moveTo(0), events: none };
      case KEYS.ctrlE:
        return { output: this.moveTo(this.line.length), events: none };
      case KEYS.up:
        return { output: this.recall(this.historyIndex - 1), events: none };
      case KEYS.down:
        return { output: this.recall(this.historyIndex + 1), events: none };
      case KEYS.ctrlU:
        return { output: this.edit(this.line.slice(this.cursor), 0), events: none };
      case KEYS.ctrlC:
        return { output: `${this.toEnd()}^C\r\n`, events: [{ type: 'interrupt' }] };
      case KEYS.ctrlL:
        return { output: '', events: [{ type: 'clear-screen' }] };
      case KEYS.ctrlD:
        return this.line ? { output: this.edit(this.line.slice(0, this.cursor) + this.line.slice(this.cursor + 1),
          this.cursor), events: none } : { output: '', events: [{ type: 'eof' }] };
      case KEYS.tab:
        return { output: '', events: [{ type: 'complete', line: this.line, cursor: this.cursor }] };
    }
    if (KEYS.home.includes(key)) return { output: this.moveTo(0), events: none };
    if (KEYS.end.includes(key)) return { output: this.moveTo(this.line.length), events: none };
    if (key.startsWith('\x1b') || key < ' ') return { output: '', events: none };
    return { output: this.edit(this.line.slice(0, this.cursor) + key + this.line.slice(this.cursor),
      this.cursor + key.length), events: none };
  }

  private edit(line: string, cursor: number): string {
    this.line = line;
    this.cursor = Math.max(0, Math.min(cursor, line.length));
    return this.redraw();
  }

  private moveTo(cursor: number): string {
    return this.edit(this.line, cursor);
  }

  private recall(index: number): string {
    if (index < 0 || index > this.history.length) return '';
    if (this.historyIndex === this.history.length) this.draft = this.line;
    this.historyIndex = index;
    const line = index === this.history.length ? this.draft : this.history[index]!;
    return this.edit(line, line.length);
  }

  private replaceWord(start: number, text: string): string {
    return this.edit(this.line.slice(0, start) + text + this.line.slice(this.cursor), start + text.length);
  }
}

/** How many columns text takes on screen: escape sequences take none. (Wide characters count as one.) */
function width(text: string): number {
  return [...text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')].length;
}

/** Split terminal input into keys: escape sequences stay whole, everything else is one character each. */
export function splitKeys(data: string): string[] {
  const keys: string[] = [];
  for (let index = 0; index < data.length;) {
    const match = /^\x1b(\[[0-9;]*[A-Za-z~]|O[A-Za-z])/.exec(data.slice(index));
    const key = match ? match[0] : data[index]!;
    // A pasted newline submits the line, like pressing Enter.
    keys.push(key === '\n' ? '\r' : key);
    index += key.length;
  }
  return keys;
}

function commonPrefix(values: string[]): string {
  let prefix = values[0] ?? '';
  for (const value of values) while (!value.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return prefix;
}

/** bash lists `projects/alpha/` as `alpha/`: only the last path component. */
function displayName(candidate: string): string {
  const trimmed = candidate.endsWith('/') ? candidate.slice(0, -1) : candidate;
  const name = trimmed.slice(trimmed.lastIndexOf('/') + 1);
  return candidate.endsWith('/') ? `${name}/` : name;
}

/** Lay names out in columns, filled top to bottom like `ls`, within `width` characters. */
export function formatColumns(names: string[], width: number): string {
  const columnWidth = Math.max(...names.map((name) => name.length)) + 2;
  const columns = Math.max(1, Math.floor(width / columnWidth));
  const rows = Math.ceil(names.length / columns);
  let output = '';
  for (let row = 0; row < rows; row += 1) {
    let line = '';
    for (let column = 0; column < columns; column += 1) {
      const name = names[column * rows + row];
      if (name !== undefined) line += name.padEnd(columnWidth);
    }
    output += `${line.trimEnd()}\r\n`;
  }
  return output;
}

import { describe, expect, it } from 'vitest';
import { formatColumns, LineEditor, splitKeys } from './line-editor';

function editor(history: string[] = []) {
  const value = new LineEditor();
  value.start('$ ', history);
  return value;
}

describe('LineEditor', () => {
  it('types, moves and edits in the middle of the line', () => {
    const line = editor();
    line.input('helo');
    line.input('\x1b[D');
    line.input('l');
    expect(line.line).toBe('hello');
    expect(line.cursor).toBe(4);
    line.input('\x01');
    line.input('\x1b[3~');
    expect(line.line).toBe('ello');
    line.input('\x05\x7f');
    expect(line.line).toBe('ell');
    expect(line.cursor).toBe(3);
  });

  it('redraws the prompt and moves the cursor back when not at the end', () => {
    const line = editor();
    const { output } = line.input('ab\x1b[D');
    // The whole line is redrawn once, then the cursor goes to its column: after the prompt and `a`.
    expect(output.endsWith('\r$ ab\x1b[J\r\x1b[3C')).toBe(true);
  });

  it('submits on Enter and stops at it, leaving the rest for the next prompt', () => {
    const line = editor();
    expect(line.input('ls -l\rpwd').events).toEqual([{ type: 'submit', line: 'ls -l' }]);
    expect(line.input('\n').events).toEqual([{ type: 'submit', line: 'ls -l' }]);
  });

  it('walks history with Up and Down and keeps the unsent draft', () => {
    const line = editor(['ls', 'pwd']);
    line.input('ec');
    line.input('\x1b[A');
    expect(line.line).toBe('pwd');
    line.input('\x1b[A\x1b[A');
    expect(line.line).toBe('ls');
    line.input('\x1b[B\x1b[B');
    expect(line.line).toBe('ec');
  });

  it('handles Ctrl+C, Ctrl+L, Ctrl+U and Ctrl+D', () => {
    const line = editor();
    expect(line.input('abc\x03')).toMatchObject({ events: [{ type: 'interrupt' }] });
    expect(line.input('\x0c').events).toEqual([{ type: 'clear-screen' }]);
    line.start('$ ', []);
    line.input('one two\x1b[D\x1b[D\x1b[D\x15');
    expect(line.line).toBe('two');
    line.start('$ ', []);
    expect(line.input('\x04').events).toEqual([{ type: 'eof' }]);
  });

  it('ignores unknown escape sequences and control characters', () => {
    const line = editor();
    line.input('a\x1b[1;5Cb\x07');
    expect(line.line).toBe('ab');
  });
});

describe('tab completion', () => {
  it('inserts a single candidate, with a space unless it is a directory', () => {
    const line = editor();
    line.input('cat no\t');
    line.applyCompletion({ start: 4, candidates: ['notes.txt'] }, 80);
    expect(line.line).toBe('cat notes.txt ');
    line.start('$ ', []);
    line.input('cd Do\t');
    line.applyCompletion({ start: 3, candidates: ['Documents/'] }, 80);
    expect(line.line).toBe('cd Documents/');
  });

  it('inserts the common prefix, then lists candidates on the second Tab', () => {
    const line = editor();
    line.input('ls pro\t');
    line.applyCompletion({ start: 3, candidates: ['projects/', 'prompt.txt'] }, 80);
    expect(line.line).toBe('ls pro');
    line.input('j\t');
    expect(line.applyCompletion({ start: 3, candidates: ['projects/'] }, 80)).toContain('projects/');
    line.start('$ ', []);
    line.input('ls p\t');
    expect(line.applyCompletion({ start: 3, candidates: ['pa', 'pb'] }, 80)).toBe('\x07');
    line.input('\t');
    const listing = line.applyCompletion({ start: 3, candidates: ['pa', 'pb'] }, 80);
    expect(listing).toContain('pa  pb\r\n');
    expect(listing.endsWith('\r$ ls p\x1b[J\r\x1b[6C')).toBe(true);
  });

  it('rings the bell when nothing matches', () => {
    const line = editor();
    line.input('zz\t');
    expect(line.applyCompletion({ start: 0, candidates: [] }, 80)).toBe('\x07');
  });

  it('lists only the last path component, like bash', () => {
    const line = editor();
    line.input('ls projects/\t\t');
    const listing = line.applyCompletion({ start: 3, candidates: ['projects/alpha/', 'projects/beta.md'] }, 80);
    expect(listing).toContain('alpha/   beta.md');
  });
});

describe('helpers', () => {
  it('splits escape sequences from plain characters', () => {
    expect(splitKeys('a\x1b[Ab\x1bOH\x1b[3~')).toEqual(['a', '\x1b[A', 'b', '\x1bOH', '\x1b[3~']);
  });

  it('formats names top to bottom in columns that fit the width', () => {
    expect(formatColumns(['a', 'b', 'c', 'd', 'e'], 9)).toBe('a  c  e\r\nb  d\r\n');
  });
});

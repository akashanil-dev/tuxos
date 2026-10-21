// Lines wider than the terminal, checked on a real xterm.js screen: each must appear exactly once, however it
// is typed or edited (typed a key at a time, a wrapped line used to be printed again for every key).

import { Terminal } from '@xterm/xterm';
import { describe, expect, it } from 'vitest';
import { LineEditor } from './line-editor';

const PROMPT = 'ada@tuxos:~$ ';

function screen(columns = 40) {
  const term = new Terminal({ cols: columns, rows: 30 });
  const editor = new LineEditor();
  editor.columns = columns;
  const write = (data: string) => new Promise<void>((resolve) => term.write(data, resolve));
  const rows = () => {
    const lines: string[] = [];
    for (let index = 0; index < term.buffer.active.length; index++) lines.push(term.buffer.active.getLine(index)!.translateToString(true));
    while (lines.length && !lines.at(-1)) lines.pop();
    return lines;
  };
  const type = async (keys: string[]) => { for (const key of keys) await write(editor.input(key).output); };
  const cursor = () => ({ row: term.buffer.active.cursorY, column: term.buffer.active.cursorX });
  return { term, editor, write, rows, type, cursor };
}

describe('wrapped lines', () => {
  it('shows a long line typed one key at a time exactly once', async () => {
    const { editor, write, rows, type } = screen();
    await write(editor.start(PROMPT, []));
    const command = 'echo "this is a long line that Vasi types one key at a time, wrapping twice"';
    await type([...command]);
    expect(rows().join('')).toBe(PROMPT + command);
    expect(rows()).toHaveLength(Math.ceil((PROMPT + command).length / 40));
  });

  it('handles a line that ends exactly at the edge, then continues', async () => {
    const { editor, write, rows, type, cursor } = screen();
    await write(editor.start(PROMPT, []));
    const fill = 'x'.repeat(40 - PROMPT.length);
    await type([...fill]);
    expect(rows()).toEqual([PROMPT + fill]);
    // The cursor waits at the start of the next row, as in bash.
    expect(cursor()).toEqual({ row: 1, column: 0 });
    await type([...'yz']);
    expect(rows()).toEqual([PROMPT + fill, 'yz']);
  });

  it('edits in the middle of a wrapped line, and deletes back across the wrap', async () => {
    const { editor, write, rows, type, cursor } = screen();
    await write(editor.start(PROMPT, []));
    const command = 'a'.repeat(30) + 'b'.repeat(10);
    await type([...command]);
    await type(Array(12).fill('\x1b[D'));
    await type(['X']);
    const expected = PROMPT + 'a'.repeat(28) + 'X' + 'aa' + 'b'.repeat(10);
    expect(rows().join('')).toBe(expected);
    // The cursor sits just after the X.
    const offset = PROMPT.length + 29;
    expect(cursor()).toEqual({ row: Math.floor(offset / 40), column: offset % 40 });
    await type(['\x1b[F', ...Array(20).fill('\x7f')]);
    expect(rows()).toEqual([(PROMPT + 'a'.repeat(28) + 'X' + 'aa' + 'b'.repeat(10)).slice(0, PROMPT.length + 21)]);
  });

  it('replaces a long line with a short one from history without leaving the old one behind', async () => {
    const { editor, write, rows, type } = screen();
    await write(editor.start(PROMPT, ['ls', 'echo ' + 'z'.repeat(70)]));
    await type(['\x1b[A']);
    expect(rows().join('')).toBe(`${PROMPT}echo ${'z'.repeat(70)}`);
    await type(['\x1b[A']);
    expect(rows()).toEqual([`${PROMPT}ls`]);
  });

  it('puts output below the whole line when Enter is pressed in its middle', async () => {
    const { editor, write, rows, type } = screen();
    await write(editor.start(PROMPT, []));
    const command = 'echo ' + 'w'.repeat(60);
    await type([...command, '\x01']);
    const { events, output } = editor.input('\r');
    await write(`${output}done\r\n`);
    expect(events).toEqual([{ type: 'submit', line: command }]);
    expect(rows()).toEqual([...[(PROMPT + command).slice(0, 40), (PROMPT + command).slice(40, 80)].filter(Boolean), 'done']);
  });

  it('redraws a cleared screen from the row it kept', async () => {
    const { term, editor, write, rows, type } = screen();
    await write('old output\r\n');
    await write(editor.start(PROMPT, []));
    await type([...'ls -la']);
    term.clear();
    await write(editor.cleared());
    expect(rows()).toEqual([`${PROMPT}ls -la`]);
  });
});

import { afterEach, expect, it, vi } from 'vitest';
import { guardTerminalClipboard } from './clipboard';

const disposers: (() => void)[] = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); document.body.replaceChildren(); });
function setup() {
  const surface = document.createElement('div');
  const input = document.createElement('textarea');
  surface.append(input); document.body.append(surface);
  const blocked = vi.fn(), consumed = vi.fn();
  let selected = false;
  const stop = guardTerminalClipboard(surface, () => selected, blocked);
  disposers.push(stop);
  for (const type of ['paste', 'copy', 'cut', 'keydown', 'contextmenu', 'mousedown', 'drop', 'beforeinput']) input.addEventListener(type, consumed);
  return { input, blocked, consumed, stop, select: () => { selected = true; } };
}

it.each(['copy', 'cut', 'paste', 'contextmenu', 'drop'])('blocks %s before terminal handlers run and shows the notice', type => {
  const { input, blocked, consumed } = setup();
  const event = new Event(type, { bubbles: true, cancelable: true });
  input.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(consumed).not.toHaveBeenCalled();
  expect(blocked).toHaveBeenCalledOnce();
});
it.each([
  { key: 'v', ctrlKey: true }, { key: 'V', ctrlKey: true, shiftKey: true },
  { key: 'v', metaKey: true }, { key: 'c', metaKey: true },
  { key: 'C', ctrlKey: true, shiftKey: true },
  { key: 'Insert', shiftKey: true }, { key: 'Insert', ctrlKey: true },
])('blocks clipboard keyboard shortcut %j', shortcut => {
  const { input, blocked, consumed } = setup();
  const event = new KeyboardEvent('keydown', { ...shortcut, bubbles: true, cancelable: true });
  input.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(consumed).not.toHaveBeenCalled();
  expect(blocked).toHaveBeenCalledOnce();
});
it('preserves typing, Tab, history and Ctrl+C interrupt, but blocks copying a selection', () => {
  const { input, select, consumed } = setup();
  for (const key of ['w', 'Tab', 'ArrowUp', 'Enter', 'c']) {
    const event = new KeyboardEvent('keydown', { key, ctrlKey: key === 'c', bubbles: true, cancelable: true });
    input.dispatchEvent(event); expect(event.defaultPrevented).toBe(false);
  }
  expect(consumed).toHaveBeenCalledTimes(5);
  select();
  const copy = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true });
  input.dispatchEvent(copy); expect(copy.defaultPrevented).toBe(true);
  expect(consumed).toHaveBeenCalledTimes(5);
});
it('blocks middle-click paste and mobile paste input', () => {
  const { input, consumed } = setup();
  const middle = new MouseEvent('mousedown', { button: 1, bubbles: true, cancelable: true });
  const paste = new InputEvent('beforeinput', { inputType: 'insertFromPaste', data: 'whoami', bubbles: true, cancelable: true });
  input.dispatchEvent(middle); input.dispatchEvent(paste);
  expect(middle.defaultPrevented).toBe(true); expect(paste.defaultPrevented).toBe(true);
  expect(consumed).not.toHaveBeenCalled();
});
it('keeps clipboard actions outside the terminal working and restores the terminal after unlocking', () => {
  const { input, blocked, consumed, stop } = setup();
  const outside = document.createElement('textarea'); document.body.append(outside);
  const event = new Event('paste', { bubbles: true, cancelable: true });
  outside.dispatchEvent(event); expect(event.defaultPrevented).toBe(false);
  stop();
  const paste = new Event('paste', { bubbles: true, cancelable: true });
  input.dispatchEvent(paste);
  expect(paste.defaultPrevented).toBe(false);
  expect(blocked).not.toHaveBeenCalled();
  expect(consumed).toHaveBeenCalledOnce();
});

export const CLIPBOARD_LOCK_MESSAGE = 'Typing practice is on. You can still copy output, or choose Allow paste to leave practice mode.';

/** Intercept clipboard input before xterm handles it; ordinary typing and Ctrl+C interrupts stay intact. */
export function guardTerminalClipboard(element: HTMLElement, _hasSelection: () => boolean, onBlocked: () => void): () => void {
  const block = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    onBlocked();
  };
  const key = (event: KeyboardEvent) => {
    const name = event.key.toLowerCase();
    const modifier = event.ctrlKey || event.metaKey;
    const clipboardKey = modifier && name === 'v';
    if (clipboardKey || (name === 'insert' && event.shiftKey)) block(event);
  };
  const input = (event: InputEvent) => {
    if (['insertFromPaste', 'insertFromPasteAsQuotation', 'insertFromDrop'].includes(event.inputType)) block(event);
  };
  const middle = (event: MouseEvent) => { if (event.button === 1) block(event); };
  const events = ['paste', 'drop', 'dragover'] as const;
  for (const type of events) element.addEventListener(type, block, true);
  element.addEventListener('keydown', key, true);
  element.addEventListener('beforeinput', input, true);
  element.addEventListener('mousedown', middle, true);
  element.addEventListener('auxclick', middle, true);
  return () => {
    for (const type of events) element.removeEventListener(type, block, true);
    element.removeEventListener('keydown', key, true);
    element.removeEventListener('beforeinput', input, true);
    element.removeEventListener('mousedown', middle, true);
    element.removeEventListener('auxclick', middle, true);
  };
}

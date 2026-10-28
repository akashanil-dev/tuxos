export const CLIPBOARD_LOCK_MESSAGE = 'copy pasting makes you dumb, so we disabled it for now :)';

/** Intercept clipboard input before xterm handles it; ordinary typing and Ctrl+C interrupts stay intact. */
export function guardTerminalClipboard(element: HTMLElement, hasSelection: () => boolean, onBlocked: () => void): () => void {
  const block = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    onBlocked();
  };
  const key = (event: KeyboardEvent) => {
    const name = event.key.toLowerCase();
    const modifier = event.ctrlKey || event.metaKey;
    const clipboardKey = modifier && (name === 'v' || name === 'x' || (name === 'c' && (event.metaKey || event.shiftKey || hasSelection())));
    if (clipboardKey || (name === 'insert' && (event.shiftKey || event.ctrlKey))) block(event);
  };
  const input = (event: InputEvent) => {
    if (['insertFromPaste', 'insertFromPasteAsQuotation', 'insertFromDrop', 'deleteByCut'].includes(event.inputType)) block(event);
  };
  const middle = (event: MouseEvent) => { if (event.button === 1) block(event); };
  const events = ['copy', 'cut', 'paste', 'contextmenu', 'drop', 'dragover'] as const;
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

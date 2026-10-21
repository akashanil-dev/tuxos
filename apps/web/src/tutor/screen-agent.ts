// How Vasu uses the screen: he reads it like a screen reader would (buttons, fields, icons with their names),
// and acts on it with his own pointer and keyboard. A web page can't move the real mouse, so Vasu's pointer is
// drawn by the page and his clicks and keys are events sent to the elements themselves.

import type { ScreenElement } from '@tuxos/tutor';

/** Vasu's on-screen pointer. */
export interface Cursor {
  moveTo(x: number, y: number): Promise<void>;
  click(): Promise<void>;
}

/** The terminal app listens for this to take keystrokes (see modules/terminal/src/view.tsx). */
const TERMINAL_TYPE_EVENT = 'tuxos:terminal-type';

const INTERACTIVE = 'button, input, textarea, select, a[href], [role="menuitem"], [role="option"], [role="radio"], '
  + '[role="tab"], [role="checkbox"]';
/** Vasu's own controls, and terminals (which he types into with typeInTerminal). */
const IGNORED = '.tutor-panel, .tutor-puppet, .tutor-nudge, .tutor-pointer, .vasu-cursor, .vasu-control, .sudo-dialog, '
  + '.xterm';
const ID_ATTRIBUTE = 'data-vasu-id';
const MAX_ELEMENTS = 150;
const TERMINAL_READY_MS = 8000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** jsdom has no layout, so sizes are all zero there and can't tell what is visible. */
const hasLayout = () => !globalThis.navigator?.userAgent.includes('jsdom');

export function createScreenAgent(cursor: Cursor, typingDelay: number) {
  const find = (id: string): HTMLElement => {
    const element = document.querySelector<HTMLElement>(`[${ID_ATTRIBUTE}=${JSON.stringify(id)}]`);
    if (!element || !visible(element)) {
      throw new Error(`Element ${id} is no longer on screen. Use look_at_screen to see what is there now.`);
    }
    return element;
  };

  const pointAndPress = async (element: HTMLElement) => {
    element.scrollIntoView?.({ block: 'nearest' });
    const { x, y } = centre(element);
    await cursor.moveTo(x, y);
    await cursor.click();
    return { x, y };
  };

  return {
    describeScreen(): ScreenElement[] {
      document.querySelectorAll(`[${ID_ATTRIBUTE}]`).forEach((element) => element.removeAttribute(ID_ATTRIBUTE));
      const root = document.querySelector('.desktop-screen') ?? document.body;
      const found = [...root.querySelectorAll<HTMLElement>(INTERACTIVE)]
        .filter((element) => !element.closest(IGNORED) && visible(element) && !(element as HTMLButtonElement).disabled)
        .slice(0, MAX_ELEMENTS);
      return found.map((element, index) => {
        const id = `e${index + 1}`;
        element.setAttribute(ID_ATTRIBUTE, id);
        const window = element.closest('.app-window')?.getAttribute('aria-label');
        return { id, role: roleOf(element), name: nameOf(element), ...(window ? { window } : {}) };
      });
    },

    async click(id: string, double: boolean): Promise<void> {
      const element = find(id);
      const at = await pointAndPress(element);
      press(element, at, 1);
      if (double) {
        press(element, at, 2);
        element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2, ...client(at) }));
      }
    },

    async typeText(id: string, text: string, submit: boolean): Promise<void> {
      const element = find(id);
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
        throw new Error(`Element ${id} is not a text field.`);
      }
      const at = await pointAndPress(element);
      press(element, at, 1);
      element.focus();
      const setValue = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')!.set!;
      for (const character of text) {
        setValue.call(element, element.value + character);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(typingDelay);
      }
      if (submit) {
        key(element, 'keydown', parseKeys('Enter'));
        key(element, 'keyup', parseKeys('Enter'));
        element.form?.requestSubmit();
      }
    },

    async pressKeys(keys: string): Promise<void> {
      const parsed = parseKeys(keys);
      const target = (document.activeElement as HTMLElement | null) ?? document.body;
      key(target, 'keydown', parsed);
      key(target, 'keyup', parsed);
    },

    async typeInTerminal(windowId: string, text: string): Promise<void> {
      const frame = document.querySelector<HTMLElement>(`[data-tutor-target=${JSON.stringify(`window:${windowId}`)}]`);
      if (frame) await pointAndPress(frame.querySelector<HTMLElement>('.window-content') ?? frame);
      const send = (data: string) => {
        const detail = { windowId, data, accepted: false };
        window.dispatchEvent(new CustomEvent(TERMINAL_TYPE_EVENT, { detail }));
        return detail.accepted;
      };
      // A terminal that has just opened needs a moment before it takes keys.
      const deadline = Date.now() + TERMINAL_READY_MS;
      while (!send('')) {
        if (Date.now() > deadline) throw new Error(`Window ${windowId} is not a terminal that is ready for typing.`);
        await sleep(100);
      }
      for (const character of text) {
        send(character);
        await sleep(character === '\r' ? 0 : typingDelay);
      }
    },
  };
}

function visible(element: HTMLElement): boolean {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.hidden || node.getAttribute('aria-hidden') === 'true' || node.style.display === 'none') return false;
  }
  return !hasLayout() || element.getClientRects().length > 0;
}

function roleOf(element: HTMLElement): string {
  const explicit = element.getAttribute('role');
  if (explicit) return explicit;
  if (element instanceof HTMLTextAreaElement) return 'textbox';
  if (element instanceof HTMLSelectElement) return 'combobox';
  if (element instanceof HTMLAnchorElement) return 'link';
  if (element instanceof HTMLInputElement) {
    return element.type === 'checkbox' || element.type === 'radio' ? element.type : 'textbox';
  }
  return 'button';
}

function nameOf(element: HTMLElement): string {
  const label = element.getAttribute('aria-label')
    ?? (element.id ? document.querySelector(`label[for=${JSON.stringify(element.id)}]`)?.textContent : null)
    ?? element.closest('label')?.textContent
    ?? element.getAttribute('title')
    ?? element.textContent
    ?? '';
  let name = label.replace(/\s+/g, ' ').trim();
  if (!name && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    name = element.placeholder || 'text field';
  }
  if ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && element.value
    && element.type !== 'password') {
    name += ` (contains "${element.value.slice(0, 40)}")`;
  }
  return name.slice(0, 100) || '(unnamed)';
}

function centre(element: HTMLElement) {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + Math.min(box.height / 2, 40) };
}

const client = (at: { x: number; y: number }) => ({ clientX: at.x, clientY: at.y });

/** A full mouse click, as a browser sends it: pointer and mouse down, focus, up, then click. */
function press(element: HTMLElement, at: { x: number; y: number }, detail: number) {
  const Pointer = globalThis.PointerEvent ?? MouseEvent;
  const init = { bubbles: true, cancelable: true, button: 0, detail, ...client(at) };
  // pointerId 1 is the mouse in browsers, so apps that capture the pointer get a valid one.
  const pointer = { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  element.dispatchEvent(new Pointer('pointerdown', pointer));
  element.dispatchEvent(new MouseEvent('mousedown', init));
  element.focus?.();
  element.dispatchEvent(new Pointer('pointerup', pointer));
  element.dispatchEvent(new MouseEvent('mouseup', init));
  element.dispatchEvent(new MouseEvent('click', init));
}

interface ParsedKeys {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const NAMED: Record<string, [key: string, code: string]> = {
  enter: ['Enter', 'Enter'], return: ['Enter', 'Enter'], escape: ['Escape', 'Escape'], esc: ['Escape', 'Escape'],
  tab: ['Tab', 'Tab'], space: [' ', 'Space'], backspace: ['Backspace', 'Backspace'], delete: ['Delete', 'Delete'],
  up: ['ArrowUp', 'ArrowUp'], down: ['ArrowDown', 'ArrowDown'], left: ['ArrowLeft', 'ArrowLeft'],
  right: ['ArrowRight', 'ArrowRight'], home: ['Home', 'Home'], end: ['End', 'End'],
  super: ['Meta', 'MetaLeft'], meta: ['Meta', 'MetaLeft'], win: ['Meta', 'MetaLeft'],
};

/** "Ctrl+Alt+T" → the key event fields a browser would send. */
export function parseKeys(keys: string): ParsedKeys {
  const parts = keys.split('+').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) throw new Error('No keys given.');
  const has = (...names: string[]) => parts.slice(0, -1).some((part) => names.includes(part.toLowerCase()));
  const last = parts.at(-1)!;
  const lower = last.toLowerCase();
  const parsed = {
    ctrlKey: has('ctrl', 'control'),
    altKey: has('alt'),
    shiftKey: has('shift'),
    metaKey: has('super', 'meta', 'win', 'cmd') || NAMED[lower]?.[0] === 'Meta',
  };
  if (NAMED[lower]) return { ...parsed, key: NAMED[lower][0], code: NAMED[lower][1] };
  if (/^f([1-9]|1[0-2])$/.test(lower)) return { ...parsed, key: last.toUpperCase(), code: last.toUpperCase() };
  if (/^[a-z]$/i.test(last)) {
    return { ...parsed, key: parsed.shiftKey ? last.toUpperCase() : lower, code: `Key${last.toUpperCase()}` };
  }
  if (/^[0-9]$/.test(last)) return { ...parsed, key: last, code: `Digit${last}` };
  if (last.length === 1) return { ...parsed, key: last, code: '' };
  throw new Error(`Unknown key "${last}".`);
}

function key(target: HTMLElement, type: 'keydown' | 'keyup', parsed: ParsedKeys) {
  target.dispatchEvent(new KeyboardEvent(type, { ...parsed, bubbles: true, cancelable: true }));
}

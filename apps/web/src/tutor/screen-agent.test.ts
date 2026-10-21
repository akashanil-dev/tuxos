import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScreenAgent, parseKeys } from './screen-agent';

const moves: string[] = [];
const agent = createScreenAgent({
  moveTo: async (x, y) => { moves.push(`${x},${y}`); },
  click: async () => { moves.push('click'); },
}, 0);

afterEach(() => {
  document.body.innerHTML = '';
  moves.length = 0;
});

describe('screen agent', () => {
  it('lists what can be clicked or typed into, skipping hidden things and Vasu\'s own controls', () => {
    document.body.innerHTML = `<main class="desktop-screen">
      <button title="Open Terminal">Terminal</button>
      <section class="app-window" aria-label="Notes"><input aria-label="Name" value="todo"></section>
      <section class="app-window" aria-hidden="true"><button>Hidden</button></section>
      <button disabled>Off</button>
      <section class="tutor-panel"><button>Ask</button></section>
    </main>`;
    expect(agent.describeScreen()).toEqual([
      { id: 'e1', role: 'button', name: 'Open Terminal' },
      { id: 'e2', role: 'textbox', name: 'Name (contains "todo")', window: 'Notes' },
    ]);
  });

  it('clicks and double-clicks with the pointer, and refuses ids that are gone', async () => {
    document.body.innerHTML = '<main class="desktop-screen"><button>Go</button></main>';
    const button = document.querySelector('button')!;
    const clicks = vi.fn();
    const doubles = vi.fn();
    button.addEventListener('click', clicks);
    button.addEventListener('dblclick', doubles);
    agent.describeScreen();
    await agent.click('e1', true);
    expect(clicks).toHaveBeenCalledTimes(2);
    expect(doubles).toHaveBeenCalledTimes(1);
    expect(moves).toEqual(['0,0', 'click']);
    await expect(agent.click('e9', false)).rejects.toThrow('look_at_screen');
  });

  it('types into a field so controlled inputs see every letter, then submits its form', async () => {
    document.body.innerHTML = '<main class="desktop-screen"><form><input aria-label="Who"></form></main>';
    const input = document.querySelector('input')!;
    const seen: string[] = [];
    input.addEventListener('input', () => seen.push(input.value));
    const submitted = vi.fn((event: Event) => event.preventDefault());
    document.querySelector('form')!.addEventListener('submit', submitted);
    agent.describeScreen();
    await agent.typeText('e1', 'ada', true);
    expect(seen).toEqual(['a', 'ad', 'ada']);
    expect(submitted).toHaveBeenCalledOnce();
  });

  it('reads shortcuts the way a browser reports them', () => {
    expect(parseKeys('Ctrl+Alt+T')).toMatchObject({ key: 't', code: 'KeyT', ctrlKey: true, altKey: true });
    expect(parseKeys('Alt+Space')).toMatchObject({ key: ' ', code: 'Space', altKey: true });
    expect(parseKeys('Alt+Shift+2')).toMatchObject({ key: '2', code: 'Digit2', shiftKey: true });
    expect(parseKeys('Super')).toMatchObject({ key: 'Meta', metaKey: true });
    expect(() => parseKeys('Alt+Banana')).toThrow('Unknown key');
  });

  it('types into a terminal once it is ready', async () => {
    const received: string[] = [];
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ windowId: string; data: string; accepted: boolean }>).detail;
      if (detail.windowId !== 'w1') return;
      detail.accepted = true;
      if (detail.data) received.push(detail.data);
    };
    window.addEventListener('tuxos:terminal-type', listener);
    await agent.typeInTerminal('w1', 'ls\r');
    window.removeEventListener('tuxos:terminal-type', listener);
    expect(received).toEqual(['l', 's', '\r']);
  });
});

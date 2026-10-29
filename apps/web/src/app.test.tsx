import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionState } from '@tuxos/kernel';
import type { KernelEvent } from '@tuxos/sdk';
import { about } from '@tuxos/module-about';
import { createLocalSystem, type KeyValueStorage, type SystemClient } from '@tuxos/system';
import { App, Desktop } from './app';

interface TestSystem extends Omit<SystemClient, 'dispatch'> {
  emit(): void;
  dispatch: any;
}

function fakeSystem(): TestSystem {
  let state: SessionState = {
    windows: [], focusedId: null, nextId: 1, desktop: 'plasma', wallpaper: 'freedom',
  };
  const allListeners = new Set<(event: KernelEvent) => void>();
  const changeListeners = new Set<(event: KernelEvent) => void>();
  const emit = (type: string) => {
    const event = { action: { type, payload: {} }, ok: true, mutates: true } as KernelEvent;
    for (const listener of allListeners) listener(event);
    for (const listener of changeListeners) listener(event);
  };
  const dispatch = vi.fn(async <R,>(type: string, payload: unknown) => {
    const value = payload as {
      appId?: string; title?: string; id?: string; x?: number; y?: number;
      width?: number; height?: number;
    };
    if (type === 'fs.read') {
      const path = (payload as { path: string }).path;
      const value = path.endsWith('passwd') ? 'root:x:0:0\nada:x:1000:1000\n' : 'tuxos\n';
      return { ok: true as const, value: value as R };
    }
    const current = state.windows.find((window) => window.id === value.id);
    if (type === 'session.open') {
      const id = `window-${state.nextId++}`;
      state = {
        ...state,
        focusedId: id,
        windows: [...state.windows, {
          id, appId: value.appId!, title: value.title!, x: 20, y: 20,
          width: 500, height: 320, minimized: false, maximized: false, z: 1,
        }],
      };
    } else if (current && type === 'session.close') {
      state = { ...state, windows: state.windows.filter((window) => window.id !== value.id) };
    } else if (current && type === 'session.move') {
      state = {
        ...state,
        windows: state.windows.map((window) => window.id === value.id
          ? { ...window, x: value.x!, y: value.y! } : window),
      };
    } else if (current && type === 'session.resize') {
      state = {
        ...state,
        windows: state.windows.map((window) => window.id === value.id
          ? {
            ...window,
            width: Math.max(240, value.width ?? 240),
            height: Math.max(160, value.height ?? 160),
          } : window),
      };
    } else if (type === 'session.setDesktop') {
      state = { ...state, desktop: (payload as { desktop: string }).desktop };
    } else if (current && type === 'session.toggleMaximize') {
      state = {
        ...state,
        windows: state.windows.map((window) => window.id === value.id
          ? { ...window, maximized: !window.maximized } : window),
      };
    }
    if (type.startsWith('session.')) emit(type);
    return { ok: true, value: undefined as R };
  });
  return {
    boot: vi.fn(async (username: string) => {
      if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(username)) throw new Error('invalid username');
    }),
    hasSave: vi.fn(async () => null),
    dispatch,
    subscribe: (listener) => { allListeners.add(listener); return () => allListeners.delete(listener); },
    onChange: (listener) => { changeListeners.add(listener); return () => changeListeners.delete(listener); },
    onSaveError: () => () => undefined,
    flush: vi.fn(async () => undefined),
    tutor: () => { throw new Error('the tutor is not used in this test'); },
    ai: () => null,
    user: vi.fn(async () => 'ada'),
    hostname: vi.fn(async () => 'tuxos'),
    session: vi.fn(async () => structuredClone(state)),
    apps: vi.fn(async () => [{ id: 'about', moduleId: 'about', title: 'About this system', icon: 'ⓘ' }]),
    openApp: vi.fn(async () => {
      await dispatch('session.open', { appId: 'about', title: 'About this system' });
      return { ok: true as const, value: 'window-1' };
    }),
    createTerminal: vi.fn(),
    restartLearning: vi.fn(async () => {}),
    onRestart: () => () => undefined,
    reset: vi.fn(async () => {}),
    emit: () => emit('fs.read'),
  };
}

function memoryStorage(): KeyValueStorage {
  let saved: string | null = null;
  return {
    async get() { return saved; },
    async set(_key, value) { saved = value; },
    async remove() { saved = null; },
  };
}

describe('web desktop', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });
  it('shows about, opens a window, closes it, and follows direct dispatch events', async () => {
    const system = fakeSystem();
    render(<Desktop system={system} />);
    expect(await screen.findByText('About this system', {}, { timeout: 3000 })).toBeTruthy();
    fireEvent.doubleClick(screen.getByRole('button', { name: /About this system/ }));
    expect(await screen.findByRole('button', { name: 'Close About this system' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close About this system' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Close About this system' })).toBeNull());
    await system.dispatch('session.open', { appId: 'about', title: 'About this system' });
    expect(await screen.findByRole('button', { name: 'Close About this system' })).toBeTruthy();
  });

  it('uses the real system client without recursive session events', async () => {
    const system = createLocalSystem({
      storage: memoryStorage(),
      modules: [{ manifest: about.manifest, load: async () => about }],
    });
    await system.boot('ada');
    render(<Desktop system={system} />);
    await system.openApp('about');
    await system.dispatch('fs.read', { path: '/etc/hostname' });
    await system.dispatch('fs.list', { path: '/' });
    expect(await screen.findByText('A small Linux desktop for learning by doing.', {}, { timeout: 3000 })).toBeTruthy();
    const hostname = await screen.findByText('tuxos');
    await system.dispatch('session.focus', { id: 'window-1' });
    expect(screen.getByText('tuxos')).toBe(hostname);
    expect((await screen.findAllByText('About this system')).length).toBeGreaterThan(1);
  });

  it('moves a window live and dispatches one final move', async () => {
    const system = fakeSystem();
    render(<Desktop system={system} />);
    await system.openApp('about');
    const title = await findWindowTitle();
    dispatchPointer(title, 'pointerdown', 30, 30, 1);
    dispatchPointer(title, 'pointermove', 80, 90, 1);
    dispatchPointer(title, 'pointerup', 100, 110, 1);
    const moves = system.dispatch.mock.calls.filter((call: [string, unknown]) => call[0] === 'session.move');
    expect(moves).toHaveLength(1);
    expect(moves[0]![1]).toMatchObject({ x: 90, y: 100 });
  });

  it('clamps resize to the minimum geometry', async () => {
    const system = fakeSystem();
    render(<Desktop system={system} />);
    await system.openApp('about');
    const handle = await screen.findByRole('button', { name: 'Resize About this system' }, { timeout: 3000 });
    dispatchPointer(handle, 'pointerdown', 520, 340, 2);
    dispatchPointer(handle, 'pointermove', 0, 0, 2);
    dispatchPointer(handle, 'pointerup', 0, 0, 2);
    const resize = system.dispatch.mock.calls.find((call: [string, unknown]) => call[0] === 'session.resize');
    expect(resize?.[1]).toMatchObject({ width: 240, height: 160 });
  });

  it('renders maximized windows at desktop size and restores geometry', async () => {
    const system = fakeSystem();
    render(<Desktop system={system} />);
    await system.openApp('about');
    const title = await findWindowTitle();
    const frame = title.closest('.app-window') as HTMLElement;
    expect(frame.style.width).toBe('500px');
    expect(frame.style.height).toBe('320px');
    fireEvent.doubleClick(title);
    await waitFor(() => expect(frame.style.width).toBe(`${globalThis.innerWidth}px`));
    fireEvent.doubleClick(title);
    await waitFor(() => expect(frame.style.width).toBe('500px'));
    expect(frame.style.height).toBe('320px');
  });
});

async function findWindowTitle(): Promise<HTMLElement> {
  await screen.findByRole('button', { name: 'Close About this system' }, { timeout: 3000 });
  const title = screen.getAllByText('About this system')
    .find((element) => element.closest('.app-window'));
  if (!title) throw new Error('window title not found');
  return title as HTMLElement;
}

function dispatchPointer(
  element: HTMLElement,
  type: string,
  clientX: number,
  clientY: number,
  pointerId: number,
) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    pointerId: { value: pointerId },
  });
  element.dispatchEvent(event);
}

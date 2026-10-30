import { validatePluginTheme, validPluginId } from '@tuxos/sdk';
import { demandReward, demandDesktop } from './journey';
import { KernelError } from '../errors';
import type { ActionDefinition } from '../kernel';
import type { SessionState, Window } from '../state';

const MIN_WIDTH = 240;
const MIN_HEIGHT = 160;

function field(
  payload: unknown,
  key: string,
  type: 'string' | 'number',
  optional = false,
): string | number | undefined {
  const value = (payload as Record<string, unknown> | null)?.[key];
  if (value === undefined && optional) return undefined;
  if (typeof value !== type || (type === 'number' && !Number.isFinite(value))) {
    throw new KernelError('EINVAL', `"${key}" must be a ${type}`);
  }
  return value as string | number;
}

function args(payload: unknown): Record<string, string> | undefined {
  const value = (payload as Record<string, unknown> | null)?.args;
  if (value === undefined) return undefined;
  const valid = typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.values(value).every((entry) => typeof entry === 'string');
  if (!valid) throw new KernelError('EINVAL', '"args" must be an object of strings');
  return { ...(value as Record<string, string>) };
}

/** Desktop and wallpaper names are short lowercase ids; which ones exist is the desktop's business. */
function settingId(payload: unknown, key: string): string {
  const value = field(payload, key, 'string') as string;
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(value)) throw new KernelError('EINVAL', `invalid ${key}: ${value}`);
  return value;
}

function id(payload: unknown): string {
  return field(payload, 'id', 'string') as string;
}

function find(session: SessionState, windowId: string): Window {
  const window = session.windows.find((candidate) => candidate.id === windowId);
  if (!window) throw new KernelError('ENOENT', `no such window: ${windowId}`);
  return window;
}

function topZ(session: SessionState): number {
  return session.windows.reduce((top, window) => Math.max(top, window.z), 0) + 1;
}

function focus(session: SessionState, window: Window): void {
  window.minimized = false;
  window.z = topZ(session);
  session.focusedId = window.id;
}

export const sessionActions: ActionDefinition[] = [
  {
    type: 'session.setTheme', capability: 'session:control', description: 'Apply or reset desktop theme colours.', mutates: true,
    run: ({ state }, payload) => {
      demandReward(state.session, 'themes');
      const theme = (payload as { theme?: unknown } | null)?.theme;
      if (theme === null) { delete state.session.theme; return; }
      try { state.session.theme = validatePluginTheme(theme); }
      catch (error) { throw new KernelError('EINVAL', error instanceof Error ? error.message : 'Invalid theme.'); }
    },
  },
  {
    type: 'session.setWidget', capability: 'session:control', description: 'Pin, move, resize or unpin a desktop widget.', mutates: true,
    run: ({ state }, payload) => {
      demandReward(state.session, 'plugins');
      const appId = field(payload, 'appId', 'string') as string;
      if (!validPluginId(appId)) throw new KernelError('EINVAL', 'Invalid widget app ID.');
      const widgets = state.session.widgets ?? [];
      if ((payload as { remove?: boolean }).remove === true) { state.session.widgets = widgets.filter(widget => widget.appId !== appId); return; }
      const old = widgets.find(widget => widget.appId === appId);
      if (!old && widgets.length >= 8) throw new KernelError('ENOSPC', 'You can pin up to 8 widgets.');
      const number = (key: string, fallback: number, min: number, max: number) => Math.max(min, Math.min(max, field(payload, key, 'number', true) as number | undefined ?? fallback));
      const widget = { appId, x: number('x', old?.x ?? 160, 0, 10000), y: number('y', old?.y ?? 64, 0, 10000), width: number('width', old?.width ?? 340, 240, 800), height: number('height', old?.height ?? 360, 200, 800) };
      state.session.widgets = [...widgets.filter(item => item.appId !== appId), widget];
    },
  },
  {
    type: 'session.consumeLaunch', capability: 'session:control', description: 'Consume a terminal launch command once.', mutates: true,
    run: ({ state }, payload) => {
      const window = find(state.session, id(payload));
      if (window.appId !== 'terminal') throw new KernelError('EINVAL', 'Only terminal windows accept launch commands.');
      const command = window.args?.run;
      if (window.args) delete window.args.run;
      return command;
    },
  },
  {
    type: 'session.open',
    capability: 'session:control',
    description: 'Open and focus an application window.',
    mutates: true,
    run: ({ state }, payload) => {
      const appId = field(payload, 'appId', 'string') as string;
      if (!['terminal', 'learn-linux'].includes(appId)) demandDesktop(state.session, state.session.desktop);
      if (appId === 'plugins') demandReward(state.session, 'plugins');
      const title = field(payload, 'title', 'string') as string;
      const width = Math.max(MIN_WIDTH, field(payload, 'width', 'number', true) as number | undefined ?? 720);
      const height = Math.max(MIN_HEIGHT, field(payload, 'height', 'number', true) as number | undefined ?? 480);
      const index = state.session.windows.length;
      const window: Window = {
        id: `window-${state.session.nextId++}`,
        appId, title, width, height, x: 48 + index * 24, y: 40 + index * 24,
        minimized: false, maximized: false, z: topZ(state.session),
      };
      const windowArgs = args(payload);
      if (windowArgs) window.args = windowArgs;
      state.session.windows.push(window);
      state.session.focusedId = window.id;
      return window.id;
    },
  },
  {
    type: 'session.close', capability: 'session:control', description: 'Close a window.', mutates: true,
    run: ({ state }, payload) => {
      const windowId = id(payload);
      find(state.session, windowId);
      state.session.windows = state.session.windows.filter((window) => window.id !== windowId);
      if (state.session.focusedId === windowId) {
        const next = [...state.session.windows].sort((a, b) => b.z - a.z)[0];
        state.session.focusedId = next?.id ?? null;
      }
      return undefined;
    },
  },
  {
    type: 'session.setDesktop', capability: 'session:control', mutates: true,
    description: 'Switch the desktop environment: "plasma" (KDE Plasma), "gnome", "cde" or "hyprland".',
    params: { type: 'object', properties: { desktop: { type: 'string' } }, required: ['desktop'] },
    run: ({ state }, payload) => { const desktop = settingId(payload, 'desktop'); demandDesktop(state.session, desktop); state.session.desktop = desktop; },
  },
  {
    type: 'session.setWallpaper', capability: 'session:control', mutates: true,
    description: 'Change the desktop wallpaper by name.',
    params: { type: 'object', properties: { wallpaper: { type: 'string' } }, required: ['wallpaper'] },
    run: ({ state }, payload) => { const wallpaper = settingId(payload, 'wallpaper'); demandReward(state.session, 'wallpaper'); if (wallpaper === 'kde-30th') demandReward(state.session, 'anniversary'); state.session.wallpaper = wallpaper; },
  },
  {
    type: 'session.setTitle', capability: 'session:control', description: 'Change a window title.', mutates: true,
    run: ({ state }, payload) => {
      find(state.session, id(payload)).title = field(payload, 'title', 'string') as string;
    },
  },
  {
    type: 'session.focus', capability: 'session:control', description: 'Focus a window.', mutates: true,
    run: ({ state }, payload) => { const window = find(state.session, id(payload)); focus(state.session, window); },
  },
  {
    type: 'session.minimize', capability: 'session:control', description: 'Minimize a window.', mutates: true,
    run: ({ state }, payload) => {
      const window = find(state.session, id(payload));
      window.minimized = true;
      if (state.session.focusedId === window.id) state.session.focusedId = null;
    },
  },
  {
    type: 'session.toggleMaximize',
    capability: 'session:control',
    description: 'Toggle a window maximized.',
    mutates: true,
    run: ({ state }, payload) => {
      const window = find(state.session, id(payload));
      focus(state.session, window);
      window.maximized = !window.maximized;
    },
  },
  {
    type: 'session.move', capability: 'session:control', description: 'Move a window.', mutates: true,
    run: ({ state }, payload) => {
      const window = find(state.session, id(payload));
      window.x = field(payload, 'x', 'number') as number;
      window.y = field(payload, 'y', 'number') as number;
    },
  },
  {
    type: 'session.resize', capability: 'session:control', description: 'Resize a window.', mutates: true,
    run: ({ state }, payload) => {
      const window = find(state.session, id(payload));
      window.width = Math.max(MIN_WIDTH, field(payload, 'width', 'number') as number);
      window.height = Math.max(MIN_HEIGHT, field(payload, 'height', 'number') as number);
    },
  },
  {
    type: 'session.list', capability: 'session:control', description: 'List desktop windows.', mutates: false,
    run: ({ state }) => structuredClone(state.session),
  },
];

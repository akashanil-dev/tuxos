// Kernel state and the fresh system a new learner boots into.

import type { JourneyProgress, PluginTheme } from '@tuxos/sdk';
import { KernelError } from './errors';
import { expandFilesystem } from './filesystem-layout';
import { dir, file, type DirNode } from './vfs';

export interface UserAccount {
  uid: number;
  home: string;
}

export interface Window {
  id: string;
  appId: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  maximized: boolean;
  z: number;
  /** What the app was opened with, e.g. { path: '/etc/motd' } for the Text Editor. */
  args?: Record<string, string>;
}

export interface DesktopWidget { appId: string; x: number; y: number; width: number; height: number; }

export interface SessionState {
  journey?: JourneyProgress;
  widgets?: DesktopWidget[];
  theme?: PluginTheme;
  windows: Window[];
  focusedId: string | null;
  nextId: number;
  /** The desktop environment the learner is logged in to, "plasma", "gnome", "cde" or "hyprland". */
  desktop: string;
  wallpaper: string;
}

export const DEFAULT_DESKTOP = 'plasma';
// Keep the default automatic so seasonal artwork can expire even in saved sessions.
export const DEFAULT_WALLPAPER = 'default';

export function emptySession(): SessionState {
  return { windows: [], focusedId: null, nextId: 1, desktop: DEFAULT_DESKTOP, wallpaper: DEFAULT_WALLPAPER };
}

export interface KernelState {
  filesystemVersion?: number;
  hostname: string;
  users: Record<string, UserAccount>;
  fs: DirNode;
  session: SessionState;
}

// The "message of the day" a terminal prints when it opens, as Ubuntu's does.
const MOTD = [
  'Welcome to TuxOS, a Linux system for learning.',
  '',
  ' * Type "help" to see the commands you can use.',
  ' * Press Tab to complete a command or file name, and Up to repeat one.',
].join('\n') + '\n';

// Same rule as useradd's default NAME_REGEX on Debian.
const USERNAME = /^[a-z_][a-z0-9_-]{0,31}$/;

export function createInitialState(username: string, hostname = 'tuxos', now = 0): KernelState {
  if (!USERNAME.test(username) || username === 'root') {
    throw new KernelError('EINVAL', `invalid username: ${JSON.stringify(username)}`);
  }
  const passwd = [
    'root:x:0:0:root:/root:/bin/bash',
    `${username}:x:1000:1000:${username}:/home/${username}:/bin/bash`,
  ].join('\n');
  const shadow = [
    'root:*:20000:0:99999:7:::',
    `${username}:$y$j9T$tuxos$notarealhash:20000:0:99999:7:::`,
  ].join('\n');

  const state: KernelState = {
    hostname,
    users: {
      root: { uid: 0, home: '/root' },
      [username]: { uid: 1000, home: `/home/${username}` },
    },
    fs: dir('root', 0o755, {
      bin: dir('root', 0o755, {}, now),
      dev: dir('root', 0o755, { null: file('root', 0o666, '', now) }, now),
      etc: dir('root', 0o755, {
        hostname: file('root', 0o644, hostname, now),
        motd: file('root', 0o644, MOTD, now),
        passwd: file('root', 0o644, passwd, now),
        // Password hashes live here, readable only by root, so `cat /etc/shadow` teaches permissions.
        shadow: file('root', 0o600, shadow, now),
      }, now),
      home: dir('root', 0o755, {
        [username]: dir(username, 0o755, {
          Documents: dir(username, 0o755, {}, now),
        }, now),
      }, now),
      root: dir('root', 0o700, {}, now),
      tmp: dir('root', 0o777, {}, now),
      usr: dir('root', 0o755, { bin: dir('root', 0o755, {}, now) }, now),
      var: dir('root', 0o755, { log: dir('root', 0o755, {}, now) }, now),
    }, now),
    session: emptySession(),
  };
  expandFilesystem(state, username, now);
  return state;
}

import type { SessionState } from '@tuxos/kernel';
import type { AppContribution } from '@tuxos/sdk';
import type { SystemClient } from '@tuxos/system';
import type { ComponentType } from 'react';
import type { Decoration, Insets } from '../desktop/WindowFrame';
import type { MenuItem } from './shared/Menu';

export type App = AppContribution & { moduleId: string };
export type PowerAction = 'lock' | 'logout' | 'restart' | 'shutdown';

/** What every desktop environment's shell (its panels, launcher and overview) gets to work with. */
export interface ShellProps {
  system: SystemClient;
  apps: App[];
  session: SessionState;
  user: string;
  open(appId: string): void;
  /** Bring a window forward, restoring it and switching to its workspace if needed. */
  activate(windowId: string): void;
  minimize(windowId: string): void;
  /** Close a window, letting its app ask about unsaved work first. */
  close(windowId: string): void;
  power(action: PowerAction): void;
  /** Open the learner's shared achievement tracker. */
  onAchievements?(): void;
  /** The desktop asks the shell to toggle its launcher (Super key). */
  launcherRequest: number;
  /** The current workspace, counting from 1. Desktops without workspaces stay on 1. */
  workspace: number;
  workspaceOf(windowId: string): number;
  switchWorkspace(workspace: number): void;
  moveToWorkspace(windowId: string, workspace: number): void;
}

/**
 * A desktop environment: its shell plus the few things the shared desktop needs to know about it.
 * Adding one means writing a Shell component and registering it in registry.ts.
 */
export interface DesktopEnvironment {
  id: string;
  /** Space its panels take; windows stay out of it. */
  insets: Insets;
  decoration: Decoration;
  /** What the desktop shows as icons: the apps, minimised windows (CDE), or nothing. */
  desktopIcons: 'apps' | 'minimized' | false;
  /** Names of its workspaces, or null when it has none. */
  workspaces: string[] | null;
  /** Windows arrange themselves side by side (Hyprland). */
  tiling: boolean;
  Shell: ComponentType<ShellProps>;
  /** Right-click menu on the empty desktop. */
  desktopMenu(actions: { open(appId: string): void; apps: App[]; power(action: PowerAction): void }): MenuItem[];
  /** Shown once, the first time a learner logs in to it. */
  welcome: string;
}

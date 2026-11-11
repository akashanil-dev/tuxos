import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { AppViewProps } from '@tuxos/system';

export type { AppViewProps } from '@tuxos/system';
type ViewModule = { default: ComponentType<AppViewProps> };

// Each app's window content, loaded only when its first window opens.
export const views: Record<string, () => Promise<ViewModule>> = {
  'learn-adventure': () => import('@tuxos/module-learn-adventure/view'),
  'try-linux': () => import('@tuxos/module-try-linux/view'),
  'know-your-distro': () => import('@tuxos/module-know-your-distro/view'),
  play: () => import('@tuxos/module-exploration/view'),
  'command-reference': () => import('@tuxos/module-exploration/view'),
  'exploration-achievements': () => import('@tuxos/module-exploration/view'),
  'pipe-dream': () => import('@tuxos/module-pipe-dream/view'),
  about: () => import('@tuxos/module-about/view'),
  terminal: () => import('@tuxos/module-terminal/view'),
  files: () => import('@tuxos/module-files/view'),
  editor: () => import('@tuxos/module-editor/view'),
  'learn-filesystem': () => import('@tuxos/module-learn-filesystem/view'),
  'learn-linux': () => import('@tuxos/module-learn-linux/view'),
  'learn-docker': () => import('@tuxos/module-learn-docker/view'),
  'chmod-arcade': () => import('@tuxos/module-chmod-arcade/view'),
  settings: () => import('@tuxos/module-settings/view'),
  plugins: () => import('./plugins/PluginManager'),
  'package-practice': () => import('./software/PackagePractice'),
  software: () => import('./software/SoftwareShop'),
};

const lazyViews = new Map<string, LazyExoticComponent<ComponentType<AppViewProps>>>();
export const dynamicViews = new Map<string, () => Promise<ViewModule>>();

export function registerView(appId: string, loader: () => Promise<ViewModule>): void {
  dynamicViews.set(appId, loader);
  lazyViews.delete(appId);
}

export function unregisterView(appId: string): void {
  dynamicViews.delete(appId);
  lazyViews.delete(appId);
}

export function getLazyView(appId: string): LazyExoticComponent<ComponentType<AppViewProps>> | null {
  const loader = dynamicViews.get(appId) ?? views[appId];
  if (!loader) return null;
  let component = lazyViews.get(appId);
  if (!component) {
    component = lazy(loader);
    lazyViews.set(appId, component);
  }
  return component;
}

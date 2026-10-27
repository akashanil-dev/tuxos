import type { DispatchResult, PluginManifest, PluginTheme } from './index';

export const PLUGIN_LIMITS = { packageBytes: 256 * 1024, totalBytes: 1024 * 1024, installed: 24, rpcBytes: 64 * 1024 };
export const PLUGIN_CAPABILITIES = {
  'fs:read': 'Read files in this plugin’s private storage',
  'fs:write': 'Create, change and delete files in this plugin’s private storage',
} as const;

/** A portable package. HTML, CSS and JavaScript are self-contained in html. */
export interface PluginPackage {
  format: 'tuxos-plugin';
  formatVersion: 1;
  manifest: PluginManifest;
  html: string;
}

export interface InstalledPlugin {
  id: string;
  manifest?: PluginManifest;
  status: 'enabled' | 'disabled' | 'invalid';
  bytes: number;
  error?: string;
}

export interface PluginApproval {
  approvedCapabilities: readonly string[];
  replace?: boolean;
}

export interface PluginManager {
  list(): Promise<InstalledPlugin[]>;
  install(value: unknown, approval: PluginApproval): Promise<void>;
  uninstall(id: string, options?: { deleteData?: boolean }): Promise<void>;
  setEnabled(id: string, enabled: boolean, approval?: PluginApproval): Promise<void>;
  export(id: string): Promise<PluginPackage>;
  app(appId: string): Promise<{ pluginId: string; package: PluginPackage; generation: number }>;
  reload(): Promise<void>;
  onChange(listener: () => void): () => void;
  isEnabled(id: string): boolean;
  generation(id: string): number | undefined;
  dispatch(id: string, type: string, payload: unknown): Promise<DispatchResult>;
}

export function validPluginId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{0,47}$/.test(value) && !['constructor', 'prototype'].includes(value);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string, max: number, optional = false): string {
  if (optional && value === undefined) return '';
  if (typeof value !== 'string' || (!optional && !value.trim()) || value.length > max || /[\u0000-\u001f]/.test(value)) {
    throw new Error(`${label} must be ${optional ? 'at most' : 'between 1 and'} ${max} characters.`);
  }
  return value;
}

export function validatePluginTheme(value: unknown): PluginTheme {
  const theme = object(value, 'Theme');
  if (!validPluginId(theme.id)) throw new Error('Invalid theme ID.');
  const name = string(theme.name, 'Theme name', 80);
  const colors = Object.fromEntries(['accent', 'background', 'surface', 'foreground'].map(key => {
    if (typeof theme[key] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(theme[key] as string)) throw new Error('Theme colours must be six-digit hex colours.');
    return [key, theme[key]];
  })) as Pick<PluginTheme, 'accent' | 'background' | 'surface' | 'foreground'>;
  return { id: theme.id, name, ...colors };
}

/** Validate unknown input before it reaches paths, module registration or the iframe. */
export function validatePluginManifest(value: unknown): PluginManifest {
  const m = object(value, 'Manifest');
  if (!validPluginId(m.id)) throw new Error('Plugin ID must start with a lowercase letter and contain only letters, digits and hyphens (48 characters maximum).');
  const version = string(m.version, 'Version', 32);
  if (!/^(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})$/.test(version)) throw new Error('Version must use major.minor.patch, for example 1.0.0.');
  const name = string(m.name, 'Name', 80);
  const description = string(m.description, 'Description', 500, true);
  const author = string(m.author, 'Author', 100, true);
  const icon = string(m.icon, 'Icon', 32, true);
  const entry = m.entry ?? 'index.html';
  if (typeof entry !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}\.html$/.test(entry)) throw new Error('Entry must be a simple HTML filename.');
  if (!Array.isArray(m.capabilities) || m.capabilities.length > 2) throw new Error('Capabilities must be a list of supported permissions.');
  const capabilities = m.capabilities.map((cap) => {
    if (typeof cap !== 'string' || !Object.hasOwn(PLUGIN_CAPABILITIES, cap)) throw new Error(`Unsupported plugin permission: ${String(cap)}. Root, shell and wildcard access are not supported.`);
    return cap;
  });
  if (new Set(capabilities).size !== capabilities.length) throw new Error('Duplicate plugin permission.');
  const contributes = object(m.contributes, 'Contributions');
  if (!Array.isArray(contributes.apps) || contributes.apps.length < 1 || contributes.apps.length > 4) throw new Error('A plugin must contribute between 1 and 4 apps.');
  const apps = contributes.apps.map((value) => {
    const app = object(value, 'App');
    if (!validPluginId(app.id)) throw new Error('Invalid app ID.');
    const title = string(app.title, 'App title', 80);
    const appIcon = string(app.icon, 'App icon', 32);
    const category = string(app.category, 'App category', 40, true) || 'Utilities';
    const appDescription = string(app.description, 'App description', 500, true);
    let defaultGeometry: { width: number; height: number } | undefined;
    if (app.defaultGeometry !== undefined) {
      const geometry = object(app.defaultGeometry, 'App geometry');
      if (!Number.isInteger(geometry.width) || !Number.isInteger(geometry.height)
        || Number(geometry.width) < 240 || Number(geometry.width) > 1600 || Number(geometry.height) < 160 || Number(geometry.height) > 1200) throw new Error('App dimensions must be 240–1600 × 160–1200 pixels.');
      defaultGeometry = { width: Number(geometry.width), height: Number(geometry.height) };
    }
    if (app.widget !== undefined && typeof app.widget !== 'boolean') throw new Error('Widget must be a boolean.');
    return { ...(app.widget === true ? { widget: true } : {}), id: app.id, title, icon: appIcon, category, description: appDescription, ...(defaultGeometry ? { defaultGeometry } : {}) };
  });
  if (new Set(apps.map((app) => app.id)).size !== apps.length) throw new Error('Duplicate app ID.');
  const rawCommands = contributes.commands ?? [];
  if (!Array.isArray(rawCommands) || rawCommands.length > 4) throw new Error('A plugin may contribute at most 4 launcher commands.');
  const commands = rawCommands.map((value) => {
    const command = object(value, 'Command');
    if (!validPluginId(command.name)) throw new Error('Invalid command name.');
    return { name: command.name, summary: string(command.summary, 'Command summary', 160), usage: string(command.usage, 'Command usage', 160, true) || command.name };
  });
  if (new Set(commands.map((cmd) => cmd.name)).size !== commands.length) throw new Error('Duplicate command name.');
  const rawThemes = contributes.themes ?? [];
  if (!Array.isArray(rawThemes) || rawThemes.length > 8) throw new Error('A plugin may include at most 8 theme presets.');
  const themes = rawThemes.map(validatePluginTheme);
  if (new Set(themes.map(theme => theme.id)).size !== themes.length) throw new Error('Duplicate theme ID.');
  return { id: m.id, name, version, description, capabilities, entry, ...(author ? { author } : {}), ...(icon ? { icon } : {}), contributes: { apps, commands, ...(themes.length ? { themes } : {}) } };
}

export function pluginBytes(value: unknown): number {
  // TextEncoder is absent in a few test/browser hosts; encodeURIComponent measures UTF-8 too.
  return encodeURIComponent(JSON.stringify(value)).replace(/%[A-F\d]{2}/gi, '_').length;
}

export function validatePluginPackage(value: unknown): PluginPackage {
  let parsed = value;
  if (typeof value === 'string') {
    if (value.length > PLUGIN_LIMITS.packageBytes) throw new Error('Plugin package exceeds 256 KB.');
    try { parsed = JSON.parse(value); } catch { throw new Error('Plugin package is not valid JSON.'); }
  }
  const pkg = object(parsed, 'Package');
  if (pluginBytes(pkg) > PLUGIN_LIMITS.packageBytes) throw new Error('Plugin package exceeds 256 KB.');
  if (pkg.format !== 'tuxos-plugin' || pkg.formatVersion !== 1) throw new Error('Expected a TuxOS plugin package with formatVersion 1.');
  const manifest = validatePluginManifest(pkg.manifest);
  if (typeof pkg.html !== 'string' || !pkg.html.trim() || pkg.html.includes('\u0000')) throw new Error('Package must contain non-empty HTML.');
  return { format: 'tuxos-plugin', formatVersion: 1, manifest, html: pkg.html };
}

export function approvePlugin(manifest: PluginManifest, approval: PluginApproval | undefined): void {
  if (!approval || !Array.isArray(approval.approvedCapabilities) || manifest.capabilities.some((cap) => !approval.approvedCapabilities.includes(cap))) {
    throw new Error('Review and approve this plugin’s requested permissions first.');
  }
}

export function comparePluginVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i]! - right[i]!;
  return 0;
}

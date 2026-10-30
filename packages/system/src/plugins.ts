import { KernelError, resolvePath, type Kernel, type ActionContext, type Stat, type VNode } from '@tuxos/kernel';
import { unlocked, approvePlugin, comparePluginVersions, pluginBytes, PLUGIN_LIMITS, validatePluginManifest, validatePluginPackage,
  validPluginId, type InstalledPlugin, type ModuleManifest, type PluginApproval, type PluginManager, type PluginPackage } from '@tuxos/sdk';
import type { ModuleHost } from '@tuxos/module-host';
import type { PluginLoaderHooks } from './plugin-loader';

const RESERVED = new Set(['plugins', 'plugin-manager', 'terminal', 'files', 'editor', 'settings', 'about', 'software', 'apt', 'learn-linux', 'learn-filesystem', 'learn-docker', 'chmod-arcade']);
interface Entry { info: InstalledPlugin; package?: PluginPackage; approved: string[]; }

/** Owns both persistent packages and their runtime registrations, scoped to one boot. */
export class ManagedPlugins implements PluginManager {
  private readonly entries = new Map<string, Entry>();
  private readonly registered = new Map<string, PluginPackage>();
  private readonly generations = new Map<string, number>();
  private nextGeneration = 0;
  private readonly listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private readonly base: string;
  private readonly data: string;

  constructor(private readonly kernel: Kernel, private readonly host: ModuleHost, private readonly hooks: PluginLoaderHooks,
    private readonly persist: () => Promise<void>) {
    this.base = `/home/${kernel.user}/.local/share/tuxos/plugins`;
    this.data = `/home/${kernel.user}/.local/share/tuxos/plugin-data`;
    kernel.register({ type: 'plugins.store', capability: 'plugins:manage', description: 'Store an approved plugin package.', mutates: true,
      run: ({ fs }, payload: { package: unknown; approved: string[]; enabled: boolean }) => {
        const pkg = validatePluginPackage(payload.package);
        approvePlugin(pkg.manifest, { approvedCapabilities: payload.approved });
        const path = `${this.base}/${pkg.manifest.id}`;
        fs.mkdir(path, { parents: true });
        fs.write(`${path}/manifest.json`, JSON.stringify(pkg.manifest));
        fs.write(`${path}/${pkg.manifest.entry}`, pkg.html);
        fs.write(`${path}/install.json`, JSON.stringify({ enabled: payload.enabled, approved: payload.approved }));
        fs.mkdir(`${this.data}/${pkg.manifest.id}`, { parents: true });
      } });
    kernel.register({ type: 'plugins.remove', capability: 'plugins:manage', description: 'Remove a plugin package.', mutates: true,
      run: ({ fs }, payload: { id: string; deleteData?: boolean }) => {
        this.removableId(payload.id);
        fs.remove(`${this.base}/${payload.id}`, { recursive: true });
        if (payload.deleteData) {
          try { fs.stat(`${this.data}/${payload.id}`); } catch (err) { if (err instanceof KernelError && err.code === 'ENOENT') return; throw err; }
          fs.remove(`${this.data}/${payload.id}`, { recursive: true });
        }
      } });
    for (const write of [false, true]) kernel.register({
      type: write ? 'plugins.storageWrite' : 'plugins.storageRead', capability: write ? 'fs:write' : 'fs:read',
      description: 'Access a plugin’s private storage.', mutates: write,
      run: (ctx, payload: { type: string; payload: Record<string, unknown> }) => this.storage(ctx, payload, write),
    });
  }

  onChange(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  isEnabled(id: string): boolean { return !this.disposed && this.entries.get(id)?.info.status === 'enabled' && this.registered.has(id); }
  generation(id: string): number | undefined { return this.isEnabled(id) ? this.generations.get(id) : undefined; }
  private requireUnlocked(): void {
    if (!unlocked(this.kernel.getState().session.journey, 'plugins')) throw new Error('Plugins unlock after lesson 26: Open-source maker.');
  }

  async list(): Promise<InstalledPlugin[]> { return structuredClone([...this.entries.values()].map((entry) => entry.info)); }
  async export(id: string): Promise<PluginPackage> {
    this.id(id);
    const pkg = this.entries.get(id)?.package;
    if (!pkg) throw new Error('This plugin package is unavailable or invalid.');
    return structuredClone(pkg);
  }
  async app(appId: string): Promise<{ pluginId: string; package: PluginPackage; generation: number }> {
    this.requireUnlocked();
    for (const [pluginId, pkg] of this.registered) {
      if (this.isEnabled(pluginId) && pkg.manifest.contributes.apps?.some((app) => app.id === appId)) {
        await this.host.activate(pluginId);
        if (!this.isEnabled(pluginId) || this.registered.get(pluginId) !== pkg) throw new Error('This plugin changed while opening. Try again.');
        return { pluginId, package: structuredClone(pkg), generation: this.generations.get(pluginId)! };
      }
    }
    throw new Error('This plugin is disabled or no longer installed.');
  }

  install(value: unknown, approval: PluginApproval): Promise<void> {
    let pkg: PluginPackage;
    try { pkg = validatePluginPackage(value); approvePlugin(pkg.manifest, approval); } catch (err) { return Promise.reject(err); }
    const accepted = { ...approval, approvedCapabilities: [...approval.approvedCapabilities] };
    return this.serialize(async () => {
      this.requireUnlocked();
      const id = pkg.manifest.id;
      this.id(id);
      const old = this.entries.get(id);
      if (old && !accepted.replace) throw new Error('This plugin is already installed. Choose Update to replace it.');
      if (old?.package && comparePluginVersions(pkg.manifest.version, old.package.manifest.version) < 0) throw new Error('Installing an older version is not supported.');
      if (!old && this.entries.size >= PLUGIN_LIMITS.installed) throw new Error('You can install at most 24 plugins.');
      const total = [...this.entries.values()].reduce((sum, entry) => sum + (entry.info.id === id ? 0 : entry.info.bytes), 0);
      if (total + pluginBytes(pkg) > PLUGIN_LIMITS.totalBytes) throw new Error('Installed plugin packages exceed the 1 MB limit. Remove a plugin first.');
      this.host.validate(this.moduleManifest(pkg), this.registered.has(id) ? id : undefined);
      this.run('plugins.store', { package: pkg, approved: accepted.approvedCapabilities, enabled: true });
      await this.unregister(id);
      this.register(pkg);
      this.entries.set(id, { package: pkg, approved: [...pkg.manifest.capabilities], info: { id, manifest: pkg.manifest, status: 'enabled', bytes: pluginBytes(pkg) } });
      this.emit();
      await this.save('installed');
    });
  }

  uninstall(id: string, options: { deleteData?: boolean } = {}): Promise<void> {
    return this.serialize(async () => {
      this.removableId(id);
      if (!this.entries.has(id)) throw new Error('Plugin is not installed.');
      const removedApps = this.entries.get(id)?.info.manifest?.contributes.apps ?? [];
      this.run('plugins.remove', { id, deleteData: options.deleteData === true });
      for (const app of removedApps) this.run('session.setWidget', { appId: app.id, remove: true });
      await this.unregister(id);
      this.entries.delete(id);
      this.emit();
      await this.save('removed');
    });
  }

  setEnabled(id: string, enabled: boolean, approval?: PluginApproval): Promise<void> {
    return this.serialize(async () => {
      this.id(id);
      const entry = this.entries.get(id);
      if (!entry?.package || entry.info.status === 'invalid') throw new Error('This package is invalid. Import a valid replacement or remove it.');
      if (enabled === (entry.info.status === 'enabled')) return;
      if (enabled) {
        this.requireUnlocked();
        approvePlugin(entry.package.manifest, approval);
        this.host.validate(this.moduleManifest(entry.package));
      }
      this.run('plugins.store', { package: entry.package, approved: enabled ? [...entry.package.manifest.capabilities] : entry.approved, enabled });
      if (enabled) this.register(entry.package);
      else await this.unregister(id);
      entry.approved = [...entry.package.manifest.capabilities];
      entry.info.status = enabled ? 'enabled' : 'disabled';
      delete entry.info.error;
      this.emit();
      await this.save(enabled ? 'enabled' : 'disabled');
    });
  }

  reload(): Promise<void> {
    return this.serialize(async () => {
      this.entries.clear();
      const keep = new Set<string>();
      const listed = this.kernel.dispatch<Stat[]>({ type: 'fs.list', payload: { path: this.base } });
      if (!listed.ok) {
        for (const id of [...this.registered.keys()]) await this.unregister(id);
        this.emit(); return;
      }
      let total = 0;
      for (const [index, dir] of listed.value.filter((entry) => entry.kind === 'dir').entries()) {
        const info: InstalledPlugin = { id: dir.name, status: 'invalid', bytes: 0 };
        const entry: Entry = { info, approved: [] };
        this.entries.set(dir.name, entry);
        try {
          this.id(dir.name);
          if (index >= PLUGIN_LIMITS.installed) throw new Error('The 24-plugin limit has been exceeded. Remove a plugin to enable this package.');
          const manifest = validatePluginManifest(JSON.parse(this.read(`${this.base}/${dir.name}/manifest.json`)));
          if (manifest.id !== dir.name) throw new Error('Manifest ID does not match its directory.');
          const pkg = validatePluginPackage({ format: 'tuxos-plugin', formatVersion: 1, manifest, html: this.read(`${this.base}/${dir.name}/${manifest.entry}`) });
          entry.package = pkg;
          info.manifest = manifest;
          info.bytes = pluginBytes(pkg);
          total += info.bytes;
          if (total > PLUGIN_LIMITS.totalBytes) throw new Error('Installed packages exceed the 1 MB limit.');
          info.status = 'disabled';
          let metadata: { enabled?: unknown; approved?: unknown };
          try { metadata = JSON.parse(this.read(`${this.base}/${dir.name}/install.json`)); } catch {
            info.error = 'Imported from an older save. Review permissions to enable this plugin.';
            continue;
          }
          if (!metadata || !Array.isArray(metadata.approved) || !metadata.approved.every((cap) => typeof cap === 'string')) throw new Error('Invalid saved permission approval.');
          entry.approved = metadata.approved as string[];
          approvePlugin(manifest, { approvedCapabilities: entry.approved });
          if (metadata.enabled === true) {
            if (JSON.stringify(this.registered.get(manifest.id)) !== JSON.stringify(pkg)) {
              await this.unregister(manifest.id);
              this.host.validate(this.moduleManifest(pkg));
              this.register(pkg);
            }
            keep.add(manifest.id);
            info.status = 'enabled';
          }
        } catch (err) { info.status = 'invalid'; info.error = err instanceof Error ? err.message : String(err); }
      }
      for (const id of [...this.registered.keys()]) if (!keep.has(id)) await this.unregister(id);
      const unavailableApps = new Set([...this.entries.values()].filter((entry) => entry.info.status !== 'enabled')
        .flatMap((entry) => entry.package?.manifest.contributes.apps?.map((app) => app.id) ?? []));
      for (const window of [...this.kernel.getState().session.windows]) if (unavailableApps.has(window.appId)) {
        this.kernel.dispatch({ type: 'session.close', payload: { id: window.id } });
      }
      this.emit();
    });
  }

  async dispatch(id: string, type: string, payload: unknown) {
    if (!this.isEnabled(id)) return { ok: false as const, error: { code: 'EPERM', message: 'Plugin is disabled or uninstalled.' } };
    const write = ['fs.write', 'fs.mkdir', 'fs.remove'].includes(type);
    if (!write && !['fs.read', 'fs.list', 'fs.stat'].includes(type)) return { ok: false as const, error: { code: 'EPERM', message: 'Plugins may only access their private files.' } };
    const result = this.kernel.dispatch({ type: write ? 'plugins.storageWrite' : 'plugins.storageRead', payload: { type, payload } }, { actor: { kind: 'module', id } });
    if (write && result.ok) {
      try { await this.save('data saved'); } catch (err) { return { ok: false as const, error: { code: 'EIO', message: err instanceof Error ? err.message : String(err) } }; }
    }
    return result;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await this.queue;
    for (const id of [...this.registered.keys()]) await this.unregister(id);
    this.listeners.clear();
  }

  private storage(ctx: ActionContext, request: { type: string; payload: Record<string, unknown> }, write: boolean): unknown {
    const id = ctx.actor.id;
    if (ctx.actor.kind !== 'module' || !this.isEnabled(id)) throw new KernelError('EPERM', 'Plugin is disabled or uninstalled.');
    const base = `${this.data}/${id}`;
    const payload = request?.payload;
    if (!payload || typeof payload.path !== 'string') throw new KernelError('EINVAL', 'A private storage path is required.');
    if (payload.path.length > 2048 || payload.path.split('/').some(part => part.length > 255) || /[\u0000-\u001f]/.test(payload.path)) throw new KernelError('EINVAL', 'Invalid private storage path.');
    if (payload.path.split('/').some((part) => ['__proto__', 'constructor', 'prototype'].includes(part))) throw new KernelError('EINVAL', 'Unsupported storage filename.');
    const path = resolvePath(payload.path, base);
    if (path !== base && !path.startsWith(`${base}/`)) throw new KernelError('EPERM', 'Plugins may only access their private storage.');
    if (path.slice(base.length).split('/').length > 9) throw new KernelError('EINVAL', 'Plugin storage paths may have at most 8 levels.');
    if (!write) {
      if (request.type === 'fs.read') return ctx.fs.read(path);
      if (request.type === 'fs.list') return ctx.fs.list(path);
      if (request.type === 'fs.stat') return ctx.fs.stat(path);
      throw new KernelError('EPERM', 'Unsupported plugin action.');
    }
    if (request.type === 'fs.write' && typeof payload.content === 'string') ctx.fs.write(path, payload.content, { append: payload.append === true });
    else if (request.type === 'fs.mkdir') ctx.fs.mkdir(path, { parents: payload.parents === true });
    else if (request.type === 'fs.remove' && path !== base) ctx.fs.remove(path, { recursive: payload.recursive === true });
    else throw new KernelError('EINVAL', 'Unsupported write or missing content.');
    const find = (target: string) => {
      let node: VNode = ctx.state.fs;
      for (const part of target.split('/').filter(Boolean)) {
        if (node.kind !== 'dir' || !Object.hasOwn(node.children, part)) throw new KernelError('ENOENT', 'Private storage is missing.');
        node = node.children[part]!;
      }
      return node;
    };
    const count = (node: VNode): { bytes: number; nodes: number } => {
      if (node.kind === 'file') return { bytes: pluginBytes(node.content), nodes: 1 };
      return Object.values(node.children).map(count).reduce((sum, child) => ({ bytes: sum.bytes + child.bytes, nodes: sum.nodes + child.nodes }), { bytes: 0, nodes: 1 });
    };
    const usage = count(find(base));
    if (usage.bytes > 128 * 1024 || usage.nodes > 128) throw new KernelError('ENOSPC', 'Plugin storage limit reached (128 KB / 128 entries).');
    const total = count(find(this.data));
    if (total.bytes > 1024 * 1024 || total.nodes > 2048) throw new KernelError('ENOSPC', 'Total plugin data exceeds the 1 MB / 2048 entry limit.');
  }

  private moduleManifest(pkg: PluginPackage): ModuleManifest {
    const m = pkg.manifest;
    if (m.contributes.apps?.some((app) => RESERVED.has(app.id))) throw new Error('A plugin cannot replace a built-in app.');
    return { id: m.id, title: m.name, version: m.version, capabilities: [...m.capabilities],
      activation: (m.contributes.apps ?? []).map((app) => `onApp:${app.id}` as const),
      contributes: { apps: [...m.contributes.apps ?? []], commands: [...m.contributes.commands ?? []] } };
  }

  private register(pkg: PluginPackage): void {
    const manifest = this.moduleManifest(pkg);
    this.host.add(manifest, async () => ({ manifest, activate: (ctx) => {
      for (const command of pkg.manifest.contributes.commands ?? []) ctx.registerCommand({ ...command, usage: command.usage ?? command.name,
        run: (shell) => {
          const app = manifest.contributes.apps![0]!;
          const opened = shell.dispatch('session.open', { appId: app.id, title: app.title });
          if (!opened.ok) { shell.stderr(`${command.name}: ${opened.error.message}\n`); return 1; }
          return 0;
        } });
    } }));
    this.registered.set(manifest.id, pkg);
    this.generations.set(manifest.id, ++this.nextGeneration);
    for (const app of manifest.contributes.apps ?? []) this.hooks.onRegisterAppView?.(app.id);
  }

  private async unregister(id: string): Promise<void> {
    const pkg = this.registered.get(id);
    if (!pkg) return;
    this.registered.delete(id);
    this.generations.delete(id);
    const apps = new Set(pkg.manifest.contributes.apps?.map((app) => app.id));
    await this.host.uninstall(id);
    for (const window of [...this.kernel.getState().session.windows]) if (apps.has(window.appId)) {
      this.kernel.dispatch({ type: 'session.close', payload: { id: window.id } });
    }
    for (const app of apps) this.hooks.onUnregisterAppView?.(app);
  }

  private run(type: string, payload: unknown): void {
    const result = this.kernel.dispatch({ type, payload });
    if (!result.ok) throw new Error(result.error.message);
  }
  private read(path: string): string {
    const result = this.kernel.dispatch<string>({ type: 'fs.read', payload: { path } });
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  }
  private id(id: string): void {
    if (!validPluginId(id) || RESERVED.has(id)) throw new Error('Invalid or reserved plugin ID.');
  }
  private removableId(id: string): void {
    if (!/^[a-zA-Z0-9_-]{1,255}$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id) || RESERVED.has(id)) throw new Error('Invalid plugin directory.');
  }
  private serialize(work: () => Promise<void>): Promise<void> {
    const task = this.queue.then(() => { if (this.disposed) throw new Error('This system session has ended.'); return work(); });
    this.queue = task.catch(() => undefined);
    return task;
  }
  private emit(): void { for (const listener of this.listeners) listener(); }
  private async save(operation: string): Promise<void> {
    if (this.disposed) throw new Error('This system session has ended.');
    try { await this.persist(); } catch (err) { throw new Error(`Plugin ${operation} for this session, but saving failed. Retry saving before leaving: ${err instanceof Error ? err.message : String(err)}`); }
  }
}

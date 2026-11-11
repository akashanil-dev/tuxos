import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalSystem, type SystemClient } from './index';
import { validatePluginPackage, type PluginPackage } from '@tuxos/sdk';

const systems: SystemClient[] = [];
afterEach(async () => { for (const system of systems.splice(0)) await system.reset().catch(() => undefined); });
export const example = (id = 'example'): PluginPackage => validatePluginPackage({ format: 'tuxos-plugin', formatVersion: 1,
  manifest: { id, name: 'Example Plugin', version: '1.0.0', description: 'An example', capabilities: ['fs:read', 'fs:write'],
    contributes: { apps: [{ id: `${id}-app`, title: 'Example App', icon: '🧩' }, { id: `${id}-second`, title: 'Second App', icon: '🧩' }], commands: [{ name: `${id}-launch`, summary: 'Launch the app' }] } }, html: '<h1>Example</h1>' });

async function setup() {
  const saved = new Map<string, string>();
  const writes = vi.fn(async (key: string, value: string) => { saved.set(key, value); });
  const register = vi.fn(), unregister = vi.fn();
  const system = createLocalSystem({ modules: [], storage: { get: async k => saved.get(k) ?? null, set: writes, remove: async k => { saved.delete(k); } },
    plugins: { onRegisterAppView: register, onUnregisterAppView: unregister } });
  systems.push(system);
  await system.boot('ada');
  const manager = system.plugins!();
  const install = async (pkg = example(), replace = false) => manager.install(pkg, { approvedCapabilities: pkg.manifest.capabilities, replace });
  return { system, manager, saved, writes, register, unregister, install };
}

describe('managed plugin lifecycle', () => {
  it('installs immediately, launches distinct app IDs and launcher commands, and saves the full package', async () => {
    const { system, manager, install, register, saved } = await setup();
    const appsChanged = vi.fn(); system.onAppsChange!(appsChanged);
    await install();
    expect(register.mock.calls.map(call => call[0])).toEqual(['example-app', 'example-second']);
    expect(appsChanged).toHaveBeenCalledTimes(1);
    expect((await system.apps()).map(app => app.id)).toEqual(['example-app', 'example-second']);
    expect(await system.openApp('example-app')).toMatchObject({ ok: true });
    const shell = await system.createTerminal();
    expect((await shell.run('example-launch')).code).toBe(0);
    expect((await system.session()).windows).toHaveLength(2);
    expect((await manager.app('example-second')).pluginId).toBe('example');
    expect(await manager.export('example')).toEqual(example());
    expect(saved.get('tuxos.save')).toContain('Example</h1>');
  });

  it('closes all contributed windows, revokes access and removes commands; reinstall works', async () => {
    const { system, manager, install, unregister } = await setup();
    await install();
    await system.openApp('example-app'); await system.openApp('example-second');
    await manager.uninstall('example');
    expect(await system.apps()).toEqual([]);
    expect((await system.session()).windows).toEqual([]);
    expect(unregister).toHaveBeenCalledTimes(2);
    expect(await manager.dispatch('example', 'fs.read', { path: '.' })).toMatchObject({ ok: false, error: { code: 'EPERM' } });
    const shell = await system.createTerminal();
    expect((await shell.run('example-launch')).code).toBe(127);
    expect(await shell.complete('example-', 8)).toMatchObject({ candidates: [] });
    await install();
    expect((await shell.run('example-launch')).code).toBe(0);
  });

  it('disables immediately, preserves private data, and requires fresh review to enable', async () => {
    const { system, manager, install } = await setup();
    await install(); await system.openApp('example-app');
    expect(await manager.dispatch('example', 'fs.write', { path: 'notes.txt', content: 'keep me' })).toMatchObject({ ok: true });
    await manager.setEnabled('example', false);
    expect((await system.session()).windows).toHaveLength(0);
    expect(await system.openApp('example-app')).toMatchObject({ ok: false });
    await expect(manager.setEnabled('example', true)).rejects.toThrow('approve');
    await manager.setEnabled('example', true, { approvedCapabilities: ['fs:read', 'fs:write'] });
    await system.openApp('example-app');
    expect(await manager.dispatch('example', 'fs.read', { path: 'notes.txt' })).toMatchObject({ ok: true, value: 'keep me' });
  });

  it('preserves data on remove by default and deletes it only when explicitly selected', async () => {
    const { system, manager, install } = await setup();
    await install(); await system.openApp('example-app');
    await manager.dispatch('example', 'fs.write', { path: 'note', content: 'keep' });
    await manager.uninstall('example'); await install(); await system.openApp('example-app');
    expect(await manager.dispatch('example', 'fs.read', { path: 'note' })).toMatchObject({ ok: true, value: 'keep' });
    await manager.uninstall('example', { deleteData: true }); await install(); await system.openApp('example-app');
    expect(await manager.dispatch('example', 'fs.read', { path: 'note' })).toMatchObject({ ok: false, error: { code: 'ENOENT' } });
  });

  it('updates packages, preserves data, rejects downgrades and failed preflight without disturbing the old app', async () => {
    const { system, manager, install } = await setup();
    await install(); await install(example('another'));
    await system.openApp('example-app');
    const update = example(); update.manifest = { ...update.manifest, version: '1.1.0' }; update.html = '<h1>Updated</h1>';
    await install(update, true);
    expect((await manager.export('example')).html).toContain('Updated');
    await expect(install(example(), true)).rejects.toThrow('older');
    await system.openApp('example-app');
    const conflict = example(); conflict.manifest = { ...conflict.manifest, version: '1.2.0', contributes: { apps: [{ id: 'another-app', title: 'Conflict', icon: 'x' }] } };
    await expect(install(conflict, true)).rejects.toThrow('already claimed');
    expect((await manager.export('example')).html).toContain('Updated');
    expect((await system.session()).windows.some(win => win.appId === 'example-app')).toBe(true);
  });

  it('reload is idempotent and restores enabled and disabled packages across boots', async () => {
    const { system, manager, install, register } = await setup();
    await install(); await system.openApp('example-app');
    const window = (await system.session()).windows[0]!;
    await manager.reload(); await manager.reload();
    expect(register).toHaveBeenCalledTimes(2);
    expect((await system.session()).windows[0]?.id).toBe(window.id);
    await system.flush(); await system.boot('ada');
    expect(system.plugins!().isEnabled('example')).toBe(true);
    expect((await system.session()).windows[0]?.id).toBe(window.id);
    await system.plugins!().setEnabled('example', false);
    await system.boot('ada');
    expect(await system.apps()).toEqual([]);
    expect((await system.plugins!().list())[0]?.status).toBe('disabled');
  });

  it('does not restore privileges from a legacy manifest without permission approval', async () => {
    const { system, manager } = await setup();
    const path = '/home/ada/.local/share/tuxos/plugins/example';
    await system.dispatch('fs.mkdir', { path, parents: true });
    await system.dispatch('fs.write', { path: `${path}/manifest.json`, content: JSON.stringify(example().manifest) });
    await system.dispatch('fs.write', { path: `${path}/index.html`, content: example().html });
    await manager.reload();
    expect((await manager.list())[0]).toMatchObject({ status: 'disabled', error: expect.stringContaining('older save') });
    expect(await system.apps()).toEqual([]);
    await manager.setEnabled('example', true, { approvedCapabilities: ['fs:read', 'fs:write'] });
    expect((await system.apps()).length).toBe(2);
  });

  it('allows an imported disabled package to request fresh approval without inheriting old permissions', async () => {
    const { system, manager, install } = await setup();
    await install();
    await system.dispatch('fs.write', { path: '/home/ada/.local/share/tuxos/plugins/example/install.json', content: '{"enabled":false,"approved":[]}' });
    await manager.reload();
    expect((await manager.list())[0]?.status).toBe('disabled');
    expect(await system.apps()).toEqual([]);
    await expect(manager.setEnabled('example', true)).rejects.toThrow('approve');
    await manager.setEnabled('example', true, { approvedCapabilities: ['fs:read', 'fs:write'] });
    expect(manager.isEnabled('example')).toBe(true);
  });

  it('reports corrupt packages without failing boot; they can be removed', async () => {
    const { system, manager } = await setup();
    await system.dispatch('fs.mkdir', { path: '/home/ada/.local/share/tuxos/plugins/broken', parents: true });
    await system.dispatch('fs.write', { path: '/home/ada/.local/share/tuxos/plugins/broken/manifest.json', content: '{bad' });
    await manager.reload();
    expect((await manager.list())[0]).toMatchObject({ id: 'broken', status: 'invalid' });
    await manager.uninstall('broken');
    expect(await manager.list()).toEqual([]);
  });

  it('rejects malformed permission records and reconciles deleted package files', async () => {
    const { system, manager, install } = await setup();
    await install(); await system.openApp('example-app');
    await system.dispatch('fs.write', { path: '/home/ada/.local/share/tuxos/plugins/example/install.json', content: '{"enabled":true,"approved":[]}' });
    await manager.reload();
    expect(manager.isEnabled('example')).toBe(false);
    expect((await manager.list())[0]?.status).toBe('invalid');
    expect((await system.session()).windows).toEqual([]);
    await system.dispatch('fs.remove', { path: '/home/ada/.local/share/tuxos/plugins/example', recursive: true });
    await manager.reload();
    expect(await manager.list()).toEqual([]);
  });

  it('rolls back failed package writes before changing the runtime', async () => {
    const { system, manager, install } = await setup();
    await install(); await system.openApp('example-app');
    await system.dispatch('fs.chmod', { path: '/home/ada/.local/share/tuxos/plugins/example/index.html', mode: 0o400 });
    const update = example(); update.manifest = { ...update.manifest, version: '2.0.0' };
    await expect(install(update, true)).rejects.toThrow('Permission denied');
    expect((await manager.export('example')).manifest.version).toBe('1.0.0');
    const stored = await system.dispatch<string>('fs.read', { path: '/home/ada/.local/share/tuxos/plugins/example/manifest.json' });
    expect(stored.ok && JSON.parse(stored.value).version).toBe('1.0.0');
    expect(manager.isEnabled('example')).toBe(true);
    expect((await system.session()).windows).toHaveLength(1);
  });

  it('does not install reserved IDs, app collisions or packages without approval', async () => {
    const { manager, install } = await setup();
    await expect(install(example('terminal'))).rejects.toThrow('reserved');
    const reservedApp = example(); reservedApp.manifest = { ...reservedApp.manifest, contributes: { apps: [{ id: 'editor', title: 'Editor', icon: 'x' }] } };
    await expect(install(reservedApp)).rejects.toThrow('built-in');
    await expect(manager.install(example(), { approvedCapabilities: [] })).rejects.toThrow('approve');
    expect(await manager.list()).toEqual([]);
  });

  it('serializes concurrent installs and survives an unsuccessful operation', async () => {
    const { manager, install } = await setup();
    const results = await Promise.allSettled([install(), install()]);
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
    await install(example('second'));
    expect(await manager.list()).toHaveLength(2);
  });

  it('reports save failures without claiming durable installation, and allows a save retry', async () => {
    const { system, manager, writes, install } = await setup();
    writes.mockRejectedValueOnce(new Error('Storage is full'));
    await expect(install()).rejects.toThrow('saving failed');
    expect(manager.isEnabled('example')).toBe(true);
    await system.flush();
  });

  it('reports private data save failures back to the plugin without pretending the write is durable', async () => {
    const { system, manager, writes, install } = await setup();
    await install(); await system.openApp('example-app');
    writes.mockRejectedValueOnce(new Error('Disk full'));
    expect(await manager.dispatch('example', 'fs.write', { path: 'note', content: 'unsaved' })).toMatchObject({ ok: false, error: { code: 'EIO', message: expect.stringContaining('saving failed') } });
    await system.flush();
  });

  it('invalidates managers captured from an earlier boot', async () => {
    const { system, manager, install } = await setup();
    await install();
    await system.boot('grace');
    expect(await system.apps()).toEqual([]);
    expect(await manager.dispatch('example', 'fs.read', { path: 'notes' })).toMatchObject({ ok: false });
    await expect(manager.uninstall('example')).rejects.toThrow('session has ended');
  });
});

describe('plugin storage boundaries', () => {
  it('rejects host files, traversal, other plugin files, system actions and prototype paths', async () => {
    const { system, manager, install } = await setup();
    await install(); await system.openApp('example-app');
    for (const path of ['/etc/hostname', '../../plugins/example/manifest.json', '../another/notes', '__proto__/x', 'constructor/x']) {
      expect(await manager.dispatch('example', 'fs.write', { path, content: 'bad' })).toMatchObject({ ok: false });
    }
    for (const type of ['session.open', 'plugins.store', 'plugins.remove', 'fs.chmod', 'shell.ran']) {
      expect(await manager.dispatch('example', type, {})).toMatchObject({ ok: false, error: { code: 'EPERM' } });
    }
    expect(await manager.dispatch('example', 'fs.remove', { path: '.', recursive: true })).toMatchObject({ ok: false });
  });

  it('enforces grants, quotas and rollback of an oversized write', async () => {
    const { system, manager, install } = await setup();
    const reader = example(); reader.manifest = { ...reader.manifest, capabilities: ['fs:read'] };
    await install(reader); await system.openApp('example-app');
    expect(await manager.dispatch('example', 'fs.write', { path: 'note', content: 'bad' })).toMatchObject({ ok: false, error: { code: 'EPERM' } });
    await install(example(), true); await system.openApp('example-app');
    await manager.dispatch('example', 'fs.write', { path: 'note', content: 'keep' });
    expect(await manager.dispatch('example', 'fs.write', { path: 'note', content: 'x'.repeat(129 * 1024) })).toMatchObject({ ok: false, error: { code: 'ENOSPC' } });
    expect(await manager.dispatch('example', 'fs.read', { path: 'note' })).toMatchObject({ ok: true, value: 'keep' });
  });
});

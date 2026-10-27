import { describe, expect, it } from 'vitest';
import { createKernel } from '../index';
import { validatePluginPackage } from '@tuxos/sdk';

const theme = { id: 'night', name: 'Night', accent: '#88c0d0', background: '#202630', surface: '#303640', foreground: '#eeeeee' };
describe('desktop extensions', () => {
  it('validates themes and widget geometry, enforces a pin limit and restores both from snapshots', () => {
    const kernel = createKernel({ username: 'ada' });
    expect(kernel.dispatch({ type: 'session.setTheme', payload: { theme: { ...theme, accent: 'url(https://example.test)' } } }).ok).toBe(false);
    expect(kernel.dispatch({ type: 'session.setTheme', payload: { theme } }).ok).toBe(true);
    expect(kernel.dispatch({ type: 'session.setWidget', payload: { appId: 'clock', x: NaN } }).ok).toBe(false);
    for (let i = 0; i < 8; i++) expect(kernel.dispatch({ type: 'session.setWidget', payload: { appId: `clock-${i}`, width: 1 } }).ok).toBe(true);
    expect(kernel.dispatch({ type: 'session.setWidget', payload: { appId: 'extra' } })).toMatchObject({ ok: false, error: { code: 'ENOSPC' } });
    const restored = createKernel({ snapshot: kernel.snapshot() });
    expect(restored.getState().session.theme).toEqual(theme);
    expect(restored.getState().session.widgets).toHaveLength(8);
    expect(restored.getState().session.widgets![0]!.width).toBe(240);
    expect(kernel.dispatch({ type: 'session.setWidget', payload: { appId: 'clock-0', remove: true } }).ok).toBe(true);
    expect(kernel.getState().session.widgets).toHaveLength(7);
    kernel.dispatch({ type: 'session.setTheme', payload: { theme: null } });
    expect(kernel.getState().session.theme).toBeUndefined();
  });

  it('consumes a terminal launch command exactly once, including across restoration', () => {
    const kernel = createKernel({ username: 'ada' });
    const opened = kernel.dispatch<string>({ type: 'session.open', payload: { appId: 'terminal', title: 'Terminal', args: { run: 'cmatrix' } } });
    if (!opened.ok) throw new Error('Could not open terminal');
    expect(kernel.dispatch({ type: 'session.consumeLaunch', payload: { id: opened.value } })).toEqual({ ok: true, value: 'cmatrix' });
    const restored = createKernel({ snapshot: kernel.snapshot() });
    expect(restored.dispatch({ type: 'session.consumeLaunch', payload: { id: opened.value } })).toEqual({ ok: true, value: undefined });
  });

  it('accepts declarative widget and theme extensions, but rejects executable CSS values', () => {
    const pkg = { format: 'tuxos-plugin', formatVersion: 1, manifest: { id: 'my-theme', name: 'My theme', version: '1.0.0', capabilities: [], contributes: { apps: [{ id: 'clock', title: 'Clock', icon: 'x', widget: true }], themes: [theme] } }, html: '<p>Hello</p>' };
    expect(validatePluginPackage(pkg).manifest.contributes).toMatchObject({ apps: [{ widget: true }], themes: [theme] });
    expect(() => validatePluginPackage({ ...pkg, manifest: { ...pkg.manifest, contributes: { ...pkg.manifest.contributes, themes: [{ ...theme, surface: 'red;display:none' }] } } })).toThrow('hex');
    expect(() => validatePluginPackage({ ...pkg, manifest: { ...pkg.manifest, contributes: { ...pkg.manifest.contributes, themes: [theme, theme] } } })).toThrow('Duplicate');
  });
});

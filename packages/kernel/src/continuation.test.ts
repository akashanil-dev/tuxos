import { describe, expect, it } from 'vitest';
import { JOURNEY_THEMES } from '@tuxos/sdk';
import { createKernel } from './index';

describe('continuation access and snapshot upgrades', () => {
  it('allows exploration while keeping course awards protected', () => {
    const kernel = createKernel({ username: 'ada', journey: true });
    for (const desktop of ['plasma', 'gnome', 'cde', 'hyprland']) {
      expect(kernel.dispatch({ type: 'session.setDesktop', payload: { desktop } }).ok).toBe(true);
    }
    expect(kernel.dispatch({ type: 'session.open', payload: { appId: 'files', title: 'Files' } }).ok).toBe(true);
    expect(kernel.dispatch({ type: 'session.setTheme', payload: { theme: JOURNEY_THEMES[1] } }).ok).toBe(true);
    expect(kernel.dispatch({ type: 'session.setWallpaper', payload: { wallpaper: 'gnu' } }).ok).toBe(true);
    expect(kernel.dispatch({ type: 'journey.record', payload: { lessons: ['first-words'], steps: [] } }).ok).toBe(false);
    expect(kernel.getState().session.journey?.lessons).toEqual([]);
    expect(kernel.dispatch({ type: 'session.setDesktop', payload: { desktop: 'unknown' } }).ok).toBe(false);
  });

  it('upgrades v1 without erasing explicit appearance, files, windows or mastery', () => {
    const old = createKernel({ username: 'ada', journey: true }).snapshot();
    old.version = 1;
    old.state.session.desktop = 'hyprland';
    old.state.session.wallpaper = 'kde-30th';
    old.state.session.theme = JOURNEY_THEMES[0];
    old.state.session.journey!.lessons = ['first-words'];
    delete old.state.exploration;
    delete old.state.session.preferences;
    const kernel = createKernel({ snapshot: old, journey: true });
    kernel.dispatch({ type: 'journey.reconcile', payload: {} });
    expect(kernel.snapshot().version).toBe(2);
    expect(kernel.getState().session).toMatchObject({ desktop: 'hyprland', wallpaper: 'kde-30th', theme: JOURNEY_THEMES[0], journey: { lessons: ['first-words'] }, appearanceGrants: ['anniversary'] });
    expect(kernel.getState().exploration).toMatchObject({ version: 1, achievements: {}, imports: [] });
    expect(kernel.dispatch({ type: 'session.setWallpaper', payload: { wallpaper: 'kde-30th' } }).ok).toBe(true);
    expect(old.state.exploration).toBeUndefined();
  });

  it('validates preferences atomically and retains them across a boot', () => {
    const kernel = createKernel({ username: 'ada' });
    expect(kernel.dispatch({ type: 'session.setPreferences', payload: { fastBoot: false, resume: 'learn', showVasu: false } }).ok).toBe(true);
    expect(kernel.dispatch({ type: 'session.setPreferences', payload: { fastBoot: true, resume: 'bad' } }).ok).toBe(false);
    const restored = createKernel({ snapshot: kernel.snapshot() });
    expect(restored.getState().session.preferences).toMatchObject({ fastBoot: false, resume: 'learn', showVasu: false, richVasu: false });
  });
});

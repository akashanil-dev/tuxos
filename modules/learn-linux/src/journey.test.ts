import { afterEach, expect, it } from 'vitest';
import { createLocalSystem, type SystemClient } from '@tuxos/system';
import { JOURNEY_LESSONS, REWARDS, DESKTOP_PACKAGES, desktopReward, desktopReady, JOURNEY_THEMES, journeyLevel, unlocked } from '@tuxos/sdk';
import { course, learnLinux } from './index';
import { apt } from '../../apt/src/index';
import { files } from '../../files/src/index';
import { about } from '../../about/src/index';
import { terminal } from '../../terminal/src/index';

let system: SystemClient;
const values = new Map<string, string>();
async function boot(journey = true) {
  system = createLocalSystem({ journey, storage: { get: async k => values.get(k) ?? null, set: async (k,v) => { values.set(k,v); }, remove: async k => { values.delete(k); } },
    modules: [learnLinux, apt, files, terminal, about].map(module => ({ manifest: module.manifest, load: async () => module })) });
  await system.boot('ada');
  return system;
}
afterEach(async () => { await system?.reset(); values.clear(); });
async function solve(index: number) {
  const lesson = course.lessons[index]!;
  expect((await system.dispatch('learn-linux.start', { lesson: lesson.id })).ok).toBe(true);
  const shell = await system.createTerminal({ learningModule: 'learn-linux' });
  for (const step of lesson.solution) {
    if (typeof step === 'string') await shell.run(step);
    else expect((await system.openApp(step.open)).ok).toBe(true);
  }
  expect((await system.session()).journey!.lessons, lesson.id).toContain(lesson.id);
}
it('locks features and future lessons, and viewing answers awards nothing', async () => {
  await boot();
  expect((await system.openApp('files')).ok).toBe(false);
  expect((await system.dispatch('session.setDesktop', { desktop: 'gnome' })).ok).toBe(false);
  expect((await system.dispatch('session.setWallpaper', { wallpaper: 'kde-30th' })).ok).toBe(false);
  expect((await system.dispatch('session.setTheme', { theme: JOURNEY_THEMES[0] })).ok).toBe(false);
  expect((await system.dispatch('learn-linux.start', { lesson: 'permissions' })).ok).toBe(false);
  expect((await system.dispatch('journey.record', { lessons: [...JOURNEY_LESSONS], steps: ['fake'] })).ok).toBe(false);
  await system.dispatch('learn-linux.start', { lesson: 'first-words' });
  expect(await system.dispatch('learn-linux.solution', {})).toEqual({ ok: true, value: 'whoami' });
  const shell = await system.createTerminal({ learningModule: 'learn-linux' });
  expect((await shell.run('/answer')).stdout).toContain('whoami');
  expect((await system.session()).journey!.steps).toEqual([]);
});
it('earns every milestone through the real curriculum, retains rewards on replay, and saves across boots', async () => {
  await boot();
  expect(course.lessons.map(l => l.id)).toEqual([...JOURNEY_LESSONS]);
  for (let i = 0; i < course.lessons.length; i++) {
    await solve(i);
    const progress = (await system.session()).journey!;
    expect(journeyLevel(progress)).toBe(i + 1);
    for (const reward of REWARDS) expect(unlocked(progress, reward.id), reward.id).toBe(reward.at <= i + 1);
    for (const desktop of DESKTOP_PACKAGES.filter(item => REWARDS.find(r => r.id === desktopReward(item.id))!.at === i + 1)) {
      expect((await system.dispatch('session.setDesktop', { desktop: desktop.id })).ok).toBe(false);
      const installer = await system.createTerminal();
      await installer.run('sudo apt update');
      expect((await installer.run(`sudo apt install -y ${desktop.package}`)).code).toBe(0);
      expect(desktopReady((await system.session()).journey, desktop.id)).toBe(true);
    }
    if (i === 1) expect((await system.openApp('files')).ok).toBe(true);
    if (i === 2) {
      expect((await system.dispatch('session.setWallpaper', { wallpaper: 'tux' })).ok).toBe(true);
      expect((await system.dispatch('session.setWallpaper', { wallpaper: 'kde-30th' })).ok).toBe(false);
    }
  }
  expect((await system.dispatch('session.setDesktop', { desktop: 'hyprland' })).ok).toBe(true);
  expect((await system.dispatch('session.setWallpaper', { wallpaper: 'kde-30th' })).ok).toBe(true);
  expect((await system.dispatch('session.setTheme', { theme: JOURNEY_THEMES[0] })).ok).toBe(true);
  const earned = (await system.session()).journey!;
  expect(earned.steps).toHaveLength(course.lessons.reduce((sum, l) => sum + l.steps.length, 0));
  await system.dispatch('journey.ack', { id: 'complete' });
  await solve(0);
  expect((await system.session()).journey!.steps).toEqual(earned.steps);
  await system.flush(); await system.boot('ada');
  const restored = await system.session();
  expect(restored.journey!.acknowledged).toContain('complete');
  expect(journeyLevel(restored.journey!)).toBe(34);
  expect(restored.wallpaper).toBe('kde-30th');
}, 20_000);
it('imports existing reviewed progress and resumes a question in the same working folder', async () => {
  await boot(false);
  await system.dispatch('learn-linux.start', { lesson: 'first-words' });
  let shell = await system.createTerminal({ learningModule: 'learn-linux' });
  for (const line of ['whoami', 'pwd', 'ls']) await shell.run(line);
  await system.flush();
  await boot();
  expect((await system.session()).journey!.lessons).toEqual(['first-words']);
  await system.dispatch('learn-linux.start', { lesson: 'moving-around' });
  shell = await system.createTerminal({ learningModule: 'learn-linux' });
  await shell.run('cd garden'); await system.flush(); await system.boot('ada');
  shell = await system.createTerminal({ learningModule: 'learn-linux' });
  expect(await shell.cwd()).toBe('/home/ada/garden');
  const result = await shell.run('ls -a');
  expect(result.feedback?.correct).toBe(true);
});

it('requires earned, confirmed desktop installs; cancellation, previews and retries keep state consistent', async () => {
  await boot();
  const installer = await system.createTerminal({ learningModule: 'desktop-installation' });
  await installer.run('sudo apt update');
  expect((await installer.run('sudo apt install -y kde-plasma-desktop')).stderr).toContain('unlocks after lesson 2');
  await solve(0); await solve(1);
  await system.dispatch('learn-linux.start', { lesson: course.lessons[2]!.id });
  const beforeInstallation = await system.dispatch('learn-linux.status', {});
  expect((await installer.run('apt install kde-plasma-desktop')).code).toBe(100);
  expect((await installer.run('sudo apt install -s kde-plasma-desktop')).code).toBe(0);
  expect(desktopReady((await system.session()).journey)).toBe(false);
  expect((await installer.run('sudo apt install kde-plasma-desktop', { readLine: async () => 'n' })).code).toBe(1);
  const abort = new AbortController();
  const cancelled = await installer.run('sudo apt install -y kde-plasma-desktop', {
    terminal: { columns: 80, rows: 24 }, signal: abort.signal,
    stdout: text => { if (text.includes('Downloading packages')) abort.abort(); },
  });
  expect(cancelled.code).toBe(130);
  expect(desktopReady((await system.session()).journey)).toBe(false);
  expect((await installer.run('dpkg -s kde-plasma-desktop')).code).toBe(1);
  const completed = await installer.run('sudo apt install kde-plasma-desktop', {
    terminal: { columns: 80, rows: 24 }, readLine: async () => 'y',
  });
  expect(completed.code).toBe(0);
  expect(completed.feedback).toBeUndefined();
  expect(await system.dispatch('learn-linux.status', {})).toEqual(beforeInstallation);
  expect(completed.stdout).toContain('100% Configuring');
  expect(desktopReady((await system.session()).journey)).toBe(true);
  expect((await installer.run('sudo apt install -y kde-plasma-desktop')).stdout).toContain('already the newest version');
  expect((await installer.run('sudo apt install -y gnome-core')).stderr).toContain('unlocks after lesson 7');
  expect((await installer.run('sudo apt remove -y kde-plasma-desktop')).stderr).toContain('desktop is in use');
  await system.flush(); await system.boot('ada');
  expect(desktopReady((await system.session()).journey)).toBe(true);
  expect((await system.openApp('files')).ok).toBe(true);
}, 10_000);

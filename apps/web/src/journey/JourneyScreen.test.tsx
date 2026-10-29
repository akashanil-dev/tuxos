import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createLocalSystem, type SystemClient } from '@tuxos/system';
import { learnLinux, course } from '../../../../modules/learn-linux/src/index';
import { terminal } from '../../../../modules/terminal/src/index';
import { apt } from '../../../../modules/apt/src/index';
import { files } from '../../../../modules/files/src/index';
import { JourneyScreen } from './JourneyScreen';

// xterm rendering needs a real canvas; lesson checks still use the real shell and kernel.
vi.mock('@tuxos/module-terminal/view', () => ({ TerminalSurface: ({ clipboardDisabled }: { clipboardDisabled?: boolean }) => <div aria-label="Learning terminal" data-clipboard-disabled={String(clipboardDisabled)} /> }));
let system: SystemClient;
afterEach(async () => { cleanup(); await system?.reset(); localStorage.clear(); });
async function setup() {
  const saves = new Map<string, string>();
  system = createLocalSystem({ journey: true,
    storage: { get: async k => saves.get(k) ?? null, set: async (k, v) => { saves.set(k, v); }, remove: async k => { saves.delete(k); } },
    modules: [learnLinux, terminal, files, apt].map(module => ({ manifest: module.manifest, load: async () => module })),
  });
  await system.boot('ada');
  render(<StrictMode><JourneyScreen system={system} onPower={() => {}} verifySudo={null} /></StrictMode>);
  await screen.findByRole('heading', { name: course.lessons[0]!.steps[0]!.task });
  await act(async () => {});
  return saves;
}

it('starts with one question, offers free help, and keeps the desktop locked', async () => {
  await setup();
  expect((screen.getByRole('button', { name: 'Desktop · unlock at lesson 2' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
  expect(screen.getByText(/Open the Terminal/, { selector: 'pre' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  await screen.findByText(/Try this: whoami/);
  expect((await system.session()).journey!.steps).toEqual([]);
  expect(screen.getByText('0 XP')).toBeTruthy();
  expect(screen.getByLabelText('Learning terminal').getAttribute('data-clipboard-disabled')).toBe('true');
  expect(document.querySelector('.journey-console')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Your rewards' }));
  const dialog = screen.getByRole('dialog', { name: 'Your reward map' });
  expect(dialog.textContent).toContain('After lesson 16');
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('updates questions, saves XP, automatically opens installed KDE, and can return to learning', async () => {
  const saves = await setup();
  let shell = await system.createTerminal({ learningModule: 'learn-linux' });
  await act(async () => { await shell.run('whoami'); });
  await screen.findByRole('heading', { name: course.lessons[0]!.steps[1]!.task });
  expect(screen.getByText('10 XP')).toBeTruthy();
  await act(async () => { await shell.run('pwd'); await shell.run('ls'); });
  const first = await screen.findByRole('dialog', { name: 'Reward unlocked' });
  expect(first.textContent).toContain('Terminal Explorer');
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Continue to next lesson →' }));
  await screen.findByRole('heading', { name: course.lessons[1]!.steps[0]!.task });
  shell = await system.createTerminal({ learningModule: 'learn-linux' });
  await act(async () => { for (const line of course.lessons[1]!.solution) if (typeof line === 'string') await shell.run(line); });
  expect((await screen.findByRole('dialog', { name: 'Reward unlocked' })).textContent).toContain('Hello, KDE!');
  fireEvent.click(screen.getByRole('button', { name: 'Set up KDE Plasma' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await screen.findByRole('heading', { name: 'Install your first desktop: KDE Plasma' });
  expect((screen.getByRole('button', { name: 'Install KDE to enter desktop' }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => { await shell.run('sudo apt update'); await shell.run('sudo apt install -y kde-plasma-desktop'); });
  await screen.findByRole('button', { name: 'Application Launcher' }, { timeout: 4000 });
  const trophy = screen.getByRole('button', { name: 'Achievements' });
  expect(trophy.getAttribute('title')).toContain('2/10 unlocked');
  fireEvent.click(screen.getByRole('button', { name: 'Achievements' }));
  const achievements = screen.getByRole('dialog', { name: 'Your reward map' });
  expect(screen.getByText('2/10 achievements earned')).toBeTruthy();
  expect(screen.getByRole('progressbar', { name: 'Progress toward Make it yours' }).getAttribute('value')).toBe('2');
  expect(screen.getByRole('progressbar', { name: 'Progress toward Make it yours' }).getAttribute('max')).toBe('3');
  fireEvent.keyDown(achievements, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('button', { name: '← Continue learning' })).toBeNull();
  expect(document.querySelector('.journey-return')).toBeNull();
  // Both the trophy panel and the existing Learn Linux launcher resume the same lesson.
  fireEvent.click(screen.getByRole('button', { name: 'Achievements' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue learning →' }));
  await screen.findByRole('heading', { name: course.lessons[2]!.steps[0]!.task });
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Explore desktop ↗' }));
  fireEvent.doubleClick(screen.getByTitle('Open Learn Linux'));
  await screen.findByRole('heading', { name: course.lessons[2]!.steps[0]!.task });
  fireEvent.click(screen.getByRole('button', { name: 'Explore desktop ↗' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Learn Linux' }).find(button => button.getAttribute('data-tutor-target') === 'task:learn-linux')!);
  expect((await system.session()).windows.some(window => window.appId === 'learn-linux')).toBe(false);
  expect(document.querySelector('.journey-console')).toBeNull();
  await screen.findByRole('heading', { name: course.lessons[2]!.steps[0]!.task });
  expect(screen.getByLabelText('Learning terminal').getAttribute('data-clipboard-disabled')).toBe('false');
  const windows = (await system.session()).windows.length;
  fireEvent.keyDown(window, { key: 't', ctrlKey: true, altKey: true });
  fireEvent.keyDown(window, { key: ' ', altKey: true });
  await act(async () => {});
  expect((await system.session()).windows).toHaveLength(windows);
  expect(screen.queryByRole('dialog', { name: 'KRunner' })).toBeNull();
  await system.flush();
  expect(JSON.parse(saves.get('tuxos.save')!).snapshot.state.session.journey.lessons).toEqual(['first-words', 'moving-around']);
  await act(async () => { await system.restartLearning(); });
  await screen.findByRole('heading', { name: course.lessons[0]!.steps[0]!.task });
  expect(screen.getByText('0 XP')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Application Launcher' })).toBeNull();
  expect(screen.getByLabelText('Learning terminal').getAttribute('data-clipboard-disabled')).toBe('true');
  expect((await system.session()).journey!.installedDesktops).toEqual([]);
  expect((await system.session()).windows).toEqual([]);
  const restarted = await system.createTerminal({ learningModule: 'learn-linux' });
  await act(async () => { await restarted.run('whoami'); });
  await screen.findByRole('heading', { name: course.lessons[0]!.steps[1]!.task });
  expect(screen.getByText('10 XP')).toBeTruthy();
  await system.flush();
  expect(JSON.parse(saves.get('tuxos.save')!).snapshot.state.session.journey.lessons).toEqual([]);

}, 10_000);

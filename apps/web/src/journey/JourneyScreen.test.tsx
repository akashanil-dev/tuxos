import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { createLocalSystem, type SystemClient } from '@tuxos/system';
import { course, learnLinux } from '@tuxos/module-learn-linux';
import { terminal } from '@tuxos/module-terminal';
import { files } from '@tuxos/module-files';
import { apt } from '@tuxos/module-apt';
import { JourneyScreen } from './JourneyScreen';

vi.mock('@tuxos/module-terminal/view', () => ({ TerminalSurface: ({ clipboardDisabled = false }: { clipboardDisabled?: boolean }) => <div aria-label="Learning terminal" data-clipboard-disabled={String(clipboardDisabled)} /> }));
let system: SystemClient;
afterEach(async () => { cleanup(); await system?.reset(); localStorage.clear(); });
async function setup(mode: 'desktop' | 'learn' = 'desktop') {
  const saves = new Map<string, string>();
  system = createLocalSystem({ journey: true,
    storage: { get: async k => saves.get(k) ?? null, set: async (k, v) => { saves.set(k, v); }, remove: async k => { saves.delete(k); } },
    modules: [learnLinux, terminal, files, apt].map(module => ({ manifest: module.manifest, load: async () => module })),
  });
  await system.boot('ada');
  await system.dispatch('session.setPreferences', { resume: mode });
  render(<StrictMode><JourneyScreen system={system} onPower={() => {}} verifySudo={null} /></StrictMode>);
  await act(async () => {});
  return saves;
}

it('opens the desktop without starting a course or requiring installation', async () => {
  await setup();
  await screen.findByRole('button', { name: 'Application Launcher' }, { timeout: 4000 });
  expect(screen.queryByLabelText('Learning terminal')).toBeNull();
  expect((await system.session()).journey?.lessons).toEqual([]);
  await act(async () => { expect((await system.openApp('files')).ok).toBe(true); });
  await screen.findByRole('button', { name: 'Close Files' });
});

it('uses the same learning window and terminal in focus and desktop views', async () => {
  await setup('learn');
  await screen.findByText(course.lessons[0]!.steps[0]!.task);
  const surface = screen.getByLabelText('Learning terminal');
  expect(surface.getAttribute('data-clipboard-disabled')).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: 'Return to window' }));
  expect(screen.getByLabelText('Learning terminal')).toBe(surface);
  expect((await system.session()).journey!.steps).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Explore desktop' }));
  await waitFor(async () => expect((await system.session()).preferences?.resume).toBe('desktop'));
  await act(async () => { await system.openApp('learn-linux'); });
  expect(screen.getByLabelText('Learning terminal')).toBe(surface);
  expect((await system.session()).windows.filter(w => w.appId === 'learn-linux')).toHaveLength(1);
});

it('keeps the terminal mounted across lessons, milestones and the rewards gallery', async () => {
  const saves = await setup('learn');
  await screen.findByText(course.lessons[0]!.steps[0]!.task);
  const surface = screen.getByLabelText('Learning terminal');
  const shell = await system.createTerminal({ learningModule: 'learn-linux' });
  await act(async () => { for (const line of ['whoami', 'pwd', 'ls']) await shell.run(line); });
  await screen.findByText('Terminal Explorer');
  expect(screen.queryByRole('dialog', { name: 'Reward unlocked' })).toBeNull();
  expect(screen.getByLabelText('Learning terminal')).toBe(surface);
  fireEvent.click(screen.getByRole('button', { name: 'View rewards' }));
  const gallery = screen.getByRole('dialog', { name: 'Your reward map' });
  expect(gallery.textContent).toContain('1/10 achievements earned');
  fireEvent.keyDown(gallery, { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss milestone' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Dismiss milestone' })).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: /Let’s begin/ }));
  await screen.findByText(course.lessons[1]!.steps[0]!.task);
  expect(screen.getByLabelText('Learning terminal')).toBe(surface);
  await system.flush();
  expect(JSON.parse(saves.get('tuxos.save')!).snapshot.state.session.journey.lessons).toEqual(['first-words']);
});

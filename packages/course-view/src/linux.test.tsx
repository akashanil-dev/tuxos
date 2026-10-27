import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createLocalSystem, type SystemClient } from '@tuxos/system';
import { learnLinux } from '@tuxos/module-learn-linux';
import course from '../../../modules/learn-linux/src/course.json';
import { LearningLabView } from './index';

// The terminal's rendering is covered by its own tests; use a real shell below to check lesson progression.
vi.mock('@tuxos/module-terminal/view', () => ({ TerminalSurface: () => <div aria-label="Practice terminal" /> }));
let system: SystemClient;
beforeEach(async () => {
  const data = new Map<string, string>();
  system = createLocalSystem({
    storage: { get: async key => data.get(key) ?? null, set: async (key, value) => { data.set(key, value); }, remove: async key => { data.delete(key); } },
    modules: [{ manifest: learnLinux.manifest, load: async () => learnLinux }],
  });
  await system.boot('ada');
});
afterEach(async () => { cleanup(); await system.reset(); });
const open = () => render(<LearningLabView system={system} courseId="learn-linux" variant="linux" />);

describe('Simple Linux learning path', () => {
  it('keeps the complete syllabus and resources behind collapsed stages, and searches across them', async () => {
    const { container } = open();
    await screen.findByRole('heading', { name: 'Learn Linux, one step at a time.' });
    expect(container.querySelectorAll('.curriculum-stage')).toHaveLength(7);
    expect(container.querySelectorAll('.curriculum-stage[open]')).toHaveLength(0);
    expect(container.querySelectorAll('.curriculum-lesson')).toHaveLength(course.lessons.length);
    for (const lesson of course.lessons) {
      expect(screen.getByRole('button', { name: `Start ${lesson.title}`, hidden: true })).toBeDefined();
      expect(screen.getAllByText(lesson.realLab).length).toBeGreaterThan(0);
    }
    const topic = course.lessons.at(-1)!;
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: topic.title } });
    expect(container.querySelectorAll('.curriculum-stage[open]')).toHaveLength(1);
    expect(screen.getByRole('button', { name: `Start ${topic.title}` })).toBeDefined();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no-such-topic' } });
    expect(screen.getByText(/No lessons found/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(container.querySelectorAll('.curriculum-stage')).toHaveLength(7);
    expect(container.querySelectorAll('.curriculum-stage[open]')).toHaveLength(0);
  });

  it('shows one task immediately, reveals help on demand, and resets help for the next step', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: /Let’s begin/ }));
    await screen.findByText(course.lessons[0]!.steps[0]!.task);
    expect(screen.getByLabelText('Practice terminal')).toBeDefined();
    const help = screen.getByText('Need help?').closest('details')!;
    expect(help.open).toBe(false);
    fireEvent.click(screen.getByText('Need help?'));
    expect(help.open).toBe(true);
    expect(screen.getByText(course.lessons[0]!.steps[0]!.teach)).toBeDefined();
    const typed = vi.fn();
    window.addEventListener('tuxos:terminal-type', typed);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Give me a hint' }));
      expect(typed.mock.calls[0]![0].detail).toMatchObject({ windowId: 'learn-linux-lab', data: '/hint\r' });
      fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
      expect(typed.mock.calls[1]![0].detail.data).toBe('/answer\r');
    } finally { window.removeEventListener('tuxos:terminal-type', typed); }
    const shell = await system.createTerminal({ learningModule: 'learn-linux' });
    await act(async () => { await shell.run('whoami'); });
    await screen.findByText(course.lessons[0]!.steps[1]!.task);
    expect(screen.queryByText(course.lessons[0]!.steps[0]!.task)).toBeNull();
    expect(screen.getByText('Need help?').closest('details')!.open).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '← Learning path' }));
    const next = within(await screen.findByRole('region', { name: 'Your next lesson' }));
    fireEvent.click(next.getByRole('button', { name: /Continue lesson/ }));
    await screen.findByText(course.lessons[0]!.steps[1]!.task);
    await act(async () => { await shell.run('pwd'); await shell.run('ls'); });
    await screen.findByText('1 of 34 lessons complete');
    expect(within(screen.getByRole('region', { name: 'Your next lesson' })).getByText(course.lessons[1]!.title)).toBeDefined();
  });

  it('recommends an unfinished lesson already in progress before an untouched lesson', async () => {
    await system.dispatch('learn-linux.start', { lesson: 'moving-around' });
    const shell = await system.createTerminal({ learningModule: 'learn-linux' });
    await shell.run('cd garden');
    await system.dispatch('learn-linux.quit', {});
    open();
    const next = within(await screen.findByRole('region', { name: 'Your next lesson' }));
    expect(next.getByText('Moving around')).toBeDefined();
    fireEvent.click(next.getByRole('button', { name: /Continue lesson/ }));
    await screen.findByText(course.lessons[1]!.steps[1]!.task);
  });
});

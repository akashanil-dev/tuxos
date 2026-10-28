import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createLocalSystem } from '@tuxos/system';
import { createKernel } from '@tuxos/kernel';
import { learnFilesystem } from './index';
import { TOPICS, expandPath } from './topics';
import FilesystemView from './view';

afterEach(cleanup);
async function setup() {
  const values = new Map<string, string>();
  const system = createLocalSystem({ storage: { get: async k => values.get(k) ?? null, set: async (k,v) => { values.set(k,v); }, remove: async k => { values.delete(k); } }, modules: [{ manifest: learnFilesystem.manifest, load: async () => learnFilesystem }] });
  await system.boot('ada');
  render(<FilesystemView system={system} windowId="guide" />);
  await screen.findByRole('heading', { name: '/ Start at the root' });
  return system;
}
it('has real virtual entries behind every teaching link', () => {
  const kernel = createKernel({ username: 'ada' });
  for (const t of TOPICS) for (const p of [t.path, ...t.items.map(i => i[0])]) expect(kernel.dispatch({ type: 'fs.stat', payload: { path: expandPath(p, '/home/ada') } }, { user: 'root' }).ok, p).toBe(true);
});
it('explores folders and only saves progress for the right answer', async () => {
  const system = await setup();
  const open = vi.spyOn(system, 'openApp').mockResolvedValue({ ok: true, value: 'files' });
  fireEvent.click(screen.getByRole('button', { name: 'Open folder in Files ↗' }));
  expect(open).toHaveBeenCalledWith('files', { path: '/' });
  fireEvent.click(screen.getByRole('button', { name: 'At /root' }));
  expect(screen.getByRole('status').textContent).toContain('Not quite');
  fireEvent.click(screen.getByRole('button', { name: 'At /' }));
  await screen.findByText('You got it! Progress saved.');
  cleanup();
  await system.boot('ada');
  render(<FilesystemView system={system} windowId="guide" />);
  expect(await screen.findByText('1/27 explored')).toBeTruthy();
});
it('saves and restores a practice copy without modifying real configuration', async () => {
  const system = await setup();
  const original = await system.dispatch('fs.read', { path: '/etc/hostname' });
  fireEvent.click(screen.getByRole('button', { name: 'Configuration lab' }));
  const area = await screen.findByRole('textbox', { name: 'Practice configuration' });
  await waitFor(() => expect((area as HTMLTextAreaElement).disabled).toBe(false));
  fireEvent.change(area, { target: { value: 'wrong' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save & check' }));
  await screen.findByText(/does not match the goal/);
  fireEvent.change(area, { target: { value: 'penguin-lab\n' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save & check' }));
  await screen.findByText(/Well done!/);
  expect(await system.dispatch('fs.read', { path: '/home/ada/Documents/filesystem-lab/hostname/practice.conf' })).toEqual({ ok: true, value: 'penguin-lab\n' });
  expect(await system.dispatch('fs.read', { path: '/etc/hostname' })).toEqual(original);
  fireEvent.click(screen.getByRole('button', { name: 'Restore practice backup' }));
  await screen.findByText('Practice backup restored. Try the exercise again.');
  expect((area as HTMLTextAreaElement).value).toBe('tuxos\n');
  await act(async () => { await system.flush(); });
});

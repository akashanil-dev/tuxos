import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createLocalSystem, type KeyValueStorage, type SystemClient } from '@tuxos/system';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { files } from './index';
import { formatSize, nameError, parentOf, sortEntries } from './model';
import FilesView from './view';

const memory = (): KeyValueStorage => {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  };
};

async function renderFiles(): Promise<SystemClient> {
  const system = createLocalSystem({
    storage: memory(),
    modules: [{ manifest: files.manifest, load: async () => files }],
  });
  await system.boot('ada');
  render(<FilesView system={system} windowId="window-1" />);
  await screen.findByText('Documents');
  return system;
}

afterEach(() => cleanup());

describe('Files', () => {
  it('opens a requested system folder and provides a shortcut to the root', async () => {
    const system = createLocalSystem({ storage: memory(), modules: [{ manifest: files.manifest, load: async () => files }] });
    await system.boot('ada');
    render(<FilesView system={system} windowId="folder" args={{ path: '/etc/ssh' }} />);
    expect(await screen.findByText('sshd_config')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Location').value).toBe('/etc/ssh');
    fireEvent.click(screen.getByRole('button', { name: 'Filesystem /' }));
    expect(await screen.findByText('proc')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Location').value).toBe('/');
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(await screen.findByText('Documents')).toBeTruthy();
  });

  it('opens in the home folder and enters a folder on double-click', async () => {
    await renderFiles();
    expect(screen.getByLabelText<HTMLInputElement>('Location').value).toBe('/home/ada');
    fireEvent.doubleClick(screen.getByText('Documents'));
    expect(await screen.findByText('This folder is empty.')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Location').value).toBe('/home/ada/Documents');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Documents')).toBeTruthy();
  });

  it('shows the kernel error for a folder the learner may not open', async () => {
    await renderFiles();
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: '/root' } });
    fireEvent.submit(screen.getByLabelText('Location').closest('form')!);
    expect((await screen.findByRole('alert')).textContent).toBe('Can’t open “/root”: Permission denied');
  });

  it('refreshes when a file is created from somewhere else, like the terminal', async () => {
    const system = await renderFiles();
    const terminal = await system.createTerminal();
    await act(async () => { await terminal.run('touch from-terminal.txt'); });
    expect(await screen.findByText('from-terminal.txt')).toBeTruthy();
  });

  it('creates a folder, rejecting bad names first', async () => {
    const system = await renderFiles();
    fireEvent.click(screen.getByRole('button', { name: 'New Folder' }));
    fireEvent.change(screen.getByLabelText('Folder name'), { target: { value: 'a/b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect((await screen.findByRole('alert')).textContent).toContain('cannot contain “/”');
    fireEvent.change(screen.getByLabelText('Folder name'), { target: { value: 'projects' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('projects')).toBeTruthy();
    expect(await system.dispatch('fs.stat', { path: '/home/ada/projects' })).toMatchObject({ ok: true });
  });

  it('deletes only after confirmation', async () => {
    const system = await renderFiles();
    fireEvent.click(screen.getByText('Documents'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alertdialog').textContent).toContain('and everything in it');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await system.dispatch('fs.stat', { path: '/home/ada/Documents' })).toMatchObject({ ok: true });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!);
    await waitFor(() => expect(screen.queryByText('Documents')).toBeNull());
  });

  it('opens files in the Text Editor with their path', async () => {
    const system = await renderFiles();
    const openApp = vi.spyOn(system, 'openApp').mockResolvedValue({ ok: true, value: 'window-2' });
    await act(async () => { await system.dispatch('fs.write', { path: '/home/ada/notes.txt', content: 'x' }); });
    fireEvent.doubleClick(await screen.findByText('notes.txt'));
    expect(openApp).toHaveBeenCalledWith('editor', { path: '/home/ada/notes.txt' });
  });

  it('toggles hidden files with Ctrl+H', async () => {
    const system = await renderFiles();
    await act(async () => { await system.dispatch('fs.write', { path: '/home/ada/.bashrc', content: '' }); });
    expect(screen.queryByText('.bashrc')).toBeNull();
    fireEvent.keyDown(screen.getByText('Documents'), { key: 'h', ctrlKey: true });
    expect(await screen.findByText('.bashrc')).toBeTruthy();
  });
});

describe('Files model', () => {
  it('validates names like Linux does', () => {
    expect(nameError('')).toMatch(/empty/);
    expect(nameError('..')).toMatch(/special/);
    expect(nameError('x'.repeat(256))).toMatch(/255/);
    expect(nameError('notes.txt')).toBeNull();
  });

  it('sorts folders first, then names in byte order, hiding dot files unless asked', () => {
    const entry = (name: string, kind: 'file' | 'dir') => ({
      name, kind, owner: 'ada', mode: 0o644, size: 0, mtime: 0,
    });
    const entries = [entry('b', 'file'), entry('Z', 'dir'), entry('.x', 'file'), entry('a', 'dir')];
    expect(sortEntries(entries, false).map((e) => e.name)).toEqual(['Z', 'a', 'b']);
    expect(sortEntries(entries, true).map((e) => e.name)).toEqual(['Z', 'a', '.x', 'b']);
  });

  it('formats sizes and finds parents', () => {
    expect(formatSize({ name: 'f', kind: 'file', owner: 'ada', mode: 0, size: 1500, mtime: 0 })).toBe('1.5 kB');
    expect(parentOf('/home/ada')).toBe('/home');
    expect(parentOf('/home')).toBe('/');
  });
});

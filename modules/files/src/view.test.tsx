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
  await screen.findByText('Documents', { selector:'td' });
  return system;
}

afterEach(() => cleanup());

it('resumes a verified folder, hidden-file preference and icon view after a full boot', async () => {
  const system = createLocalSystem({ storage: memory(), modules: [{ manifest: files.manifest, load: async () => files }] });
  await system.boot('ada'); const opened = await system.openApp('files'); if (!opened.ok) throw new Error('Files did not open');
  const view = render(<FilesView system={system} windowId={opened.value} />);
  await screen.findByText('Documents', { selector:'td' }); fireEvent.click(screen.getByRole('button', { name: 'Temporary files' }));
  fireEvent.click(screen.getByLabelText('More actions'));
    fireEvent.click(screen.getByRole('button', { name: 'Hidden files' })); fireEvent.click(screen.getByRole('button', { name: 'Icon view' }));
  await waitFor(async () => expect((await system.session()).windows[0]?.args).toMatchObject({ path: '/tmp', hidden: 'true', view: 'icons' }));
  await system.flush(); view.unmount(); await system.boot('ada');
  const saved = (await system.session()).windows[0]!;
  render(<FilesView system={system} windowId={saved.id} args={saved.args} />);
  await waitFor(() => expect((screen.getByLabelText('Location') as HTMLInputElement).value).toBe('/tmp'));
  fireEvent.click(screen.getByLabelText('More actions'));
  expect(screen.getByRole('button', { name: 'Hidden files' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: 'List view' }).getAttribute('aria-pressed')).toBe('true');
  await system.reset();
});

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
    expect(await screen.findByText('Documents', { selector:'td' })).toBeTruthy();
  });

  it('opens in the home folder and enters a folder on double-click', async () => {
    await renderFiles();
    expect(screen.getByLabelText<HTMLInputElement>('Location').value).toBe('/home/ada');
    fireEvent.doubleClick(screen.getByText('Documents', { selector:'td' }));
    expect(await screen.findByText('This folder is empty.')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Location').value).toBe('/home/ada/Documents');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Documents', { selector:'td' })).toBeTruthy();
  });

  it('shows the kernel error for a folder the learner may not open', async () => {
    await renderFiles();
    fireEvent.click(screen.getByLabelText('Edit location'));
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
    fireEvent.click(screen.getByText('Documents', { selector:'td' }));
    if (!screen.queryByRole('alertdialog')) fireEvent.click(screen.getByLabelText('More actions'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alertdialog').textContent).toContain('and everything in it');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await system.dispatch('fs.stat', { path: '/home/ada/Documents' })).toMatchObject({ ok: true });
    if (!screen.queryByRole('alertdialog')) fireEvent.click(screen.getByLabelText('More actions'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!);
    await waitFor(() => expect(screen.queryByText('Documents', { selector:'td' })).toBeNull());
  });

  it('previews files safely before opening the same path in Text Editor', async () => {
    const system = await renderFiles();
    const openApp = vi.spyOn(system, 'openApp').mockResolvedValue({ ok: true, value: 'window-2' });
    await act(async () => { await system.dispatch('fs.write', { path: '/home/ada/notes.txt', content: 'x' }); });
    fireEvent.doubleClick(await screen.findByText('notes.txt'));
    expect((await screen.findByLabelText('File preview')).textContent).toContain("cat '/home/ada/notes.txt'");
    expect(openApp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit file' }));
    expect(openApp).toHaveBeenCalledWith('editor', { path: '/home/ada/notes.txt' });
  });

  it('toggles hidden files with Ctrl+H', async () => {
    const system = await renderFiles();
    await act(async () => { await system.dispatch('fs.write', { path: '/home/ada/.bashrc', content: '' }); });
    expect(screen.queryByText('.bashrc')).toBeNull();
    fireEvent.keyDown(screen.getByText('Documents', { selector:'td' }), { key: 'h', ctrlKey: true });
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

it('edits and selects the full path when its current breadcrumb is clicked, and Escape cancels', async () => {
  await renderFiles();
  fireEvent.click(screen.getByRole('button', { name: /explorer|ada/ }));
  const location = screen.getByLabelText<HTMLInputElement>('Location');
  expect(location.closest('form')?.hidden).toBe(false);
  expect(document.activeElement).toBe(location);
  expect(location.selectionStart).toBe(0);
  expect(location.selectionEnd).toBe('/home/ada'.length);
  fireEvent.change(location, { target: { value:'/tmp' } });
  fireEvent.keyDown(location, { key:'Escape' });
  expect(location.value).toBe('/home/ada');
  expect(location.closest('form')?.hidden).toBe(true);
});

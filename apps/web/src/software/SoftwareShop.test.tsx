import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createLocalSystem, type SystemClient, type KeyValueStorage } from '@tuxos/system';
import { apt } from '@tuxos/module-apt';
import SoftwareShop from './SoftwareShop';
import { changePackage, readInstalled } from './packages';

let system: SystemClient;
let storage: KeyValueStorage;
const modules = [{ manifest: apt.manifest, load: async () => apt }];
beforeEach(async () => {
  const data = new Map<string, string>();
  storage = { get: async key => data.get(key) ?? null, set: async (key, value) => { data.set(key, value); }, remove: async key => { data.delete(key); } };
  system = createLocalSystem({ storage, modules }); await system.boot('ada');
});
afterEach(async () => { cleanup(); await system.reset(); });

describe('Software shop and apt share one package database', () => {
  it('installs dependencies through the shop, runs in a shell, removes through apt and restores saved state', async () => {
    await changePackage(system, 'cowsay', 'install');
    const terminal = await system.createTerminal();
    expect((await terminal.run('cowsay hello')).stdout).toContain('hello');
    expect(await readInstalled(system)).toContain('libtext-charwidth-perl');
    await terminal.run('sudo apt remove -y cowsay');
    expect(await readInstalled(system)).not.toContain('cowsay');
    await changePackage(system, 'tree', 'install');
    const restored = createLocalSystem({ storage, modules }); await restored.boot('ada');
    expect(await readInstalled(restored)).toContain('tree');
    expect(await readInstalled(restored)).not.toContain('cowsay');
    await restored.reset();
  });

  it('reflects terminal installs and removals live, and passes the Try command to a new terminal', async () => {
    render(<SoftwareShop system={system} windowId="shop" />);
    const card = within(await screen.findByRole('article', { name: 'cmatrix' }));
    await waitFor(() => expect((card.getByRole('button', { name: 'Install' }) as HTMLButtonElement).disabled).toBe(false));
    const terminal = await system.createTerminal();
    await act(async () => { await terminal.run('sudo apt update'); await terminal.run('sudo apt install -y cmatrix'); });
    expect(await card.findByRole('button', { name: /Try it/ })).toBeDefined();
    const { vi } = await import('vitest');
    const opened = vi.spyOn(system, 'openApp').mockResolvedValue({ ok: true, value: 'window-test' });
    fireEvent.click(card.getByRole('button', { name: /Try it/ }));
    expect(opened).toHaveBeenCalledWith('terminal', { run: 'cmatrix' });
    opened.mockRestore();
    await act(async () => { await terminal.run('sudo apt remove -y cmatrix'); });
    expect(await card.findByRole('button', { name: 'Install' })).toBeDefined();
  });

  it('installs and removes from cards and filters to the installed collection', async () => {
    render(<SoftwareShop system={system} windowId="shop" />);
    const card = within(await screen.findByRole('article', { name: 'fortune-mod' }));
    await waitFor(() => expect((card.getByRole('button', { name: 'Install' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(card.getByRole('button', { name: 'Install' }));
    await card.findByRole('button', { name: /Try it/ });
    await waitFor(() => expect((card.getByRole('button', { name: /Remove/ }) as HTMLButtonElement).disabled).toBe(false));
    expect(await readInstalled(system)).toContain('fortunes-min');
    fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: /Installed/ }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    fireEvent.click(card.getByRole('button', { name: /Remove/ }));
    await screen.findByText('Your collection starts here.');
    expect(await readInstalled(system)).not.toContain('fortune-mod');
  });
});

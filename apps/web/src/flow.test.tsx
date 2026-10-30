import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createLocalSystem, type KeyValueStorage, type SystemClient } from '@tuxos/system';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { settings } from '../../../modules/settings/src/index';
import { about } from '../../../modules/about/src/index';
import { App, type AccountsWiring } from './app';
let signedIn: string | null = null;
const flowAccounts: AccountsWiring = {
  client: { me: async () => signedIn, register: async name => { signedIn = name; }, login: async name => { signedIn = name; }, logout: async () => { signedIn = null; }, verify: async () => true, storage: () => memory() },
  use: () => {}, localSave: async () => null,
};
const FlowApp = (props: React.ComponentProps<typeof App>) => <App {...props} accounts={flowAccounts} />;

const SLOW = { timeout: 4000 };

function memory(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  };
}

function system(): SystemClient {
  return createLocalSystem({
    storage: memory(),
    modules: [
      { manifest: settings.manifest, load: async () => settings },
      { manifest: about.manifest, load: async () => about },
    ],
  });
}

async function logIn(name = 'ada') {
  await screen.findByLabelText('Password');
  const username = screen.queryByLabelText('Username');
  if (username) fireEvent.change(username, { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } });
  fireEvent.submit(screen.getByLabelText('Password').closest('form')!);
}

afterEach(() => {
  cleanup();
  signedIn = null;
  localStorage.clear();
  vi.useRealTimers();
});

describe('starting TuxOS', () => {
  it('goes from GRUB through the boot log to the login screen', async () => {
    vi.useFakeTimers();
    render(<FlowApp system={system()} start="grub" />);
    expect(screen.getByText(/GNU GRUB\s+version 2\.12/)).toBeTruthy();
    expect(screen.getByRole('option', { name: /^\*TuxOS GNU\/Linux$/ }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(window, { key: 'Enter' });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(screen.getByText(/Linux version 6\.10\.0-tuxos/)).toBeTruthy();
    for (let tick = 0; tick < 40; tick += 1) await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(screen.getByLabelText('Username')).toBeTruthy();
  });

  it('opens GRUB\'s advanced options and comes back', () => {
    render(<FlowApp system={system()} start="grub" />);
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByRole('option', { name: /recovery mode/ })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('option', { name: /Memory test/ })).toBeTruthy();
  });

  it('shows the kernel\'s reason when a username is not allowed', async () => {
    render(<FlowApp system={system()} start="greeter" />);
    // The field lowercases names and drops spaces as you type, so use a character the kernel refuses.
    await logIn('bad!user');
    expect((await screen.findByRole('alert')).textContent).toContain('invalid username');
  });
});

describe('KDE Plasma', () => {
  it('logs in to Plasma with its panel, launcher and KRunner', async () => {
    render(<FlowApp system={system()} start="greeter" />);
    await logIn();
    fireEvent.click(await screen.findByRole('button', { name: 'Application Launcher' }, SLOW));
    expect(screen.getByRole('button', { name: 'Favorites' })).toBeTruthy();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Categories' })).getByRole('button', { name: 'Settings' }));
    const launcher = screen.getByRole('dialog', { name: 'Application Launcher' });
    expect(launcher.textContent).toContain('Settings');
    fireEvent.change(screen.getByLabelText('Search applications'), { target: { value: 'about' } });
    expect(launcher.textContent).toContain('About this system');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Application Launcher' })).toBeNull();

    fireEvent.keyDown(window, { key: ' ', code: 'Space', altKey: true });
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'sett' } });
    fireEvent.keyDown(screen.getByLabelText('Search'), { key: 'Enter' });
    expect(await screen.findByRole('button', { name: 'Close Settings' }, SLOW)).toBeTruthy();
  });

  it('switches to GNOME from Settings without logging out', async () => {
    const client = system();
    render(<FlowApp system={client} start="greeter" />);
    await logIn();
    await screen.findByRole('button', { name: 'Application Launcher' }, SLOW);
    await act(async () => { await client.openApp('settings'); });
    fireEvent.click(await screen.findByRole('button', { name: 'Switch to GNOME' }, SLOW));
    expect(await screen.findByRole('button', { name: 'Activities' }, SLOW)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Application Launcher' })).toBeNull();
    expect((await client.session()).desktop).toBe('gnome');
  });

  it('shuts down from the Leave menu, and the power button starts it again', async () => {
    render(<FlowApp system={system()} start="greeter" />);
    await logIn();
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }, SLOW));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Shut Down' }));
    fireEvent.click(await screen.findByRole('button', { name: /power on/ }, SLOW));
    expect(screen.getByText(/GNU GRUB\s+version 2\.12/)).toBeTruthy();
  });
});

describe('GNOME', () => {
  it('restores GNOME after account sign-in, with the Activities overview', async () => {
    const client = system();
    await client.boot('ada');
    await client.dispatch('session.setDesktop', { desktop: 'gnome' });
    await client.flush(); signedIn = 'ada';
    render(<FlowApp system={client} start="greeter" />);
    await logIn();
    fireEvent.click(await screen.findByRole('button', { name: 'Activities' }, SLOW));
    expect(screen.getByText(/No open windows/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show Apps' }));
    fireEvent.click(within(document.querySelector('.gnome-app-grid') as HTMLElement).getByRole('button', { name: /Settings/ }));
    expect(await screen.findByRole('button', { name: 'Close Settings' }, SLOW)).toBeTruthy();
    // Adwaita windows have only a close button.
    expect(screen.queryByRole('button', { name: 'Minimize Settings' })).toBeNull();
    expect((await client.session()).desktop).toBe('gnome');
  });

  it('locks to account sign-in and keeps the same session', async () => {
    const client = system();
    await client.boot('ada');
    await client.dispatch('session.setDesktop', { desktop: 'gnome' });
    await client.flush();
    localStorage.setItem('tuxos.last-desktop', 'gnome');
    render(<FlowApp system={client} start="greeter" />);
    await logIn();
    await screen.findByRole('button', { name: 'Activities' }, SLOW);
    fireEvent.click(screen.getByRole('button', { name: 'System menu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Lock' }));
    await screen.findByLabelText('Password');
    expect(screen.queryByLabelText('Username')).toBeNull();
  });
});

describe('CDE', () => {
  it('restores the Front Panel after account sign-in, with four workspaces', async () => {
    const client = system();
    await client.boot('ada');
    await client.dispatch('session.setDesktop', { desktop: 'cde' });
    await client.flush(); signedIn = 'ada';
    render(<FlowApp system={client} start="greeter" />);
    await logIn();
    const workspaces = await screen.findByRole('group', { name: 'Workspaces' }, SLOW);
    expect(within(workspaces).getAllByRole('button')).toHaveLength(4);
    expect((await client.session()).desktop).toBe('cde');

    // A window opened on workspace One is hidden on workspace Two and back on One.
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const window = (await screen.findByText('Settings', { selector: '.window-title' }, SLOW)).closest('section')!;
    expect(window.getAttribute('aria-hidden')).toBeNull();
    fireEvent.click(within(workspaces).getByRole('button', { name: 'Two' }));
    expect(window.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(within(workspaces).getByRole('button', { name: 'One' }));
    expect(window.getAttribute('aria-hidden')).toBeNull();
  });
});

describe('Hyprland', () => {
  it('restores Waybar after account sign-in, and Alt+R opens the launcher', async () => {
    const client = system();
    await client.boot('ada');
    await client.dispatch('session.setDesktop', { desktop: 'hyprland' });
    await client.flush();
    localStorage.setItem('tuxos.last-desktop', 'hyprland');
    render(<FlowApp system={client} start="greeter" />);
    await logIn();
    await screen.findByRole('button', { name: 'Apps' }, SLOW);
    fireEvent.keyDown(window, { key: 'r', code: 'KeyR', altKey: true });
    const launcher = await screen.findByRole('dialog', { name: 'Launcher' }, SLOW);
    fireEvent.change(within(launcher).getByLabelText('Search apps'), { target: { value: 'sett' } });
    fireEvent.keyDown(within(launcher).getByLabelText('Search apps'), { key: 'Enter' });
    // Tiled windows have no title bar buttons on a wide screen, but are still closable by keyboard.
    await screen.findByText('Settings', { selector: '.window-title' }, SLOW);
    fireEvent.keyDown(window, { key: 'c', code: 'KeyC', altKey: true });
    await waitFor(() => expect(document.querySelector('.app-window')).toBeNull());
  });

  it('keeps all environments available in the standalone desktop harness', async () => {
    const client = system();
    await client.boot('ada');
    await client.dispatch('session.setDesktop', { desktop: 'hyprland' });
    await client.flush();
    localStorage.setItem('tuxos.last-desktop', 'hyprland');
    render(<FlowApp system={client} start="greeter" />);
    await logIn();
    await screen.findByRole('button', { name: 'Apps' }, SLOW);
    await client.openApp('settings');
    for (const name of ['CDE', 'GNOME', 'KDE Plasma', 'Hyprland']) {
      fireEvent.click(await screen.findByRole('button', { name: `Switch to ${name}` }, SLOW));
      await screen.findByRole('button', { name: `${name}, in use` }, SLOW);
    }
  }, 20_000); // Four desktop splash screens play in a row.
});

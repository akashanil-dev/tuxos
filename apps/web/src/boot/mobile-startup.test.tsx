import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createLocalSystem } from '@tuxos/system';
import { App, type AccountsWiring } from '../app';
import { isPhone } from './PhoneScreen';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const cases = [
  { name: 'portrait phone', width: 390, height: 844, touch: true, ua: 'iPhone', gated: true },
  { name: 'landscape phone', width: 844, height: 390, touch: true, ua: 'iPhone', gated: true },
  { name: 'Android user-agent fallback', width: 412, height: 915, touch: false, ua: 'Android Mobile', gated: true },
  { name: '599px touch screen', width: 599, height: 900, touch: true, ua: 'Tablet', gated: true },
  { name: '600px touch screen', width: 600, height: 900, touch: true, ua: 'Tablet', gated: false },
  { name: 'tablet', width: 768, height: 1024, touch: true, ua: 'Tablet', gated: false },
  { name: 'small non-touch desktop', width: 390, height: 844, touch: false, ua: 'Desktop', gated: false },
];

it.each(cases)('$name startup behaves correctly', async ({ width, height, touch, ua, gated }) => {
  vi.useFakeTimers();
  vi.stubGlobal('screen', { width, height });
  vi.stubGlobal('navigator', { userAgent: ua });
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)' && touch }));
  const storage = { get: async () => null, set: async () => {}, remove: async () => {} };
  const system = createLocalSystem({ storage, modules: [] });
  const me = vi.fn(async () => null);
  const accounts: AccountsWiring = {
    client: { me, register: async () => {}, login: async () => {}, logout: async () => {}, verify: async () => true, storage: () => storage },
    use: () => {}, localSave: async () => null,
  };
  // Same startup selection as the actual web entry point.
  render(<App system={system} accounts={accounts} start={isPhone() ? 'phone' : 'grub'} />);
  if (gated) {
    for (let i = 0; i < 100; i++) await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(screen.getByRole('heading', { name: "Whoa, that's a phone!" })).toBeTruthy();
    expect(screen.queryByLabelText('Username')).toBeNull();
    expect(me).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Boot anyway/ }));
  }
  expect(screen.getByRole('listbox', { name: 'Boot menu' })).toBeTruthy();
  fireEvent.keyDown(window, { key: 'Enter' });
  for (let i = 0; i < 40; i++) await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  expect(screen.getByLabelText('Username')).toBeTruthy();
  expect(me).toHaveBeenCalledOnce();
  expect(screen.queryByRole('heading', { name: "Whoa, that's a phone!" })).toBeNull();
});

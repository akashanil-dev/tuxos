import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PhoneScreen, isPhone } from './PhoneScreen';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('animates the phone rescue, copies the current link, and lets the user boot', async () => {
  vi.useFakeTimers();
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  const boot = vi.fn();
  render(<PhoneScreen onBoot={boot} />);
  expect(screen.queryByText("Whoa, that's a phone!")).toBeNull();
  for (let i = 0; i < 10; i++) await act(async () => { await vi.advanceTimersByTimeAsync(640); });
  expect(screen.getByText("Whoa, that's a phone!")).toBeTruthy();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Copy the link/ })); });
  expect(writeText).toHaveBeenCalledWith(location.origin + location.pathname);
  expect(screen.getByText('Copied!')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Boot anyway/ }));
  expect(boot).toHaveBeenCalledOnce();
});

it('detects phones in either orientation but allows tablets and non-touch computers', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  vi.stubGlobal('screen', { width: 390, height: 844 });
  expect(isPhone()).toBe(true);
  vi.stubGlobal('screen', { width: 844, height: 390 });
  expect(isPhone()).toBe(true);
  vi.stubGlobal('screen', { width: 768, height: 1024 });
  expect(isPhone()).toBe(false);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('navigator', { userAgent: 'Desktop' });
  vi.stubGlobal('screen', { width: 400, height: 800 });
  expect(isPhone()).toBe(false);
});

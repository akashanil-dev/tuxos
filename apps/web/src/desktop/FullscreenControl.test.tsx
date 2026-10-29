import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FullscreenControl } from './FullscreenControl';

const originalElement = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
const originalEnabled = Object.getOwnPropertyDescriptor(document, 'fullscreenEnabled');
const originalRequest = Object.getOwnPropertyDescriptor(document.documentElement, 'requestFullscreen');
const originalExit = Object.getOwnPropertyDescriptor(document, 'exitFullscreen');
function restore(object: object, property: string, descriptor?: PropertyDescriptor) {
  if (descriptor) Object.defineProperty(object, property, descriptor);
  else Reflect.deleteProperty(object, property);
}
afterEach(() => {
  cleanup();
  restore(document, 'fullscreenElement', originalElement);
  restore(document, 'fullscreenEnabled', originalEnabled);
  restore(document.documentElement, 'requestFullscreen', originalRequest);
  restore(document, 'exitFullscreen', originalExit);
});
function browser() {
  let element: Element | null = null;
  const change = (next: Element | null) => { element = next; document.dispatchEvent(new Event('fullscreenchange')); };
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element });
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
  const enter = vi.fn(async () => change(document.documentElement));
  const exit = vi.fn(async () => change(null));
  Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: enter });
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
  return { enter, exit, change };
}

describe('desktop fullscreen control', () => {
  it('enters and exits fullscreen and follows browser Escape changes', async () => {
    const api = browser();
    render(<FullscreenControl />);
    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }));
    await waitFor(() => expect(api.enter).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Exit fullscreen' }).getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Exit fullscreen' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Exit fullscreen' }));
    await waitFor(() => expect(api.exit).toHaveBeenCalledOnce());
    await waitFor(() => expect((screen.getByRole('button', { name: 'Enter fullscreen' }) as HTMLButtonElement).disabled).toBe(false));
    act(() => api.change(document.documentElement));
    expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeTruthy();
    act(() => api.change(null));
    expect(screen.getByRole('button', { name: 'Enter fullscreen' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('reports rejected requests without falsely entering fullscreen', async () => {
    const api = browser();
    api.enter.mockRejectedValueOnce(new Error('Not allowed'));
    render(<FullscreenControl />);
    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }));
    expect((await screen.findByRole('status')).textContent).toContain('browser blocked fullscreen');
    expect(screen.getByRole('button', { name: 'Enter fullscreen' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('explains an unsupported embedded browser without calling its API', () => {
    const api = browser();
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
    render(<FullscreenControl />);
    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }));
    expect(screen.getByRole('status').textContent).toContain('Fullscreen is unavailable');
    expect(api.enter).not.toHaveBeenCalled();
  });
});

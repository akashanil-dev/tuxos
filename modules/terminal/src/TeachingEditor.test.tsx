// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TeachingEditor } from './TeachingEditor';
afterEach(cleanup);
it('nano protects a changed buffer, cancels exit, then saves and exits', () => {
  const save = vi.fn(() => ({ ok: true as const })); const finish = vi.fn(); let guard: (() => boolean) | null = null;
  const setGuard = (next: (() => boolean) | null) => { guard = next; };
  render(<TeachingEditor request={{ mode: 'nano', path: '/home/ada/note', content: 'old', save }} finish={finish} setGuard={setGuard} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'new' } }); expect(guard).not.toBeNull();
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'x', ctrlKey: true });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); expect(finish).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Exit (Ctrl+X)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Yes, save' })); expect(save).toHaveBeenCalledWith('new'); expect(finish).toHaveBeenCalledWith(true);
});
it('vim supports insert, Esc, failed :w, guarded :q, and intentional :q!', () => {
  const save = vi.fn(() => ({ ok: false as const, error: 'Permission denied' })); const finish = vi.fn();
  render(<TeachingEditor request={{ mode: 'vim', path: '/note', content: 'old', save }} finish={finish} setGuard={() => {}} />);
  const text = screen.getByRole('textbox', { name: 'vim file contents' });
  expect((text as HTMLTextAreaElement).readOnly).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Insert mode (i)' })); fireEvent.change(text, { target: { value: 'new' } });
  fireEvent.keyDown(text, { key: 'Escape' }); expect((text as HTMLTextAreaElement).readOnly).toBe(true);
  const ex = (value: string) => { fireEvent.keyDown(text, { key: ':' }); fireEvent.change(screen.getByRole('textbox', { name: 'Vim command' }), { target: { value } }); fireEvent.click(screen.getByRole('button', { name: 'Run' })); };
  ex(':wq'); expect(screen.getByRole('status').textContent).toContain('Permission denied'); expect(finish).not.toHaveBeenCalled();
  ex(':q'); expect(screen.getByRole('status').textContent).toContain('E37'); expect(finish).not.toHaveBeenCalled();
  ex(':q!'); expect(finish).toHaveBeenCalledWith(true);
});

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { SystemClient, AppViewProps } from '@tuxos/system';
import { WindowFrame } from './WindowFrame';
vi.mock('../views', () => ({ getLazyView: () => ({ active }: AppViewProps) => <button>Game {active ? 'active' : 'paused'}</button> }));
afterEach(cleanup);
it('focuses an app for keyboard/accessibility interaction and suspends background content', () => {
  const dispatch = vi.fn(async () => ({ ok: true, value: undefined }));
  const props = {
    system: { dispatch } as unknown as SystemClient,
    window: { id: 'window-1', appId: 'game', title: 'Game', x: 20, y: 40, width: 600, height: 400, z: 1, minimized: false, maximized: false },
    focused: false, insets: { top: 30, bottom: 30 }, decoration: 'breeze' as const, onClose: vi.fn(), setCloseGuard: vi.fn(),
  };
  const view = render(<WindowFrame {...props} />);
  fireEvent.focus(screen.getByRole('button', { name: 'Game paused' }));
  expect(dispatch).toHaveBeenCalledWith('session.focus', { id: 'window-1' });
  dispatch.mockClear(); fireEvent.click(screen.getByRole('button', { name: 'Game paused' }));
  expect(dispatch).toHaveBeenCalledWith('session.focus', { id: 'window-1' });
  view.rerender(<WindowFrame {...props} focused />);
  expect(screen.getByRole('button', { name: 'Game active' })).toBeTruthy();
  view.rerender(<WindowFrame {...props} focused offWorkspace />);
  expect(screen.getByRole('button', { name: 'Game paused', hidden: true })).toBeTruthy();
});

it('centres a new floating window in the usable screen and persists its position once', () => {
  const dispatch = vi.fn(async () => ({ ok: true, value: undefined }));
  render(<WindowFrame system={{ dispatch } as unknown as SystemClient}
    window={{ id:'window-new', appId:'game', title:'New game', x:48, y:40, width:600, height:400, z:1, minimized:false, maximized:false, centerOnLaunch:true }}
    focused insets={{ top:30, bottom:50 }} decoration="breeze" onClose={() => {}} setCloseGuard={() => {}} />);
  const frame = screen.getByRole('region', { name:'New game' });
  expect(frame.style.left).toBe(`${(innerWidth - 600) / 2}px`);
  expect(frame.style.top).toBe(`${30 + (innerHeight - 80 - 400) / 2}px`);
  expect(dispatch).toHaveBeenCalledWith('session.move', { id:'window-new', x:(innerWidth - 600) / 2, y:30 + (innerHeight - 80 - 400) / 2 });
});

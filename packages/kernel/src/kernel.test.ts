import type { Actor, KernelEvent } from '@tuxos/sdk';
import type { KernelState } from './state';
import { describe, expect, it } from 'vitest';
import { createKernel, KernelError } from './index';

const tutor: Actor = { kind: 'tutor', id: 'guide' };

describe('dispatch', () => {
  it('runs an action as the session user and returns its value', () => {
    const kernel = createKernel({ username: 'ada' });
    expect(kernel.dispatch({ type: 'fs.write', payload: { path: '/home/ada/a.txt', content: 'hi' } }))
      .toEqual({ ok: true, value: undefined });
    expect(kernel.dispatch({ type: 'fs.read', payload: { path: '/home/ada/a.txt' } }))
      .toEqual({ ok: true, value: 'hi' });
  });

  it('turns kernel errors into results instead of throwing', () => {
    const kernel = createKernel({ username: 'ada' });
    const result = kernel.dispatch({ type: 'fs.read', payload: { path: '/home/ada/missing' } });
    expect(result).toMatchObject({ ok: false, error: { code: 'ENOENT' } });
    expect(kernel.dispatch({ type: 'fs.read', payload: { path: 'relative' } }))
      .toMatchObject({ ok: false, error: { code: 'EINVAL' } });
    expect(kernel.dispatch({ type: 'fs.read', payload: null })).toMatchObject({ ok: false, error: { code: 'EINVAL' } });
    expect(kernel.dispatch({ type: 'no.such', payload: {} })).toMatchObject({ ok: false, error: { code: 'ENOSYS' } });
  });

  it('runs as another user when asked, as sudo will', () => {
    const kernel = createKernel({ username: 'ada' });
    const write = { type: 'fs.write', payload: { path: '/etc/motd', content: 'hello' } };
    expect(kernel.dispatch(write)).toMatchObject({ ok: false, error: { code: 'EACCES' } });
    expect(kernel.dispatch(write, { user: 'root' })).toMatchObject({ ok: true });
    expect(kernel.dispatch(write, { user: 'nobody' })).toMatchObject({ ok: false, error: { code: 'EINVAL' } });
  });

  it('leaves state untouched when a mutating action fails part way', () => {
    const kernel = createKernel({ username: 'ada' });
    kernel.register({
      type: 'test.half',
      capability: 'fs:write',
      description: 'writes once, then fails',
      mutates: true,
      run: ({ state }) => {
        state.hostname = 'changed';
        throw new KernelError('EIO', 'disk on fire');
      },
    });
    expect(kernel.dispatch({ type: 'test.half', payload: {} })).toMatchObject({ ok: false, error: { code: 'EIO' } });
    expect(kernel.getState().hostname).toBe('tuxos');
  });

  it('rethrows unexpected errors so bugs are not hidden', () => {
    const kernel = createKernel({ username: 'ada' });
    kernel.register({
      type: 'test.bug', capability: 'fs:read', description: 'bug', mutates: false,
      run: () => { throw new TypeError('oops'); },
    });
    expect(() => kernel.dispatch({ type: 'test.bug', payload: {} })).toThrow(TypeError);
  });

  it('refuses to register the same action twice', () => {
    const kernel = createKernel({ username: 'ada' });
    expect(() => kernel.register({
      type: 'fs.read', capability: 'fs:read', description: '', mutates: false, run: () => '',
    })).toThrow(KernelError);
  });
});

describe('capabilities', () => {
  it('denies actors without a grant and allows them once granted', () => {
    const kernel = createKernel({ username: 'ada' });
    const write = { type: 'fs.write', payload: { path: '/home/ada/note', content: 'from the tutor' } };
    expect(kernel.dispatch(write, { actor: tutor })).toMatchObject({ ok: false, error: { code: 'EPERM' } });

    kernel.grant(tutor, ['fs:read']);
    expect(kernel.dispatch({ type: 'fs.list', payload: { path: '/home/ada' } }, { actor: tutor }).ok).toBe(true);
    expect(kernel.dispatch(write, { actor: tutor }).ok).toBe(false);

    kernel.grant(tutor, ['fs:*']);
    expect(kernel.dispatch(write, { actor: tutor }).ok).toBe(true);
  });

  it('still applies Linux permissions to granted actors', () => {
    const kernel = createKernel({ username: 'ada' });
    kernel.grant(tutor, ['*']);
    const result = kernel.dispatch(
      { type: 'fs.write', payload: { path: '/etc/passwd', content: '' } }, { actor: tutor },
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'EACCES' } });
  });

  it('requires user:switch to act as another user, so actors cannot grant themselves sudo', () => {
    const kernel = createKernel({ username: 'ada' });
    const write = { type: 'fs.write', payload: { path: '/etc/motd', content: 'hi' } };
    kernel.grant(tutor, ['fs:*']);
    expect(kernel.dispatch(write, { actor: tutor, user: 'root' })).toMatchObject({
      ok: false, error: { code: 'EPERM', message: expect.stringContaining('user:switch') },
    });
    kernel.grant(tutor, ['fs:*', 'user:switch']);
    expect(kernel.dispatch(write, { actor: tutor, user: 'root' })).toMatchObject({ ok: true });
    expect(kernel.dispatch(write, { user: 'root' })).toMatchObject({ ok: true });
  });
});

describe('event log', () => {
  it('records every dispatch in order and notifies subscribers', () => {
    let clock = 100;
    const kernel = createKernel({ username: 'ada', now: () => clock++ });
    const seen: KernelEvent[] = [];
    const unsubscribe = kernel.subscribe((event) => seen.push(event));

    kernel.dispatch({ type: 'fs.mkdir', payload: { path: '/home/ada/projects' } });
    kernel.dispatch({ type: 'fs.read', payload: { path: '/nope' } }, { actor: tutor });
    unsubscribe();
    kernel.dispatch({ type: 'fs.list', payload: { path: '/' } });

    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({
      seq: 1, time: 101, ok: true, mutates: true, user: 'ada', actor: { kind: 'user', id: 'ada' },
    });
    expect(seen[1]).toMatchObject({
      seq: 2, ok: false, mutates: false, actor: tutor, error: { code: 'EPERM' },
    });
    expect(kernel.events().map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it('keeps only the newest events past the limit', () => {
    const kernel = createKernel({ username: 'ada', logLimit: 2 });
    for (let i = 0; i < 5; i++) kernel.dispatch({ type: 'fs.list', payload: { path: '/' } });
    expect(kernel.events().map((e) => e.seq)).toEqual([4, 5]);
  });
});

describe('snapshots', () => {
  it('restores a system from a snapshot without sharing state', () => {
    const first = createKernel({ username: 'ada' });
    first.dispatch({ type: 'fs.write', payload: { path: '/home/ada/keep.txt', content: 'saved' } });
    const snapshot = first.snapshot();

    const second = createKernel({ snapshot });
    expect(second.user).toBe('ada');
    expect(second.dispatch({ type: 'fs.read', payload: { path: '/home/ada/keep.txt' } }))
      .toEqual({ ok: true, value: 'saved' });

    second.dispatch({ type: 'fs.write', payload: { path: '/home/ada/keep.txt', content: 'changed' } });
    expect(first.dispatch({ type: 'fs.read', payload: { path: '/home/ada/keep.txt' } }))
      .toEqual({ ok: true, value: 'saved' });
  });

  it('survives a JSON round trip, as saves will', () => {
    const kernel = createKernel({ username: 'ada' });
    const restored = createKernel({ snapshot: JSON.parse(JSON.stringify(kernel.snapshot())) });
    expect(restored.getState()).toEqual(kernel.getState());
  });

  it('rejects bad usernames and unknown snapshot versions', () => {
    expect(() => createKernel({ username: 'Root User' })).toThrow(KernelError);
    expect(() => createKernel({ username: 'root' })).toThrow(KernelError);
    expect(() => createKernel({
      snapshot: { version: 99 as 1, state: createKernel({ username: 'ada' }).getState() },
    })).toThrow(KernelError);
    expect(() => createKernel({})).toThrow(KernelError);
  });

  it('restores snapshots made before mtime was added', () => {
    const state = createKernel({ username: 'ada' }).getState();
    const strip = (node: any): void => {
      delete node.mtime;
      if (node.kind === 'dir') Object.values(node.children).forEach(strip);
    };
    strip(state.fs);
    const restored = createKernel({ snapshot: { version: 1, state } });
    expect(restored.dispatch({ type: 'fs.stat', payload: { path: '/home/ada' } })).toMatchObject({
      ok: true, value: { mtime: 0 },
    });
  });
});

describe('session actions', () => {
  it('opens, cascades, focuses and lists windows', () => {
    const kernel = createKernel({ username: 'ada' });
    const first = kernel.dispatch<string>({ type: 'session.open', payload: { appId: 'one', title: 'One' } });
    const second = kernel.dispatch<string>({ type: 'session.open', payload: { appId: 'two', title: 'Two' } });
    expect(first).toEqual({ ok: true, value: 'window-1' });
    expect(second).toEqual({ ok: true, value: 'window-2' });
    expect(kernel.dispatch({ type: 'session.list', payload: {} })).toMatchObject({
      ok: true, value: { focusedId: 'window-2', windows: [{ x: 48, y: 40 }, { x: 72, y: 64 }] },
    });
  });

  it('focuses, minimizes, maximizes, moves, resizes and closes', () => {
    const kernel = createKernel({ username: 'ada' });
    kernel.dispatch({ type: 'session.open', payload: { appId: 'one', title: 'One' } });
    expect(kernel.dispatch({ type: 'session.minimize', payload: { id: 'window-1' } })).toMatchObject({ ok: true });
    expect(kernel.dispatch({ type: 'session.focus', payload: { id: 'window-1' } })).toMatchObject({ ok: true });
    kernel.dispatch({ type: 'session.toggleMaximize', payload: { id: 'window-1' } });
    kernel.dispatch({ type: 'session.move', payload: { id: 'window-1', x: 10, y: 20 } });
    kernel.dispatch({ type: 'session.resize', payload: { id: 'window-1', width: 1, height: 2 } });
    expect(kernel.getState().session.windows[0]).toMatchObject({
      minimized: false, maximized: true, x: 10, y: 20, width: 240, height: 160,
    });
    expect(kernel.dispatch({ type: 'session.close', payload: { id: 'window-1' } })).toMatchObject({ ok: true });
    expect(kernel.getState().session.focusedId).toBeNull();
  });

  it('rejects unknown windows and invalid numbers', () => {
    const kernel = createKernel({ username: 'ada' });
    expect(kernel.dispatch({ type: 'session.focus', payload: { id: 'missing' } })).toMatchObject({
      ok: false, error: { code: 'ENOENT' },
    });
    kernel.dispatch({ type: 'session.open', payload: { appId: 'x', title: 'X' } });
    expect(kernel.dispatch({ type: 'session.move', payload: { id: 'window-1', x: NaN, y: 0 } })).toMatchObject({
      ok: false, error: { code: 'EINVAL' },
    });
    expect(kernel.dispatch({ type: 'session.open', payload: {
      appId: 'x', title: 'X', width: Infinity,
    } })).toMatchObject({ ok: false, error: { code: 'EINVAL' } });
  });

  it('stores the arguments a window was opened with, and validates them', () => {
    const kernel = createKernel({ username: 'ada' });
    kernel.dispatch({ type: 'session.open', payload: { appId: 'editor', title: 'Edit', args: { path: '/etc/motd' } } });
    expect(kernel.getState().session.windows[0]?.args).toEqual({ path: '/etc/motd' });
    expect(kernel.dispatch({ type: 'session.open', payload: { appId: 'x', title: 'X', args: { n: 1 } } }))
      .toMatchObject({ ok: false, error: { code: 'EINVAL' } });
    expect(kernel.dispatch({ type: 'session.open', payload: { appId: 'x', title: 'X', args: ['a'] } }))
      .toMatchObject({ ok: false, error: { code: 'EINVAL' } });
  });

  it('renames a window', () => {
    const kernel = createKernel({ username: 'ada' });
    kernel.dispatch({ type: 'session.open', payload: { appId: 'terminal', title: 'Terminal' } });
    kernel.dispatch({ type: 'session.setTitle', payload: { id: 'window-1', title: 'ada@tuxos: ~' } });
    expect(kernel.getState().session.windows[0]?.title).toBe('ada@tuxos: ~');
    expect(kernel.dispatch({ type: 'session.setTitle', payload: { id: 'nope', title: 'x' } }))
      .toMatchObject({ ok: false, error: { code: 'ENOENT' } });
  });

  it('restores old snapshots with an empty session', () => {
    const kernel = createKernel({ username: 'ada' });
    const { session: ignored, ...legacyState } = structuredClone(kernel.getState());
    void ignored;
    const restored = createKernel({ snapshot: { version: 1, state: legacyState as KernelState } });
    expect(restored.getState().session).toEqual({
      windows: [], focusedId: null, nextId: 1, desktop: 'plasma', wallpaper: 'default',
    });
  });

  it('switches desktop and wallpaper, rejecting odd names', () => {
    const kernel = createKernel({ username: 'ada' });
    kernel.dispatch({ type: 'session.setDesktop', payload: { desktop: 'gnome' } });
    kernel.dispatch({ type: 'session.setWallpaper', payload: { wallpaper: 'rabbit' } });
    expect(kernel.getState().session).toMatchObject({ desktop: 'gnome', wallpaper: 'rabbit' });
    expect(kernel.dispatch({ type: 'session.setDesktop', payload: { desktop: '../evil' } }))
      .toMatchObject({ ok: false, error: { code: 'EINVAL' } });
  });
});

describe('nested dispatch', () => {
  it('keeps changes made by actions dispatched from inside a read-only action', () => {
    const kernel = createKernel({ username: 'ada' });
    kernel.register({
      type: 'test.orchestrate', capability: 'fs:read', description: 'creates a file via dispatch', mutates: false,
      run: () => kernel.dispatch({ type: 'fs.write', payload: { path: '/home/ada/made', content: 'kept' } }),
    });
    expect(kernel.dispatch({ type: 'test.orchestrate', payload: {} })).toMatchObject({ ok: true });
    expect(kernel.dispatch({ type: 'fs.read', payload: { path: '/home/ada/made' } }))
      .toEqual({ ok: true, value: 'kept' });
  });
});

import { expect, it, vi } from 'vitest';
import { switchableStorage } from './accounts';

it('finishes pending writes at their original destination before changing accounts', async () => {
  let finish!: () => void;
  const local = { get: async () => null, set: vi.fn(() => new Promise<void>(resolve => { finish = resolve; })), remove: async () => {} };
  const account = { get: async () => 'account', set: vi.fn(async () => {}), remove: async () => {} };
  const store = switchableStorage(local);
  const writing = store.storage.set('save', 'guest');
  await Promise.resolve();
  const switching = store.use(account);
  await expect(store.storage.set('save', 'ambiguous')).rejects.toThrow('switching');
  expect(account.set).not.toHaveBeenCalled();
  finish(); await writing; await switching;
  await store.storage.set('save', 'account data');
  expect(local.set).toHaveBeenCalledExactlyOnceWith('save', 'guest');
  expect(account.set).toHaveBeenCalledExactlyOnceWith('save', 'account data');
});

it('leaves the original storage selected if a pending write fails', async () => {
  let fail!: (error: Error) => void;
  const local = { get: async () => 'guest', set: () => new Promise<void>((_, reject) => { fail = reject; }), remove: async () => {} };
  const account = { get: async () => 'account', set: async () => {}, remove: async () => {} };
  const store = switchableStorage(local);
  const writing = store.storage.set('save', 'guest');
  const failedWrite = expect(writing).rejects.toThrow('full');
  await Promise.resolve();
  const switching = store.use(account);
  const failedSwitch = expect(switching).rejects.toThrow('full');
  fail(new Error('full')); await failedWrite; await failedSwitch;
  expect(await store.storage.get('save')).toBe('guest');
});

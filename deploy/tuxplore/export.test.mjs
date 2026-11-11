import { expect, it } from 'vitest';
import { exportLocalSave } from './export.mjs';

it('exports only the game save and its opt-out, without reading credentials or changing storage', () => {
  const reads = [];
  const save = { username: 'explorer', quests: { done: { hello: 42 } }, fs: { t: 'd', ch: {} }, token: 'never-export', online: true };
  const storage = { getItem(key) { reads.push(key); return key === 'tuxos-save-v1' ? JSON.stringify(save) : '1'; } };
  const result = exportLocalSave(storage, 'https://legacy.example', 100);
  expect(result).toMatchObject({ format: 'tuxplore-export', version: 1, exportedAt: 100, preferences: { anonymousUsage: false }, save: { quests: save.quests, fs: save.fs }, omittedFields: ['token', 'online'] });
  expect(result.save).not.toHaveProperty('token');
  expect(reads).toEqual(['tuxos-save-v1', 'tuxos-no-analytics']);
});

it('reports absent and malformed data instead of inventing an empty successful export', () => {
  expect(() => exportLocalSave({ getItem: () => null }, '')).toThrow('No Tuxplore progress');
  expect(() => exportLocalSave({ getItem: () => '[]' }, '')).toThrow('not a Tuxplore save');
  expect(() => exportLocalSave({ getItem: () => '{broken' }, '')).toThrow();
});

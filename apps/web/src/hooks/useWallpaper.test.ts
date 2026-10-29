import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useWallpaper } from './useWallpaper';
afterEach(cleanup);
it('updates only when the learner changes the wallpaper', () => {
  const { result, rerender } = renderHook(({ id }) => useWallpaper(id), { initialProps: { id: 'default' } });
  expect(result.current.id).toBe('kde-minimal');
  rerender({ id: 'kde-30th' });
  expect(result.current.id).toBe('kde-30th');
  rerender({ id: 'default' });
  expect(result.current.id).toBe('kde-minimal');
});

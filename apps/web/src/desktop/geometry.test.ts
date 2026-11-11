import { expect, it } from 'vitest';
import { clampGeometry } from './geometry';
it('keeps restored windows and controls inside the desktop after a smaller viewport or taller panel', () => {
  const area = { width: 800, height: 600 };
  expect(clampGeometry({ x: 1400, y: 900, width: 1000, height: 800 }, area, { top: 64, bottom: 48 })).toEqual({ x: 0, y: 64, width: 800, height: 488 });
  expect(clampGeometry({ x: -400, y: -20, width: 400, height: 300 }, area, { top: 64, bottom: 48 })).toEqual({ x: 0, y: 64, width: 400, height: 300 });
});

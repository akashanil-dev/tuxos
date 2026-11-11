import { describe, expect, it } from 'vitest';
import { tileLayout, tiledGroup } from './tiling';

const area = { x: 0, y: 44, width: 1000, height: 600 };

describe('tileLayout', () => {
  it('keeps a large restored session readable while every focused window remains reachable', () => {
    const ids = Array.from({ length: 14 }, (_, index) => `window-${index}`);
    for (const focused of ids) {
      const group = tiledGroup(ids, focused, area);
      expect(group).toContain(focused);
      for (const box of tileLayout(group.length, area)) {
        expect(box.height).toBeGreaterThanOrEqual(220);
        expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height);
      }
    }
    expect(tiledGroup(ids, ids[5], { ...area, width: 700 })).toEqual([ids[5]]);
    expect(tiledGroup([], null, area)).toEqual([]);
  });
  it('places nothing when there are no windows', () => {
    expect(tileLayout(0, area)).toEqual([]);
  });

  it('gives a single window the whole area inside the gaps', () => {
    expect(tileLayout(1, area)).toEqual([{ x: 12, y: 56, width: 976, height: 576 }]);
  });

  it('puts the first window on the left and stacks the rest on the right', () => {
    const [master, top, bottom] = tileLayout(3, area);
    expect(master).toEqual({ x: 12, y: 56, width: 530, height: 576 });
    expect(top).toMatchObject({ x: 554, y: 56, width: 434 });
    expect(bottom!.y).toBeCloseTo(top!.y + top!.height + 12);
    // The stack ends where the master does.
    expect(bottom!.y + bottom!.height).toBeCloseTo(master!.y + master!.height);
  });
});

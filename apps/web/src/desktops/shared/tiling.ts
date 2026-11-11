import type { Geometry } from '../../desktop/WindowFrame';

export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Show a readable group around the focused window; other groups stay mounted and are switchable. */
export function tiledGroup(ids: readonly string[], focused: string | null | undefined, area: Area, gap = 12): string[] {
  const capacity = area.width < 760 || area.height < 244 ? 1 : 1 + Math.max(1, Math.floor((area.height - gap) / (220 + gap)));
  const index = Math.max(0, ids.indexOf(focused ?? ''));
  const start = Math.floor(index / capacity) * capacity;
  return ids.slice(start, start + capacity);
}

/**
 * Master and stack tiling, as Hyprland's master layout does: one window fills the area; with more, the
 * first takes the left 55% and the rest share the right side, one above the other, with gaps between.
 */
export function tileLayout(count: number, area: Area, gap = 12): Geometry[] {
  if (count <= 0) return [];
  if (count === 1) {
    return [{ x: area.x + gap, y: area.y + gap, width: area.width - gap * 2, height: area.height - gap * 2 }];
  }
  const masterWidth = Math.round((area.width - gap * 3) * 0.55);
  const stackCount = count - 1;
  const stackHeight = (area.height - gap * (stackCount + 1)) / stackCount;
  const stack = Array.from({ length: stackCount }, (_, index) => ({
    x: area.x + gap * 2 + masterWidth,
    y: area.y + gap + index * (stackHeight + gap),
    width: area.width - masterWidth - gap * 3,
    height: stackHeight,
  }));
  return [{ x: area.x + gap, y: area.y + gap, width: masterWidth, height: area.height - gap * 2 }, ...stack];
}

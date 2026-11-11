export interface Geometry { x: number; y: number; width: number; height: number }
export function clampGeometry(box: Geometry, viewport: { width: number; height: number }, insets: { top: number; bottom: number }): Geometry {
  const width = Math.min(Math.max(240, box.width), Math.max(240, viewport.width));
  const height = Math.min(Math.max(160, box.height), Math.max(160, viewport.height - insets.top - insets.bottom));
  return { width, height, x: Math.max(0, Math.min(box.x, viewport.width - width)), y: Math.max(insets.top, Math.min(box.y, viewport.height - insets.bottom - height)) };
}

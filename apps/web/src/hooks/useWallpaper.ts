import { wallpaperById } from '@tuxos/appearance';

/** The base wallpaper stays KDE Minimal; rewards unlock explicit alternatives. */
export function useWallpaper(id: string) { return wallpaperById(id); }

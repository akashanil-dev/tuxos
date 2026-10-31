import { wallpaperById } from '@tuxos/appearance';

/** The base wallpaper stays KDE 30th Anniversary; rewards unlock explicit alternatives. */
export function useWallpaper(id: string) { return wallpaperById(id); }

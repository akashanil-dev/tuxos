import { describe, expect, it } from 'vitest';
import { wallpaperById } from './index';
describe('earned wallpaper defaults', () => {
  it.each(['2026-10-30', '2026-11-05', '2027-01-01'])('keeps KDE 30th Anniversary as the default on %s', date => {
    expect(wallpaperById('default', Date.parse(date)).id).toBe('kde-30th');
    expect(wallpaperById('unknown', Date.parse(date)).id).toBe('kde-30th');
  });
  it('resolves an explicit anniversary reward without an expiry', () => {
    expect(wallpaperById('kde-30th', Date.parse('2027-01-01')).id).toBe('kde-30th');
  });
});

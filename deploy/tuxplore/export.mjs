/** Portable export for the original Tuxplore origin. Never reads cloud tokens or sends a request. */
export function exportLocalSave(storage, origin, now = Date.now()) {
  const raw = storage.getItem('tuxos-save-v1');
  if (!raw) throw new Error('No Tuxplore progress was found in this browser on this site. Try the browser and address you used to play.');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The saved data is not a Tuxplore save. Download the original for recovery.');
  const fields = ['username', 'theme', 'wallpaper', 'fastBoot', 'unlockedThemes', 'achievements', 'learned', 'quests', 'tracks', 'pipe', 'runner', 'installed', 'history', 'fs', 'seen', 'daemonKilled', 'savedAt'];
  const save = Object.fromEntries(fields.filter(key => Object.hasOwn(parsed, key)).map(key => [key, parsed[key]]));
  return {
    format: 'tuxplore-export', version: 1, exportedAt: now, sourceOrigin: origin,
    preferences: { anonymousUsage: storage.getItem('tuxos-no-analytics') !== '1' },
    save, omittedFields: Object.keys(parsed).filter(key => !fields.includes(key)),
  };
}

export function downloadJSON(value, filename) {
  const url = URL.createObjectURL(new Blob([value], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

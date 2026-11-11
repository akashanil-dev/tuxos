import type { KeyValueStorage } from './index';

export interface BackupInfo { id: string; username: string; label: string; createdAt: number; bytes: number }
const INDEX = 'tuxos.backups.v1';
const PREFIX = 'tuxos.backup.';
/** The index is separate from account save storage. Failed or full storage never permits replacement. */
export function backupStore(storage: KeyValueStorage) {
  let queue: Promise<unknown> = Promise.resolve();
  const list = async (): Promise<BackupInfo[]> => {
    const raw = await storage.get(INDEX);
    const value: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(value) || !value.every(v => v && typeof v.id === 'string' && v.id.startsWith(PREFIX) && typeof v.username === 'string' && typeof v.label === 'string' && Number.isFinite(v.createdAt) && Number.isFinite(v.bytes))) throw new Error('The backup index is damaged. Export the running save before repairing browser storage.');
    const entries = value as BackupInfo[];
    // Account replacements from the earlier guest-transfer release used named keys without an index.
    // Discover just those backup keys; authentication/AI keys are never read by this manager.
    for (const key of await storage.keys?.() ?? []) {
      if (!/^tuxos\.backup\.account-[a-z_][a-z0-9_-]*\.\d+$/.test(key) || entries.some(item => item.id === key)) continue;
      const data = await storage.get(key); if (!data) continue;
      try {
        const save = JSON.parse(data), createdAt = Number(key.slice(key.lastIndexOf('.') + 1));
        if (typeof save.username === 'string' && Number.isFinite(createdAt)) entries.push({ id: key, username: save.username, label: 'Before earlier account transfer', createdAt, bytes: new TextEncoder().encode(data).byteLength });
      } catch { /* A malformed legacy backup remains untouched at its original key. */ }
    }
    return entries.sort((a, b) => b.createdAt - a.createdAt);
  };
  return {
    list,
    async read(id: string) {
      if (!(await list()).some(item => item.id === id)) throw new Error('Backup not found.');
      const data = await storage.get(id); if (!data) throw new Error('Backup content is missing.'); return data;
    },
    create(value: string, username: string, label: string): Promise<BackupInfo> {
      const task = queue.then(async () => {
        const entries = await list();
        const info: BackupInfo = { id: `${PREFIX}${crypto.randomUUID()}`, username, label, createdAt: Date.now(), bytes: new TextEncoder().encode(value).byteLength };
        await storage.set(info.id, value);
        try { await storage.set(INDEX, JSON.stringify([info, ...entries])); }
        catch (cause) { await storage.remove(info.id).catch(() => undefined); throw cause; }
        return info;
      });
      queue = task.catch(() => undefined); return task;
    },
    remove(id: string): Promise<void> {
      const task = queue.then(async () => {
        const entries = await list();
        if (!entries.some(item => item.id === id)) throw new Error('Backup not found.');
        // Update the index first: a failure keeps the reachable backup intact.
        await storage.set(INDEX, JSON.stringify(entries.filter(item => item.id !== id)));
        await storage.remove(id);
      });
      queue = task.catch(() => undefined); return task;
    },
  };
}

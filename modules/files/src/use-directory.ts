import type { Stat } from '@tuxos/kernel';
import type { SystemClient } from '@tuxos/system';
import { useCallback, useEffect, useRef, useState } from 'react';

const REASONS: Record<string, string> = {
  ENOENT: 'No such file or directory',
  EACCES: 'Permission denied',
  ENOTDIR: 'Not a directory',
  EEXIST: 'File exists',
  ENOTEMPTY: 'Directory not empty',
  EPERM: 'Operation not permitted',
};

export function reason(code: string, fallback: string): string {
  return REASONS[code] ?? fallback;
}

/** The entries of one directory, reloaded whenever any file changes, whoever changed it. */
export function useDirectory(system: SystemClient, path: string) {
  const [entries, setEntries] = useState<Stat[]>([]);
  const [error, setError] = useState('');
  const [loadedPath, setLoadedPath] = useState('');
  const generation = useRef(0);

  const reload = useCallback(async () => {
    if (!path) return;
    const request = ++generation.current;
    const result = await system.dispatch<Stat[]>('fs.list', { path });
    if (request !== generation.current) return;
    if (result.ok) {
      setEntries(result.value);
      setError('');
    } else {
      setEntries([]);
      setError(`Can’t open “${path}”: ${reason(result.error.code, result.error.message)}`);
    }
    setLoadedPath(path);
  }, [system, path]);

  useEffect(() => {
    void reload();
    const unsubscribe = system.onChange((event) => {
      if (event.action.type.startsWith('fs.')) void reload();
    });
    return () => { generation.current++; unsubscribe(); };
  }, [system, reload]);

  const loading = !path || loadedPath !== path;
  return { entries: loading ? [] : entries, error: loading ? '' : error, reload, loading };
}

import { useEffect, useRef, useState } from 'react';
import { EXPLORATION_ACHIEVEMENTS, type ExplorationProgress } from '@tuxos/sdk';
import type { SystemClient } from '@tuxos/system';
/** Imported/restored history is the baseline. Only discoveries earned in this session announce. */
export function DiscoveryNotice({ system }: { system: SystemClient }) {
  const known = useRef<Set<string> | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const result = await system.dispatch<ExplorationProgress>('exploration.status', {});
      if (!active || !result.ok || !result.value) return;
      const ids = Object.keys(result.value.achievements);
      if (known.current) {
        const newest = ids.filter(id => !known.current!.has(id)).at(-1);
        const item = EXPLORATION_ACHIEVEMENTS.find(item => item.id === newest);
        if (item) setNotice(item.name);
      }
      known.current = new Set(ids);
    };
    void refresh();
    const stop = system.onChange(event => { if (/^(try-linux|exploration|pipe-dream|know-your-distro|learn-adventure)\./.test(event.action.type)) void refresh(); });
    return () => { active = false; stop(); known.current = null; };
  }, [system]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 6500); return () => clearTimeout(timer); }, [notice]);
  if (!notice) return null;
  return <aside className="discovery-notice" role="status"><button onClick={() => { void system.openApp('exploration-achievements'); setNotice(''); }}>Achievement: {notice}</button><button aria-label="Dismiss discovery" onClick={() => setNotice('')}>×</button></aside>;
}

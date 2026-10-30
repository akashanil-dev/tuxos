import { useEffect, useState } from 'react';
import type { JourneyProgress } from '@tuxos/sdk';
import type { SystemClient } from '@tuxos/system';

export function useJourney(system: SystemClient) {
  const [progress, setProgress] = useState<JourneyProgress>();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const session = await system.session();
      if (active) { setProgress(session.journey); setLoaded(true); }
    };
    void refresh();
    const stop = system.onChange(e => { if (['journey.record', 'journey.ack', 'journey.reconcile'].includes(e.action.type)) void refresh(); });
    return () => { active = false; stop(); };
  }, [system]);
  return { progress, loaded };
}

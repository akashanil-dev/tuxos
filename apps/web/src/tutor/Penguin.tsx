import { lazy, Suspense, useCallback, useState } from 'react';
import type { PenguinPose } from './Penguin3D';
import { Puppet } from './Puppet';

// three.js is loaded only when Vasu is first shown, so it never slows down the first page load.
const Penguin3D = lazy(() => import('./Penguin3D'));

/** Whether this browser can draw WebGL. Test environments (jsdom) can't. */
function webglAvailable(): boolean {
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return false;
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

let supported: boolean | undefined;

/** Vasu: the 3D penguin where WebGL works, the drawn one otherwise (and while the 3D one loads). */
export function Penguin(pose: Partial<PenguinPose>) {
  const full: PenguinPose = { facing: pose.facing ?? 'front', walking: pose.walking ?? false, mood: pose.mood ?? 'idle' };
  const [failed, setFailed] = useState(() => !(supported ??= webglAvailable()));
  const fail = useCallback(() => setFailed(true), []);
  const drawn = <Puppet facing={full.facing} />;
  if (failed) return drawn;
  return <Suspense fallback={drawn}><Penguin3D pose={full} onFail={fail} /></Suspense>;
}

export type { PenguinMood, PenguinPose } from './Penguin3D';

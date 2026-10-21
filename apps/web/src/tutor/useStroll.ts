import { useEffect, useRef, useState } from 'react';

const SIZE = 64;
const MARGIN = 14;
/** Walking speed, in pixels per second: an unhurried waddle, and a hurry when he is called back to his corner. */
const SPEED = 70;
const HURRY_SPEED = 420;
/** How long Vasu rests (facing the learner) between walks: a random few seconds each time. */
const PAUSE_MS = { min: 3_000, max: 9_000 };
const FIRST_PAUSE_MS = 2_500;

export interface Stroll {
  /** Vasu's left edge, in pixels from the left of the screen. */
  x: number;
  facing: 'left' | 'right' | 'front';
  walking: boolean;
  /** How long the current walk takes, for the CSS transition. */
  durationMs: number;
}

const home = () => Math.max(MARGIN, globalThis.innerWidth - SIZE - MARGIN);

/**
 * Vasu's stroll along the bottom of the screen. While `free` he now and then waddles to another spot, and back home
 * to the right corner; as soon as he is needed (a chat, a nudge, his introduction, his work) he walks home and turns
 * to face the learner. Reduced motion keeps him at home.
 */
export function useStroll(free: boolean): Stroll {
  const [stroll, setStroll] = useState<Stroll>(() => ({ x: home(), facing: 'front', walking: false, durationMs: 0 }));
  const position = useRef(stroll.x);
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const walkTo = (target: number, then?: () => void, speed = SPEED) => {
      const from = position.current;
      const durationMs = Math.round((Math.abs(target - from) / speed) * 1000);
      if (durationMs < 50) {
        setStroll({ x: target, facing: 'front', walking: false, durationMs: 0 });
        then?.();
        return;
      }
      position.current = target;
      setStroll({ x: target, facing: target < from ? 'left' : 'right', walking: true, durationMs });
      timers.push(setTimeout(() => {
        setStroll((current) => ({ ...current, facing: 'front', walking: false }));
        then?.();
      }, durationMs));
    };

    if (!free || still) {
      // Called (clicked, or needed for a chat, a nudge or his work): hurry back to his corner.
      walkTo(home(), undefined, HURRY_SPEED);
      return () => timers.forEach(clearTimeout);
    }
    const wander = (pause = PAUSE_MS.min + Math.random() * (PAUSE_MS.max - PAUSE_MS.min)) => {
      timers.push(setTimeout(() => {
        // Walk to a random spot along the bottom, at least a little way from where he stands, so every walk shows.
        const width = globalThis.innerWidth;
        const span = Math.max(0, width - SIZE - MARGIN * 2);
        let target = MARGIN + Math.random() * span;
        if (Math.abs(target - position.current) < 120) target = position.current > width / 2 ? MARGIN + Math.random() * span / 2 : MARGIN + span / 2 + Math.random() * span / 2;
        walkTo(Math.round(target), () => wander());
      }, pause));
    };
    // The first stroll comes soon after he is free, so he doesn't seem frozen.
    wander(FIRST_PAUSE_MS);
    return () => timers.forEach(clearTimeout);
  }, [free, still]);

  // Keep him on screen when the window shrinks.
  useEffect(() => {
    const onResize = () => {
      if (position.current > home()) {
        position.current = home();
        setStroll((current) => ({ ...current, x: home(), durationMs: 0 }));
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return stroll;
}

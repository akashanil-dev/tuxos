import { useEffect, useRef, useState } from 'react';
import { Tux } from '../desktop/Tux';
export type PenguinMood = 'idle' | 'thinking' | 'acting' | 'pointing';
export interface PenguinPose { facing: 'front' | 'left' | 'right'; walking: boolean; mood: PenguinMood }
/** Tuxplore's flat companion, with its original idle, blink and hop gestures. */
export function Penguin(_pose: Partial<PenguinPose>) {
  const host = useRef<HTMLSpanElement>(null);
  const [hop, setHop] = useState(false);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!host.current || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
      const r = host.current.getBoundingClientRect();
      const dx = Math.max(-1, Math.min(1, (event.clientX - r.left - r.width / 2) / 300)) * 1.6;
      const dy = Math.max(-1, Math.min(1, (event.clientY - r.top - r.height / 3) / 300)) * 1.6;
      host.current.style.setProperty('--tux-eye-x', `${dx}px`);
      host.current.style.setProperty('--tux-eye-y', `${dy}px`);
    };
    document.addEventListener('pointermove', move, { passive: true });
    return () => document.removeEventListener('pointermove', move);
  }, []);
  return <span ref={host} className={`tux-companion-art ${hop ? 'hop' : ''}`} onClick={() => setHop(true)} onAnimationEnd={() => setHop(false)}><Tux /></span>;
}

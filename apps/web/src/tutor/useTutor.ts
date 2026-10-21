import type { SystemClient } from '@tuxos/system';
import { TutorSession, type Transport, type TutorEvent } from '@tuxos/tutor';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createScreenAgent, type Cursor } from './screen-agent';

export type Entry =
  | { kind: 'message'; role: 'user' | 'assistant'; text: string }
  | { kind: 'tool'; name: string; args: Record<string, unknown>; result: unknown }
  | { kind: 'error'; text: string };

export interface Pointer {
  target: string;
  note?: string;
  at: number;
}

/** Where Vasu's own pointer is drawn, and whether it is mid-click. */
export interface CursorState {
  x: number;
  y: number;
  visible: boolean;
  clicking: boolean;
}

/** A sudo request waiting for the learner's answer. */
export interface SudoRequest {
  reason: string;
  answer(granted: boolean): void;
}

/** Real browsers animate Vasu's pointer and typing; tests (and reduced motion) run instantly. */
const instant = () => typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOVE_MS = 450;
const CLICK_MS = 180;
const TYPE_MS = 45;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The tutor conversation for this desktop: messages, tool actions, busy state, where Vasu is pointing,
 * his on-screen pointer, sudo requests, and the learner's Stop.
 */
export function useTutor(system: SystemClient, transport: Transport) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState(false);
  const [pointer, setPointer] = useState<Pointer | null>(null);
  const [cursor, setCursor] = useState<CursorState>({ x: 0, y: 0, visible: false, clicking: false });
  const [sudoRequest, setSudoRequest] = useState<SudoRequest | null>(null);
  const [hasSudo, setHasSudo] = useState(false);
  const position = useRef({ x: globalThis.innerWidth - 60, y: globalThis.innerHeight - 80 });

  const session = useMemo(() => {
    const fast = instant();
    const cursorControl: Cursor = {
      async moveTo(x, y) {
        setActing(true);
        // Start from where the pointer last was, so it glides rather than jumps.
        setCursor({ ...position.current, visible: true, clicking: false });
        await sleep(fast ? 0 : 30);
        position.current = { x, y };
        setCursor({ x, y, visible: true, clicking: false });
        await sleep(fast ? 0 : MOVE_MS);
      },
      async click() {
        setCursor((current) => ({ ...current, clicking: true }));
        await sleep(fast ? 0 : CLICK_MS);
        setCursor((current) => ({ ...current, clicking: false }));
      },
    };
    const agent = createScreenAgent(cursorControl, fast ? 0 : TYPE_MS);
    return new TutorSession({
      access: system.tutor(),
      transport,
      ui: {
        ...agent,
        pointAt: (target, note) => setPointer({ target, note, at: Date.now() }),
        pressKeys: async (keys) => {
          setActing(true);
          await agent.pressKeys(keys);
        },
        requestSudo: (reason) => new Promise<boolean>((resolve) => {
          setSudoRequest({
            reason,
            answer: (granted) => {
              setSudoRequest(null);
              setHasSudo(granted);
              resolve(granted);
            },
          });
        }),
      },
    });
  }, [system, transport]);

  useEffect(() => session.on((event: TutorEvent) => {
    if (event.type === 'busy') {
      setBusy(event.busy);
      if (!event.busy) {
        setActing(false);
        setCursor((current) => ({ ...current, visible: false }));
      }
    } else if (event.type === 'message') {
      setEntries((list) => [...list, { kind: 'message', role: event.role, text: event.text }]);
    } else if (event.type === 'tool') setEntries((list) => [...list, { kind: 'tool', ...event }]);
    else setEntries((list) => [...list, { kind: 'error', text: event.message }]);
  }), [session]);

  const stop = useCallback(() => {
    session.stop();
    sudoRequest?.answer(false);
  }, [session, sudoRequest]);

  const revokeSudo = useCallback(() => {
    session.revokeSudo();
    setHasSudo(false);
  }, [session]);

  const clearPointer = useCallback(() => setPointer(null), []);

  return {
    entries, busy, acting, pointer, cursor, sudoRequest, hasSudo, clearPointer, stop, revokeSudo,
    ask: (question: string) => void session.ask(question),
  };
}

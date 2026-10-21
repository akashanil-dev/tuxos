import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { AppViewProps } from '@tuxos/system';
import { useEffect, useRef, useState } from 'react';
import { TerminalController } from './controller';
import './terminal.css';

// A GitHub-dark style palette: the same terminal colours in every desktop environment.
const THEME = {
  background: '#0d1117',
  foreground: '#e6edf3',
  cursor: '#e6edf3',
  selectionBackground: '#30363d',
  black: '#484f58',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#facc15',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#39c5cf',
  white: '#b1bac4',
  brightBlack: '#8b949e',
  brightRed: '#ff7b72',
  brightGreen: '#56d364',
  brightYellow: '#e3b341',
  brightBlue: '#79c0ff',
  brightMagenta: '#d2a8ff',
  brightCyan: '#56d4dd',
  brightWhite: '#f0f6fc',
};

/**
 * Typing into a terminal from elsewhere on the page (Vasu, the tutor): dispatch this event on `window` with
 * the target window id and the keystrokes. The terminal sets `accepted` once it is ready to take them.
 */
export const TERMINAL_TYPE_EVENT = 'tuxos:terminal-type';
export interface TerminalTypeDetail {
  windowId: string;
  data: string;
  accepted: boolean;
}

export default function TerminalView(props: AppViewProps) {
  return <TerminalSurface system={props.system} windowId={props.windowId} args={props.args} />;
}

/** Reusable real xterm surface for terminal-first learning labs. */
export function TerminalSurface({ system, windowId, args, learningModule, inputId = windowId }: {
  system: AppViewProps['system']; windowId?: string; args?: AppViewProps['args']; learningModule?: string;
  /** The id that TERMINAL_TYPE_EVENT uses to type here; a window's terminal uses its window id. */
  inputId?: string;
}) {
  // Vasu's own terminal runs his commands as the tutor, so they never count towards the learner's lessons.
  const owner = args?.owner === 'vasu' ? 'vasu' : 'learner';
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const term = new Terminal({
      theme: THEME,
      fontFamily: '"JetBrains Mono", "Ubuntu Mono", "DejaVu Sans Mono", Menlo, Consolas, monospace',
      fontSize: 14,
      cursorBlink: true,
      scrollback: 2000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(element);
    const resize = () => {
      try {
        fit.fit();
      } catch {
        // The window can be briefly hidden (minimized) and have no size to fit to.
      }
    };
    resize();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize);
    observer?.observe(element);

    let disposed = false;
    let typeHere: ((data: string) => void) | undefined;
    const onType = (event: Event) => {
      const detail = (event as CustomEvent<TerminalTypeDetail>).detail;
      if (!inputId || detail.windowId !== inputId || !typeHere) return;
      detail.accepted = true;
      typeHere(detail.data);
    };
    window.addEventListener(TERMINAL_TYPE_EVENT, onType);
    const windowActions = {
      close: () => { if (windowId) void system.dispatch('session.close', { id: windowId }); },
      setTitle: (title: string) => {
        if (windowId) void system.dispatch('session.setTitle', {
          id: windowId, title: owner === 'vasu' ? `Vasu's terminal — ${title}` : title,
        });
      },
    };
    const screen = {
      write: (data: string) => term.write(data),
      clear: () => term.clear(),
      get cols() { return term.cols; },
    };
    void (async () => {
      const session = owner === 'vasu'
        ? await system.tutor().createTerminal()
        : await system.createTerminal(learningModule ? { learningModule } : undefined);
      if (disposed) return;
      const motd = await system.dispatch<string>('fs.read', { path: '/etc/motd' });
      const controller = new TerminalController(screen, session, windowActions);
      term.onData((data) => {
        controller.input(data).catch((cause: unknown) => setError(String(cause)));
      });
      await controller.start(motd.ok ? motd.value : undefined);
      // Typed keys arrive one at a time; queue them so a slow command can't let later keys jump ahead.
      let queue = Promise.resolve();
      typeHere = (data) => {
        term.focus();
        queue = queue.then(() => controller.input(data)).catch((cause: unknown) => setError(String(cause)));
      };
      term.focus();
    })().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));

    return () => {
      disposed = true;
      window.removeEventListener(TERMINAL_TYPE_EVENT, onType);
      observer?.disconnect();
      term.dispose();
    };
  }, [system, windowId, owner, learningModule, inputId]);

  return <div className="terminal-view">
    {error && <p className="terminal-error" role="alert">Terminal error: {error}</p>}
    <div className="terminal-screen" ref={container} />
  </div>;
}

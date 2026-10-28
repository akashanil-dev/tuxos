import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { AppViewProps } from '@tuxos/system';
import { useEffect, useId, useRef, useState } from 'react';
import { DESKTOP_PACKAGES } from '@tuxos/sdk';
import { TerminalController } from './controller';
import { CLIPBOARD_LOCK_MESSAGE, guardTerminalClipboard } from './clipboard';
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
  const desktop = DESKTOP_PACKAGES.find(item => item.id === props.args?.installDesktop);
  return <div className="terminal-install-window">{desktop && <section className="terminal-install-guide"><strong>Install {desktop.name}</strong><p>Run these commands, then return to Settings to select the installed desktop.</p><pre>sudo apt update{'\n'}sudo apt install {desktop.package}</pre><small>TuxOS practice packages · simulated installation</small></section>}<TerminalSurface system={props.system} windowId={props.windowId} args={props.args} learningModule={desktop ? "desktop-installation" : undefined} colourOutput={Boolean(desktop)} /></div>;
}

/** Reusable real xterm surface for terminal-first learning labs. */
export function TerminalSurface({ system, windowId, args, learningModule, inputId = windowId, clipboardDisabled = false, colourOutput = Boolean(learningModule) }: {
  system: AppViewProps['system']; windowId?: string; args?: AppViewProps['args']; learningModule?: string;
  /** The id that TERMINAL_TYPE_EVENT uses to type here; a window's terminal uses its window id. */
  inputId?: string;
  /** Only the early learning journey disables clipboard actions. */
  clipboardDisabled?: boolean;
  colourOutput?: boolean;
}) {
  // Vasu's own terminal runs his commands as the tutor, so they never count towards the learner's lessons.
  const owner = args?.owner === 'vasu' ? 'vasu' : 'learner';
  const container = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const [clipboardNotice, setClipboardNotice] = useState(false);
  const clipboardTipId = useId();
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const interrupt = useRef<() => void>(() => {});

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
    terminal.current = term;
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
    let controller: TerminalController | undefined;
    let typeHere: ((data: string) => void) | undefined;
    const onType = (event: Event) => {
      const detail = (event as CustomEvent<TerminalTypeDetail>).detail;
      if (!inputId || detail.windowId !== inputId || !typeHere) return;
      detail.accepted = true;
      typeHere(detail.data);
    };
    window.addEventListener(TERMINAL_TYPE_EVENT, onType);
    const windowActions = {
      runningChanged: (value: boolean) => { if (!disposed) setRunning(value); },
      close: () => { if (windowId) void system.dispatch('session.close', { id: windowId }); },
      setTitle: (title: string) => {
        if (windowId) void system.dispatch('session.setTitle', {
          id: windowId, title: owner === 'vasu' ? `Vasu's terminal — ${title}` : title,
        });
      },
    };
    const screen = {
      write: (data: string) => { if (!disposed) term.write(data); },
      clear: () => term.clear(),
      get cols() { return term.cols; },
      get rows() { return term.rows; },
    };
    void (async () => {
      const session = owner === 'vasu'
        ? await system.tutor().createTerminal()
        : await system.createTerminal(learningModule ? { learningModule } : undefined);
      if (disposed) return;
      const motd = await system.dispatch<string>('fs.read', { path: '/etc/motd' });
      if (disposed) return;
      // The controller separates lesson feedback and hints from command output and the next prompt.
      controller = new TerminalController(screen, session, windowActions, { colourOutput });
      const activeController = controller;
      interrupt.current = () => {
        void activeController.input('\x03');
        term.focus();
      };
      // Handle the interrupt by its modern key value as well as xterm's legacy key-code mapping.
      // Embedded browsers may deliver Ctrl+C without the numeric keyCode xterm expects.
      term.attachCustomKeyEventHandler((event) => {
        if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'c') {
          if (event.type === 'keydown') {
            event.preventDefault();
            void activeController.input('\x03').catch((cause: unknown) => { if (!disposed) setError(String(cause)); });
          }
          return false;
        }
        return true;
      });
      term.onData((data) => {
        activeController.input(data).catch((cause: unknown) => { if (!disposed) setError(String(cause)); });
      });
      await activeController.start(motd.ok ? motd.value : undefined);
      typeHere = (data) => {
        term.focus();
        // The controller buffers busy input and must receive answers while a command is waiting.
        void activeController.input(data).catch((cause: unknown) => { if (!disposed) setError(String(cause)); });
      };
      term.focus();
      if (windowId && !disposed) {
        const launch = await system.dispatch<string | undefined>('session.consumeLaunch', { id: windowId });
        if (!disposed && launch.ok && launch.value) await activeController.input(launch.value + '\r');
      }
    })().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));

    return () => {
      disposed = true;
      controller?.dispose();
      interrupt.current = () => {};
      window.removeEventListener(TERMINAL_TYPE_EVENT, onType);
      observer?.disconnect();
      term.dispose();
      if (terminal.current === term) terminal.current = null;
    };
  }, [system, windowId, owner, learningModule, inputId, colourOutput]);

  useEffect(() => {
    const element = container.current;
    setClipboardNotice(false);
    if (!clipboardDisabled || !element) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const stop = guardTerminalClipboard(element, () => terminal.current?.hasSelection() ?? false, () => {
      setClipboardNotice(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setClipboardNotice(false), 4500);
    });
    return () => { stop(); clearTimeout(timeout); };
  }, [clipboardDisabled]);

  return <div className="terminal-view">
    {clipboardDisabled && <div className={`terminal-clipboard-lock ${clipboardNotice ? 'show-notice' : ''}`}>
      <span tabIndex={0} aria-describedby={clipboardTipId}>[ typing mode ]</span>
      <span id={clipboardTipId} role="tooltip" className="terminal-clipboard-tooltip">{CLIPBOARD_LOCK_MESSAGE}</span>
      <span className="terminal-clipboard-announcement" role="status">{clipboardNotice ? CLIPBOARD_LOCK_MESSAGE : ''}</span>
    </div>}
    {running && <button className="terminal-stop" onClick={() => interrupt.current()} title="Interrupt the running command (Ctrl+C)">Stop command</button>}
    {error && <p className="terminal-error" role="alert">Terminal error: {error}</p>}
    <div className="terminal-screen" ref={container} />
  </div>;
}

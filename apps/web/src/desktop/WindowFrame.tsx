import type { Window as SessionWindow } from '@tuxos/kernel';
import type { SystemClient } from '@tuxos/system';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { PopupMenu, type MenuItem } from '../desktops/shared/Menu';
import { usePointerDrag } from '../hooks/usePointerDrag';
import { getLazyView, retryView } from '../views';
import { AppErrorBoundary } from './AppErrorBoundary';
import { clampGeometry } from './geometry';

export interface Insets {
  top: number;
  bottom: number;
}

export interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Window decorations, one per desktop environment: KDE's Breeze (icon, title, three buttons), GNOME's
 * Adwaita (title, close only), CDE's Motif (window-menu button, title, minimise and maximise boxes) and
 * Hyprland's bare border (no title bar at all on a wide screen).
 */
export type Decoration = 'breeze' | 'adwaita' | 'motif' | 'borderless';

interface WindowFrameProps {
  system: SystemClient;
  window: SessionWindow;
  focused: boolean;
  /** Space the desktop's panels take, which windows keep clear of. */
  insets: Insets;
  decoration: Decoration;
  icon?: React.ReactNode;
  /** A tiling window manager's placement. Tiled windows can't be dragged, resized or maximised. */
  tiled?: Geometry;
  /** On another workspace: kept mounted, so apps keep their state, but not shown. */
  offWorkspace?: boolean;
  active?: boolean;
  closing?: boolean;
  /** Ask to close this window. The app may refuse (unsaved changes), so this goes through the desktop. */
  onClose(): void;
  /** Lets an app veto closing, e.g. to ask about unsaved changes. */
  setCloseGuard(guard: (() => boolean) | null): void;
  /** Extra entries for CDE's window menu, such as moving the window to another workspace. */
  windowMenu?: MenuItem[];
}

const MIN_WIDTH = 240;
const MIN_HEIGHT = 160;

export function WindowFrame(props: WindowFrameProps) {
  const { system, window, focused, insets, decoration, icon, tiled, offWorkspace, onClose, setCloseGuard } = props;
  const [preview, setPreview] = useState<Geometry>(() => geometryOf(window));
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const dragOrigin = useRef({ x: 0, y: 0 });
  const resizeOrigin = useRef({ width: 0, height: 0, x: 0, y: 0 });
  const View = getLazyView(window.appId);
  const [, setAttempt] = useState(0);
  // Apps get one stable function for the window's whole life, whatever the desktop passes on each render.
  const guardTarget = useRef(setCloseGuard);
  guardTarget.current = setCloseGuard;
  const guard = useCallback((next: (() => boolean) | null) => guardTarget.current(next), []);
  const fixed = Boolean(tiled) || window.maximized;

  useEffect(() => {
    setPreview(geometryOf(window));
  }, [window.x, window.y, window.width, window.height]);

  const movePreview = (event: React.PointerEvent) => {
    const position = clampPosition(
      pointerX(event) - dragOrigin.current.x,
      pointerY(event) - dragOrigin.current.y,
      preview.width,
      insets,
    );
    setPreview((current) => ({ ...current, ...position }));
  };
  const finishMove = (event: React.PointerEvent) => {
    const position = clampPosition(
      pointerX(event) - dragOrigin.current.x,
      pointerY(event) - dragOrigin.current.y,
      preview.width,
      insets,
    );
    setPreview((current) => ({ ...current, ...position }));
    void system.dispatch('session.move', { id: window.id, ...position });
  };
  const drag = usePointerDrag(movePreview, finishMove, () => setPreview(geometryOf(window)));

  const resizePreview = (event: React.PointerEvent) => {
    const width = Math.min(globalThis.innerWidth - preview.x, Math.max(MIN_WIDTH, resizeOrigin.current.width + pointerX(event) - resizeOrigin.current.x));
    const height = Math.min(globalThis.innerHeight - insets.bottom - preview.y, Math.max(MIN_HEIGHT, resizeOrigin.current.height + pointerY(event) - resizeOrigin.current.y));
    setPreview((current) => ({ ...current, width, height }));
  };
  const finishResize = (event: React.PointerEvent) => {
    const width = Math.min(globalThis.innerWidth - preview.x, Math.max(MIN_WIDTH, resizeOrigin.current.width + pointerX(event) - resizeOrigin.current.x));
    const height = Math.min(globalThis.innerHeight - insets.bottom - preview.y, Math.max(MIN_HEIGHT, resizeOrigin.current.height + pointerY(event) - resizeOrigin.current.y));
    setPreview((current) => ({ ...current, width, height }));
    void system.dispatch('session.resize', { id: window.id, width, height });
  };
  const resize = usePointerDrag(resizePreview, finishResize, () => setPreview(geometryOf(window)));

  const focus = () => {
    if (!focused) void system.dispatch('session.focus', { id: window.id });
  };
  const minimize = () => void system.dispatch('session.minimize', { id: window.id });
  const toggleMaximize = () => {
    if (!tiled) void system.dispatch('session.toggleMaximize', { id: window.id });
  };
  const stopPointer = (event: React.PointerEvent) => event.stopPropagation();
  const box = tiled ?? (window.maximized ? maximizedGeometry(insets) : preview);

  return <section
    className={`app-window app-${window.appId} deco-${decoration} ${focused ? 'focused' : ''} `
      + `${window.maximized ? 'maximized' : ''} ${tiled ? 'tiled' : ''} ${props.closing ? 'closing' : ''}`}
    style={{
      left: box.x,
      top: box.y,
      width: box.width,
      height: box.height,
      zIndex: window.z,
      display: window.minimized || offWorkspace ? 'none' : undefined,
    }}
    aria-hidden={window.minimized || offWorkspace || undefined}
    aria-label={window.title}
    data-tutor-target={`window:${window.id}`}
    onPointerDown={focus}
    onClickCapture={focus}
    onFocusCapture={focus}
  >
    <header
      onPointerDown={(event) => {
        if (fixed || (event.target as HTMLElement).closest('button')) return;
        dragOrigin.current = { x: pointerX(event) - preview.x, y: pointerY(event) - preview.y };
        drag.onPointerDown(event);
      }}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onDoubleClick={(event) => { if (!(event.target as HTMLElement).closest('button')) toggleMaximize(); }}
    >
      {decoration === 'motif' && <button
        className="window-button menu"
        aria-label={`Window menu for ${window.title}`}
        title="Window menu (double-click to close)"
        onPointerDown={stopPointer}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setMenu({ x: rect.left, y: rect.bottom + 2 });
        }}
        onDoubleClick={onClose}
      />}
      {decoration === 'breeze' && <span className="window-app-icon">{icon}</span>}
      <span className="window-title">{window.title}</span>
      <div className="window-buttons">
        {(decoration === 'breeze' || decoration === 'motif') && <>
          <WindowButton label={`Minimize ${window.title}`} kind="minimize" onClick={minimize} onPointerDown={stopPointer} />
          <WindowButton
            label={`Maximize ${window.title}`}
            kind="maximize"
            onClick={toggleMaximize}
            onPointerDown={stopPointer}
          />
        </>}
        {decoration !== 'motif'
          && <WindowButton label={`Close ${window.title}`} kind="close" onClick={onClose} onPointerDown={stopPointer} />}
      </div>
    </header>
    {window.appId === 'learn-linux' && <nav className="learning-window-controls" aria-label="Learning view">
      <button onClick={() => { toggleMaximize(); void system.dispatch('session.setPreferences', { resume: window.maximized ? 'desktop' : 'learn' }); }}>{window.maximized ? 'Return to window' : 'Focus view'}</button>
      <button onClick={() => void system.openApp('files')}>Open Files</button>
      <button onClick={() => { minimize(); void system.dispatch('session.setPreferences', { resume: 'desktop' }); }}>Explore desktop</button>
    </nav>}
    <div className="window-content">
      {View ? <AppErrorBoundary title={window.title} retry={() => { retryView(window.appId); setAttempt(value => value + 1); }}><Suspense fallback={<p className="window-loading" role="status">Opening {window.title}…</p>}>
        <View active={focused && props.active !== false && !window.minimized && !offWorkspace} system={system} windowId={window.id} args={window.args} setCloseGuard={guard} />
      </Suspense></AppErrorBoundary> : <p className="window-loading">This app is currently unavailable. Its saved records are kept. Re-enable it in Plugins or restore a compatible system backup.</p>}
    </div>
    {!fixed && <button
      className="resize-handle"
      aria-label={`Resize ${window.title}`}
      onPointerDown={(event) => {
        event.stopPropagation();
        resizeOrigin.current = {
          width: preview.width,
          height: preview.height,
          x: pointerX(event),
          y: pointerY(event),
        };
        resize.onPointerDown(event);
      }}
      onPointerMove={resize.onPointerMove}
      onPointerUp={resize.onPointerUp}
      onPointerCancel={resize.onPointerCancel}
    />}
    {menu && <PopupMenu
      x={menu.x}
      y={menu.y}
      onClose={() => setMenu(null)}
      items={[
        { label: 'Restore', run: () => { if (window.maximized) toggleMaximize(); } },
        { label: 'Minimize', run: minimize },
        { label: 'Maximize', run: () => { if (!window.maximized) toggleMaximize(); } },
        ...(props.windowMenu?.length ? ['separator' as const, ...props.windowMenu] : []),
        'separator',
        { label: 'Close', run: onClose },
      ]}
    />}
  </section>;
}

const GLYPHS = {
  minimize: <path d="M4.5 6.5 8 10l3.5-3.5" />,
  maximize: <path d="M4.5 9.5 8 6l3.5 3.5" />,
  close: <path d="M5 5l6 6M11 5l-6 6" />,
};

function WindowButton({ label, kind, onClick, onPointerDown }: {
  label: string;
  kind: keyof typeof GLYPHS;
  onClick(): void;
  onPointerDown(event: React.PointerEvent): void;
}) {
  return <button aria-label={label} className={`window-button ${kind}`} onClick={onClick} onPointerDown={onPointerDown}>
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      {GLYPHS[kind]}
    </svg>
  </button>;
}

function geometryOf(window: SessionWindow): Geometry {
  return { x: window.x, y: window.y, width: window.width, height: window.height };
}

/** Keep at least 40px of the title bar on screen, and never under a panel. */
function clampPosition(x: number, y: number, width: number, insets: Insets) {
  const box = clampGeometry({ x, y, width, height: 160 }, { width: globalThis.innerWidth, height: globalThis.innerHeight }, insets);
  return { x: box.x, y: box.y };
}

function maximizedGeometry(insets: Insets): Geometry {
  return {
    x: 0,
    y: insets.top,
    width: Math.max(MIN_WIDTH, globalThis.innerWidth),
    height: Math.max(MIN_HEIGHT, globalThis.innerHeight - insets.top - insets.bottom),
  };
}

function pointerX(event: React.PointerEvent): number {
  return Number.isFinite(event.clientX) ? event.clientX : 0;
}

function pointerY(event: React.PointerEvent): number {
  return Number.isFinite(event.clientY) ? event.clientY : 0;
}

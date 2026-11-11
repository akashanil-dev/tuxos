import { createKonamiTracker } from '../desktop/konami';
import { preloadTerminal } from '../views';
import { DiscoveryNotice } from '../desktop/DiscoveryNotice';
import { useWallpaper } from '../hooks/useWallpaper';
import type { Window as SessionWindow } from '@tuxos/kernel';
import type { SystemClient } from '@tuxos/system';
import type { Transport } from '@tuxos/tutor';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SessionSplash } from '../boot/PowerScreens';
import { AppIcon, IconThemeContext, preloadIconTheme } from '../desktop/AppIcon';
import { WindowFrame, type Geometry } from '../desktop/WindowFrame';
import { DesktopWidgets, desktopThemeStyle } from '../desktop/DesktopWidgets';
import { environmentFor } from '../desktops/registry';
import { PopupMenu } from '../desktops/shared/Menu';
import { tileLayout, tiledGroup } from '../desktops/shared/tiling';
import type { PowerAction } from '../desktops/types';
import { useSession } from '../hooks/useSession';
import { TutorPanel } from '../tutor/TutorPanel';
import { clampGeometry } from '../desktop/geometry';
import { rememberAppearance } from './appearance-memory';

/** Below this width every window fills the screen, so tiling and dragging are off. */
const NARROW = 720;

/**
 * The desktop: wallpaper, desktop icons, windows, and the current desktop environment's shell.
 * Switching environment (from Settings, or by the tutor) shows that environment's splash, then its shell.
 * Workspaces are part of the desktop, not the saved session, as on a real Linux desktop.
 */
export function Desktop({ system, tutor, onPower, onAchievements, verifySudo = null, active = true }: {
  system: SystemClient;
  /** Suspend desktop shortcuts while the learning view is in front. */
  active?: boolean;
  tutor?: Transport;
  onPower?(action: PowerAction): void;
  onAchievements?(): void;
  /** Checks the account's password for Vasu's sudo request; null for guests, who have no password. */
  verifySudo?: ((password: string) => Promise<boolean>) | null;
}) {
  const { apps, session, user, loaded } = useSession(system);
  const wallpaper = useWallpaper(session.wallpaper);
  const environment = environmentFor(session.desktop);
  // The environment currently drawn; null until the first splash has played.
  const [roll, setRoll] = useState(false);
  useEffect(() => {
    if (!active) return;
    const track = createKonamiTracker(); let timer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || (event.target as HTMLElement)?.closest?.('input, textarea, [contenteditable=true]')) return;
      if (track(event.key, Date.now())) { void system.dispatch('exploration.discover', { id: 'konami' }); if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setRoll(true); clearTimeout(timer); timer = setTimeout(() => setRoll(false), 1200); } }
    };
    window.addEventListener('keydown', onKey); return () => { window.removeEventListener('keydown', onKey); clearTimeout(timer); };
  }, [system, active]);
  const [shown, setShown] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [launcherRequest, setLauncherRequest] = useState(0);
  const [welcome, setWelcome] = useState<string | null>(null);
  const [chosenWorkspace, setChosenWorkspace] = useState(1);
  const [placement, setPlacement] = useState<Record<string, number>>({});
  const viewport = useViewport();
  const [closing, setClosing] = useState<string[]>([]);
  const closeTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => () => { for (const timer of closeTimers.current) clearTimeout(timer); }, []);
  const closeGuards = useRef(new Map<string, () => boolean>());
  useEffect(() => system.registerLeaveGuard?.('desktop', () => [...closeGuards.current.values()].every(guard => guard())), [system]);

  const workspaceCount = environment.workspaces?.length ?? 1;
  const workspace = Math.min(chosenWorkspace, workspaceCount);
  const workspaceOf = useCallback(
    (windowId: string) => Math.min(placement[windowId] ?? workspace, workspaceCount),
    [placement, workspace, workspaceCount],
  );
  const onWorkspace = (window: SessionWindow) => workspaceOf(window.id) === workspace;

  const open = useCallback((appId: string) => {
    void system.openApp(appId).then(result => { setLaunchError(result.ok ? '' : result.error.message); });
  }, [system]);
  const minimize = useCallback((id: string) => void system.dispatch('session.minimize', { id }), [system]);
  const power = useCallback((action: PowerAction) => onPower?.(action), [onPower]);
  useEffect(() => system.subscribe(event => {
    if (active && event.ok && event.action.type === 'session.power' && event.actor.kind === 'user') power((event.action.payload as { action: PowerAction }).action);
  }), [system, active, power]);
  const close = useCallback((id: string) => {
    const guard = closeGuards.current.get(id);
    if (guard && !guard()) return;
    setClosing(ids => [...ids, id]);
    const timer = setTimeout(() => { void system.dispatch('session.close', { id }); closeTimers.current.delete(timer); setClosing(ids => ids.filter(item => item !== id)); }, globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 100);
    closeTimers.current.add(timer);
  }, [system]);
  const activate = useCallback((id: string) => {
    setChosenWorkspace(workspaceOf(id));
    void system.dispatch('session.focus', { id });
  }, [system, workspaceOf]);
  const switchWorkspace = useCallback((target: number) => {
    if (target < 1 || target > workspaceCount) return;
    setChosenWorkspace(target);
    // Focus whatever was on top there, as a window manager does.
    const top = session.windows
      .filter((window) => !window.minimized && workspaceOf(window.id) === target)
      .sort((a, b) => b.z - a.z)[0];
    if (top) void system.dispatch('session.focus', { id: top.id });
  }, [system, session.windows, workspaceOf, workspaceCount]);
  const moveToWorkspace = useCallback((id: string, target: number) => {
    if (target >= 1 && target <= workspaceCount) setPlacement((current) => ({ ...current, [id]: target }));
  }, [workspaceCount]);

  useEffect(() => rememberAppearance(session.desktop, session.wallpaper), [session.desktop, session.wallpaper]);
  // Switching desktop: fetch the new icon theme while its splash screen plays.
  useEffect(() => preloadIconTheme(session.desktop), [session.desktop]);
  useEffect(() => {
    if (loaded && (session.preferences?.fastBoot !== false || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches))) setShown(session.desktop);
  }, [loaded, session.desktop, session.preferences?.fastBoot]);

  // New windows open on the current workspace.
  useEffect(() => {
    const missing = session.windows.filter((window) => placement[window.id] === undefined);
    if (missing.length) {
      setPlacement((current) => ({ ...current, ...Object.fromEntries(missing.map((window) => [window.id, workspace])) }));
    }
  }, [session.windows, placement, workspace]);

  // Hyprland can't minimise: bring back anything minimised in another desktop so it isn't lost.
  useEffect(() => {
    if (shown !== session.desktop || !environment.tiling) return;
    session.windows.filter((window) => window.minimized)
      .forEach((window) => void system.dispatch('session.focus', { id: window.id }));
  }, [shown, session.desktop, session.windows, environment.tiling, system]);

  useEffect(() => {
    if (shown === session.desktop) setWelcome(firstVisitWelcome(session.desktop, environment.welcome));
  }, [shown, session.desktop, environment.welcome]);

  useEffect(() => {
    if (!active) return;
    let superAlone = false;
    const down = (event: KeyboardEvent) => {
      superAlone = event.key === 'Meta' || event.key === 'OS';
      // Ctrl+Alt+T opens a terminal on most Linux desktops.
      if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 't') {
        event.preventDefault();
        open('terminal');
      }
    };
    // Tapping the Super (Windows) key on its own opens the launcher or overview.
    const up = (event: KeyboardEvent) => {
      if ((event.key === 'Meta' || event.key === 'OS') && superAlone) setLauncherRequest((count) => count + 1);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [open, active]);

  useEffect(() => {
    if (!loaded || viewport.width < NARROW) return;
    for (const win of session.windows) {
      if (win.centerOnLaunch) continue;
      const box = clampGeometry(win, viewport, { top: environment.insets.top, bottom: environment.insets.bottom });
      if (box.x !== win.x || box.y !== win.y) void system.dispatch('session.move', { id: win.id, x: box.x, y: box.y });
      if (box.width !== win.width || box.height !== win.height) void system.dispatch('session.resize', { id: win.id, width: box.width, height: box.height });
    }
  }, [system, loaded, viewport.width, viewport.height, environment.insets.top, environment.insets.bottom, session.windows]);
  useEffect(() => { if (!welcome) return; const timer = setTimeout(() => setWelcome(null), 8000); return () => clearTimeout(timer); }, [welcome]);
  const primaryApps = apps.filter(app => ['terminal', 'files', 'learn-linux', 'play'].includes(app.id));
  if (!loaded) return <main className="splash splash-gnome" />;

  const { Shell } = environment;
  const insets = { ...environment.insets, top: environment.insets.top };
  const tiles = new Map<string, Geometry>();
  let tiledIds: Set<string> | undefined;
  if (environment.tiling && viewport.width >= NARROW) {
    const visible = session.windows.filter((window) => !window.minimized && onWorkspace(window));
    const area = { x: 0, y: insets.top, width: viewport.width, height: viewport.height - insets.top - insets.bottom };
    const group = tiledGroup(visible.map(window => window.id), session.focusedId, area);
    tiledIds = new Set(group);
    tileLayout(group.length, area).forEach((geometry, index) => tiles.set(group[index]!, geometry));
  }
  const minimizedHere = session.windows.filter((window) => window.minimized && onWorkspace(window));

  return <IconThemeContext.Provider value={environment.id}>
    <main
      className={`desktop-screen de-${environment.id}${roll ? ' konami-roll' : ''}`}
      onPointerOverCapture={event => { if (active) preloadTerminal((event.target as HTMLElement).closest<HTMLElement>('[data-preload-app]')?.dataset.preloadApp ?? ''); }}
      onFocusCapture={event => { if (active) preloadTerminal((event.target as HTMLElement).closest<HTMLElement>('[data-preload-app]')?.dataset.preloadApp ?? ''); }}
      style={{
        ...desktopThemeStyle(session.theme),
        background: wallpaper.background,
        '--area-top': `${insets.top}px`,
        '--area-bottom': `${insets.bottom}px`,
      } as React.CSSProperties}
      onContextMenu={(event) => {
        if (event.target !== event.currentTarget && !(event.target as HTMLElement).classList.contains('icon-grid')) return;
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      {shown !== session.desktop && session.preferences?.fastBoot === false && <div className="desktop-splash-overlay"><SessionSplash desktop={session.desktop} onDone={() => setShown(session.desktop)} /></div>}
      <DiscoveryNotice system={system} />
      {environment.desktopIcons === 'apps' && <div className="icon-grid icons-apps" style={iconGridStyle(insets)}>
        {(primaryApps.length ? primaryApps : apps).map((app) => <button
          className="desktop-icon"
          key={app.id} data-preload-app={app.id}
          title={`Open ${app.title}`}
          data-tutor-target={`app:${app.id}`}
          onDoubleClick={() => open(app.id)}
          onPointerUp={event => { if (event.pointerType === 'touch' || event.pointerType === 'pen') open(app.id); }}
          onKeyDown={(event) => { if (event.key === 'Enter') open(app.id); }}
        >
          <AppIcon name={app.icon} />
          <span className="desktop-label">{app.title}</span>
        </button>)}
      </div>}
      {environment.desktopIcons === 'minimized' && <div className="icon-grid icons-minimized" style={iconGridStyle(insets)}>
        {minimizedHere.map((window) => {
          const app = apps.find((each) => each.id === window.appId);
          return <button
            className="desktop-icon"
            key={window.id}
            title={`Restore ${window.title}`}
            onClick={() => activate(window.id)}
          >
            {app && <AppIcon name={app.icon} />}
            <span className="desktop-label">{window.title}</span>
          </button>;
        })}
      </div>}
      <DesktopWidgets system={system} widgets={session.widgets ?? []} top={insets.top} bottom={insets.bottom} />
      {/* Minimized windows and other workspaces stay mounted (just hidden) so apps keep their state. */}
      {session.windows.map((window) => {
        const app = apps.find((each) => each.id === window.appId);
        return <WindowFrame
          key={window.id}
          system={system}
          window={window}
          focused={session.focusedId === window.id}
          active={active}
          closing={closing.includes(window.id)}
          insets={insets}
          decoration={environment.decoration}
          icon={app && <AppIcon name={app.icon} />}
          tiled={tiles.get(window.id)}
          offWorkspace={!onWorkspace(window) || Boolean(tiledIds && !tiledIds.has(window.id))}
          onClose={() => close(window.id)}
          setCloseGuard={(guard) => {
            if (guard) closeGuards.current.set(window.id, guard);
            else closeGuards.current.delete(window.id);
          }}
          windowMenu={environment.workspaces?.map((name, index) => ({
            label: `Occupy Workspace ${name}`,
            run: () => moveToWorkspace(window.id, index + 1),
          }))}
        />;
      })}
      {active && <Shell
        system={system}
        apps={apps}
        session={session}
        user={user}
        open={open}
        activate={activate}
        minimize={minimize}
        close={close}
        power={power}
        onAchievements={onAchievements}
        launcherRequest={launcherRequest}
        workspace={workspace}
        workspaceOf={workspaceOf}
        switchWorkspace={switchWorkspace}
        moveToWorkspace={moveToWorkspace}
      />}
      {active && menu && <PopupMenu
        x={menu.x}
        y={menu.y}
        items={environment.desktopMenu({ open, apps, power })}
        onClose={() => setMenu(null)}
      />}
      {launchError && <div className="notification" role="alert" style={{ top: 'auto', bottom: insets.bottom + 12, left: 12, right: 'auto' }}><strong>Keep learning</strong><p>{launchError}</p><button aria-label="Dismiss launch message" onClick={() => setLaunchError('')}>×</button></div>}
      {welcome && <div
        className={`notification notification-${environment.id}`}
        style={{ top: 'auto', bottom: insets.bottom + 12, left: 12, right: 'auto' }}
        role="status"
      >
        <strong>Welcome</strong>
        <p>{welcome}</p>
        <button aria-label="Dismiss" onClick={() => setWelcome(null)}>×</button>
      </div>}
      {tutor && active && session.preferences?.showVasu !== false && <TutorPanel system={system} transport={tutor} verifySudo={verifySudo} />}
    </main>
  </IconThemeContext.Provider>;
}

function iconGridStyle(insets: { top: number; bottom: number }): React.CSSProperties {
  return { top: insets.top + 16, bottom: insets.bottom + 16 };
}

/** The window size, kept up to date, for laying out tiled windows. */
function useViewport() {
  const read = () => ({ width: globalThis.innerWidth, height: globalThis.innerHeight });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const update = () => setSize(read());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return size;
}

/** The welcome note is shown once per desktop environment, in this browser. */
function firstVisitWelcome(desktop: string, text: string): string | null {
  const key = `tuxos.welcomed.${desktop}`;
  try {
    if (localStorage.getItem(key)) return null;
    localStorage.setItem(key, '1');
  } catch {
    // Without storage the note just shows each time, which is harmless.
  }
  return text;
}

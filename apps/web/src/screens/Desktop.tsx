import { useWallpaper } from '../hooks/useWallpaper';
import type { Window as SessionWindow } from '@tuxos/kernel';
import type { SystemClient } from '@tuxos/system';
import type { Transport } from '@tuxos/tutor';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SessionSplash } from '../boot/PowerScreens';
import { AppIcon, IconThemeContext, preloadIconTheme } from '../desktop/AppIcon';
import { WindowFrame, type Geometry } from '../desktop/WindowFrame';
import { DesktopWidgets, desktopThemeStyle } from '../desktop/DesktopWidgets';
import { FullscreenControl } from '../desktop/FullscreenControl';
import { environmentFor } from '../desktops/registry';
import { PopupMenu } from '../desktops/shared/Menu';
import { tileLayout } from '../desktops/shared/tiling';
import type { PowerAction } from '../desktops/types';
import { useSession } from '../hooks/useSession';
import { TutorPanel } from '../tutor/TutorPanel';
import { rememberAppearance } from './appearance-memory';

/** Below this width every window fills the screen, so tiling and dragging are off. */
const NARROW = 720;

/**
 * The desktop: wallpaper, desktop icons, windows, and the current desktop environment's shell.
 * Switching environment (from Settings, or by the tutor) shows that environment's splash, then its shell.
 * Workspaces are part of the desktop, not the saved session, as on a real Linux desktop.
 */
export function Desktop({ system, tutor, onPower, onAchievements, onLearnLinux, verifySudo = null, active = true }: {
  system: SystemClient;
  /** Suspend desktop shortcuts while the learning view is in front. */
  active?: boolean;
  tutor?: Transport;
  onPower?(action: PowerAction): void;
  onAchievements?(): void;
  /** Resume the account learning journey from any desktop launcher. */
  onLearnLinux?(): void;
  /** Checks the account's password for Vasu's sudo request; null for guests, who have no password. */
  verifySudo?: ((password: string) => Promise<boolean>) | null;
}) {
  const { apps, session, user, loaded } = useSession(system);
  const wallpaper = useWallpaper(session.wallpaper);
  const environment = environmentFor(session.desktop);
  // The environment currently drawn; null until the first splash has played.
  const [shown, setShown] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [launcherRequest, setLauncherRequest] = useState(0);
  const [welcome, setWelcome] = useState<string | null>(null);
  const [chosenWorkspace, setChosenWorkspace] = useState(1);
  const [placement, setPlacement] = useState<Record<string, number>>({});
  const viewport = useViewport();
  const closeGuards = useRef(new Map<string, () => boolean>());

  const workspaceCount = environment.workspaces?.length ?? 1;
  const workspace = Math.min(chosenWorkspace, workspaceCount);
  const workspaceOf = useCallback(
    (windowId: string) => Math.min(placement[windowId] ?? workspace, workspaceCount),
    [placement, workspace, workspaceCount],
  );
  const onWorkspace = (window: SessionWindow) => workspaceOf(window.id) === workspace;

  const open = useCallback((appId: string) => {
    if (appId === 'learn-linux' && onLearnLinux) { onLearnLinux(); return; }
    void system.openApp(appId).then(result => { setLaunchError(result.ok ? '' : result.error.message); });
  }, [system, onLearnLinux]);
  const minimize = useCallback((id: string) => void system.dispatch('session.minimize', { id }), [system]);
  const power = useCallback((action: PowerAction) => onPower?.(action), [onPower]);
  const close = useCallback((id: string) => {
    const guard = closeGuards.current.get(id);
    if (guard && !guard()) return;
    void system.dispatch('session.close', { id });
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

  if (!loaded) return <main className="splash splash-gnome" />;
  if (shown !== session.desktop) {
    return <SessionSplash desktop={session.desktop} onDone={() => setShown(session.desktop)} />;
  }

  const { Shell } = environment;
  const insets = { ...environment.insets, top: environment.insets.top + 36 };
  const tiles = new Map<string, Geometry>();
  if (environment.tiling && viewport.width >= NARROW) {
    const visible = session.windows.filter((window) => !window.minimized && onWorkspace(window));
    const area = { x: 0, y: insets.top, width: viewport.width, height: viewport.height - insets.top - insets.bottom };
    tileLayout(visible.length, area).forEach((geometry, index) => tiles.set(visible[index]!.id, geometry));
  }
  const minimizedHere = session.windows.filter((window) => window.minimized && onWorkspace(window));

  return <IconThemeContext.Provider value={environment.id}>
    <main
      className={`desktop-screen de-${environment.id}`}
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
      <FullscreenControl top={environment.insets.top} />
      {environment.desktopIcons === 'apps' && <div className="icon-grid icons-apps" style={iconGridStyle(insets)}>
        {apps.map((app) => <button
          className="desktop-icon"
          key={app.id}
          title={`Open ${app.title}`}
          data-tutor-target={`app:${app.id}`}
          onDoubleClick={() => open(app.id)}
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
          insets={insets}
          decoration={environment.decoration}
          icon={app && <AppIcon name={app.icon} />}
          tiled={tiles.get(window.id)}
          offWorkspace={!onWorkspace(window)}
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
      {launchError && <div className="notification" role="alert" style={{ top: insets.top + 10 }}><strong>Keep learning</strong><p>{launchError}</p><button aria-label="Dismiss launch message" onClick={() => setLaunchError('')}>×</button></div>}
      {welcome && <div
        className={`notification notification-${environment.id}`}
        style={{ top: insets.top + 10 }}
        role="status"
      >
        <strong>Welcome</strong>
        <p>{welcome}</p>
        <button aria-label="Dismiss" onClick={() => setWelcome(null)}>×</button>
      </div>}
      {tutor && <TutorPanel system={system} transport={tutor} verifySudo={verifySudo} />}
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

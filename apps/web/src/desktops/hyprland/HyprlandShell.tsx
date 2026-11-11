import { useEffect, useRef, useState } from 'react';
import { AppIcon } from '../../desktop/AppIcon';
import { Tux } from '../../desktop/Tux';
import { searchApps } from '../plasma/Kickoff';
import { useNow, waybarClockText } from '../shared/Clock';
import { Icon, StatusIcons } from '../shared/Icons';
import { PopupMenu, type MenuItem } from '../shared/Menu';
import type { App, ShellProps } from '../types';
import './hyprland.css';

const WORKSPACES = ['1', '2', '3', '4', '5'];

/**
 * Hyprland: a Waybar along the top, the wofi launcher, and keyboard control. Real Hyprland uses the Super
 * key; TuxOS uses Alt, because the learner's own computer catches Super first (on Windows it opens the
 * Start menu).
 */
export function HyprlandShell(props: ShellProps) {
  const { session, apps, open, activate, close, power, launcherRequest, workspace, workspaceOf } = props;
  const { switchWorkspace, moveToWorkspace } = props;
  const [wofi, setWofi] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const now = useNow();

  const visible = session.windows.filter((window) => !window.minimized && workspaceOf(window.id) === workspace);
  const focused = visible.find((window) => window.id === session.focusedId);

  useEffect(() => { if (launcherRequest) setWofi((value) => !value); }, [launcherRequest]);

  // The handler reads the latest state through a ref, so it is added once and never misses a key.
  const latest = useRef({ props, visible, focused });
  latest.current = { props, visible, focused };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.altKey && !event.ctrlKey) && !event.metaKey) return;
      if (event.key === 'Alt' || event.key === 'Meta') return;
      const { props: current, visible: windows, focused: active } = latest.current;
      const digit = /^Digit([1-5])$/.exec(event.code);
      const step = (by: number) => {
        if (!windows.length || !active) return;
        const index = windows.indexOf(active);
        current.activate(windows[(index + by + windows.length) % windows.length]!.id);
      };
      let handled = true;
      if (digit) {
        if (event.shiftKey && active) current.moveToWorkspace(active.id, Number(digit[1]));
        else if (!event.shiftKey) current.switchWorkspace(Number(digit[1]));
      } else {
        switch (event.key.toLowerCase()) {
          case 'q': case 'enter': current.open('terminal'); break;
          case 'e': current.open('files'); break;
          case 'r': case 'd': setWofi((value) => !value); break;
          case 'c': if (active) current.close(active.id); break;
          case 'arrowright': case 'arrowdown': step(1); break;
          case 'arrowleft': case 'arrowup': step(-1); break;
          default: handled = false;
        }
      }
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    // Capture phase: these must win even when an app (like the terminal) has focus.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const popup = (event: React.MouseEvent, items: MenuItem[]) => {
    const box = event.currentTarget.getBoundingClientRect();
    setMenu({ x: Math.min(box.left, globalThis.innerWidth - 200), y: box.bottom + 6, items });
  };

  return <>
    <header className="waybar">
      <div className="waybar-side">
        <button className="waybar-launch" title="Apps (Alt+R)" aria-label="Apps" onClick={() => setWofi(!wofi)}>
          <Tux />
        </button>
        <div className="waybar-workspaces" role="group" aria-label="Workspaces">
          {WORKSPACES.map((name, index) => {
            const number = index + 1;
            const occupied = session.windows.some((window) => workspaceOf(window.id) === number);
            return <button
              key={name}
              className={`waybar-workspace ${workspace === number ? 'selected' : ''} ${occupied ? 'occupied' : ''}`}
              title={`Workspace ${name} (Alt+${name})`}
              aria-pressed={workspace === number}
              onClick={() => switchWorkspace(number)}
            >{name}</button>;
          })}
        </div>
        <button className="waybar-windows" aria-label={`Switch window (${visible.length} open)`} disabled={!visible.length} onClick={event => popup(event, visible.map(window => ({ label: `${window.id === session.focusedId ? '• ' : ''}${window.title}`, run: () => activate(window.id) })))} title="Switch between readable window groups (Alt+arrow)">Windows ({visible.length})</button>
      </div>
      <button
        className="waybar-title"
        title="Window actions"
        disabled={!focused}
        onClick={(event) => focused && popup(event, [
          ...WORKSPACES.map((name, index) => ({
            label: `Move to workspace ${name}`,
            run: () => moveToWorkspace(focused.id, index + 1),
          })),
          'separator',
          { label: 'Close window (Alt+C)', run: () => close(focused.id) },
        ])}
      >{focused?.title ?? ''}</button>
      <div className="waybar-side waybar-right">
        <StatusIcons />
        <span className="waybar-clock" title={now.toLocaleString()}>{waybarClockText(now)}</span>
        <button
          className="waybar-power"
          title="Power"
          aria-label="Power menu"
          onClick={(event) => popup(event, [
            { label: 'Lock', run: () => power('lock') },
            { label: 'Log out', run: () => power('logout') },
            'separator',
            { label: 'Restart', run: () => power('restart') },
            { label: 'Shut down', run: () => power('shutdown') },
          ])}
        ><Icon name="power" /></button>
      </div>
    </header>
    {wofi && <Wofi apps={apps} onClose={() => setWofi(false)} launch={(app) => {
      setWofi(false);
      const running = session.windows.filter((window) => window.appId === app.id).sort((a, b) => b.z - a.z)[0];
      if (running) activate(running.id);
      else open(app.id);
    }} />}
    {menu && <PopupMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
  </>;
}

/** wofi, the launcher many Hyprland setups use: type to filter, arrows to move, Enter to open. */
function Wofi({ apps, launch, onClose }: { apps: App[]; launch(app: App): void; onClose(): void }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const results = query ? searchApps(apps, query) : [...apps].sort((a, b) => a.title.localeCompare(b.title));
  const index = Math.min(selected, Math.max(0, results.length - 1));

  return <div className="wofi-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="wofi" role="dialog" aria-label="Launcher">
      <input
        className="wofi-input"
        type="search"
        placeholder="drun"
        aria-label="Search apps"
        spellCheck={false}
        autoFocus
        value={query}
        onChange={(event) => { setQuery(event.target.value); setSelected(0); }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
          if (event.key === 'Enter' && results[index]) launch(results[index]!);
          if (event.key === 'ArrowDown' && results.length) {
            event.preventDefault();
            setSelected((index + 1) % results.length);
          }
          if (event.key === 'ArrowUp' && results.length) {
            event.preventDefault();
            setSelected((index - 1 + results.length) % results.length);
          }
        }}
      />
      <div className="wofi-list" role="listbox">
        {results.map((app, position) => <button
          key={app.id} data-preload-app={app.id}
          role="option"
          aria-selected={position === index}
          className={`wofi-row ${position === index ? 'selected' : ''}`}
          onClick={() => launch(app)}
        >
          <AppIcon name={app.icon} />
          <span>{app.title}</span>
          <small>{app.description}</small>
        </button>)}
      </div>
      <p className="wofi-keys">Alt+Q terminal · Alt+C close · Alt+arrows switch window · Alt+1…5 workspace · Alt+Shift+1…5 move window</p>
    </div>
  </div>;
}

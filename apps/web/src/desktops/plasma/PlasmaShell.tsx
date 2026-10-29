import { useEffect, useState } from 'react';
import { REWARDS, unlocked } from '@tuxos/sdk';
import { AppIcon } from '../../desktop/AppIcon';
import { Tux } from '../../desktop/Tux';
import { numericDateText, timeText, useNow } from '../shared/Clock';
import { Icon, StatusIcons } from '../shared/Icons';
import { PopupMenu } from '../shared/Menu';
import type { ShellProps } from '../types';
import { Kickoff } from './Kickoff';
import { KRunner } from './KRunner';
import './plasma.css';

/** Apps pinned to the task manager, as Plasma pins a few by default. */
const PINNED = ['terminal', 'files', 'learn-linux'];

/** KDE Plasma's panel: launcher, task manager, system tray, clock and Peek at Desktop. */
export function PlasmaShell(props: ShellProps) {
  const { session, apps, open, activate, minimize, power, launcherRequest, onAchievements } = props;
  const earned = session.journey ? REWARDS.filter(reward => unlocked(session.journey, reward.id)).length : 0;
  const [kickoff, setKickoff] = useState(false);
  const [krunner, setKRunner] = useState(false);
  const [powerMenu, setPowerMenu] = useState<{ x: number; y: number } | null>(null);
  const [peeking, setPeeking] = useState<string[] | null>(null);
  const now = useNow();

  useEffect(() => { if (launcherRequest) setKickoff((value) => !value); }, [launcherRequest]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Alt+Space and Alt+F2 open KRunner; Alt+F1 opens the launcher, as in Plasma.
      if (event.altKey && !event.ctrlKey && (event.code === 'Space' || event.key === 'F2')) {
        event.preventDefault();
        setKickoff(false);
        setKRunner(true);
      } else if (event.altKey && event.key === 'F1') {
        event.preventDefault();
        setKickoff((value) => !value);
      }
    };
    // Capture phase: global shortcuts must win even when an app (like the terminal) has focus.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const running = (appId: string) => session.windows.filter((window) => window.appId === appId);
  const taskIds = [...PINNED, ...session.windows.map((window) => window.appId)]
    .filter((id, index, all) => all.indexOf(id) === index && apps.some((app) => app.id === id));

  function clickTask(appId: string) {
    const windows = running(appId);
    if (!windows.length) return open(appId);
    const top = [...windows].sort((a, b) => b.z - a.z)[0]!;
    if (session.focusedId === top.id && !top.minimized) minimize(top.id);
    else activate(top.id);
  }

  // Peek at Desktop: minimize everything, and a second click brings back exactly those windows.
  function peek() {
    if (peeking) {
      peeking.forEach(activate);
      setPeeking(null);
      return;
    }
    const visible = session.windows.filter((window) => !window.minimized).map((window) => window.id);
    visible.forEach(minimize);
    setPeeking(visible);
  }

  return <>
    <footer className="plasma-panel">
      <button
        className={`plasma-kickoff ${kickoff ? 'active' : ''}`}
        aria-label="Application Launcher"
        title="Application Launcher"
        onClick={() => setKickoff(!kickoff)}
      ><Tux /></button>
      <nav className="plasma-tasks" aria-label="Task manager">
        {taskIds.map((appId) => {
          const app = apps.find((each) => each.id === appId)!;
          const windows = running(appId);
          const active = windows.some((window) => window.id === session.focusedId && !window.minimized);
          return <button
            key={appId}
            className={`plasma-task ${windows.length ? 'running' : ''} ${active ? 'active' : ''}`}
            title={windows.length ? windows.map((window) => window.title).join('\n') : app.title}
            aria-label={app.title}
            data-tutor-target={`task:${appId}`}
            onClick={() => clickTask(appId)}
          ><AppIcon name={app.icon} /></button>;
        })}
      </nav>
      {onAchievements && session.journey && <button
        className="plasma-achievements"
        aria-label="Achievements"
        aria-haspopup="dialog"
        title={`Achievements · ${earned}/${REWARDS.length} unlocked · ${session.journey.steps.length * 10} XP`}
        onClick={onAchievements}
      ><Icon name="trophy" /><span aria-hidden="true">{earned}/{REWARDS.length}</span></button>}
      <div className="plasma-tray">
        <StatusIcons />
        <div className="plasma-clock" title={now.toLocaleString()}>
          <span>{timeText(now)}</span>
          <small>{numericDateText(now)}</small>
        </div>
        <button
          className="plasma-tray-button"
          aria-label="Leave"
          title="Leave"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            setPowerMenu({ x: box.right - 200, y: box.top - 170 });
          }}
        ><Icon name="power" /></button>
      </div>
      <button className="plasma-peek" aria-label="Peek at Desktop" title="Peek at Desktop" onClick={peek} />
    </footer>
    {kickoff && <Kickoff {...props} onClose={() => setKickoff(false)} />}
    {krunner && <KRunner apps={apps} open={open} onClose={() => setKRunner(false)} />}
    {powerMenu && <PopupMenu
      x={powerMenu.x}
      y={powerMenu.y}
      onClose={() => setPowerMenu(null)}
      items={[
        { label: 'Lock', run: () => power('lock') },
        { label: 'Log Out', run: () => power('logout') },
        'separator',
        { label: 'Restart', run: () => power('restart') },
        { label: 'Shut Down', run: () => power('shutdown') },
      ]}
    />}
  </>;
}

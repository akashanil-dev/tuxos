import { useEffect, useState } from 'react';
import { PlasmaMark } from '../desktop/PlasmaMark';

const STOPPING = [
  'Stopping session-2.scope - Session 2 of User…',
  'Stopped display-manager.service - Display Manager.',
  'Stopped docker.service - Docker Application Container Engine.',
  'Stopped NetworkManager.service - Network Manager.',
  'Unmounted tmp.mount - Temporary Directory /tmp.',
  'Reached target shutdown.target - System Shutdown.',
  'Reached target final.target - Late Shutdown Services.',
];

/** systemd stopping everything, then a dark screen: click or press a key to turn the computer back on. */
export function PowerOff({ onPowerOn }: { onPowerOn(): void }) {
  const [shown, setShown] = useState(0);
  const off = shown > STOPPING.length;

  useEffect(() => {
    if (off) return;
    const timer = setTimeout(() => setShown(shown + 1), 160);
    return () => clearTimeout(timer);
  }, [shown, off]);

  useEffect(() => {
    if (!off) return;
    window.addEventListener('keydown', onPowerOn);
    return () => window.removeEventListener('keydown', onPowerOn);
  }, [off, onPowerOn]);

  if (off) {
    return <main className="power-off" onClick={onPowerOn}>
      <p>System halted.</p>
      <button className="power-button" onClick={onPowerOn}>Press any key to power on.</button>
    </main>;
  }
  return <main className="bootlog">
    {STOPPING.slice(0, shown).map((line) => <div key={line}>
      <span className="bootlog-bracket">[</span><span className="bootlog-ok">  OK  </span>
      <span className="bootlog-bracket">] </span>{line}
    </div>)}
  </main>;
}

/** How long each desktop's splash shows before its shell appears. */
const SPLASH_MS: Record<string, number> = { plasma: 2700, gnome: 600, cde: 1300, hyprland: 1100 };
/** Plasma's splash fades out over its last moments, revealing the desktop. */
const PLASMA_FADE_MS = 450;

/** What shows while a desktop session starts: each desktop environment's own splash screen. */
export function SessionSplash({ desktop, onDone }: { desktop: string; onDone(): void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const total = SPLASH_MS[desktop] ?? 600;
    const fade = desktop === 'plasma' ? setTimeout(() => setLeaving(true), total - PLASMA_FADE_MS) : undefined;
    const timer = setTimeout(onDone, total);
    return () => {
      clearTimeout(timer);
      if (fade) clearTimeout(fade);
    };
  }, [desktop, onDone]);

  switch (desktop) {
    case 'plasma':
      // Breeze's splash: the Plasma logo fades in, a thin bar fills in steps as the session's parts start,
      // and "Plasma · made by KDE" sits at the bottom. Then it all fades into the desktop.
      return <main className={`splash splash-plasma ${leaving ? 'leaving' : ''}`} role="status" aria-label="Starting KDE Plasma">
        <PlasmaMark className="plasma-logo" />
        <span className="splash-progress"><i /></span>
        <footer className="plasma-credit">
          <strong>Plasma</strong>
          <span>made by KDE</span>
        </footer>
      </main>;
    case 'cde':
      return <main className="splash splash-cde" role="status">
        <p>Starting the Common Desktop Environment…</p>
      </main>;
    case 'hyprland':
      return <main className="splash splash-hyprland" role="status" aria-label="Starting Hyprland">
        <strong className="hypr-logo">Hyprland</strong>
      </main>;
    default:
      return <main className="splash splash-gnome" />;
  }
}

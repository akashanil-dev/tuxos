import { useEffect, useRef, useState, type ReactNode } from 'react';
import { JOURNEY_LESSONS, REWARDS, journeyLevel, unlocked } from '@tuxos/sdk';
import type { SystemClient } from '@tuxos/system';
import type { Transport } from '@tuxos/tutor';
import type { PowerAction } from '../desktops/types';
import { Desktop } from '../screens/Desktop';
import { useJourney } from './useJourney';
import { AppIcon, IconThemeContext } from '../desktop/AppIcon';
import { PlasmaMark } from '../desktop/PlasmaMark';
import { Icon } from '../desktops/shared/Icons';
import './journey.css';

export function JourneyScreen(props: {
  system: SystemClient; tutor?: Transport; onPower(action: PowerAction): void;
  verifySudo: ((password: string) => Promise<boolean>) | null;
}) {
  const [generation, setGeneration] = useState(0);
  useEffect(() => props.system.onRestart(() => setGeneration(value => value + 1)), [props.system]);
  return <JourneySession key={generation} {...props} />;
}

function JourneySession({ system, tutor, onPower, verifySudo }: {
  system: SystemClient; tutor?: Transport; onPower(action: PowerAction): void;
  verifySudo: ((password: string) => Promise<boolean>) | null;
}) {
  const { progress, loaded } = useJourney(system);
  const [map, setMap] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const opened = useRef(false);
  useEffect(() => {
    void system.session().then(async session => {
      if (opened.current || session.preferences?.resume !== 'learn') return;
      opened.current = true;
      const result = await system.openApp('learn-linux', { guided: 'true' });
      if (result.ok) {
        const current = await system.session();
        if (!current.windows.find(w => w.id === result.value)?.maximized) await system.dispatch('session.toggleMaximize', { id: result.value });
      }
    });
  }, [system]);
  useEffect(() => system.onSaveError(cause => setError(cause.message)), [system]);
  if (!loaded) return <div className="journey-loading">Opening your desktop…</div>;
  if (!progress) return <Desktop system={system} tutor={tutor} onPower={onPower} verifySudo={verifySudo} />;
  const level = journeyLevel(progress);
  const next = REWARDS.find(r => !unlocked(progress, r.id));
  const reward = [...REWARDS].reverse().find(r => unlocked(progress, r.id) && !progress.acknowledged.includes(r.id));
  const resumeLearning = () => { setMap(false); void system.openApp('learn-linux'); };
  const acknowledge = async () => {
    if (!reward) return;
    setSaving(true);
    try {
      const result = await system.dispatch('journey.ack', { id: reward.id });
      if (!result.ok) throw new Error(result.error.message);
      await system.flush(); setError('');
    } catch (cause) { setError(String(cause)); }
    finally { setSaving(false); }
  };
  return <div className="journey-shell">
    <div className="journey-desktop" inert={map}><Desktop system={system} tutor={tutor} onPower={onPower} verifySudo={verifySudo} active={!map} onAchievements={() => setMap(true)} /></div>
    {error && <div role="alert" className="journey-save-error">{error}<button onClick={() => void system.flush().then(() => { setError(''); }).catch(cause => setError(String(cause)))}>Retry saving</button></div>}
    {map && <JourneyDialog className="journey-map" label="Your reward map" onClose={() => setMap(false)}>
      <header><div><small>YOUR LINUX JOURNEY</small><h2>Your achievements</h2></div><button onClick={() => setMap(false)}>Close rewards</button></header>
      <div className="journey-achievement-summary" aria-label="Achievement progress">
        <strong>{REWARDS.filter(r => unlocked(progress, r.id)).length}/{REWARDS.length} achievements earned</strong>
        <span>{progress.steps.length * 10} XP</span><span>{level}/{JOURNEY_LESSONS.length} lessons complete</span>
      </div>
      <p>{next ? `Next achievement: ${next.title} · ${next.at - level} more ${next.at - level === 1 ? 'lesson' : 'lessons'}.` : 'Every achievement earned. Keep exploring!'} Hints and answers cost nothing.</p>
      <button className="journey-resume" onClick={resumeLearning}>Continue learning →</button>
      <button onClick={() => { setMap(false); void system.openApp('terminal', { installDesktop: 'plasma' }); }}>Practice installing a desktop</button>
      <ol>{REWARDS.map(r => {
        const earned = unlocked(progress, r.id);
        return <li key={r.id} className={earned ? 'earned' : ''}>
          <span className="journey-reward-icon" aria-hidden="true">{r.icon}</span>
          <div className="journey-achievement-detail"><small>{earned ? '✓ Earned' : `After lesson ${r.at}`}</small><h3>{r.title}</h3><p>{r.description}</p>
            <progress aria-label={`Progress toward ${r.title}`} value={Math.min(level, r.at)} max={r.at} />
            <small>{Math.min(level, r.at)}/{r.at} lessons{earned ? ' · Complete' : ` · ${r.at - level} to go`}</small>
          </div>
        </li>;
      })}</ol>
    </JourneyDialog>}
    {reward && !map && <aside className="milestone-toast" role="status"><strong>{reward.title}</strong><span>{reward.description}</span><button disabled={saving} onClick={() => void acknowledge()}>Dismiss milestone</button><button onClick={() => setMap(true)}>View rewards</button></aside>}
  </div>;
}

export function RewardReveal({ reward, saving, onContinue }: { reward: typeof REWARDS[number]; saving: boolean; onContinue(): void }) {
  const icon = reward.id === 'first-command' ? 'terminal' : reward.id === 'plugins' ? 'plugins' : reward.id === 'complete' ? 'learn-linux' : 'settings';
  return <JourneyDialog className="journey-celebration" label="Reward unlocked" onClose={onContinue}>
    <header className="journey-reveal-titlebar"><Icon name="trophy" /><span>Achievement unlocked — TuxOS</span><button className="journey-reveal-close" disabled={saving} aria-label="Dismiss reward" onClick={onContinue}>×</button></header>
    <div className="journey-reveal-body">
      <div className="journey-reveal-art" aria-hidden="true">{reward.id === 'desktop' ? <PlasmaMark /> : <IconThemeContext.Provider value="plasma"><AppIcon name={icon} /></IconThemeContext.Provider>}</div>
      <div className="journey-reveal-copy"><small>Lesson {reward.at} complete</small><h2>{reward.title}</h2><p>{reward.description}</p></div>
    </div>
    <footer className="journey-reveal-actions"><span>Learn Linux · Achievement earned</span><button data-dialog-default className="journey-reveal-continue" disabled={saving} onClick={onContinue}>{reward.id === 'desktop' ? 'Set up KDE Plasma' : 'Continue'}</button></footer>
  </JourneyDialog>;
}

/** Keep keyboard users inside the open dialog and restore their previous focus. */
function JourneyDialog({ className, label, onClose, children }: { className: string; label: string; onClose(): void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    (ref.current?.querySelector<HTMLElement>('[data-dialog-default]:not(:disabled)') ?? ref.current?.querySelector<HTMLElement>('button:not(:disabled)'))?.focus();
    return () => { previous?.focus(); };
  }, []);
  return <div className={`journey-overlay ${className === 'journey-celebration' ? 'journey-reveal-overlay' : ''}`}><section ref={ref} className={className} role="dialog" aria-modal="true" aria-label={label} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key !== 'Tab') return;
    const controls = [...ref.current!.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input, [tabindex="0"]')];
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }}>{children}</section></div>;
}

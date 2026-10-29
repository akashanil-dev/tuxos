import { useEffect, useRef, useState, type ReactNode } from 'react';
import { JOURNEY_LESSONS, REWARDS, desktopReady, journeyLevel, unlocked, type JourneyProgress } from '@tuxos/sdk';
import type { LessonStatus } from '@tuxos/lessons';
import { useLessonStatus } from '@tuxos/course-view';
import { TerminalSurface } from '@tuxos/module-terminal/view';
import type { SystemClient } from '@tuxos/system';
import type { Transport } from '@tuxos/tutor';
import type { PowerAction } from '../desktops/types';
import { Desktop } from '../screens/Desktop';
import { FullscreenControl } from '../desktop/FullscreenControl';
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
  const [installer, setInstaller] = useState(false);
  const [mode, setMode] = useState<'learn' | 'desktop'>('learn');
  const [visitedDesktop, setVisitedDesktop] = useState(false);
  useEffect(() => {
    if (!progress) return;
    if (unlocked(progress, 'desktop') && !desktopReady(progress)) {
      setInstaller(true);
      setMode('learn');
    } else if (installer && desktopReady(progress)) {
      // Enter Plasma once after installation; returning to lessons stays in learning mode.
      setInstaller(false);
      setVisitedDesktop(true);
      setMode('desktop');
    }
  }, [progress, installer]);
  const [map, setMap] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState('Progress saves to your account');
  useEffect(() => system.onSaveError(cause => { setError(cause.message); setSaveState('Changes need saving'); }), [system]);
  useEffect(() => {
    if (!progress) return;
    let active = true;
    setSaveState('Saving progress…');
    void system.flush().then(() => { if (active) setSaveState('Progress saved to your account'); }).catch(cause => { if (active) { setError(String(cause)); setSaveState('Changes need saving'); } });
    return () => { active = false; };
  }, [system, progress]);
  if (!loaded) return <div className="journey-loading">Opening your learning journey…</div>;
  // Embedded/offline development harnesses without progression keep the regular desktop.
  if (!progress) return <Desktop system={system} tutor={tutor} onPower={onPower} verifySudo={verifySudo} />;
  const level = journeyLevel(progress);
  const next = REWARDS.find(r => !unlocked(progress, r.id));
  const reward = [...REWARDS].reverse().find(r => unlocked(progress, r.id) && !progress.acknowledged.includes(r.id));
  const resumeLearning = () => { setMap(false); setMode('learn'); };
  const explore = () => { if (desktopReady(progress)) { setVisitedDesktop(true); setMode('desktop'); } };
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
    <div className={`journey-learning ${!desktopReady(progress) ? 'journey-console' : ''}`} inert={Boolean(map || reward)} hidden={mode !== 'learn'}>
      <FullscreenControl />
      <header className="journey-header"><div className="journey-brand"><span aria-hidden="true">&gt;_</span><div><strong>TuxOS</strong>{desktopReady(progress) && <small>Learn a little. Unlock a little.</small>}</div></div><div className="journey-stats"><strong>{progress.steps.length * 10} XP</strong><span>{level}/{JOURNEY_LESSONS.length} lessons</span></div>
        <div className="journey-top-actions"><button onClick={() => setMap(true)}>Your rewards</button><button disabled={!desktopReady(progress)} onClick={explore}>{desktopReady(progress) ? 'Explore desktop ↗' : unlocked(progress, 'desktop') ? 'Install KDE to enter desktop' : 'Desktop · unlock at lesson 2'}</button><button onClick={() => onPower('logout')}>Sign out</button></div>
      </header>
      <section className="journey-next-reward" aria-label="Next reward"><span>{next ? `Next: ${next.title}` : 'Everything unlocked. Keep exploring!'}</span><progress max={next?.at ?? 34} value={level} aria-label="Progress to next reward" /><small>{next ? `${next.at - level} more ${next.at - level === 1 ? 'lesson' : 'lessons'}` : 'Learning path complete'}</small></section>
      {installer || (unlocked(progress, 'desktop') && !desktopReady(progress)) ? <DesktopInstallation system={system} ready={desktopReady(progress)} /> : <Mission system={system} progress={progress} visible={mode === 'learn'} onExplore={explore} />}
      <footer className="journey-save"><span>{saveState}</span><span>No timers. No lost lives. Hints are always welcome.</span></footer>
    </div>
    {visitedDesktop && <div className="journey-desktop" inert={Boolean(map || reward)} hidden={mode !== 'desktop'}><Desktop system={system} tutor={tutor} onPower={onPower} verifySudo={verifySudo} active={mode === 'desktop' && !map && !reward} onAchievements={() => setMap(true)} onLearnLinux={resumeLearning} /></div>}
    {error && <div role="alert" className="journey-save-error">{error}<button onClick={() => void system.flush().then(() => { setError(''); setSaveState('Progress saved to your account'); }).catch(cause => setError(String(cause)))}>Retry saving</button></div>}
    {map && <JourneyDialog className="journey-map" label="Your reward map" onClose={() => setMap(false)}>
      <header><div><small>YOUR LINUX JOURNEY</small><h2>Your achievements</h2></div><button onClick={() => setMap(false)}>Close rewards</button></header>
      <div className="journey-achievement-summary" aria-label="Achievement progress">
        <strong>{REWARDS.filter(r => unlocked(progress, r.id)).length}/{REWARDS.length} achievements earned</strong>
        <span>{progress.steps.length * 10} XP</span><span>{level}/{JOURNEY_LESSONS.length} lessons complete</span>
      </div>
      <p>{next ? `Next unlock: ${next.title} · ${next.at - level} more ${next.at - level === 1 ? 'lesson' : 'lessons'}.` : 'Every achievement earned. Your whole desktop is unlocked!'} Hints and answers cost nothing.</p>
      <button className="journey-resume" onClick={resumeLearning}>Continue learning →</button>
      <ol>{REWARDS.map(r => {
        const earned = unlocked(progress, r.id);
        return <li key={r.id} className={earned ? 'earned' : ''}>
          <span className="journey-reward-icon" aria-hidden="true">{r.icon}</span>
          <div className="journey-achievement-detail"><small>{earned ? '✓ Unlocked' : `After lesson ${r.at}`}</small><h3>{r.title}</h3><p>{r.description}</p>
            <progress aria-label={`Progress toward ${r.title}`} value={Math.min(level, r.at)} max={r.at} />
            <small>{Math.min(level, r.at)}/{r.at} lessons{earned ? ' · Complete' : ` · ${r.at - level} to go`}</small>
          </div>
        </li>;
      })}</ol>
    </JourneyDialog>}
    {reward && !map && <RewardReveal reward={reward} saving={saving} onContinue={() => { if (!saving) void acknowledge(); }} />}
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

function Mission({ system, progress, visible, onExplore }: { system: SystemClient; progress: JourneyProgress; visible: boolean; onExplore(): void }) {
  const { status, error, call } = useLessonStatus(system, 'learn-linux');
  const [initialized, setInitialized] = useState(false);
  const [initialError, setInitialError] = useState('');
  const [help, setHelp] = useState('');
  const [hints, setHints] = useState(0);
  const [busy, setBusy] = useState(false);
  const stepId = status?.active?.step.id;
  const starting = useRef(false);
  const initialProgress = useRef(progress);
  useEffect(() => {
    if (starting.current) return;
    starting.current = true;
    void (async () => {
      const curriculum = await system.dispatch<LessonStatus>('learn-linux.curriculum', {});
      if (!curriculum.ok) throw new Error(curriculum.error.message);
      const next = JOURNEY_LESSONS.find(id => !initialProgress.current.lessons.includes(id));
      const active = curriculum.value.active;
      // Resume in order; earlier earned lessons stay available for review in the desktop app.
      if (next && active?.lesson.id !== next) {
        const start = await system.dispatch('learn-linux.start', { lesson: next });
        if (!start.ok) throw new Error(start.error.message);
      }
      setInitialized(true);
    })().catch(cause => { setInitialError(String(cause)); starting.current = false; });
  }, [system]);
  // The desktop can open optional AI practice. Returning here restores the reviewed path.
  useEffect(() => {
    if (visible && initialized && status && !status.builtIn) void call('curriculum', {});
  }, [visible, initialized, Boolean(status?.builtIn), call]);
  useEffect(() => { setHelp(''); setHints(0); }, [stepId]);
  const currentStep = useRef(stepId);
  currentStep.current = stepId;
  async function answer() {
    const requested = stepId;
    const result = await system.dispatch<string>('learn-linux.solution', {});
    if (currentStep.current === requested) setHelp(result.ok ? `Try this: ${result.value}\nType it yourself below to complete the task.` : result.error.message);
  }
  const next = status?.lessons.find(l => !progress.lessons.includes(l.id));
  const active = status?.active;
  const lessonIndex = active ? JOURNEY_LESSONS.indexOf(active.lesson.id as typeof JOURNEY_LESSONS[number]) : -1;
  const terminalLesson = active?.lesson.id ?? 'completed';
  if (!initialized || !status) return <div className="journey-loading" role="status">{initialError || error || 'Preparing your first question…'}{initialError && <button onClick={() => location.reload()}>Reload and retry</button>}</div>;
  return <main className="journey-mission">
    <section className="journey-question" aria-label="Current question">
      {(error || initialError) && <p role="alert">{error || initialError}</p>}
      {active ? <><div className="journey-question-meta"><span>LESSON {lessonIndex + 1} · {active.lesson.title}</span><span>Question {active.stepIndex + 1}/{active.steps.length}</span></div><h1>{active.step.task}</h1>
        <div className="journey-help-actions"><button onClick={() => { setHelp(active.step.hints[Math.min(hints, active.step.hints.length - 1)] ?? 'Try one command at a time.'); setHints(n => n + 1); }}>Hint</button><button onClick={() => void answer()}>Show answer</button><details key={stepId}><summary>Explain this</summary><p>{active.step.teach || active.lesson.story}</p></details></div>
        {help && <pre className="journey-help" role="status">{help}</pre>}
        {active.steps.slice(0, active.stepIndex).length > 0 && <small className="journey-encouragement">✓ {active.stepIndex} {active.stepIndex === 1 ? 'question' : 'questions'} done. You’re making progress.</small>}
      </> : <div className="journey-lesson-done"><span>✓</span><div><h1>{next ? 'Lesson complete. Nicely done.' : 'You built your Linux foundation.'}</h1><p>{next ? `Up next: ${next.title}` : 'Every reward is yours. Explore your desktop or review a lesson anytime.'}</p></div>{next ? <button disabled={busy} onClick={() => { setBusy(true); void call('start', { lesson: next.id }).finally(() => setBusy(false)); }}>Continue to next lesson →</button> : <button onClick={onExplore}>Explore your unlocked desktop ↗</button>}</div>}
      {active && lessonIndex >= 2 && <button className="journey-open-files" onClick={onExplore}>Need a desktop app? Open your desktop ↗</button>}
    </section>
    <div className="journey-terminal">{desktopReady(progress) && <div className="journey-terminal-label"><span>● Terminal</span><small>Type a command, then press Enter</small></div>}{active ? <TerminalSurface key={terminalLesson} system={system} learningModule="learn-linux" inputId="journey-terminal" clipboardDisabled={!desktopReady(progress)} /> : <div className="journey-terminal-rest"><pre>{status.lastExplain || 'Take a breath. Your next discovery is waiting.'}</pre></div>}</div>
  </main>;
}

function DesktopInstallation({ system, ready }: { system: SystemClient; ready: boolean }) {
  return <main className="journey-mission">
    <section className="journey-question journey-install" aria-label="Install KDE Plasma">
      <div className="journey-question-meta">DESKTOP UNLOCKED · INSTALLATION</div>
      <h1>{ready ? 'Starting KDE Plasma…' : 'Install your first desktop: KDE Plasma'}</h1>
      {!ready && <>
        <p>Type these commands one at a time. The first refreshes the package list; the second installs your desktop. Press Enter or type Y when apt asks to continue. KDE opens automatically when installation finishes.</p>
        <pre>sudo apt update{'\n'}sudo apt install kde-plasma-desktop</pre>
        <small>This installs the TuxOS simulation. Downloads and package sizes are practice examples.</small>
      </>}
    </section>
    <div className="journey-terminal"><TerminalSurface system={system} inputId="desktop-installation" learningModule="desktop-installation" clipboardDisabled={!ready} colourOutput /></div>
  </main>;
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

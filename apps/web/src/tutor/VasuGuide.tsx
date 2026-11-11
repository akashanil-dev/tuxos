import { useEffect, useState } from 'react';
import type { SystemClient } from '@tuxos/system';

interface GuideStatus {
  lesson: { active?: { lesson: { title: string }; step: { task: string; hints: string[] } } };
  progress: { started?: boolean; done: Record<string, number> };
}
/** Read the actual quest objective. Never send the guide or learner activity to AI. */
export function VasuGuide({ system, onClose }: { system: SystemClient; onClose(): void }) {
  const [status, setStatus] = useState<GuideStatus | null>(null);
  const [hint, setHint] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const result = await system.dispatch<GuideStatus>('learn-adventure.status', {});
        if (alive && result.ok) setStatus(result.value);
      } catch { /* The journal can still be opened if its module is not active yet. */ }
    };
    void refresh();
    const stop = system.onChange(event => {
      if (!/^(learn-adventure|exploration|shell|fs)\./.test(event.action.type)) return;
      clearTimeout(timer); timer = setTimeout(() => { void refresh(); }, 30);
    });
    return () => { alive = false; stop(); clearTimeout(timer); };
  }, [system]);
  const current = status?.lesson.active;
  useEffect(() => setHint(false), [current?.step.task]);
  const open = async (id: string) => {
    try { const result = await system.openApp(id); setError(result.ok ? '' : result.error.message); }
    catch (cause) { setError(String(cause)); }
  };
  const complete = Object.keys(status?.progress.done ?? {}).length >= 10;
  return <aside className="vasu-bubble" aria-label="Vasu adventure guide">
    <button className="vasu-bubble-close" aria-label="Dismiss adventure guide" onClick={onClose}>×</button>
    <p className="vasu-bubble-hello">{complete ? 'You finished all ten quests!' : current?.lesson.title ?? 'Let’s begin your adventure'}</p>
    <p aria-live="polite">{complete ? 'You’ve practised the basics. Try more games in Play, continue the Linux course, or open Try Linux to explore your next step.' : current?.step.task ?? 'Open the adventure journal and choose Prepare adventure. It adds the practice files to your virtual home folder, then shows your first quest.'}</p>
    {hint && current && <p>{current.step.hints.join(' ')}</p>}
    {error && <p role="alert">{error}</p>}
    <div className="vasu-bubble-actions">
      <button onClick={() => void open('learn-adventure')}>Open adventure journal</button>
      {current && <><button className="primary" onClick={() => void open('terminal')}>Open Terminal</button><button onClick={() => setHint(value => !value)}>{hint ? 'Hide hint' : 'Give me a hint'}</button></>}
      {complete && <button onClick={() => void open('try-linux')}>Try Linux</button>}
    </div>
  </aside>;
}

import { useEffect, useState } from 'react';
import type { AppViewProps } from '@tuxos/system';
import { course } from './course';
import type { AdventureStatus } from './index';
import './adventure.css';
export default function AdventureView({ system }: AppViewProps) {
  const [status, setStatus] = useState<AdventureStatus | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [repair, setRepair] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = async () => { const result = await system.dispatch<AdventureStatus>('learn-adventure.status', {}); if (result.ok) setStatus(result.value); };
  useEffect(() => {
    let alive = true;
    const update = () => { void system.dispatch<AdventureStatus>('learn-adventure.status', {}).then(result => { if (alive && result.ok) setStatus(result.value); }); };
    update(); const stop = system.onChange(event => { if (event.mutates && /^(learn-adventure|pipe-dream|fs|script)\./.test(event.action.type)) update(); });
    return () => { alive = false; stop(); };
  }, [system]);
  const run = async (type: string, payload: unknown = {}) => {
    setBusy(true); setError('');
    try { const result = await system.dispatch(type, payload); if (!result.ok) { setError(result.error.message); return false; } await refresh(); return true; }
    catch (e) { setError(String(e)); return false; } finally { setBusy(false); }
  };
  const launch = (app: string, args?: Record<string, string>) => void system.openApp(app, args).then(result => { if (!result.ok) setError(result.error.message); });
  if (!status) return <p>Opening your adventure journal…</p>;
  const current = status.lesson.active?.lesson.id;
  const quest = course.lessons.find(q => q.id === (selected ?? current)) ?? course.lessons[0]!;
  const done = status.progress.done[quest.id];
  const count = course.lessons.filter(q => status.progress.done[q.id]).length;
  return <div className="adventure-view">
    <aside aria-label="Adventure quests"><h2>Tux’s Adventure</h2><p>{count} of 10 quests complete</p>{course.lessons.map((q, i) => <button key={q.id} aria-current={quest.id === q.id ? 'step' : undefined} onClick={() => { setSelected(q.id); setHint(null); }}>{status.progress.done[q.id] ? '✓' : i + 1} {q.title}{current === q.id ? ' · current' : ''}</button>)}<button onClick={() => { setSelected(null); setHint(null); }}>Follow current quest</button><button onClick={() => { setRepair(value => !value); void refresh(); }}>Recover practice files</button></aside>
    <main>
      {error && <p role="alert">{error}</p>}
      {!status.progress.started && <section className="adventure-start"><h1>Help Tux rescue the crown</h1><p>Prepare a welcome letter and dungeon in your home, plus the crown in /root. Existing files are kept. Your courses and earned history stay separate.</p><button disabled={busy} onClick={async () => { if (await run('learn-adventure.prepare')) { await run('learn-adventure.start'); setSelected(null); } }}>Prepare adventure and begin</button>{status.repair.some(item => item.state !== 'missing') && <p>Some adventure paths already contain files. Review Recover practice files if those files stop an objective.</p>}</section>}
      {count === 10 && <section className="adventure-complete"><h1>Crown rescued. Adventure complete!</h1><p>All ten quests are part of your history. Try a deeper course, keep exploring, or take your first steps with real Linux.</p><button onClick={() => launch('try-linux')}>Try Linux →</button><button onClick={() => launch('learn-linux')}>Continue learning →</button></section>}
      <h1>{done ? '✓ ' : ''}{quest.title}</h1><p>{quest.story}</p>
      {current && current !== quest.id && !done && <p>Preview of a later quest. Your current quest is {status.lesson.active?.lesson.title}.</p>}
      <ul className="adventure-objectives">{quest.steps.map((step, i) => <li key={step.id}><span>{done || status.progress.progress[quest.id]?.[i] ? '✓' : '○'} {step.task}</span><button onClick={() => setHint(hint === step.id ? null : step.id)} aria-expanded={hint === step.id}>Hint</button>{hint === step.id && <p>{step.hints.join(' ')}</p>}</li>)}</ul>
      <div className="adventure-actions"><button onClick={() => launch('terminal')}>Open Terminal</button><button onClick={() => launch('files')}>Open Files</button>{quest.id === 'pipes' && <button onClick={() => launch('pipe-dream')}>Open Pipe Dream</button>}{quest.id === 'graduate' && <button onClick={() => launch('try-linux')}>Try Linux</button>}</div>
      <p className="adventure-note">Use any Terminal window. Type <code>quest</code> for your checklist or <code>quest hint</code> for the next hint. Reading a quest file in Files counts too. Desktop styles are available throughout the adventure.</p>
      {repair && <section className="adventure-recovery"><h2>Recover practice files</h2><p>This restores only the listed adventure files. Personal files elsewhere, extra files in the dungeon, course progress, discoveries and scores are kept. Changed files are backed up before repair.</p>{status.repair.length ? <><ul>{status.repair.map(item => <li key={item.path}><code>{item.path}</code> · {item.state}</li>)}</ul><button disabled={busy || status.repair.some(item => item.state === 'blocked')} onClick={() => void run('learn-adventure.repair', { paths: status.repair.map(item => item.path) })}>Back up and repair {status.repair.length} files</button></> : <p>All practice files match their starting content and permissions.</p>}{status.repair.some(item => item.state === 'blocked') && <p>A path is occupied by a different kind of file or directory. Move it in Files or Terminal before repairing; recovery will not remove it.</p>}{status.progress.recovery && <><p>Recovery backup: {new Date(status.progress.recovery.createdAt).toLocaleString()}. Restoring swaps it with the current files, so you can undo the restore.</p><button disabled={busy} onClick={() => void run('learn-adventure.undoRepair')}>Restore previous practice files</button></>}</section>}
    </main>
  </div>;
}

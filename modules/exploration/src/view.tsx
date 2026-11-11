import { useEffect, useRef, useState } from 'react';
import { emptyExploration, EXPLORATION_ACHIEVEMENTS, type ExplorationProgress } from '@tuxos/sdk';
import type { AppViewProps } from '@tuxos/system';
import { EXAMPLES } from './examples';
import { printReference } from './print';
import './exploration.css';
export default function ExplorationView({ system, windowId }: AppViewProps) {
  const [page, setPage] = useState('play');
  const [progress, setProgress] = useState(emptyExploration);
  const [apps, setApps] = useState<Awaited<ReturnType<typeof system.apps>>>([]);
  const [commands, setCommands] = useState<ReturnType<NonNullable<typeof system.commands>>>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [user, setUser] = useState('');
  const printable = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    void system.session().then(session => { if (active) setPage(session.windows.find(w => w.id === windowId)?.appId ?? 'play'); });
    void system.apps().then(value => { if (active) setApps(value); });
    void system.user().then(value => { if (active) setUser(value); });
    const refresh = () => { void system.dispatch<ExplorationProgress>('exploration.status', {}).then(result => { if (active && result.ok) { setProgress(result.value); setCommands(system.commands?.() ?? []); } }); };
    refresh();
    const stop = system.onChange(event => { if (/^(try-linux|exploration|pipe-dream|learn-adventure|know-your-distro)\./.test(event.action.type)) refresh(); });
    return () => { active = false; stop(); };
  }, [system, windowId]);
  const launch = (id: string) => void system.openApp(id).then(result => { if (!result.ok) setError(result.error.message); });
  const learned = Object.keys(progress.learned).sort().filter(name => `${name} ${commands.find(cmd => cmd.name === name)?.summary ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const activities = ['learn-adventure', 'pipe-dream', 'know-your-distro', 'chmod-arcade', 'package-practice', 'learn-linux', 'learn-docker', 'learn-filesystem', 'try-linux', 'command-reference', 'exploration-achievements'];
  return <div className="exploration-view">
    {error && <p role="alert">{error}</p>}
    {page === 'play' ? <><h1>Play and explore</h1><p>Pick a short adventure, a puzzle, or a deeper course. Every activity keeps its own progress.</p><div className="activity-grid">{activities.map(id => apps.find(app => app.id === id)).filter(app => !!app).map(app => <button key={app.id} onClick={() => launch(app.id)}><strong>{app.title}</strong><span>{app.description}</span><small>Open →</small></button>)}</div></>
      : page === 'command-reference' ? <div ref={printable} className="command-reference"><h1>{user}'s Linux cheat sheet</h1><p>Successful commands you have used. Your course completion is tracked separately.</p><div className="reference-controls"><label>Find a command <input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label><button onClick={() => { if (printable.current) { try { printReference(printable.current); } catch { setError('Printing is unavailable here. Use your browser’s print command or copy the reference text.'); } } }}>Print cheat sheet</button></div>{!learned.length && <p>Run a command in Terminal to add it here, or clear your search.</p>}<table><thead><tr><th>Command</th><th>What it does</th><th>Example</th></tr></thead><tbody>{learned.map(name => <tr key={name}><td><code>{name}</code></td><td>{commands.find(cmd => cmd.name === name)?.summary ?? 'Preserved from your earlier exploration; not currently installed.'}</td><td><code>{EXAMPLES[name] ?? commands.find(cmd => cmd.name === name)?.usage ?? name}</code></td></tr>)}</tbody></table></div>
      : <><h1>Your discoveries</h1><p>{EXPLORATION_ACHIEVEMENTS.filter(item => progress.achievements[item.id]).length} of 30 earned. Hidden discoveries reveal themselves as you explore.</p><div className="discovery-grid">{EXPLORATION_ACHIEVEMENTS.map(item => { const earned = progress.achievements[item.id]; const secret = 'hidden' in item && item.hidden && !earned; return <article key={item.id} className={earned ? 'earned' : ''}><span aria-hidden="true">{secret ? '?' : item.icon}</span><div><h2>{secret ? 'Secret discovery' : item.name}</h2><p>{secret ? 'Try something unexpected.' : item.desc}</p>{earned && <small>Earned {new Date(earned).toLocaleDateString()}</small>}</div></article>; })}</div>{Object.keys(progress.achievements).filter(id => !EXPLORATION_ACHIEVEMENTS.some(item => item.id === id)).map(id => <p key={id}>Historical discovery: {id}</p>)}</>}
  </div>;
}

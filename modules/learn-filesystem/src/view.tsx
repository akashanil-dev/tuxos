import { useEffect, useState } from 'react';
import type { AppViewProps, SystemClient } from '@tuxos/system';
import { TOPICS, expandPath } from './topics';
import { LABS, type Lab } from './labs';
import './view.css';

async function write(system: SystemClient, path: string, content: string) {
  const result = await system.dispatch('fs.write', { path, content });
  if (!result.ok) throw new Error(result.error.message);
}
async function mkdir(system: SystemClient, path: string) {
  const result = await system.dispatch('fs.mkdir', { path, parents: true });
  if (!result.ok) throw new Error(result.error.message);
}

export default function FilesystemView({ system, setCloseGuard }: AppViewProps) {
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setCloseGuard?.(dirty ? () => globalThis.confirm('Discard unsaved practice changes?') : null); return () => setCloseGuard?.(null); }, [dirty, setCloseGuard]);
  const canLeave = () => !dirty || globalThis.confirm('Discard unsaved practice changes?');
  const [home, setHome] = useState('');
  const [selected, setSelected] = useState('/');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('Explore');
  const [complete, setComplete] = useState<string[]>([]);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{ path: string; content: string } | null>(null);
  const [labId, setLabId] = useState(LABS[0]!.id);
  const topic = TOPICS.find(t => t.path === selected) ?? TOPICS[0]!;
  const progressPath = `${home}/.local/state/tuxos/filesystem`;
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const user = await system.user();
        const base = `/home/${user}`;
        const saved = await system.dispatch<string>('fs.read', { path: `${base}/.local/state/tuxos/filesystem/progress.json` });
        let done: string[] = [];
        if (saved.ok) {
          try { const parsed: unknown = JSON.parse(saved.value); if (Array.isArray(parsed)) done = parsed.filter((id): id is string => typeof id === 'string' && (TOPICS.some(t => t.path === id) || LABS.some(l => `lab:${l.id}` === id))); }
          catch { /* Invalid progress is treated as unfinished; user files are untouched. */ }
        } else if (saved.error.code !== 'ENOENT') throw new Error(saved.error.message);
        if (active) { setHome(base); setComplete([...new Set(done)]); setReady(true); }
      } catch (cause) { if (active) setError(String(cause)); }
    })();
    return () => { active = false; };
  }, [system]);
  async function mark(id: string) {
    setSaving(true);
    try {
      // Read the current file before merging, so another window's saved answers survive.
      const saved = await system.dispatch<string>('fs.read', { path: `${progressPath}/progress.json` });
      let previous = complete;
      if (saved.ok) { try { const parsed: unknown = JSON.parse(saved.value); if (Array.isArray(parsed)) previous = parsed.filter((v): v is string => typeof v === 'string'); } catch { /* Replace invalid progress. */ } }
      else if (saved.error.code !== 'ENOENT') throw new Error(saved.error.message);
      const next = [...new Set([...previous, id])];
      await mkdir(system, progressPath);
      await write(system, `${progressPath}/progress.json`, JSON.stringify(next));
      await system.flush();
      setComplete(next); setError('');
    } finally { setSaving(false); }
  }
  function select(path: string) { setSelected(path); setFeedback(''); setPreview(null); }
  async function open(id: string, args?: Record<string, string>) {
    const result = await system.openApp(id, args);
    if (!result.ok) setError(result.error.message);
  }
  async function inspect(path: string) {
    setPreview(null); setError('');
    const full = expandPath(path, home);
    const stat = await system.dispatch<{ kind: string }>('fs.stat', { path: full });
    if (!stat.ok) { setError(stat.error.message); return; }
    if (stat.value.kind === 'dir') { await open('files', { path: full }); return; }
    const read = await system.dispatch<string>('fs.read', { path: full });
    if (read.ok) setPreview({ path: full, content: read.value });
    else setError(`${read.error.message}. Protected files are part of the lesson; use your practice copies instead.`);
  }
  const shown = TOPICS.filter(t => `${t.path} ${t.title} ${t.items.flat().join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
  const learned = TOPICS.filter(t => complete.includes(t.path)).length;
  return <div className="filesystem-school">
    <header className="fs-school-header"><span className="fs-school-icon" aria-hidden="true">/</span><div><strong>Learn Linux Filesystem</strong><p>A home for every file. One small step at a time.</p></div><span>{learned}/{TOPICS.length} explored</span></header>
    <nav className="fs-school-tabs" aria-label="Learning mode">{['Explore', 'Configuration lab'].map(name => <button key={name} aria-pressed={tab === name} onClick={() => { if (name !== tab && canLeave()) { setTab(name); setDirty(false); setError(''); } }}>{name}</button>)}</nav>
    {error && <p className="fs-school-error" role="alert">{error}</p>}
    {!ready ? <p role="status">Loading your filesystem guide…</p> : tab === 'Explore' ? <div className="fs-school-layout">
      <aside><label className="fs-school-search">Find a folder or file<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Try hosts, KDE or /var…" /></label>
        <nav aria-label="Filesystem topics">{[...new Set(shown.map(t => t.group))].map(group => <section key={group}><h2>{group}</h2>{shown.filter(t => t.group === group).map(t => <button key={t.path} aria-current={selected === t.path ? 'page' : undefined} onClick={() => select(t.path)}><code>{t.path}</code><span>{t.title}</span>{complete.includes(t.path) && <small aria-label="Completed">✓</small>}</button>)}</section>)}</nav>
        {!shown.length && <p>No matching files. Try a shorter name.</p>}
      </aside>
      <main key={topic.path} className="fs-school-lesson"><span className="fs-school-eyebrow">{topic.group} · Stop {TOPICS.indexOf(topic) + 1} of {TOPICS.length}</span><h1><code>{topic.path}</code> {topic.title}</h1><p className="fs-school-purpose">{topic.purpose}</p>
        <div className="fs-school-actions"><button className="fs-school-primary" onClick={() => void open('files', { path: expandPath(topic.path, home) })}>Open folder in Files ↗</button><button onClick={() => void open('terminal', { run: `ls -la '${expandPath(topic.path, home).replace(/'/g, "'\\''")}'` })}>Try ls in Terminal ↗</button></div>
        <section className="fs-school-card"><h2>What belongs here?</h2><p>Choose a file to read it, or a folder to explore it.</p><ul className="fs-school-items">{topic.items.map(([path, description]) => <li key={path}><button onClick={() => void inspect(path)}><code>{path}</code><span>{description}</span></button></li>)}</ul></section>
        {preview && <section className="fs-school-card"><h2>{preview.path}</h2><pre>{preview.content || '(Empty file)'}</pre><button onClick={() => setPreview(null)}>Close preview</button></section>}
        <details className="fs-school-note"><summary>Good to know</summary><p>{topic.tip}</p></details>
        <section className="fs-school-card fs-school-question"><h2>One quick check</h2><p>{topic.question}</p><div>{topic.choices.map((choice, index) => <button key={choice} disabled={saving} onClick={() => {
          if (index !== topic.answer) { setFeedback('Not quite. Read the short explanation above and try again.'); return; }
          void mark(topic.path).then(() => setFeedback('You got it! Progress saved.')).catch(cause => setError(String(cause)));
        }}>{choice}</button>)}</div><p role="status">{feedback}</p></section>
        <footer className="fs-school-next"><button disabled={TOPICS.indexOf(topic) === 0} onClick={() => select(TOPICS[TOPICS.indexOf(topic) - 1]!.path)}>← Previous</button><button className="fs-school-primary" onClick={() => {
          const next = TOPICS[TOPICS.indexOf(topic) + 1]; if (next) select(next.path); else setTab('Configuration lab');
        }}>{TOPICS.indexOf(topic) === TOPICS.length - 1 ? 'Try configuration →' : 'Next folder →'}</button></footer>
        <details className="fs-school-note"><summary>About this learning machine & sources</summary><p>A representative Linux layout. Exact files vary between distributions. Device, boot, /proc and /sys entries are teaching samples, not your computer’s hardware. Symlinks and mounts are not implemented here.</p><a href="https://www.debian.org/doc/manuals/debian-reference/ch01.en.html" target="_blank" rel="noreferrer">Debian beginner reference ↗</a> · <a href="https://www.freedesktop.org/software/systemd/man/latest/file-hierarchy.html" target="_blank" rel="noreferrer">Linux hierarchy reference ↗</a></details>
      </main>
    </div> : <div className="fs-school-layout"><aside><h2>Six small experiments</h2><p>Read → back up → edit → check</p><nav aria-label="Configuration exercises">{LABS.map((lab, i) => <button key={lab.id} aria-current={labId === lab.id ? 'page' : undefined} onClick={() => { if (lab.id !== labId && canLeave()) { setLabId(lab.id); setDirty(false); } }}><span>{i + 1}. {lab.title}</span>{complete.includes(`lab:${lab.id}`) && <small>✓</small>}</button>)}</nav></aside>
      <Practice onDirty={setDirty} key={labId} lab={LABS.find(l => l.id === labId)!} home={home} system={system} onComplete={() => mark(`lab:${labId}`)} />
    </div>}
  </div>;
}

function Practice({ lab, home, system, onComplete, onDirty }: { onDirty(dirty: boolean): void; lab: Lab; home: string; system: SystemClient; onComplete(): Promise<void> }) {
  const base = `${home}/Documents/filesystem-lab/${lab.id}`;
  const path = `${base}/practice.conf`;
  const [text, setText] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await mkdir(system, base);
        const original = await system.dispatch<string>('fs.read', { path });
        if (!original.ok && original.error.code !== 'ENOENT') throw new Error(original.error.message);
        if (!original.ok) await write(system, path, lab.starter);
        const backup = await system.dispatch<string>('fs.read', { path: `${path}.bak` });
        if (!backup.ok && backup.error.code !== 'ENOENT') throw new Error(backup.error.message);
        if (!backup.ok) await write(system, `${path}.bak`, original.ok ? original.value : lab.starter);
        if (active) { setText(original.ok ? original.value : lab.starter); setReady(true); }
      } catch (cause) { if (active) setError(String(cause)); }
    })();
    return () => { active = false; };
  }, [base, lab, path, system]);
  async function save() {
    setBusy(true); setError('');
    try {
      await write(system, path, text);
      await system.flush(); onDirty(false);
      if (lab.check(text)) { await onComplete(); setStatus(`Well done! ${lab.after}`); }
      else setStatus('Practice file saved. It does not match the goal yet—open the hint and try again.');
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  }
  async function restore() {
    setBusy(true); setError('');
    try {
      const backup = await system.dispatch<string>('fs.read', { path: `${path}.bak` });
      if (!backup.ok) throw new Error(backup.error.message);
      await write(system, path, backup.value); await system.flush(); setText(backup.value); onDirty(false); setStatus('Practice backup restored. Try the exercise again.');
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  }
  return <main className="fs-school-lesson"><span className="fs-school-eyebrow">Safe configuration practice</span><h1>{lab.title}</h1><p>Based on <code>{lab.source}</code>. This exercise edits a copy in your Documents folder.</p>
    <section className="fs-school-card"><h2>Your goal</h2><p>{lab.goal}</p><details><summary>Show me a hint</summary><p>{lab.hint}</p></details></section>
    <label className="fs-school-editor">Your practice file<textarea aria-label="Practice configuration" spellCheck={false} value={text} disabled={!ready || busy} onChange={e => { setText(e.target.value); onDirty(true); setStatus('Unsaved changes — choose Save & check before switching exercises.'); }} /></label>
    <p className="fs-school-path"><code>{path}</code><br />A .bak file keeps the original contents.</p>
    <div className="fs-school-actions"><button className="fs-school-primary" disabled={!ready || busy} onClick={() => void save()}>Save & check</button><button disabled={!ready || busy} onClick={() => void restore()}>Restore practice backup</button><button disabled={!ready || busy} onClick={() => void system.openApp('files', { path: base }).then(r => { if (!r.ok) setError(r.error.message); })}>See practice files ↗</button></div>
    <p role="status">{status}</p>{error && <p role="alert" className="fs-school-error">{error}</p>}
    <details className="fs-school-note"><summary>How would this work on real Linux?</summary><p>{lab.after}</p><p>Read the application documentation, make a backup, edit the smallest setting needed, validate the file and apply it using the appropriate tool. If the change fails, restore your backup.</p></details>
  </main>;
}

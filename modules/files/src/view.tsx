import { AppIcon } from '@tuxos/appearance/icons';
import { resolvePath, type Stat } from '@tuxos/kernel';
import type { AppViewProps } from '@tuxos/system';
import { useEffect, useRef, useState } from 'react';
import { FileTable } from './file-table';
import { formatSize, joinPath, nameError, parentOf, sortEntries } from './model';
import { reason, useDirectory } from './use-directory';
import './files.css';

type Pending =
  | { kind: 'new-folder' | 'new-file'; name: string; error: string }
  | { kind: 'delete'; entry: Stat }
  | null;

export default function FilesView({ system, args, windowId }: AppViewProps) {
  const [path, setPath] = useState('');
  const [typedPath, setTypedPath] = useState('');
  const [editingPath, setEditingPath] = useState(false);
  const locationInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editingPath) { locationInput.current?.focus(); locationInput.current?.select(); } }, [editingPath]);
  const [back, setBack] = useState<string[]>([]);
  const [forward, setForward] = useState<string[]>([]);
  const [home, setHome] = useState('');
  const [showHidden, setShowHidden] = useState(args?.hidden === 'true');
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [notice, setNotice] = useState('');
  const [presentation, setPresentation] = useState<'table' | 'icons'>(args?.view === 'icons' ? 'icons' : 'table');
  const [preview, setPreview] = useState<{ path: string; content: string } | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const { entries, error, loading } = useDirectory(system, path);

  useEffect(() => {
    let active = true;
    void system.user().then((user) => { const next = args?.path ?? `/home/${user}`; if (active) setHome(`/home/${user}`); if (active && next !== path) go(next, false); });
    return () => { active = false; };
  }, [system, args?.path]);

  useEffect(() => {
    if (!path || loading || error || (args?.path === path && args?.hidden === String(showHidden) && args?.view === presentation)) return;
    // Persist only a directory that loaded successfully; an unavailable path remains recoverable via Places.
    void system.dispatch('session.setArgs', { id: windowId, args: { path, hidden: String(showHidden), view: presentation } });
  }, [system, windowId, path, loading, error, showHidden, presentation, args?.path, args?.hidden, args?.view]);

  function go(next: string, remember = true) {
    next = resolvePath(next);
    setPreviewPath(null); setPreview(null);
    if (remember && path) { setBack((history) => [...history, path].slice(-100)); setForward([]); }
    setEditingPath(false);
    setPath(next);
    setTypedPath(next);
    setSelected(null);
    setPending(null);
    setNotice('');
  }

  function open(entry: Stat) {
    const target = joinPath(path, entry.name);
    if (entry.kind === 'dir') go(target);
    else setPreviewPath(target);
  }

  useEffect(() => {
    if (!previewPath) return;
    let active = true;
    setPreview(null);
    void system.dispatch<string>('fs.read', { path: previewPath }).then(result => {
      if (!active) return;
      if (result.ok) setPreview({ path: previewPath, content: result.value });
      else { setNotice(reason(result.error.code, result.error.message)); setPreviewPath(null); }
    });
    return () => { active = false; };
  }, [system, previewPath]);

  async function create(kind: 'new-folder' | 'new-file', name: string) {
    const problem = nameError(name);
    if (problem) return setPending({ kind, name, error: problem });
    const target = joinPath(path, name);
    const exists = await system.dispatch('fs.stat', { path: target });
    if (exists.ok) return setPending({ kind, name, error: `“${name}” already exists here.` });
    const result = kind === 'new-folder'
      ? await system.dispatch('fs.mkdir', { path: target })
      : await system.dispatch('fs.write', { path: target, content: '' });
    if (!result.ok) return setPending({ kind, name, error: reason(result.error.code, result.error.message) });
    setPending(null);
    setSelected(name);
  }

  async function remove(entry: Stat) {
    const result = await system.dispatch('fs.remove', {
      path: joinPath(path, entry.name), recursive: entry.kind === 'dir',
    });
    setPending(null);
    setNotice(result.ok ? '' : `Couldn’t delete “${entry.name}”: ${reason(result.error.code, result.error.message)}`);
    if (result.ok) setSelected(null);
  }

  const visible = sortEntries(entries, showHidden);
  const selectedEntry = visible.find((entry) => entry.name === selected);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.ctrlKey && event.key.toLowerCase() === 'l') { event.preventDefault(); setEditingPath(true); }
    else if (event.ctrlKey && event.key.toLowerCase() === 'h') {
      event.preventDefault();
      setShowHidden((value) => !value);
    } else if (event.key === 'Delete' && selectedEntry && !pending) {
      setPending({ kind: 'delete', entry: selectedEntry });
    } else if (event.key === 'Backspace' && !pending && event.target === event.currentTarget) {
      go(parentOf(path));
    }
  }

  return <div className="files-view" tabIndex={-1} onKeyDown={onKeyDown}>
    <div className="files-toolbar">
      <button aria-label="Back" disabled={!back.length} onClick={() => {
        const previous = back.at(-1);
        if (!previous) return;
        setBack(back.slice(0, -1)); setForward(history => [...history, path]);
        go(previous, false);
      }}>←</button>
      <button aria-label="Forward" disabled={!forward.length} onClick={() => { const next = forward.at(-1); if (!next) return; setForward(forward.slice(0, -1)); setBack(history => [...history, path]); go(next, false); }}>→</button>
      <button aria-label="Up to parent folder" disabled={path === '/'} onClick={() => go(parentOf(path))}>↑</button>
      <div className="files-location" onClick={event => { if (!(event.target as HTMLElement).closest('button, input')) setEditingPath(true); }}>{!editingPath && <nav className="files-breadcrumbs" aria-label="Folder breadcrumbs"><button onClick={() => go('/')}>/</button>{path.split('/').filter(Boolean).map((part, index, parts) => <button key={index} onClick={() => { if (index === parts.length - 1) setEditingPath(true); else go('/' + parts.slice(0, index + 1).join('/')); }}>{part}</button>)}</nav>}<form hidden={!editingPath} className="files-path" onSubmit={(event) => { event.preventDefault(); go(typedPath.trim() || '/'); }}>
        <input ref={locationInput} aria-label="Location" value={typedPath} onChange={(event) => setTypedPath(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setTypedPath(path); setEditingPath(false); } }} onBlur={() => { setTypedPath(path); setEditingPath(false); }} />
      </form><button aria-label="Edit location" title="Edit location (Ctrl+L)" onClick={() => setEditingPath(value => !value)}>⌁</button></div>
      <button onClick={() => setPending({ kind: 'new-folder', name: '', error: '' })}>New Folder</button>
      <button aria-label={presentation === 'icons' ? 'List view' : 'Icon view'} aria-pressed={presentation === 'icons'} title={presentation === 'icons' ? 'Details view' : 'Icons view'} onClick={() => setPresentation(value => value === 'icons' ? 'table' : 'icons')}>{presentation === 'icons' ? '☷' : '▦'}</button>
      <details className="files-menu"><summary aria-label="More actions" title="More actions">☰</summary><div>
        <button onClick={() => setPending({ kind: 'new-file', name: '', error: '' })}>New File</button>
        <button disabled={!selectedEntry} onClick={() => selectedEntry && setPending({ kind: 'delete', entry: selectedEntry })}>Delete</button>
        <button onClick={() => setShowHidden(value => !value)} aria-pressed={showHidden}>Hidden files</button>
        <button disabled={!path} onClick={() => void system.openApp('terminal', { cwd: path, from: 'files' }).then(result => { if (!result.ok) setNotice(result.error.message); })}>Open terminal here</button>
        <button onClick={() => void system.openApp('learn-filesystem').then(result => { if (!result.ok) setNotice(result.error.message); })}>Learn this filesystem ↗</button>
      </div></details>
    </div>
    <div className="files-body">
      <nav className="files-places" aria-label="Places">
        <h3>Places</h3>
        {[['Home', home], ['Desktop', `${home}/Desktop`], ['Documents folder', `${home}/Documents`], ['Downloads', `${home}/Downloads`], ['Music', `${home}/Music`], ['Pictures', `${home}/Pictures`], ['Videos', `${home}/Videos`]].map(([label, target]) => <button key={label} aria-label={label} aria-current={path === target ? 'page' : undefined} onClick={() => go(target!)}><AppIcon name="files"/><span>{label === 'Documents folder' ? <span>Documents</span> : label}</span></button>)}
        <h3>Devices</h3>
        <button aria-current={path === '/' ? 'page' : undefined} onClick={() => go('/')}><AppIcon name="files"/>Filesystem /</button>
        <button aria-current={path === '/tmp' ? 'page' : undefined} onClick={() => go('/tmp')}><AppIcon name="files"/>Temporary files</button>
      </nav>
      <div className="files-content">

    {selectedEntry && <div className="files-bar"><span>{selectedEntry.owner} · permissions {selectedEntry.mode.toString(8).padStart(3, '0')}</span><button onClick={() => open(selectedEntry)}>{selectedEntry.kind === 'dir' ? 'Open folder' : 'Preview file'}</button>{selectedEntry.kind === 'file' && <button onClick={() => void system.openApp('editor', { path: joinPath(path, selectedEntry.name) })}>Open in Text Editor</button>}</div>}
    {pending && pending.kind !== 'delete' && <NamePrompt
      label={pending.kind === 'new-folder' ? 'Folder name' : 'File name'}
      pending={pending}
      onChange={(name) => setPending({ ...pending, name, error: '' })}
      onSubmit={() => void create(pending.kind, pending.name)}
      onCancel={() => setPending(null)}
    />}
    {pending?.kind === 'delete' && <div className="files-bar files-confirm" role="alertdialog">
      <span>
        Delete “{pending.entry.name}”{pending.entry.kind === 'dir' ? ' and everything in it' : ''}?
        This can’t be undone.
      </span>
      <button className="danger" onClick={() => void remove(pending.entry)}>Delete</button>
      <button onClick={() => setPending(null)}>Cancel</button>
    </div>}
    {notice && <p className="files-bar files-error" role="alert">{notice}</p>}
    {loading ? <p className="files-empty" role="status">Opening folder…</p> : error
      ? <p className="files-empty files-error" role="alert">{error}</p>
      : <FileTable entries={visible} selected={selected} onSelect={name => { setSelected(name); setPreviewPath(null); setPreview(null); }} onOpen={open} presentation={presentation} />}
    {preview && <aside className="files-preview" aria-label="File preview"><header><strong>{preview.path}</strong><button onClick={() => { setPreviewPath(null); setPreview(null); }}>Close preview</button><button onClick={() => void system.openApp('editor', { path: preview.path })}>Edit file</button></header><small>Terminal equivalent: <code>cat {shellQuote(preview.path)}</code></small><pre>{preview.content}</pre></aside>}
      </div>
    </div>
    <footer className="files-status">
      {loading ? 'Opening folder…' : selectedEntry ? `“${selectedEntry.name}” — ${formatSize(selectedEntry)}` : `${visible.length} items`}
      {showHidden ? ' · showing hidden files' : ' · Ctrl+H shows hidden files'}
    </footer>
  </div>;
}

function NamePrompt({ label, pending, onChange, onSubmit, onCancel }: {
  label: string;
  pending: { name: string; error: string };
  onChange(name: string): void;
  onSubmit(): void;
  onCancel(): void;
}) {
  return <form className="files-bar" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
    <label>
      {label}
      <input
        autoFocus
        value={pending.name}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Escape') onCancel(); }}
      />
    </label>
    <button type="submit">Create</button>
    <button type="button" onClick={onCancel}>Cancel</button>
    {pending.error && <span className="files-error" role="alert">{pending.error}</span>}
  </form>;
}

function shellQuote(value: string): string { return "'" + value.replaceAll("'", "'\"'\"'") + "'"; }

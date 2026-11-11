import { resolvePath, type Stat } from '@tuxos/kernel';
import type { AppViewProps } from '@tuxos/system';
import { useEffect, useState } from 'react';
import { FileTable } from './file-table';
import { formatSize, joinPath, nameError, parentOf, sortEntries } from './model';
import { reason, useDirectory } from './use-directory';
import './files.css';

type Pending =
  | { kind: 'new-folder' | 'new-file'; name: string; error: string }
  | { kind: 'delete'; entry: Stat }
  | null;

export default function FilesView({ system, args }: AppViewProps) {
  const [path, setPath] = useState('');
  const [typedPath, setTypedPath] = useState('');
  const [back, setBack] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [notice, setNotice] = useState('');
  const [presentation, setPresentation] = useState<'table' | 'icons'>('table');
  const [preview, setPreview] = useState<{ path: string; content: string } | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const { entries, error } = useDirectory(system, path);

  useEffect(() => {
    let active = true;
    void system.user().then((user) => { if (active) go(args?.path ?? `/home/${user}`, false); });
    return () => { active = false; };
  }, [system, args?.path]);

  function go(next: string, remember = true) {
    next = resolvePath(next);
    setPreviewPath(null); setPreview(null);
    if (remember && path) setBack((history) => [...history, path].slice(-100));
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
    if (event.ctrlKey && event.key.toLowerCase() === 'h') {
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
        setBack(back.slice(0, -1));
        go(previous, false);
      }}>←</button>
      <button aria-label="Up to parent folder" disabled={path === '/'} onClick={() => go(parentOf(path))}>↑</button>
      <form className="files-path" onSubmit={(event) => { event.preventDefault(); go(typedPath.trim() || '/'); }}>
        <input aria-label="Location" value={typedPath} onChange={(event) => setTypedPath(event.target.value)} />
      </form>
      <button onClick={() => setPending({ kind: 'new-folder', name: '', error: '' })}>New Folder</button>
      <button onClick={() => setPending({ kind: 'new-file', name: '', error: '' })}>New File</button>
      <button
        disabled={!selectedEntry}
        onClick={() => selectedEntry && setPending({ kind: 'delete', entry: selectedEntry })}
      >
        Delete
      </button>
    </div>
    <nav className="files-bar" aria-label="Places">
      <button onClick={() => go('/')}>Filesystem /</button>
      <button onClick={() => void system.user().then(user => go(`/home/${user}`))}>Home</button>
      <button onClick={() => void system.user().then(user => go(`/home/${user}/Documents`))}>Documents folder</button>
      <button onClick={() => go('/tmp')}>Temporary files</button>
      <button disabled={!path} onClick={() => void system.openApp('terminal', { cwd: path, from: 'files' }).then(result => { if (!result.ok) setNotice(result.error.message); })}>Open terminal here</button>
      <button aria-pressed={presentation === 'icons'} onClick={() => setPresentation(value => value === 'icons' ? 'table' : 'icons')}>{presentation === 'icons' ? 'List view' : 'Icon view'}</button>
      <button onClick={() => setShowHidden(value => !value)} aria-pressed={showHidden}>Hidden files</button>
      <button onClick={() => void system.openApp('learn-filesystem').then(result => { if (!result.ok) setNotice(result.error.message); })}>Learn this filesystem ↗</button>
    </nav>
    <nav className="files-bar files-breadcrumbs" aria-label="Folder breadcrumbs"><button onClick={() => go('/')}>/</button>{path.split('/').filter(Boolean).map((part, index, parts) => <button key={index} onClick={() => go('/' + parts.slice(0, index + 1).join('/'))}>{part}</button>)}<small>Terminal equivalent: <code>cd {shellQuote(path)}</code></small></nav>
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
    {error
      ? <p className="files-empty files-error" role="alert">{error}</p>
      : <FileTable entries={visible} selected={selected} onSelect={name => { setSelected(name); setPreviewPath(null); setPreview(null); }} onOpen={open} presentation={presentation} />}
    {preview && <aside className="files-preview" aria-label="File preview"><header><strong>{preview.path}</strong><button onClick={() => { setPreviewPath(null); setPreview(null); }}>Close preview</button><button onClick={() => void system.openApp('editor', { path: preview.path })}>Edit file</button></header><small>Terminal equivalent: <code>cat {shellQuote(preview.path)}</code></small><pre>{preview.content}</pre></aside>}
    <footer className="files-status">
      {selectedEntry ? `“${selectedEntry.name}” — ${formatSize(selectedEntry)}` : `${visible.length} items`}
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

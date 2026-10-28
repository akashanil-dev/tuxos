import type { Stat } from '@tuxos/kernel';
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
  const { entries, error } = useDirectory(system, path);

  useEffect(() => {
    let active = true;
    void system.user().then((user) => { if (active) go(args?.path ?? `/home/${user}`, false); });
    return () => { active = false; };
  }, [system, args?.path]);

  function go(next: string, remember = true) {
    if (remember && path) setBack((history) => [...history, path]);
    setPath(next);
    setTypedPath(next);
    setSelected(null);
    setPending(null);
    setNotice('');
  }

  function open(entry: Stat) {
    const target = joinPath(path, entry.name);
    if (entry.kind === 'dir') go(target);
    else void system.openApp('editor', { path: target });
  }

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
      <button onClick={() => setShowHidden(value => !value)} aria-pressed={showHidden}>Hidden files</button>
      <button onClick={() => void system.openApp('learn-filesystem').then(result => { if (!result.ok) setNotice(result.error.message); })}>Learn this filesystem ↗</button>
    </nav>
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
      : <FileTable entries={visible} selected={selected} onSelect={setSelected} onOpen={open} />}
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

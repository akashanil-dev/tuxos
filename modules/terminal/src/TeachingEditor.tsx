import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { EditorRequest } from '@tuxos/shell';

export function TeachingEditor({ request, finish, setGuard }: {
  request: EditorRequest; finish(closed: boolean): void; setGuard(guard: (() => boolean) | null): void;
}) {
  const [text, setText] = useState(request.content);
  const [saved, setSaved] = useState(request.content);
  const [insert, setInsert] = useState(request.mode === 'nano');
  const [command, setCommand] = useState<string | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [status, setStatus] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (confirmExit) cancel.current?.focus(); }, [confirmExit]);
  const dirty = text !== saved;
  const vim = request.mode === 'vim';
  useEffect(() => { area.current?.focus(); }, []);
  useEffect(() => {
    setGuard(dirty ? () => globalThis.confirm('Discard unsaved terminal editor changes?') : null);
    return () => setGuard(null);
  }, [dirty, setGuard]);
  function save() {
    const result = request.save(text);
    if (!result.ok) { setStatus(`Could not save: ${result.error}`); return false; }
    setSaved(text); setStatus(`Wrote ${text.split('\n').length} lines to ${request.path}`); return true;
  }
  function leave(force = false) {
    if (dirty && !force) { setConfirmExit(true); return; }
    finish(true);
  }
  function ex(raw: string) {
    const value = raw.replace(/^:/, '').trim(); setCommand(null); area.current?.focus();
    if (['q!', 'qa!', 'quit!'].includes(value)) { finish(true); return; }
    if (['q', 'quit'].includes(value)) { if (dirty) setStatus('E37: No write since last change. Use :wq to save, or :q! to discard.'); else finish(true); return; }
    if (['wq', 'x'].includes(value)) { if (save()) finish(true); return; }
    if (value === 'w') { save(); return; }
    setStatus(`Unsupported practice command: ${value}. Try :w, :q, :wq or :q!`);
  }
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (confirmExit) {
      if (event.key.toLowerCase() === 'y') { event.preventDefault(); if (save()) finish(true); }
      else if (event.key.toLowerCase() === 'n') { event.preventDefault(); finish(true); }
      else if (event.key === 'Escape' || (event.ctrlKey && event.key.toLowerCase() === 'c')) { event.preventDefault(); setConfirmExit(false); area.current?.focus(); }
      return;
    }
    if (command !== null || event.target instanceof HTMLButtonElement) return;
    if (!vim && event.ctrlKey && ['o', 's', 'x'].includes(event.key.toLowerCase())) {
      event.preventDefault(); event.stopPropagation();
      if (event.key.toLowerCase() === 'x') leave(); else save(); return;
    }
    if (vim) {
      if (event.key === 'Escape') { event.preventDefault(); setInsert(false); return; }
      if (!insert && !event.ctrlKey && !event.metaKey && event.target === area.current) {
        if (['i', 'a', 'o'].includes(event.key)) {
          event.preventDefault();
          const el = area.current!; let pos = el.selectionStart;
          if (event.key === 'a') pos = Math.min(pos + 1, text.length);
          if (event.key === 'o') {
            const end = text.indexOf('\n', pos); pos = end < 0 ? text.length : end;
            setText(text.slice(0, pos) + '\n' + text.slice(pos)); pos++;
          }
          setInsert(true); const next = pos; requestAnimationFrame(() => el.setSelectionRange(next, next));
        } else if (event.key === ':') { event.preventDefault(); setCommand(':'); }
        else if (event.key.length === 1) { event.preventDefault(); setStatus('Press i to insert text. Esc, then :wq saves and exits; :q! discards.'); }
      }
    }
  }
  return <div className="teaching-editor" aria-label={`${request.mode} teaching editor`} onKeyDown={onKey}>
    <header><strong>{request.mode} · teaching editor</strong><span>{request.path}{dirty ? ' • Modified' : ''}</span></header>
    <p>{vim ? 'i / a / o: insert · Esc: normal · :w: save · :wq: save and exit · :q!: discard' : 'Ctrl+O: save · Ctrl+X: exit · Edit text, select, cut and paste normally.'}</p>
    <small>Practice subset of {request.mode}. All file changes use the TuxOS filesystem.</small>
    <textarea ref={area} aria-label={`${request.mode} file contents`} spellCheck={false} readOnly={!insert || confirmExit} value={text} onChange={event => setText(event.target.value)} />
    <div role="status" className="teaching-editor-status">{vim ? insert ? 'INSERT · ' : 'NORMAL · ' : ''}{status}</div>
    {command !== null && <form onSubmit={event => { event.preventDefault(); ex(command); }}><label>Vim command<input autoFocus aria-label="Vim command" value={command} onChange={event => setCommand(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setCommand(null); area.current?.focus(); } }} /></label><button>Run</button></form>}
    {confirmExit ? <div className="teaching-editor-actions" role="group" aria-label="Save changed buffer before exiting">
      <span>Save changed buffer?</span><button onClick={() => { if (save()) finish(true); }}>Yes, save</button><button onClick={() => finish(true)}>No, discard</button><button ref={cancel} onClick={() => { setConfirmExit(false); area.current?.focus(); }}>Cancel</button>
    </div> : <div className="teaching-editor-actions">
      {vim && <><button onClick={() => { setInsert(value => !value); area.current?.focus(); }}>{insert ? 'Normal mode (Esc)' : 'Insert mode (i)'}</button><button onClick={() => setCommand(':')}>Command (:)</button></>}
      <button onClick={save}>Save{!vim && ' (Ctrl+O)'}</button><button onClick={() => leave()}>Exit{!vim && ' (Ctrl+X)'}</button>
    </div>}
  </div>;
}

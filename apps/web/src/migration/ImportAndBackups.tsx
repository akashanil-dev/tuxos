import { useEffect, useRef, useState } from 'react';
import { MAX_BYTES, previewImport, type ImportOptions, type ImportPreview } from '@tuxos/migration';
import type { BackupInfo, SystemClient } from '@tuxos/system';
import './migration.css';

function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function ImportAndBackups({ system, close }: { system: SystemClient; close(): void }) {
  const [raw, setRaw] = useState(''), [name, setName] = useState('Pasted save');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [sourceKind, setSourceKind] = useState<'TuxOS' | 'Tuxplore'>();
  const [options, setOptions] = useState<Omit<ImportOptions, 'now'>>({ files: 'keep', preferences: 'source', adventure: 'keep' });
  const [backups, setBackups] = useState<BackupInfo[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [deleting, setDeleting] = useState<string>();
  const expected = useRef(''), previewTime = useRef(0), dialog = useRef<HTMLDialogElement>(null);
  const history = (JSON.parse(system.exportSave?.() ?? '{}').snapshot?.state?.exploration?.imports ?? []) as import('@tuxos/sdk').ExplorationProgress['imports'];
  const refresh = async () => setBackups(await system.backups?.() ?? []);
  useEffect(() => { dialog.current?.showModal(); void refresh().catch(e => setError(String(e))); }, [system]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  };
  const inspect = async (text = raw, choices = options) => {
    const current = system.exportSave?.(); if (!current) throw new Error('The current system cannot be exported.');
    previewTime.current = Date.now();
    const result = await previewImport(text, current, { ...choices, now: previewTime.current });
    expected.current = current; setSourceKind(result.source); setPreview(result); setMessage('');
  };
  const change = (next: Omit<ImportOptions, 'now'>) => { setOptions(next); setPreview(null); };
  const choose = async (file: File | undefined) => {
    if (!file) return;
    await run(async () => {
      if (file.size > MAX_BYTES) throw new Error('This file exceeds 4 MiB. Keep the original; export large personal files separately before retrying.');
      const text = await file.text(); setRaw(text); setName(file.name); setPreview(null); setMessage('');
      await inspect(text);
    });
  };
  return <dialog ref={dialog} className="migration-dialog" aria-labelledby="migration-title" onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
    <header><h1 id="migration-title">Import & backups</h1><button autoFocus disabled={busy} onClick={close}>Close</button></header>
    <p>Bring your Tuxplore adventure here, or restore a TuxOS backup. Your selected file stays unchanged. Before applying anything, TuxOS keeps a recovery copy of the current system in this browser.</p>
    <p>For Tuxplore, export from the browser and original address where you played. <a href="http://tuxplore.akashanil.dev/" target="_blank" rel="noreferrer">Open Tuxplore</a>. Its export bridge must be available there before browser-local progress can cross to this site. A copied <code>tuxos-save-v1</code> JSON backup is also accepted.</p>
    {error && <p className="migration-error" role="alert">{error}</p>}
    {message && <p className="migration-success" role="status">{message}</p>}
    <fieldset disabled={busy}><legend>Select a save</legend>
      <label>Exported JSON file <input type="file" accept="application/json,.json" onChange={event => void choose(event.target.files?.[0])} /></label>
      <details><summary>Paste a save instead</summary><label>Save JSON<textarea value={raw} onChange={event => { setRaw(event.target.value); setName('Pasted save'); setSourceKind(undefined); setPreview(null); }} spellCheck={false} /></label></details>
      <button disabled={!raw} onClick={() => void run(() => inspect())}>{busy ? 'Checking…' : 'Preview import'}</button>
    </fieldset>
    {raw && sourceKind === 'Tuxplore' && <fieldset disabled={busy}><legend>Tuxplore conflict choices</legend>
      <label>Existing files <select value={options.files} onChange={e => change({ ...options, files: e.target.value as ImportOptions['files'], choices: {} })}><option value="keep">Keep current files</option><option value="both">Keep both with a new filename</option><option value="replace">Use imported files at conflicting paths</option></select></label>
      <label>Desktop and game preferences <select value={options.preferences} onChange={e => change({ ...options, preferences: e.target.value as ImportOptions['preferences'] })}><option value="source">Use Tuxplore preferences</option><option value="keep">Keep current preferences</option></select></label>
      <label>Unfinished adventure objectives <select value={options.adventure} onChange={e => change({ ...options, adventure: e.target.value as ImportOptions['adventure'] })}><option value="keep">Keep current partial objectives</option><option value="source">Use Tuxplore partial objectives</option></select></label>
      <p>Completed quests, discoveries and best scores merge without decreasing. When resuming a Tuxplore quest, choose its partial objectives and its conflicting practice files together. Existing TuxOS courses are kept. These merge choices apply to Tuxplore imports; a TuxOS backup replaces the whole system.</p>
      {!preview && <p role="status">Preview again after changing these choices.</p>}
    </fieldset>}
    {preview && <section aria-label="Import preview"><h2>{preview.alreadyImported ? 'Already imported' : `${preview.source} → TuxOS`}</h2>
      <p>{name}: <strong>{preview.sourceUser}</strong> → <strong>{preview.destinationUser}</strong>. Converted save: {(preview.bytes / 1024).toFixed(1)} KiB.</p>
      <p>Result: {preview.report.quests} completed adventure quests, {preview.report.discoveries} discovery records, {preview.report.puzzles} solved puzzles. {preview.source === 'Tuxplore' && <>{preview.report.files.added} new entries, {preview.report.files.replaced} replacements, {preview.report.files.copied} renamed copies.</>}</p>
      {preview.source === 'TuxOS' && <p className="migration-error">Restoring this backup replaces all current files, courses, scores and settings. Review the source and download a current backup before continuing. A local recovery backup is also required automatically.</p>}
      {preview.report.packages.length > 0 && <p>Compatible packages to retain/install: {preview.report.packages.join(', ')}. Their current teaching packages and dependencies are used.</p>}
      {!!preview.conflicts.length && <details open><summary>{preview.conflicts.length} conflicts</summary><ul>{preview.conflicts.map(conflict => <li key={conflict.path}><code>{conflict.path}</code><select aria-label={`Conflict at ${conflict.path}`} disabled={busy} value={conflict.choice} onChange={event => change({ ...options, choices: { ...options.choices, [conflict.path]: event.target.value as 'keep' | 'replace' | 'both' } })}><option value="keep">Keep current</option><option value="replace">Use imported</option><option value="both">Keep both</option></select>{conflict.copyPath && <small>Copy: {conflict.copyPath}</small>}</li>)}</ul></details>}
      <ul>{preview.report.notes.map((note, i) => <li key={i}>{note}</li>)}</ul>
      {!!preview.report.unsupported.length && <details open><summary>Items kept in the original export or as historical records</summary><ul>{preview.report.unsupported.map((note, i) => <li key={i}>{note}</li>)}</ul></details>}
      <div className="migration-actions"><button disabled={busy} onClick={() => download(JSON.stringify(preview.report, null, 2), 'tuxos-import-report.json')}>Download import report</button><button disabled={busy} onClick={() => download(raw, 'original-import-source.json')}>Download unchanged source</button>
      <button disabled={busy || preview.alreadyImported || !system.replaceSave} onClick={() => void run(async () => {
        const backup = await system.replaceSave!(preview.data, expected.current, preview.source === 'TuxOS' ? 'Before system restore' : 'Before Tuxplore import');
        setMessage(`${preview.source === 'TuxOS' ? 'Restored' : 'Imported'} successfully. Recovery backup: ${backup.label}, ${new Date(backup.createdAt).toLocaleString()}. Open your files and activities to verify them.`);
        setPreview(null); setRaw(''); setSourceKind(undefined); await refresh();
      })}>{preview.alreadyImported ? 'This save is already imported' : preview.source === 'TuxOS' ? 'Back up and restore this system' : 'Back up current system and apply import'}</button></div>
    </section>}
    {!!history.length && <section aria-label="Import history"><h2>Import history</h2>{history.map(item => <details key={item.id}><summary>{item.source} · {new Date(item.importedAt).toLocaleString()}</summary><p><code>{item.id}</code></p>{item.report && <><ul>{[...item.report.notes, ...item.report.unsupported].map((note, i) => <li key={i}>{note}</li>)}</ul><button onClick={() => download(JSON.stringify(item, null, 2), 'tuxos-import-history.json')}>Download historical report</button></>}</details>)}</section>}
    <section aria-label="Recovery backups"><h2>Recovery backups in this browser</h2><p>These copies belong to the current learner and stay on this browser. Download important backups before clearing site data. Account passwords and AI keys are not part of a system backup.</p>
      <div className="migration-actions"><button disabled={busy} onClick={() => download(system.exportSave!(), 'tuxos-current-backup.json')}>Download current system</button><button disabled={busy || !system.createBackup} onClick={() => void run(async () => { await system.createBackup!(); await refresh(); setMessage('A recovery backup was created.'); })}>Keep a browser backup</button></div>
      {!backups.length && <p>No recovery backups yet.</p>}
      <ul>{backups.map(backup => <li key={backup.id}><strong>{backup.label}</strong> · {new Date(backup.createdAt).toLocaleString()} · {(backup.bytes / 1024).toFixed(1)} KiB
        <div className="migration-actions"><button disabled={busy} onClick={() => void run(async () => download(await system.readBackup!(backup.id), `tuxos-${backup.username}-backup.json`))}>Download</button><button disabled={busy} onClick={() => void run(async () => { const text = await system.readBackup!(backup.id); setRaw(text); setName(backup.label); await inspect(text); dialog.current?.scrollTo({ top: 0, behavior: 'instant' }); })}>Preview restore</button><button disabled={busy} onClick={() => setDeleting(backup.id)}>Delete backup</button></div>
        {deleting === backup.id && <div role="group" aria-label="Confirm backup deletion"><p>Delete this browser copy? Download it first if you want to keep it elsewhere.</p><button disabled={busy} onClick={() => setDeleting(undefined)}>Keep backup</button><button disabled={busy} onClick={() => void run(async () => { await system.deleteBackup!(backup.id); setDeleting(undefined); await refresh(); })}>Delete this copy</button></div>}
      </li>)}</ul>
    </section>
  </dialog>;
}

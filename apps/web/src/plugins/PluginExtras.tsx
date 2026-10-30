import { useEffect, useState } from 'react';
import type { InstalledPlugin, PluginManifest } from '@tuxos/sdk';
import type { SystemClient } from '@tuxos/system';
import type { SessionState } from '@tuxos/kernel';

/** These previews are host-rendered data; importing a package never runs its code here. */
export function PluginPreview({ manifest }: { manifest: PluginManifest }) {
  const themes = manifest.contributes.themes;
  const id = manifest.id;
  return <div className={`pm-preview preview-${id}`} aria-label={`${manifest.name} preview`}>
    {themes?.length ? <div className="pm-theme-preview">{themes.map(theme => <div key={theme.id} style={{ background: theme.background, color: theme.foreground }}><span style={{ background: theme.surface }}>•••</span><i style={{ background: theme.accent }} /><small>{theme.name}</small></div>)}</div>
      : id === 'tuxos-focus' ? <><span>ONE THING AT A TIME</span><strong>25:00</strong><small>Start · Pause · Breathe</small></>
      : id === 'tuxos-clock' ? <><span>A MOMENT AROUND THE WORLD</span><strong>09:41</strong><small>Local · Kolkata · London · UTC</small></>
      : id === 'tuxos-notes' ? <><span>YOUR DESKTOP SCRATCHPAD</span><p>Today’s little discoveries</p><small>✓ Learn a command<br />□ Make something yours<br />□ Write down a new idea</small></>
      : id === 'tuxos-permissions' ? <><span>PERMISSION EXPLORER</span><strong>rwxr-xr-x</strong><small>chmod 755 · Toggle bits. See the result.</small></>
      : <><span>🐉 A SMALL DISCOVERY</span><p>Free software is about freedom.</p><small>Learn a little. Try a little. Repeat.</small></>}
  </div>;
}

export function PluginExtras({ system, entry, busy, run }: { system: SystemClient; entry: InstalledPlugin; busy: boolean; run(work: () => Promise<unknown>, success: string): Promise<void> }) {
  const [session, setSession] = useState<SessionState | null>(null);
  useEffect(() => {
    let active = true, ticket = 0;
    const refresh = async () => { const current = ++ticket; const state = await system.session(); if (active && current === ticket) setSession(state); };
    void refresh(); const stop = system.onChange(event => { if (event.action.type.startsWith('session.')) void refresh(); });
    return () => { active = false; stop(); };
  }, [system]);
  if (entry.status !== 'enabled' || !entry.manifest) return null;
  const widgets = entry.manifest.contributes.apps?.filter(app => app.widget) ?? [];
  const themes = entry.manifest.contributes.themes ?? [];
  if (!widgets.length && !themes.length) return null;
  const apply = async (type: string, payload: unknown) => {
    const result = await system.dispatch(type, payload); if (!result.ok) throw new Error(result.error.message);
    await system.flush();
  };
  return <div className="pm-extras">{widgets.map(app => {
    const pinned = session?.widgets?.some(widget => widget.appId === app.id);
    return <button className="pm-button" key={app.id} disabled={busy || !session} aria-pressed={!!pinned} onClick={() => void run(() => apply('session.setWidget', { appId: app.id, remove: !!pinned, ...(!pinned ? { x: Math.max(160, innerWidth - 370), y: 72 + (session?.widgets?.length ?? 0) * 28 } : {}) }), pinned ? 'Widget removed from desktop.' : 'Widget pinned. Drag its header to move it; use ⤢ to resize.')}>{pinned ? 'Unpin widget' : 'Pin to desktop'}{widgets.length > 1 ? `: ${app.title}` : ''}</button>;
  })}{themes.length > 0 && <div className="pm-theme-options"><p>Desktop colours · Your wallpaper stays the same</p>{themes.map(theme => <button className="pm-button" key={theme.id} aria-pressed={session?.theme?.id === theme.id} disabled={busy} onClick={() => void run(() => apply('session.setTheme', { theme }), `${theme.name} applied.`)}><i style={{ background: theme.accent }} />{theme.name}{session?.theme?.id === theme.id ? ' ✓' : ''}</button>)}<button className="pm-button subtle" disabled={busy || !session?.theme} onClick={() => void run(() => apply('session.setTheme', { theme: null }), 'Desktop colours reset.')}>Reset desktop colours</button></div>}</div>;
}

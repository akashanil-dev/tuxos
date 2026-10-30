import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { DesktopWidget, SessionState } from '@tuxos/kernel';
import type { InstalledPlugin } from '@tuxos/sdk';
import type { SystemClient } from '@tuxos/system';
import { usePointerDrag } from '../hooks/usePointerDrag';
const PluginWindowFrame = lazy(() => import('./PluginWindowFrame'));
import './widgets.css';

export function desktopThemeStyle(theme: SessionState['theme']): CSSProperties {
  if (!theme) return {};
  return {
    '--accent': theme.accent, '--accent-strong': theme.accent, '--accent-soft': `${theme.accent}33`, '--accent-fg': theme.background,
    '--window-bg': theme.background, '--window-fg': theme.foreground, '--window-sidebar': theme.surface,
    '--titlebar': theme.surface, '--titlebar-inactive': theme.background, '--surface': theme.surface,
    '--surface-2': theme.surface, '--card': theme.surface, '--menu-bg': theme.background,
    '--muted': `color-mix(in srgb, ${theme.foreground} 70%, ${theme.background})`,
    '--text': theme.foreground, '--line': `${theme.foreground}25`, '--window-border': theme.surface,
  } as CSSProperties;
}

export function DesktopWidgets({ system, widgets, top, bottom }: { system: SystemClient; widgets: DesktopWidget[]; top: number; bottom: number }) {
  const [entries, setEntries] = useState<InstalledPlugin[]>([]);
  useEffect(() => {
    let active = true, ticket = 0;
    const manager = system.plugins?.();
    const refresh = async () => { const current = ++ticket; const result = await manager?.list() ?? []; if (active && current === ticket) setEntries(result); };
    void refresh();
    const stop = manager?.onChange(() => void refresh());
    return () => { active = false; stop?.(); };
  }, [system]);
  return <div className="desktop-widgets" aria-label="Desktop widgets">{widgets.map(widget => {
    const plugin = entries.find(entry => entry.status === 'enabled' && entry.manifest?.contributes.apps?.some(app => app.id === widget.appId && app.widget));
    const app = plugin?.manifest?.contributes.apps?.find(app => app.id === widget.appId);
    return app && <Widget key={`${widget.appId}:${system.plugins?.().generation(plugin!.id)}`} system={system} widget={widget} title={app.title} top={top} bottom={bottom} />;
  })}</div>;
}

function Widget({ system, widget, title, top, bottom }: { system: SystemClient; widget: DesktopWidget; title: string; top: number; bottom: number }) {
  const [preview, setPreview] = useState(widget);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState('');
  const origin = useRef({ x: 0, y: 0 });
  const [, setViewport] = useState(0);
  useEffect(() => setPreview(widget), [widget]);
  useEffect(() => { const resize = () => setViewport(n => n + 1); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  const width = Math.min(preview.width, Math.max(240, innerWidth - 16));
  const height = Math.min(preview.height, Math.max(200, innerHeight - top - bottom - 16));
  const clamp = (x: number, y: number) => ({ x: Math.max(8, Math.min(x, innerWidth - width - 8)), y: Math.max(top + 8, Math.min(y, innerHeight - bottom - height - 8)) });
  const position = clamp(preview.x, preview.y);
  const save = async (values: Partial<DesktopWidget> & { remove?: boolean }) => {
    const result = await system.dispatch('session.setWidget', { appId: widget.appId, ...values });
    if (!result.ok) { setError(result.error.message); return; }
    try { await system.flush(); setError(''); } catch { setError('Could not save widget layout. Move it again to retry.'); }
  };
  const locate = (event: React.PointerEvent) => clamp(event.clientX - origin.current.x, event.clientY - origin.current.y);
  const drag = usePointerDrag(event => setPreview(current => ({ ...current, ...locate(event) })), event => { setMoving(false); void save(locate(event)); });
  return <section className="desktop-widget" aria-label={`${title} widget`} style={{ left: position.x, top: position.y, width, height }}>
    <header><button className="widget-handle" aria-label={`Move ${title} widget`} title="Drag to move, or use arrow keys" {...drag} onPointerDown={event => { origin.current = { x: event.clientX - position.x, y: event.clientY - position.y }; setMoving(true); drag.onPointerDown(event); }} onPointerCancel={() => setMoving(false)} onKeyDown={event => {
      const steps: Record<string, [number, number]> = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] };
      const step = steps[event.key]; if (!step) return; event.preventDefault(); void save(clamp(position.x + step[0], position.y + step[1]));
    }}>⠿ {title}</button><button aria-label={`Resize ${title} widget`} title="Switch between compact and large" onClick={() => void save({ width: widget.width > 400 ? 340 : 480, height: widget.height > 400 ? 360 : 500 })}>⤢</button><button aria-label={`Unpin ${title} widget`} title="Remove from desktop" onClick={() => void save({ remove: true })}>×</button></header>
    {error && <p role="alert">{error}</p>}
    <div className="widget-content" style={{ pointerEvents: moving ? 'none' : undefined }}><Suspense fallback={<p role="status">Loading widget…</p>}><PluginWindowFrame system={system} appId={widget.appId} /></Suspense></div>
  </section>;
}

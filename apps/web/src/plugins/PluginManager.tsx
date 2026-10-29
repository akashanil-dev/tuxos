import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { comparePluginVersions, PLUGIN_CAPABILITIES, PLUGIN_LIMITS, validatePluginPackage, type InstalledPlugin, type PluginPackage } from '@tuxos/sdk';
import type { AppViewProps } from '@tuxos/system';
import { AppIcon } from '../desktop/AppIcon';
import { PLUGIN_CATALOG, STARTER_PLUGIN } from './catalog';
import { PluginExtras, PluginPreview } from './PluginExtras';
import './plugins.css';

type Section = 'discover' | 'installed' | 'updates' | 'add';
type Review = { kind: 'install' | 'enable'; package: PluginPackage; replace?: boolean } | { kind: 'remove'; entry: InstalledPlugin };

function download(pkg: PluginPackage) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${pkg.manifest.id}-${pkg.manifest.version}.tuxos-plugin.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PluginManagerView({ system }: AppViewProps) {
  const manager = system.plugins?.();
  const [section, setSection] = useState<Section>('discover');
  const [installed, setInstalled] = useState<InstalledPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [raw, setRaw] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let ticket = 0;
    const refresh = async () => {
      const current = ++ticket;
      try {
        const entries = await manager?.list() ?? [];
        if (mounted.current && current === ticket) { setInstalled(entries); setLoading(false); }
      } catch (err) { if (mounted.current) setNotice({ error: true, text: String(err) }); }
    };
    void refresh();
    const stop = manager?.onChange(() => void refresh());
    return () => { mounted.current = false; stop?.(); };
  }, [manager]);

  const run = async (work: () => Promise<unknown>, success: string) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await work();
      if (mounted.current) { setNotice({ error: false, text: success }); setReview(null); }
    } catch (err) {
      if (mounted.current) { setReview(null); setNotice({ error: true, text: err instanceof Error ? err.message : String(err) }); }
    } finally { if (mounted.current) setBusy(false); }
  };

  function prepare(value: unknown) {
    try {
      const pkg = validatePluginPackage(value);
      const old = installed.find((entry) => entry.id === pkg.manifest.id);
      setReview({ kind: 'install', package: pkg, replace: !!old });
      setNotice(null);
    } catch (err) { setNotice({ error: true, text: err instanceof Error ? err.message : String(err) }); }
  }

  async function reviewEnable(id: string) {
    if (!manager || busy) return;
    setBusy(true);
    try { const pkg = await manager.export(id); if (mounted.current) { setReview({ kind: 'enable', package: pkg }); setNotice(null); } }
    catch (err) { if (mounted.current) setNotice({ error: true, text: err instanceof Error ? err.message : String(err) }); }
    finally { if (mounted.current) setBusy(false); }
  }

  const select = (target: Section) => { setSection(target); setQuery(''); setCategory('All'); setNotice(null); };
  const needle = query.trim().toLowerCase();
  const matches = (name: string, description = '', id = '') => `${name} ${description} ${id}`.toLowerCase().includes(needle);
  const available = PLUGIN_CATALOG.filter((item) => matches(item.package.manifest.name, item.package.manifest.description, item.package.manifest.id)
    && (category === 'All' || item.category === category));
  const visibleInstalled = installed.filter((entry) => matches(entry.manifest?.name ?? entry.id, entry.manifest?.description, entry.id));
  const updates = PLUGIN_CATALOG.filter(item => { const entry = installed.find(entry => entry.id === item.package.manifest.id); return entry?.manifest && comparePluginVersions(item.package.manifest.version, entry.manifest.version) > 0; });
  const bytes = installed.reduce((sum, entry) => sum + entry.bytes, 0);

  if (!manager) return <div className="pm-empty"><h2>Plugins are unavailable</h2><p>This system does not support plugin installation.</p></div>;

  return <div className="plugin-manager">
    <div className="pm-layout" inert={!!review}>
      <aside className="pm-sidebar">
        <div className="pm-brand"><span className="pm-brand-icon"><AppIcon name="plugins" /></span><div><strong>Plugins</strong><small>Desktop extensions</small></div></div>
        <nav aria-label="Plugin manager">
          <button aria-current={section === 'discover' ? 'page' : undefined} onClick={() => select('discover')}><span>◇</span>Discover<small>{PLUGIN_CATALOG.length}</small></button>
          <button aria-current={section === 'installed' ? 'page' : undefined} onClick={() => select('installed')}><span>▦</span>Installed<small>{installed.length}</small></button>
          <button aria-current={section === 'updates' ? 'page' : undefined} onClick={() => select('updates')}><span>↻</span>Updates<small>{updates.length}</small></button>
          <button aria-current={section === 'add' ? 'page' : undefined} onClick={() => select('add')}><span>＋</span>Add your own</button>
        </nav>
        <div className="pm-storage"><span>Plugin packages</span><strong>{Math.ceil(bytes / 1024)} KB <small>/ 1 MB</small></strong><progress aria-label="Plugin package storage" value={bytes} max={PLUGIN_LIMITS.totalBytes} /><small>{installed.length} of {PLUGIN_LIMITS.installed} installed</small></div>
        <div className="pm-sidebar-note"><span aria-hidden="true">♧</span><p>Small tools.<br />More possibilities.</p></div>
      </aside>

      <main className="pm-main" aria-label="Plugins">
        <header className="pm-toolbar"><span>{section === 'discover' ? 'Discover plugins' : section === 'installed' ? 'Your plugins' : section === 'updates' ? 'Plugin updates' : 'Create something useful'}</span>{section !== 'add' && <label className="pm-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="Search plugins" placeholder="Search plugins…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>}</header>
        {notice && <div className={`pm-notice ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}><span>{notice.text}</span>{notice.error && notice.text.includes('saving failed') && <button disabled={busy} onClick={() => void run(() => system.flush(), 'Your changes are saved.')}>Retry saving</button>}<button aria-label="Dismiss notification" onClick={() => setNotice(null)}>×</button></div>}

        {(section === 'discover' || section === 'updates') && <>
          {section === 'discover' && <section className="pm-hero"><div><span className="pm-eyebrow">Get new extensions</span><h1>Extend your desktop</h1><p>Discover widgets, applications and colour schemes<br className="pm-wide" /> for your workspace.</p><button className="pm-button subtle" onClick={() => select('add')}>Add your own plugin <span aria-hidden="true">↗</span></button></div><div className="pm-hero-art" aria-hidden="true"><AppIcon name="plugins" /></div></section>}
          <div className="pm-section-heading"><div><h2>{section === 'updates' ? 'Updates for your collection' : 'Available plugins'}</h2><p>{section === 'updates' ? 'Review each update. Your private data stays with you.' : 'Desktop plugins · Apps, widgets and appearance presets.'}</p></div><span className="pm-count">{section === 'updates' ? updates.length : available.length} plugins</span></div>
          <div className="pm-filters" aria-label="Plugin categories">{['All', ...new Set(PLUGIN_CATALOG.map(item => item.category))].map((value) => <button key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}</div>
          <div className="pm-grid">{(section === 'updates' ? updates.filter(item => available.includes(item)) : available).map((item) => {
            const pkg = item.package;
            const entry = installed.find((p) => p.id === pkg.manifest.id);
            const update = !!entry?.manifest && comparePluginVersions(pkg.manifest.version, entry.manifest.version) > 0;
            return <article className={`pm-card accent-${item.accent}`} key={pkg.manifest.id}>
              <PluginPreview manifest={pkg.manifest} />
              <div className="pm-card-top"><div className="pm-plugin-icon"><AppIcon name={pkg.manifest.contributes.apps![0]!.icon} /></div><span className="pm-pill">{item.category}</span></div>
              <h3>{pkg.manifest.name}</h3><p className="pm-tagline">{item.tagline}</p><p className="pm-description">{pkg.manifest.description}</p>
              <details className="pm-feature-details"><summary>Features & release notes</summary><p>{pkg.manifest.contributes.apps?.some(app => app.widget) ? 'Open as an app or pin as a movable desktop widget. Layout is saved with your TuxOS system.' : pkg.manifest.contributes.themes?.length ? 'Preview three palettes, apply desktop colours, and reset to your desktop’s default.' : 'Interactive tools in their own sandboxed window.'}</p><p>v{pkg.manifest.version} · {['tuxos-notes', 'tuxos-focus'].includes(pkg.manifest.id) ? 'Adds desktop widget support and a compact layout.' : 'First release in the TuxOS collection.'}</p><small>Source: bundled TuxOS catalog · {pkg.manifest.author}</small></details>
              <div className="pm-card-meta"><span>TuxOS · v{pkg.manifest.version}</span><span>{pkg.manifest.capabilities.length ? 'Private storage' : 'No permissions'}</span></div>
              <div className="pm-card-actions">{entry && !update
                ? <button className="pm-button" disabled={busy || entry.status === 'invalid'} onClick={() => entry.status === 'enabled'
                  ? void run(async () => { const opened = await system.openApp(pkg.manifest.contributes.apps![0]!.id); if (!opened.ok) throw new Error(opened.error.message); }, `${pkg.manifest.name} opened.`)
                  : void reviewEnable(entry.id)}>{entry.status === 'enabled' ? 'Open plugin' : entry.status === 'invalid' ? 'Invalid package' : 'Enable plugin'}</button>
                : <button className="pm-button primary" disabled={busy || loading} onClick={() => prepare(pkg)}>{update ? 'Review update' : 'Install plugin'} <span aria-hidden="true">＋</span></button>}
                {entry && <span className={`pm-installed-label ${entry.status === 'enabled' ? '' : 'muted'}`}>{entry.status === 'enabled' ? '✓ Installed' : entry.status === 'disabled' ? 'Disabled' : 'Needs attention'}</span>}
              </div>
              {entry && <PluginExtras system={system} entry={entry} busy={busy} run={run} />}
            </article>;
          })}</div>
          {section === 'updates' && !updates.length && <Empty title="You’re up to date." text="No newer versions in the bundled catalog. Custom plugin updates can be imported in Add your own." />}
          {!available.length && <Empty title="No matching plugins" text="Try another name or category." />}
          <div className="pm-bottom-note"><span aria-hidden="true">🧩</span><div><strong>Have an idea for a plugin?</strong><p>Start with a template and bring your own app to this desktop.</p></div><button className="pm-button subtle" onClick={() => select('add')}>Get started →</button></div>
        </>}

        {section === 'installed' && <>
          <div className="pm-section-heading"><div><h1>At home on your desktop.</h1><p>Manage your plugins and the permissions you’ve approved.</p></div></div>
          {loading ? <p role="status">Loading plugins…</p> : !visibleInstalled.length ? <Empty title={installed.length ? 'No matching plugins' : 'A little room for something new.'} text={installed.length ? 'Try searching for another name.' : 'Install a plugin from Discover, or add a package of your own.'}><button className="pm-button primary" onClick={() => select('discover')}>Explore plugins</button></Empty> : <div className="pm-installed-list">{visibleInstalled.map((entry) => <article className="pm-installed-card" key={entry.id}>
            <div className="pm-plugin-icon"><AppIcon name={entry.manifest?.contributes.apps?.[0]?.icon ?? '🧩'} /></div>
            <div className="pm-installed-copy"><div className="pm-installed-title"><h2>{entry.manifest?.name ?? entry.id}</h2><span className={`pm-state ${entry.status}`}>{entry.status === 'enabled' ? 'Enabled' : entry.status === 'disabled' ? 'Disabled' : 'Needs attention'}</span></div><p>{entry.manifest?.description ?? 'This package could not be loaded.'}</p><small>{entry.manifest?.author ?? 'Custom plugin'} · v{entry.manifest?.version ?? '?'} · {Math.ceil(entry.bytes / 1024)} KB</small>{entry.error && <p className="pm-inline-error">{entry.error}</p>}<div className="pm-permission-summary">{entry.manifest?.capabilities.length ? entry.manifest.capabilities.map((cap) => <span key={cap}>{PLUGIN_CAPABILITIES[cap as keyof typeof PLUGIN_CAPABILITIES]}</span>) : 'No storage permissions'}</div>
              <div className="pm-installed-actions">{entry.status === 'enabled' && <><button className="pm-button" disabled={busy} onClick={() => void run(async () => { const opened = await system.openApp(entry.manifest!.contributes.apps![0]!.id); if (!opened.ok) throw new Error(opened.error.message); }, 'Plugin opened.')}>Open</button><button className="pm-button subtle" disabled={busy} onClick={() => void run(() => manager.setEnabled(entry.id, false), 'Plugin disabled. Its data is kept.')}>Disable</button></>}
                {entry.status === 'disabled' && <button className="pm-button" disabled={busy} onClick={() => void reviewEnable(entry.id)}>Review & enable</button>}
                {entry.manifest && entry.status !== 'invalid' && <button className="pm-button subtle" disabled={busy} onClick={() => void run(async () => download(await manager.export(entry.id)), 'Plugin package exported. Private data is not included.')}>Export package</button>}
                <button className="pm-button danger subtle" disabled={busy} onClick={() => setReview({ kind: 'remove', entry })}>Remove</button>
              </div>
              <PluginExtras system={system} entry={entry} busy={busy} run={run} />
            </div>
          </article>)}</div>}
        </>}

        {section === 'add' && <>
          <div className="pm-add-heading"><span className="pm-eyebrow">Built by you</span><h1>Your idea deserves an icon.</h1><p>Add a plugin package from your computer, or start with our small, editable template.</p></div>
          <section className="pm-import"><div className="pm-import-symbol" aria-hidden="true">↥</div><h2>Bring your own plugin</h2><p>Choose a .tuxos-plugin.json package. Up to 256 KB.</p><input ref={file} hidden type="file" accept=".json,application/json" aria-label="Plugin package file" onChange={(event) => {
            const selected = event.target.files?.[0]; event.target.value = '';
            if (!selected) return;
            if (selected.size > PLUGIN_LIMITS.packageBytes) { setNotice({ error: true, text: 'Plugin package exceeds 256 KB.' }); return; }
            void selected.text().then(prepare).catch(() => setNotice({ error: true, text: 'Could not read this file.' }));
          }} /><button className="pm-button primary" disabled={busy} onClick={() => file.current?.click()}>Choose package</button><span className="pm-import-or">or paste the package JSON below</span><label className="pm-json-label">Package JSON<textarea aria-label="Package JSON" spellCheck={false} value={raw} maxLength={PLUGIN_LIMITS.packageBytes} placeholder={'{ "format": "tuxos-plugin", "formatVersion": 1, … }'} onChange={(event) => setRaw(event.target.value)} /></label><div className="pm-import-footer"><small>You’ll review the plugin and its permissions before installing.</small><button className="pm-button" disabled={busy || !raw.trim()} onClick={() => prepare(raw)}>Review package →</button></div></section>
          <section className="pm-template"><span aria-hidden="true">⌘</span><div><h2>Start with a working template</h2><p>Edit the name, ID and self-contained HTML. Set an app’s widget field to true to make it pinnable. Add declarative themes for colour presets. Then import it here.</p></div><button className="pm-button subtle" onClick={() => { setRaw(JSON.stringify(STARTER_PLUGIN, null, 2)); setNotice({ error: false, text: 'Template loaded below. Change its name, IDs and HTML before reviewing.' }); }}>Use template</button><button className="pm-button subtle" onClick={() => download(STARTER_PLUGIN)}>Download</button></section>
          <p className="pm-trust-note">Custom plugins run code. Install packages from authors you trust. Their approved storage permissions apply only to their own files.</p>
        </>}
      </main>
    </div>
    {review && <ReviewDialog key={review.kind + (review.kind === 'remove' ? review.entry.id : review.package.manifest.id)} review={review} busy={busy} onClose={() => { if (!busy) setReview(null); }} onConfirm={(deleteData) => {
      if (review.kind === 'remove') void run(() => manager.uninstall(review.entry.id, { deleteData }), `${review.entry.manifest?.name ?? review.entry.id} removed.${deleteData ? ' Private data deleted.' : ' Private data kept for reinstall.'}`);
      else if (review.kind === 'enable') void run(() => manager.setEnabled(review.package.manifest.id, true, { approvedCapabilities: review.package.manifest.capabilities }), `${review.package.manifest.name} enabled.`);
      else void run(() => manager.install(review.package, { approvedCapabilities: review.package.manifest.capabilities, replace: review.replace }), `${review.package.manifest.name} ${review.replace ? 'updated' : 'installed'}. Find it in your app launcher.`);
    }} />}
  </div>;
}

function Empty({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return <div className="pm-empty"><span aria-hidden="true">◇</span><h2>{title}</h2><p>{text}</p>{children}</div>;
}

function ReviewDialog({ review, busy, onClose, onConfirm }: { review: Review; busy: boolean; onClose(): void; onConfirm(deleteData: boolean): void }) {
  const titleId = useId();
  const [approved, setApproved] = useState(false);
  const [deleteData, setDeleteData] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const remove = review.kind === 'remove';
  const manifest = remove ? review.entry.manifest : review.package.manifest;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('button')?.focus();
    return () => previous?.focus();
  }, []);
  return <div className="pm-modal-backdrop"><div className="pm-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panel} onKeyDown={(event) => {
    if (event.key === 'Escape' && !busy) { event.stopPropagation(); onClose(); }
    if (event.key === 'Tab') {
      const targets = [...panel.current!.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')];
      const first = targets[0], last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <div className="pm-modal-heading"><div className="pm-plugin-icon"><AppIcon name={manifest?.contributes.apps?.[0]?.icon ?? '🧩'} /></div><button className="pm-close" aria-label="Close review" disabled={busy} onClick={onClose}>×</button></div>
    <span className="pm-eyebrow">{remove ? 'Make some room' : 'You’re in control'}</span><h2 id={titleId}>{remove ? 'Remove this plugin?' : review.kind === 'enable' ? 'Enable this plugin?' : review.replace ? 'Review plugin update' : 'Review plugin installation'}</h2>
    <h3>{manifest?.name ?? (remove ? review.entry.id : '')} <small>v{manifest?.version ?? '?'}</small></h3><p>{manifest?.description}</p>
    {remove ? <><p>Its open windows will close, its widgets will be unpinned and its apps will leave your launcher. You can install it again later.</p><label className="pm-consent"><input type="checkbox" checked={deleteData} onChange={(event) => setDeleteData(event.target.checked)} />Also delete this plugin’s saved data</label>{deleteData && <p className="pm-inline-error">Saved data will be permanently deleted.</p>}</> : <>
      <dl className="pm-review-details"><dt>Author</dt><dd>{manifest?.author ?? 'Not specified'}</dd><dt>Apps</dt><dd>{manifest?.contributes.apps?.map((app) => app.title).join(', ')}</dd></dl>
      <div className="pm-review-permissions">{manifest?.contributes.apps?.some(app => app.widget) && <p>Includes optional desktop widgets. Pin them after installation.</p>}{!!manifest?.contributes.themes?.length && <p>Includes {manifest.contributes.themes.length} desktop colour presets. Apply them after installation.</p>}<strong>Requested permissions</strong>{manifest?.capabilities.length ? <ul>{manifest.capabilities.map((cap) => <li key={cap}>{PLUGIN_CAPABILITIES[cap as keyof typeof PLUGIN_CAPABILITIES]}</li>)}</ul> : <p>No storage permissions. This plugin works entirely inside its window.</p>}</div>
      {review.kind === 'install' && review.replace && <p>The installed package will be replaced and its windows closed. Its private data will be kept.</p>}
      <label className="pm-consent"><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} />I trust this plugin and approve these permissions.</label>
    </>}
    <footer><button className="pm-button subtle" disabled={busy} onClick={onClose}>Cancel</button><button className={`pm-button ${remove ? 'danger' : 'primary'}`} disabled={busy || (!remove && !approved)} onClick={() => onConfirm(deleteData)}>{busy ? 'Saving changes…' : remove ? 'Remove plugin' : review.kind === 'enable' ? 'Enable plugin' : review.replace ? 'Update plugin' : 'Install plugin'}</button></footer>
  </div></div>;
}

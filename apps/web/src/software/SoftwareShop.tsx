import { useEffect, useState } from 'react';
import type { AppViewProps } from '@tuxos/system';
import { RECIPES, SOFTWARE, changePackage, readInstalled } from './packages';
import { AppIcon } from '../desktop/AppIcon';
import './software.css';

export default function SoftwareShop({ system }: AppViewProps) {
  const [have, setHave] = useState(new Set<string>());
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Explore');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [log, setLog] = useState('');
  useEffect(() => {
    let active = true, ticket = 0;
    const refresh = async () => {
      const current = ++ticket;
      try { const names = await readInstalled(system); if (active && ticket === current) { setHave(names); setLoading(false); } }
      catch (cause) { if (active) setError(String(cause)); }
    };
    void refresh();
    const stop = system.onChange(event => {
      if (event.action.type === 'fs.write' || event.action.type === 'shell.ran') void refresh();
    });
    return () => { active = false; stop(); };
  }, [system]);
  const act = async (name: string, operation: 'install' | 'remove') => {
    if (busy) return;
    setBusy(name); setError(''); setNotice(`${operation === 'install' ? 'Installing' : 'Removing'} ${name}…`);
    try { setLog(await changePackage(system, name, operation)); setHave(await readInstalled(system)); setNotice(`${name} ${operation === 'install' ? 'is installed. Ready to open!' : 'removed.'}`); }
    catch (cause) { setNotice(''); setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(''); }
  };
  const open = async (id: string, args?: Record<string, string>) => {
    const result = await system.openApp(id, args);
    if (!result.ok) setError(result.error.message);
  };
  const visible = SOFTWARE.filter(pkg => {
    const recipe = RECIPES[pkg.name];
    return (category !== 'Installed' || have.has(pkg.name)) && (['Explore', 'Installed'].includes(category) || recipe?.category === category)
      && `${pkg.name} ${recipe?.title} ${pkg.summary}`.toLowerCase().includes(query.toLowerCase().trim());
  });
  return <div className="software-shop">
    <aside className="shop-sidebar"><div className="shop-brand"><AppIcon name="software" /><strong>Software<small>Discover applications</small></strong></div>
      <nav aria-label="Software categories">{['Explore', 'Installed', 'Just for fun', 'Everyday tools', 'Learn & explore'].map(name => <button key={name} aria-current={category === name ? 'page' : undefined} onClick={() => setCategory(name)}>{name}{name === 'Installed' && <small>{SOFTWARE.filter(p => have.has(p.name)).length}</small>}</button>)}</nav>
      <div className="shop-plugins"><AppIcon name="plugins" /><strong>Make it your desktop</strong><p>Widgets, themes and small apps live in Plugins.</p><button onClick={() => void open('plugins')}>Explore desktop plugins ↗</button></div>
      <small className="shop-footnote">A curated practice collection.<br />Installs into your saved TuxOS system.</small>
    </aside>
    <main className="shop-main"><header className="shop-toolbar"><strong>{category === 'Explore' ? 'Discover something new' : category}</strong><input type="search" aria-label="Search software" placeholder="Search apps or commands…" value={query} onChange={event => setQuery(event.target.value)} /></header>
      {category === 'Explore' && !query && <section className="shop-hero"><div><span className="shop-eyebrow">Featured collection</span><h1>Discover something new</h1><p>Fun terminal tools and useful applications.<br />Install a favourite and try your first command.</p><span className="shop-hero-tag">Free software · Ready to explore</span></div><AppIcon name="software" /></section>}
      <div className="shop-notices" aria-live="polite">{notice && <p role="status">{notice}</p>}{error && <p role="alert">{error} {error.includes('saving failed') && <button onClick={() => void system.flush().then(() => { setError(''); setNotice('Changes saved.'); }).catch(cause => setError(String(cause)))}>Retry saving</button>}</p>}</div>
      {['Explore', 'Learn & explore'].includes(category) && (!query || 'learn linux filesystem folders configuration'.includes(query.toLowerCase().trim())) && <article className="shop-card" aria-label="Learn Linux Filesystem"><div className="shop-card-body"><div className="shop-badges"><span>Built-in learning app</span><span className="shop-installed">✓ Ready to use</span></div><h3>Learn Linux Filesystem</h3><p>Meet the folders under /, read important files and try six safe configuration exercises.</p><button className="shop-primary" onClick={() => void open('learn-filesystem')}>Open filesystem guide ↗</button></div></article>}
      <div className="shop-heading"><div><h2>{category === 'Installed' ? 'Ready when you are' : 'Find your next favourite'}</h2><p>Terminal tools · Shared with apt</p></div><span>{visible.length} programs</span></div>
      {loading ? <p role="status">Reading installed software…</p> : <div className="shop-grid">{visible.map(pkg => {
        const recipe = RECIPES[pkg.name] ?? { title: pkg.summary, description: pkg.description, category: 'Everyday tools', command: pkg.commands[0]!, preview: `$ ${pkg.commands[0]}`, color: 'blue' };
        const installed = have.has(pkg.name);
        return <article className={`shop-card tone-${recipe.color}`} key={pkg.name} aria-label={pkg.name}>
          <div className="shop-preview"><span>{pkg.name}</span><pre aria-label={`${pkg.name} example preview`}>{recipe.preview}</pre><small>Example preview</small></div>
          <div className="shop-card-body"><div className="shop-badges"><span>Terminal package</span>{installed && <span className="shop-installed">✓ Installed</span>}</div><h3>{recipe.title}</h3><p>{recipe.description}</p>
            <div className="shop-card-actions">{installed ? <><button className="shop-primary" disabled={!!busy} onClick={() => void open('terminal', { run: recipe.command })}>Try it ↗</button><button disabled={!!busy} aria-label={`Remove ${pkg.name}`} onClick={() => void act(pkg.name, 'remove')}>{busy === pkg.name ? 'Removing…' : 'Remove'}</button></> : <button className="shop-primary" disabled={!!busy || loading} onClick={() => void act(pkg.name, 'install')}>{busy === pkg.name ? 'Installing…' : 'Install'}</button>}<small>{pkg.downloadSize} kB download</small></div>
            <details><summary>See the terminal command</summary><p>Install from a terminal:</p><code>sudo apt update<br />sudo apt install {pkg.name}</code><p>Then try:</p><code>{recipe.command}</code>{pkg.name === 'cmatrix' && <p>Use Stop command or Ctrl+C to end the animation.</p>}</details>
            <details><summary>Package details</summary><dl><dt>Version</dt><dd>{pkg.version}</dd><dt>Installed size</dt><dd>{pkg.installedSize} kB</dd><dt>Dependencies</dt><dd>{pkg.depends.join(', ') || 'None'}</dd></dl><p>Dependencies are installed automatically. Removing this program keeps any unused libraries for apt autoremove.</p></details>
          </div>
        </article>;
      })}</div>}
      {!loading && !visible.length && <div className="shop-empty"><h3>{category === 'Installed' ? 'Your collection starts here.' : 'No programs found.'}</h3><p>Try another search or explore the collection.</p><button onClick={() => { setQuery(''); setCategory('Explore'); }}>Explore software</button></div>}
      {log && <details className="shop-log"><summary>Last installation activity</summary><pre>{log}</pre></details>}
    </main>
  </div>;
}

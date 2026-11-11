import { useEffect, useRef, useState } from 'react';
import { AppIcon } from '../../desktop/AppIcon';
import { Tux } from '../../desktop/Tux';
import { Icon } from '../shared/Icons';
import type { App, ShellProps } from '../types';

const FAVORITES = ['terminal', 'files', 'learn-linux', 'settings'];

/** Plasma's Kickoff launcher: favourites and categories on the left, apps on the right, search on top. */
export function Kickoff({ apps, user, open, power, onClose }: ShellProps & { onClose(): void }) {
  const categories = ['Favorites', 'All Applications',
    ...new Set(apps.map((app) => app.category ?? 'Other').sort())];
  const [category, setCategory] = useState('Favorites');
  const [query, setQuery] = useState('');
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const away = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!panel.current?.contains(target) && !target.closest('.plasma-kickoff')) onClose();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', escape);
    };
  }, [onClose]);

  const shown = query ? searchApps(apps, query)
    : category === 'Favorites' ? FAVORITES.flatMap((id) => apps.filter((app) => app.id === id))
      : category === 'All Applications' ? [...apps].sort((a, b) => a.title.localeCompare(b.title))
        : apps.filter((app) => (app.category ?? 'Other') === category);
  const launch = (app: App) => {
    onClose();
    open(app.id);
  };

  return <div className="kickoff" ref={panel} role="dialog" aria-label="Application Launcher">
    <header className="kickoff-head">
      <span className="kickoff-avatar"><Tux /></span>
      <strong>{user}</strong>
      <input
        className="kickoff-search"
        type="search"
        placeholder="Search…"
        aria-label="Search applications"
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && shown[0]) launch(shown[0]); }}
      />
    </header>
    <div className="kickoff-body">
      <nav className="kickoff-categories" aria-label="Categories">
        {categories.map((name) => <button
          key={name}
          className={name === category && !query ? 'selected' : ''}
          onClick={() => { setCategory(name); setQuery(''); }}
          // Plasma switches category on hover, so moving across the list feels instant.
          onPointerEnter={() => { if (!query) setCategory(name); }}
        >{name}</button>)}
      </nav>
      <div className="kickoff-apps" role="list">
        {shown.map((app) => <button key={app.id} data-preload-app={app.id} role="listitem" className="kickoff-app" onClick={() => launch(app)}>
          <AppIcon name={app.icon} />
          <span><strong>{app.title}</strong><small>{app.description}</small></span>
        </button>)}
        {!shown.length && <p className="kickoff-empty">No matches.</p>}
      </div>
    </div>
    <footer className="kickoff-foot">
      <button onClick={() => { onClose(); power('lock'); }}><Icon name="lock" />Lock</button>
      <button onClick={() => { onClose(); power('logout'); }}><Icon name="back" />Log Out</button>
      <span />
      <button onClick={() => { onClose(); power('restart'); }}><Icon name="restart" />Restart</button>
      <button onClick={() => { onClose(); power('shutdown'); }}><Icon name="power" />Shut Down</button>
    </footer>
  </div>;
}

/** Apps whose name, description or category matches, best (name starts with the query) first. */
export function searchApps(apps: App[], query: string): App[] {
  const needle = query.trim().toLowerCase();
  const score = (app: App) => {
    if (app.title.toLowerCase().startsWith(needle) || app.id.startsWith(needle)) return 0;
    if (app.title.toLowerCase().includes(needle)) return 1;
    return `${app.description ?? ''} ${app.category ?? ''}`.toLowerCase().includes(needle) ? 2 : 3;
  };
  return apps.filter((app) => score(app) < 3).sort((a, b) => score(a) - score(b));
}

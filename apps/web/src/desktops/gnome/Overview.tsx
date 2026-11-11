import { useEffect, useState } from 'react';
import { AppIcon } from '../../desktop/AppIcon';
import { searchApps } from '../plasma/Kickoff';
import { Icon } from '../shared/Icons';
import type { App, ShellProps } from '../types';

const DASH = ['terminal', 'files', 'editor', 'learn-linux', 'settings'];

/**
 * The Activities overview: open windows in the middle, the dash along the bottom, and type-to-search.
 * "Show Apps" swaps the windows for the app grid.
 */
export function Overview({ apps, session, open, activate, mode, setMode, onClose }: ShellProps & {
  mode: 'windows' | 'apps';
  setMode(mode: 'windows' | 'apps'): void;
  onClose(): void;
}) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onClose]);

  const launch = (app: App) => {
    onClose();
    open(app.id);
  };
  const dashIds = [...DASH, ...session.windows.map((window) => window.appId)]
    .filter((id, index, all) => all.indexOf(id) === index && apps.some((app) => app.id === id));
  const results = query ? searchApps(apps, query) : null;

  return <div className="gnome-overview" role="dialog" aria-label="Activities overview">
    <input
      className="gnome-search"
      type="search"
      placeholder="Type to search"
      aria-label="Search"
      autoFocus
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      onKeyDown={(event) => { if (event.key === 'Enter' && results?.[0]) launch(results[0]); }}
    />
    <div className="gnome-overview-main" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      {results ? <AppGrid apps={results} launch={launch} />
        : mode === 'apps' ? <AppGrid apps={[...apps].sort((a, b) => a.title.localeCompare(b.title))} launch={launch} />
          : session.windows.length
            ? <div className="gnome-windows">
              {session.windows.map((window) => {
                const app = apps.find((each) => each.id === window.appId);
                return <button
                  key={window.id}
                  className={`gnome-window-card ${window.id === session.focusedId ? 'active' : ''}`}
                  onClick={() => { onClose(); activate(window.id); }}
                >
                  <span className="gnome-window-thumb">{app && <AppIcon name={app.icon} />}</span>
                  <span className="gnome-window-label">{window.title}</span>
                </button>;
              })}
            </div>
            : <p className="gnome-empty">No open windows. Pick an app from the dash below, or start typing to search.</p>}
    </div>
    <nav className="gnome-dash" aria-label="Dash">
      {dashIds.map((id) => {
        const app = apps.find((each) => each.id === id)!;
        const running = session.windows.some((window) => window.appId === id);
        return <button
          key={id}
          className={`gnome-dash-item ${running ? 'running' : ''}`}
          title={app.title}
          aria-label={app.title}
          onClick={() => launch(app)}
        ><AppIcon name={app.icon} /></button>;
      })}
      <span className="gnome-dash-separator" />
      <button
        className={`gnome-dash-item ${mode === 'apps' ? 'running' : ''}`}
        title="Show Apps"
        aria-label="Show Apps"
        onClick={() => setMode(mode === 'apps' ? 'windows' : 'apps')}
      ><Icon name="grid" /></button>
    </nav>
  </div>;
}

function AppGrid({ apps, launch }: { apps: App[]; launch(app: App): void }) {
  if (!apps.length) return <p className="gnome-empty">No results.</p>;
  return <div className="gnome-app-grid">
    {apps.map((app) => <button key={app.id} data-preload-app={app.id} className="gnome-app" onClick={() => launch(app)}>
      <AppIcon name={app.icon} />
      <span>{app.title}</span>
    </button>)}
  </div>;
}

import { useState } from 'react';
import { AppIcon } from '../../desktop/AppIcon';
import { Icon } from '../shared/Icons';
import type { App } from '../types';
import { searchApps } from './Kickoff';

/** KRunner: Plasma's search bar that drops from the top of the screen (Alt+Space). */
export function KRunner({ apps, open, onClose }: { apps: App[]; open(appId: string): void; onClose(): void }) {
  const [query, setQuery] = useState('');
  const results = query ? searchApps(apps, query) : [];
  const launch = (app: App) => {
    onClose();
    open(app.id);
  };

  return <div className="krunner-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="krunner" role="dialog" aria-label="KRunner">
      <div className="krunner-bar">
        <Icon name="search" />
        <input
          aria-label="Search"
          placeholder="Search…"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose();
            if (event.key === 'Enter' && results[0]) launch(results[0]);
          }}
        />
      </div>
      {results.map((app) => <button key={app.id} data-preload-app={app.id} className="krunner-result" onClick={() => launch(app)}>
        <AppIcon name={app.icon} />
        <span><strong>{app.title}</strong><small>{app.description}</small></span>
      </button>)}
    </div>
  </div>;
}

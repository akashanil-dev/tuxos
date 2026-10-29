import { createContext, useContext } from 'react';

// App icons, keyed by the `icon` field of a module's manifest. Each desktop environment has its own icon
// theme, as on real Linux (Breeze, Adwaita, Papirus and Motif-style; see public/icons/CREDITS.md). Apps
// without a themed icon use the TuxOS drawings below, and an unknown key is shown as text, so a module
// can still use a single emoji or glyph.

/** The desktop environment whose icon theme to use, or null for TuxOS's own icons. */
export const IconThemeContext = createContext<string | null>(null);

const THEMED = new Set(['terminal', 'files', 'editor', 'settings', 'chmod-arcade', 'learn-docker']);
const THEMES = new Set(['plasma', 'gnome', 'cde', 'hyprland']);
const iconUrl = (theme: string, name: string) => `/icons/${theme}/${name}.svg`;

/**
 * Fetch a desktop's icon theme ahead of time (while the login screen or a splash is showing), so its icons
 * are already in the browser's cache when the desktop appears instead of popping in one by one.
 */
export function preloadIconTheme(theme: string): void {
  if (!THEMES.has(theme) || typeof Image === 'undefined') return;
  for (const name of THEMED) new Image().src = iconUrl(theme, name);
}

const ICONS: Record<string, () => React.JSX.Element> = {
  software: () => <svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M9 14h30l3 29H6z" fill="#3daee9" />
    <path d="M16 17v-6a8 8 0 0 1 16 0v6" fill="none" stroke="#eff0f1" strokeWidth="3" />
    <path d="M18 29h12m-6-6v12" fill="none" stroke="#fff" strokeWidth="3" />
    <path d="M6 43h36l-1-7H7z" fill="#1d99d3" />
  </svg>,
  plugins: () => <svg viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="4" width="40" height="40" rx="4" fill="#3daee9" />
    <path d="M13 16h7v-3a4 4 0 0 1 8 0v3h7v7h-3a4 4 0 0 0 0 8h3v6H13v-7h3a4 4 0 0 0 0-8h-3z" fill="#eff0f1" />
  </svg>,
  terminal: () => <svg viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="7" width="40" height="34" rx="5" fill="#241f31" stroke="#5e5c64" strokeWidth="2" />
    <rect x="4" y="7" width="40" height="7" rx="3" fill="#3d3846" />
    <path
      d="M12 22l7 5-7 5" fill="none" stroke="#8ff0a4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
    />
    <path d="M23 33h12" stroke="#deddda" strokeWidth="3" strokeLinecap="round" />
  </svg>,
  files: () => <svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M5 13a4 4 0 0 1 4-4h10l4 5h16a4 4 0 0 1 4 4v19a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="#1c71d8" />
    <path d="M5 19h38v18a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="#62a0ea" />
  </svg>,
  editor: () => <svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M11 5h19l9 9v27a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" fill="#f6f5f4" />
    <path d="M30 5v9h9" fill="#c0bfbc" />
    <path d="M14 21h20M14 27h20M14 33h13" stroke="#77767b" strokeWidth="2.5" strokeLinecap="round" />
  </svg>,
  'learn-filesystem': () => <svg viewBox="0 0 48 48" aria-hidden="true"><rect x="5" y="5" width="38" height="38" rx="8" fill="#1d99d3"/><path d="M15 14v20m0-10h17m-17 10h17" stroke="#eff0f1" strokeWidth="3" fill="none"/><rect x="26" y="19" width="11" height="9" rx="2" fill="#f6d32d"/><rect x="26" y="30" width="11" height="9" rx="2" fill="#8ff0a4"/></svg>,
  'learn-linux': () => <svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M24 9 3 19l21 10 21-10z" fill="#33d17a" />
    <path d="M11 24v9c0 3 6 7 13 7s13-4 13-7v-9l-13 6z" fill="#26a269" />
    <path d="M41 21v12" stroke="#f6d32d" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="41" cy="35" r="2.5" fill="#f6d32d" />
  </svg>,
  'learn-docker': () => <svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M4 24h36c2 0 4-3 4-5 1 0 3 1 3 3-1 0-2 1-3 2-2 10-11 16-23 16C11 40 5 34 4 24z" fill="#1d63ed" />
    {[[9, 18], [15, 18], [21, 18], [27, 18], [15, 12], [21, 12], [21, 6]].map(([x, y]) =>
      <rect key={`${x}-${y}`} x={x} y={y} width="5" height="5" rx="1" fill="#99c1f1" />)}
  </svg>,
  'chmod-arcade': () => <svg viewBox="0 0 48 48" aria-hidden="true">
    <rect x="5" y="12" width="38" height="24" rx="12" fill="#7c6cf0" />
    <path d="M14 20v8M10 24h8" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    <circle cx="32" cy="21" r="2.6" fill="#8ff0a4" />
    <circle cx="37" cy="27" r="2.6" fill="#f6d32d" />
    <text x="24" y="44" fontSize="8" textAnchor="middle" fill="#c0bfbc" fontFamily="monospace">755</text>
  </svg>,
  settings: () => <svg viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="19" fill="#5e5c64" />
    <path d="M24 13v4M24 31v4M13 24h4M31 24h4M16.2 16.2l2.8 2.8M29 29l2.8 2.8M16.2 31.8l2.8-2.8M29 19l2.8-2.8"
      stroke="#deddda" strokeWidth="3.4" strokeLinecap="round" />
    <circle cx="24" cy="24" r="6.5" fill="#deddda" />
    <circle cx="24" cy="24" r="3" fill="#5e5c64" />
  </svg>,
  about: () => <svg viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="19" fill="#613583" />
    <circle cx="24" cy="15" r="3" fill="#fff" />
    <path d="M24 21v14" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
  </svg>,
};

export function AppIcon({ name }: { name: string }) {
  const theme = useContext(IconThemeContext);
  if (theme && THEMES.has(theme) && THEMED.has(name)) {
    return <span className="app-icon"><img src={iconUrl(theme, name)} alt="" draggable={false} /></span>;
  }
  const Icon = ICONS[name];
  return <span className="app-icon">{Icon ? <Icon /> : name}</span>;
}

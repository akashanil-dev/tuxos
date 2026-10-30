// Small line icons for panels and login screens, drawn for TuxOS in the style of symbolic system icons.

const paths: Record<string, React.JSX.Element> = {
  wifi: <><path d="M2 7.5a9 9 0 0 1 12 0M4.2 9.9a6 6 0 0 1 7.6 0M6.4 12.2a2.8 2.8 0 0 1 3.2 0" /></>,
  volume: <><path d="M2.5 6.2h2.2L8 3.5v9l-3.3-2.7H2.5z" fill="currentColor" stroke="none" />
    <path d="M10.5 6a3 3 0 0 1 0 4M12.3 4.2a5.6 5.6 0 0 1 0 7.6" /></>,
  battery: <><rect x="2" y="5" width="11" height="6.5" rx="1.4" /><rect x="3.4" y="6.4" width="6.4" height="3.7" rx=".4"
    fill="currentColor" stroke="none" /><path d="M14.3 7.3v2" /></>,
  power: <><path d="M8 2v5.5" /><path d="M4.6 4.2a5.3 5.3 0 1 0 6.8 0" /></>,
  restart: <><path d="M12.8 6.2A5 5 0 1 0 13 9.5" /><path d="M13.2 2.8v3.6H9.6" /></>,
  moon: <><path d="M12.8 10.3A5.5 5.5 0 0 1 5.7 3.2a5.5 5.5 0 1 0 7.1 7.1z" /></>,
  search: <><circle cx="7" cy="7" r="4.3" /><path d="M10.3 10.3 14 14" /></>,
  grid: <>{[3, 8, 13].flatMap((y) => [3, 8, 13].map((x) =>
    <circle key={`${x}${y}`} cx={x} cy={y} r="1.4" fill="currentColor" stroke="none" />))}</>,
  // The cog GNOME uses for its session chooser, drawn on a 24px grid and scaled to fit.
  gear: <g transform="scale(0.6667)" strokeWidth="2.1"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0
    .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0
    0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1
    0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0
    1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3
    1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></g>,
  arrow: <><path d="M3 8h9.5M9 4.5 12.5 8 9 11.5" /></>,
  back: <><path d="M13 8H3.5M7 4.5 3.5 8 7 11.5" /></>,
  lock: <><rect x="3.5" y="7" width="9" height="7" rx="1" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></>,
  a11y: <><circle cx="8" cy="3" r="1.3" fill="currentColor" stroke="none" /><path d="M3 5.6h10M8 5.6v4M8 9.6l-2.4 4.4
    M8 9.6l2.4 4.4" /></>,
  desktop: <><rect x="2" y="3" width="12" height="8" rx="1" /><path d="M6 14h4M8 11v3" /></>,
  trophy: <><path d="M4.5 2h7v4a3.5 3.5 0 0 1-7 0zM4.5 3H2v2a3 3 0 0 0 3 3M11.5 3H14v2a3 3 0 0 1-3 3M8 9.5V13M5 14h6M6 13h4" /></>,
};

export function Icon({ name, label }: { name: keyof typeof paths | string; label?: string }) {
  return <svg
    className="sym-icon"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    role={label ? 'img' : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
  >{paths[name]}</svg>;
}

export function StatusIcons() {
  return <span className="status-icons"><Icon name="wifi" /><Icon name="volume" /><Icon name="battery" /></span>;
}

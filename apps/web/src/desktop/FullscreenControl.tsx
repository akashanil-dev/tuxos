import { useEffect, useState } from 'react';

/** Browser display mode stays separate from the simulated window manager. */
export function FullscreenControl({ top = 0 }: { top?: number }) {
  const [active, setActive] = useState(() => Boolean(document.fullscreenElement));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const changed = () => {
      setActive(Boolean(document.fullscreenElement));
      setError('');
    };
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);

  const toggle = async () => {
    if (pending) return;
    setError('');
    if (!document.fullscreenElement && (!document.documentElement.requestFullscreen || document.fullscreenEnabled === false)) {
      setError('Fullscreen is unavailable here. Open TuxOS in a regular browser tab to use it.');
      return;
    }
    setPending(true);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      setActive(Boolean(document.fullscreenElement));
    } catch {
      setError('The browser blocked fullscreen. Try opening TuxOS in a regular browser tab.');
    } finally {
      setPending(false);
    }
  };

  return <div className="desktop-display-controls" style={{ top: top + 4 }} role="group" aria-label="Desktop display controls">
    {error && <span className="desktop-fullscreen-error" role="status">{error}</span>}
    <button type="button" className="desktop-fullscreen-button" onClick={() => void toggle()}
      disabled={pending} aria-pressed={active} aria-label={active ? 'Exit fullscreen' : 'Enter fullscreen'}
      title={active ? 'Exit fullscreen (Esc)' : 'Use the whole screen'}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={active
          ? 'M4 9h5V4m6 0v5h5M4 15h5v5m6 0v-5h5'
          : 'M9 4H4v5m11-5h5v5M4 15v5h5m6 0h5v-5'} />
      </svg>
      <span>{active ? 'Exit fullscreen' : 'Fullscreen'}</span>
    </button>
  </div>;
}

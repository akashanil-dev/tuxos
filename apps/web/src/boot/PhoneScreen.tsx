import { useEffect, useState } from 'react';
import { Tux } from '../desktop/Tux';

// Ported from Tuxplore's phone rescue screen.
export function isPhone() {
  const touch = window.matchMedia?.('(pointer: coarse)').matches || /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent);
  return Boolean(touch && Math.min(window.screen.width, window.screen.height) < 600);
}

export function PhoneScreen({ onBoot }: { onBoot(): void }) {
  const inches = (Math.hypot(window.screen.width, window.screen.height) / 160).toFixed(1);
  const lines = [
      ['0.000000', 'Linux version 6.10.0-tuxos (tux@igloo) #1 SMP PREEMPT'],
      ['0.004201', 'DMI: Pocket-Sized Glass Rectangle, BIOS "swipe up to unlock"'],
      ['0.011000', `Detecting screen... ${inches} inches. Hmm.`],
      ['0.013370', 'Detecting keyboard... not found'],
      ['0.013371', 'Detecting mouse... found a thumb instead'],
      ['0.020000', 'tux-wm: trying to fit 4 desktop environments into a phone...'],
      ['0.020001', 'tux-wm: windows are now 3 pixels wide'],
      ['0.042000', 'Kernel panic - not syncing: Attempted to run a whole operating system inside a phone browser', 'panic'],
      ['0.042001', '---[ end Kernel panic - not syncing ]---', 'panic'],
  ];
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [shown, setShown] = useState(reduced ? lines.length + 1 : 1);
  const [copied, setCopied] = useState('Copy the link');
  useEffect(() => {
    if (shown > lines.length) return;
    const timer = setTimeout(() => setShown(n => n + 1), shown === lines.length ? 640 : 140);
    return () => clearTimeout(timer);
  }, [shown, lines.length]);
  const url = location.origin + location.pathname;
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied('Copied!'); }
    catch { setCopied(url); }
  }
  return <main className="phone">
    <pre className="phone-log">{lines.slice(0, shown).map(([time, text, cls]) => <span key={time} className={`phone-line ${cls || ''}`}><span className="phone-time">[{time}]</span> {text}</span>)}</pre>
    {shown > lines.length && <section className="phone-rescue">
      <p className="phone-prompt"><span className="c-green">tux@rescue</span>:<span className="c-blue">~</span>$ cat /etc/motd</p>
      <div className="phone-motd"><div className="phone-tux"><Tux /></div><div>
        <h1>Whoa, that's a phone!</h1>
        <p>TuxOS is a whole operating system: windows, a terminal, keyboard shortcuts and four desktops. Your phone tried its best, but Linux needs a real keyboard and a bigger screen.</p>
      </div></div>
      <p className="phone-fix">Open <strong>{location.host || 'TuxOS'}</strong> on a laptop or desktop computer.</p>
      <div className="phone-menu" role="group" aria-label="What now?">
        <span className="phone-menu-title"> What now? </span>
        <button className={`phone-item sel ${copied === 'Copied!' ? 'done' : ''}`} onClick={() => void copy()}><span className="phone-item-label" aria-live="polite">{copied}</span><span className="phone-item-note">Paste it into a browser on your computer</span></button>
        {typeof navigator.share === 'function' && <button className="phone-item" onClick={() => void navigator.share({ title: 'TuxOS', text: 'Learn Linux by playing, in a desktop browser:', url }).catch(() => {})}><span className="phone-item-label">Send it to my computer</span><span className="phone-item-note">Share the link to yourself</span></button>}
        <button className="phone-item" onClick={onBoot}><span className="phone-item-label">Boot anyway</span><span className="phone-item-note">It will be very cramped</span></button>
      </div>
      <p className="phone-foot"><span className="c-dim">Tablets and computers boot straight in.</span></p>
    </section>}
  </main>;
}

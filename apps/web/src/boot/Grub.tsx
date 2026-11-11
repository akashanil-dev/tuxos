import { useEffect, useState } from 'react';

type Entry = { label: string; action: 'boot' | 'advanced' | 'memtest' | 'firmware' | 'back' | 'recovery' };

const MAIN: Entry[] = [
  { label: 'TuxOS GNU/Linux', action: 'boot' },
  { label: 'Advanced options for TuxOS GNU/Linux', action: 'advanced' },
  { label: 'Memory test (memtest86+)', action: 'memtest' },
  { label: 'UEFI Firmware Settings', action: 'firmware' },
];

const ADVANCED: Entry[] = [
  { label: 'TuxOS GNU/Linux, with Linux 6.10.0-tuxos', action: 'boot' },
  { label: 'TuxOS GNU/Linux, with Linux 6.10.0-tuxos (recovery mode)', action: 'recovery' },
  { label: '← Back', action: 'back' },
];

const COUNTDOWN = 5;

/**
 * The boot menu a Linux PC shows first. Arrow keys move, Enter picks, and after a few seconds the
 * highlighted entry boots on its own; any key stops the countdown, as in real GRUB.
 */
export function Grub({ onBoot, onMemoryTest }: { onBoot(mode: 'normal' | 'recovery'): void; onMemoryTest?(): void }) {
  const [menu, setMenu] = useState<Entry[]>(MAIN);
  const [selected, setSelected] = useState(0);
  const [seconds, setSeconds] = useState<number | null>(COUNTDOWN);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (seconds === null) return;
    if (seconds === 0) return onBoot('normal');
    const timer = setTimeout(() => setSeconds(seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds, onBoot]);

  function choose(entry: Entry) {
    setSeconds(null);
    if (entry.action === 'boot') onBoot('normal');
    else if (entry.action === 'recovery') onBoot('recovery');
    else if (entry.action === 'advanced') { setMenu(ADVANCED); setSelected(0); }
    else if (entry.action === 'back') { setMenu(MAIN); setSelected(0); }
    else if (entry.action === 'memtest') { onMemoryTest?.(); setMessage('Simulated memory test: 4096 MB passed. This demonstration does not test your real computer’s memory.'); }
    else setMessage('Firmware settings belong to the real computer this browser runs on, so they aren\'t available here.');
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      setSeconds(null);
      if (['ArrowDown','ArrowUp','Enter','Escape'].includes(event.key)) event.preventDefault();
      if (event.key === 'ArrowDown') setSelected((index) => Math.min(index + 1, menu.length - 1));
      else if (event.key === 'ArrowUp') setSelected((index) => Math.max(index - 1, 0));
      else if (event.key === 'Enter') choose(menu[selected]!);
      else if (event.key === 'Escape' && menu === ADVANCED) { setMenu(MAIN); setSelected(0); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return <main className="grub" onPointerDown={() => setSeconds(null)}>
    <div className="grub-frame">
      <p className="grub-title">GNU GRUB  version 2.12</p>
      <div className="grub-box">
        <ul className="grub-menu" role="listbox" aria-label="Boot menu">
          {menu.map((entry, index) => <li
            key={entry.label}
            role="option"
            aria-selected={index === selected}
            className={index === selected ? 'selected' : ''}
            onClick={() => setSelected(index)}
            onDoubleClick={() => choose(entry)}
          >{index === selected ? '*' : ' '}{entry.label}</li>)}
        </ul>
      </div>
      <button onClick={() => choose(menu[selected]!)}>Run selected entry</button>
      <div className="grub-help">
        {message
          ? <p role="status">{message}</p>
          : <>
            <p>Use the ↑ and ↓ keys to select which entry is highlighted.</p>
            <p>Press enter to boot the selected OS (or double-click it).</p>
            {seconds !== null && <p>The highlighted entry will be executed automatically in {seconds}s.</p>}
          </>}
      </div>
    </div>
  </main>;
}

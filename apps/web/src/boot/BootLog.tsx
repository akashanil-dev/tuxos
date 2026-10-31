import { useEffect, useState } from 'react';

type Line = { kind: 'kernel' | 'ok' | 'warn' | 'plain'; text: string };

/** What a Linux boot prints: the kernel's own messages, then systemd starting each service. */
export function bootLines(recovery: boolean): Line[] {
  const kernel = [
      'Linux version 6.10.0-tuxos (tux@tuxos) (gcc 14.2.0) #1 SMP PREEMPT_DYNAMIC',
      `Command line: BOOT_IMAGE=/boot/vmlinuz-6.10-tuxos root=/dev/sda2 ro quiet splash${recovery ? ' single' : ''}`,
      'BIOS-provided physical RAM map:',
      'x86/fpu: Supporting XSAVE feature 0x001: \'x87 floating point registers\'',
      'Memory: 16318412K/16777216K available',
      'smp: Bringing up secondary CPUs ...',
      'smp: Brought up 1 node, 8 CPUs',
      'ACPI: Interpreter enabled',
      'PCI: Using host bridge windows from ACPI',
      'usb usb1: New USB device found, idVendor=1d6b, idProduct=0002',
      'EXT4-fs (sda2): mounted filesystem with ordered data mode',
      'Run /sbin/init as init process',
  ].map((text, index) => ({ kind: 'kernel' as const, text: `[${(index * 0.15).toFixed(6).padStart(12)}] ${text}` }));
  const services: Line[] = [
      'Mounted /boot/efi', 'Started Journal Service', 'Started udev Kernel Device Manager', 'Reached target Local File Systems',
      'Started Network Manager', 'Started Bluetooth service', 'Started OpenSSH server daemon', 'Started Regular background program processing daemon',
      recovery ? 'Started Recovery Mode Menu' : 'Started Penguin Hint Service', 'Started Segfault Daemon (suspicious)', 'Reached target Graphical Interface', 'Started Display Manager',
  ].map(text => ({ kind: text.includes('suspicious') ? 'warn' : 'ok', text: `${text}.` }));
  return [...kernel, ...services, ...(recovery ? [{ kind: 'plain' as const, text: 'Recovery Menu: nothing is broken, so resuming normal boot. 🩹' }] : [])];
}

/** Prints the boot log line by line. Any key or click skips to the end. */
export function BootLog({ recovery, onDone }: { recovery: boolean; onDone(): void }) {
  const lines = bootLines(recovery);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (shown >= lines.length) {
      const timer = setTimeout(onDone, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : recovery ? 1500 : 300);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setShown(shown + 1), window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : shown < 12 ? 60 : 110);
    return () => clearTimeout(timer);
  }, [shown, lines.length, onDone, recovery]);

  useEffect(() => {
    const skip = () => setShown(lines.length);
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  }, [lines.length]);

  return <main className="bootlog" onPointerDown={() => setShown(lines.length)} aria-live="polite">
    {lines.slice(0, shown).map((line, index) => <div key={index}>
      {line.kind === 'ok' || line.kind === 'warn' ? <><span className="bootlog-bracket">[</span><span className={line.kind === 'warn' ? 'bootlog-warn' : 'bootlog-ok'}>{line.kind === 'warn' ? ' WARN ' : '  OK  '}</span>
        <span className="bootlog-bracket">] </span>{line.text}</> : line.text || ' '}
    </div>)}
    <p className="boot-skip">Press any key to skip</p>
  </main>;
}

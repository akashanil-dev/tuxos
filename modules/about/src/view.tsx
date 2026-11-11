import type { AppViewProps } from '@tuxos/system';
import { useEffect, useState } from 'react';

export default function AboutView({ system }: AppViewProps) {
  const [details, setDetails] = useState({ hostname: '...', user: '...', kernel: '6.10.0-tuxos' });

  useEffect(() => {
    let alive = true;
    Promise.all([
      system.dispatch<string>('fs.read', { path: '/etc/hostname' }),
      system.dispatch<string>('fs.read', { path: '/etc/passwd' }),
    ]).then(([hostname, passwd]) => {
      if (!alive || !hostname.ok || !passwd.ok) return;
      const user = passwd.value.split('\n').find((line) => line.includes(':1000:'))?.split(':')[0] ?? 'unknown';
      setDetails({ hostname: hostname.value.trim(), user, kernel: '6.10.0-tuxos' });
    });
    return () => { alive = false; };
  }, [system]);

  return <div className="about-view">
    <div className="about-mark">ⓘ</div>
    <h2>About this system</h2>
    <p>TuxOS continues Tuxplore: familiar desktops, adventures and games, with deeper Linux learning.</p>
    <p>This is a browser simulation. Commands affect your virtual files, not your computer’s operating system.</p>
    <p><a href="/migrate.html" target="_blank" rel="noreferrer">Bring your Tuxplore progress</a> · <a href="/about.html#credits" target="_blank" rel="noreferrer">Project and credits</a></p>
    <dl>
      <dt>Hostname</dt><dd>{details.hostname}</dd>
      <dt>User</dt><dd>{details.user}</dd>
      <dt>Kernel</dt><dd>{details.kernel}</dd>
    </dl>
  </div>;
}

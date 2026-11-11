import { useState } from 'react';
import type { AppViewProps } from '@tuxos/system';
import './package-practice.css';

export default function PackagePractice({ system }: AppViewProps) {
  const [error, setError] = useState('');
  const launch = async (family: string) => { const result = await system.openApp('terminal', { run: `pkg-lab ${family}`, packageFamily: family }); if (!result.ok) setError(result.error.message); };
  return <div className="package-practice"><h1>One idea, different package managers</h1><p>Your TuxOS desktop uses apt. Choose a separate exercise to learn Fedora’s dnf or Arch’s pacman. Each exercise saves its own package records; it does not change the desktop’s installed software.</p>
    {error && <p role="alert">{error}</p>}<div className="package-practice-choices"><button onClick={() => void launch('fedora')}>Open Fedora exercise · dnf</button><button onClick={() => void launch('arch')}>Open Arch exercise · pacman</button></div>
    <table><thead><tr><th>Task</th><th>Fedora exercise</th><th>Arch exercise</th></tr></thead><tbody>{[
      ['Find a package', 'dnf search cowsay', 'pacman -Ss cowsay'], ['Read its description', 'dnf info cowsay', 'pacman -Si cowsay'],
      ['Install it', 'sudo dnf install cowsay', 'sudo pacman -S cowsay'], ['List installed packages', 'dnf list --installed', 'pacman -Q'],
      ['Remove it', 'sudo dnf remove cowsay', 'sudo pacman -R cowsay'], ['Update the exercise', 'sudo dnf upgrade', 'sudo pacman -Syu'],
    ].map(([task, fedora, arch]) => <tr key={task}><th>{task}</th><td><code>{fedora}</code></td><td><code>{arch}</code></td></tr>)}</tbody></table>
    <p>After installing cowsay, try <code>pkg-lab run cowsay hello</code>. This runs the shared teaching example using your exercise record. Ordinary commands still belong to the main desktop.</p>
    <p><code>pkg-lab status</code> shows completed tasks. <code>pkg-lab leave</code> leaves the exercise. <code>pkg-lab reset</code> asks before resetting this exercise and makes a backup; <code>pkg-lab restore</code> recovers that backup.</p>
    <p>The fixed catalog models searching, installing, listing and removing packages. It omits real downloads, dependency resolution and package scripts; graphical catalog entries do not install real apps. Use Software for the deeper apt simulation.</p>
    <p>Real command references: <a href="https://dnf5.readthedocs.io/en/latest/commands/install.8.html" target="_blank" rel="noopener noreferrer">DNF5</a> · <a href="https://man.archlinux.org/man/pacman.8.en" target="_blank" rel="noopener noreferrer">pacman</a>. On Arch, learn full upgrades with <code>-Syu</code>; this exercise does not teach isolated <code>-Sy</code>.</p>
  </div>;
}

import { useState } from 'react';

const TOUR = [
  { title: 'Welcome to your Linux playground', text: 'This is TuxOS, a pretend Linux computer inside your browser. Explore its desktop, play games and learn commands. Nothing you do here changes your real computer’s files.', tip: 'New to Linux? Start with Tux’s Adventure. I’ll guide you through your first commands, then help you rescue the Kernel Crown.' },
  { title: 'Find your way around', text: 'Double-click desktop icons to open apps. Play has the games and courses. Files lets you browse your virtual folders, and Terminal lets you control the same files by typing.', tip: 'Drag a window by its title bar. Use its buttons to minimise, maximise or close it. The desktop’s app menu opens Settings and your other apps.' },
  { title: 'Try it, and ask when you get stuck', text: 'In Terminal, type whoami and press Enter to ask who you are. pwd shows your current folder, and ls lists what is inside it. The adventure checks your progress as you go.', tip: 'Click me for hints or type quest hint in Terminal during the adventure. My guide works without AI. Your progress saves automatically; Settings → Storage & backups lets you export a copy.' },
];

export function VasuIntro({ user, onChat, onLearn, onAdventure, onClose }: {
  user: string; onChat(): void; onLearn(): void; onAdventure(): void; onClose(): void;
}) {
  const [step, setStep] = useState(0);
  const current = TOUR[step]!;
  return <div className="vasu-bubble" role="dialog" aria-label="Vasu introduces himself">
    <button className="vasu-bubble-close" aria-label="Close" onClick={onClose}>×</button>
    <p className="vasu-bubble-hello">Hi {user || 'there'}! I&apos;m Vasu, your Linux teacher.</p>
    <p className="vasu-tour-step">Getting started · {step + 1} of {TOUR.length}</p>
    <h3>{current.title}</h3>
    <p>{current.text}</p><p>{current.tip}</p>
    <div className="vasu-bubble-actions">
      {step > 0 && <button onClick={() => setStep(step - 1)}>Back</button>}
      {step < TOUR.length - 1 && <button onClick={() => setStep(step + 1)}>Show me around →</button>}
      <button className="primary" onClick={onAdventure}>Start Tux’s Adventure</button>
      <button onClick={onLearn}>Let&apos;s start learning</button>
      <button onClick={onChat}>Ask me something</button>
    </div>
    <button className="vasu-tour-skip" onClick={onClose}>I’ll explore on my own</button>
  </div>;
}
const MET_KEY = 'tuxos.vasu.met.';
export function hasMetVasu(user: string): boolean {
  try { return localStorage.getItem(MET_KEY + user) === '1'; } catch { return false; }
}
export function rememberMetVasu(user: string): void {
  try { localStorage.setItem(MET_KEY + user, '1'); } catch { /* Guide remains available without storage. */ }
}

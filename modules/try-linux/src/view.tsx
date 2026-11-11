import { useEffect, useRef, useState } from 'react';
import { emptyExploration, EXPLORATION_ACHIEVEMENTS, type ExplorationProgress } from '@tuxos/sdk';
import type { AppViewProps } from '@tuxos/system';
import { DISTROS, QUESTIONS, type DistroId } from './data';
import './guide.css';
const Link = ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href} target="_blank" rel="noopener noreferrer">{children} ↗</a>;
export default function TryLinuxView({ system }: AppViewProps) {
  const [progress, setProgress] = useState<ExplorationProgress | null>(null);
  const [page, setPage] = useState<'welcome' | 'quiz' | 'browse'>('welcome');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let alive = true;
    const update = () => { void system.dispatch<ExplorationProgress>('exploration.status', {}).then(result => { if (alive) setProgress(result.ok ? result.value : emptyExploration()); }); };
    update(); const stop = system.onChange(event => { if (/^(try-linux|exploration|learn-adventure|pipe-dream)\./.test(event.action.type)) update(); });
    return () => { alive = false; stop(); };
  }, [system]);
  const answers = progress?.guide?.answers ?? [], id = progress?.guide?.recommendation as DistroId | undefined;
  const match = id && Object.hasOwn(DISTROS, id) ? DISTROS[id] : null;
  const answer = async (values: number[]) => {
    setBusy(true); setError('');
    try { const result = await system.dispatch<NonNullable<ExplorationProgress['guide']>>('try-linux.answer', { answers: values }); if (result.ok) setProgress(previous => ({ ...(previous ?? emptyExploration()), guide: result.value })); else setError(result.error.message); }
    catch (e) { setError(String(e)); } finally { setBusy(false); }
  };
  useEffect(() => { if (page === 'quiz') title.current?.focus(); }, [page, answers.length]);
  if (!progress) return <p>Opening your Linux guide…</p>;
  const card = (key: DistroId) => { const distro = DISTROS[key]; return <article className="distro-card" key={key}><h2>{distro.name}</h2><p>{distro.why}</p><small>Family: {distro.family}</small><p>{distro.check}</p><div><Link href={distro.url}>Official site</Link><Link href={distro.guide}>Official guide</Link></div></article>; };
  return <div className="linux-guide">
    <nav aria-label="Guide sections"><button aria-current={page === 'welcome' ? 'page' : undefined} onClick={() => setPage('welcome')}>Your next step</button><button aria-current={page === 'quiz' ? 'page' : undefined} onClick={() => setPage('quiz')}>Find my distro</button><button aria-current={page === 'browse' ? 'page' : undefined} onClick={() => setPage('browse')}>Browse all six</button></nav>
    {error && <p role="alert">{error}</p>}
    {page === 'welcome' && <><h1>Take your next step with Linux</h1><div className="guide-journey">{[['Commands learned', Object.keys(progress.learned).length], ['Adventure quests', `${Object.keys(progress.adventure.done).length}/10`], ['Discoveries', `${EXPLORATION_ACHIEVEMENTS.filter(a => progress.achievements[a.id]).length}/30`], ['Pipe Dream', `${Object.keys(progress.pipe.solved).length}/8`]].map(([name, value]) => <div key={name}><strong>{value}</strong><span>{name}</span></div>)}</div><p>Your TuxOS practice covers useful Linux concepts. Real systems have more commands and options, actual hardware and networks, passwords, and changes that can affect your files. The dungeon scripts are part of this game.</p><p>Answer four questions for a starting suggestion, or browse all six distributions directly. You can use this guide at any point in your adventure.</p><button className="guide-primary" onClick={() => setPage('quiz')}>{answers.length ? 'Continue my selection' : 'Find my distro →'}</button></>}
    {page === 'quiz' && (answers.length < QUESTIONS.length ? <section><p>Question {answers.length + 1} of {QUESTIONS.length}</p><h1 ref={title} tabIndex={-1}>{QUESTIONS[answers.length]!.question}</h1><div className="guide-options">{QUESTIONS[answers.length]!.choices.map((choice, index) => <button key={choice.label} disabled={busy} onClick={() => void answer([...answers, index])}>{choice.label}</button>)}</div>{answers.length > 0 && <button disabled={busy} onClick={() => void answer(answers.slice(0, -1))}>← Previous question</button>}</section> : <section><h1 ref={title} tabIndex={-1}>A starting suggestion: {match?.name ?? 'choose again'}</h1><p>This is a simple preference match, not a compatibility test or a ranking. Compare the alternatives and try them on your hardware.</p>{id && match && card(id)}<button disabled={busy} onClick={() => void answer([])}>Retake the quiz</button><button onClick={() => setPage('browse')}>Compare all six</button></section>)}
    {page === 'browse' && <><h1>Six places to start</h1><p>All six are available to explore. Your choice of desktop and hardware matters as much as your quiz result.</p><div className="distro-grid">{(Object.keys(DISTROS) as DistroId[]).map(card)}</div></>}
    <section className="guide-next"><h2>Try it in a virtual machine</h2><p>A VM runs Linux in a window with a virtual disk. Download an official ISO, create a VM suited to your computer’s architecture, attach the ISO, and follow the distribution’s installer inside the VM. Leave enough memory and disk space for your current system.</p><p><Link href="https://help.gnome.org/gnome-boxes/create.html">GNOME Boxes guide</Link> · <Link href="https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/create-vm.html">VirtualBox guide</Link></p></section>
    <section className="guide-next"><h2>Or try a live USB</h2><ol><li>Use the distribution’s official download page. Check architecture, hardware requirements and the ISO verification instructions.</li><li>Follow its guide to write the image to a USB drive large enough for that image. Writing it erases the selected USB drive, so check the target and save anything you need first.</li><li>Use your computer’s documented boot menu to select the USB. Choose its live or “try” option. Debian’s small network installer is different from its live images.</li><li>Test Wi-Fi, sound, graphics, keyboard and sleep. A live session does not require installation; it can still access internal disks if you choose to mount or change them.</li><li>When ready to install, back up your files and follow the official guide for your chosen distribution and computer. Disk selection, encryption, firmware settings and dual boot need care.</li></ol><p><Link href="https://ubuntu.com/desktop/docs/en/latest/tutorial/try-ubuntu-desktop/">Ubuntu live-session walkthrough</Link> · <Link href="https://linuxmint-installation-guide.readthedocs.io/en/latest/">Mint installation guide</Link></p></section>
    <p className="guide-reviewed">Official sources reviewed 11 November 2026. Requirements and releases change; use the linked project documentation for current instructions.</p>
  </div>;
}

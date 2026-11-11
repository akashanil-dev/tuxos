import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppViewProps } from '@tuxos/system';
import type { ExplorationProgress } from '@tuxos/sdk';
import { RunnerController } from './controller';
import { FAMILY_NOTES, ICONS, TEAMS, TEAM_NAMES, TEAM_COLOR, type Mode, type Team } from './data';
import { INPUT, STEP, RunnerGame, type GameState } from './model';
import { RunnerRenderer } from './renderer';
import { RunnerSound } from './sound';
import './runner.css';

export default function RunnerView({ system, active = true }: AppViewProps) {
  const canvas = useRef<HTMLCanvasElement>(null), root = useRef<HTMLDivElement>(null);
  const controller = useRef<RunnerController | null>(null), renderer = useRef<RunnerRenderer | null>(null), sound = useRef<RunnerSound | null>(null);
  const held = useRef(0), raf = useRef(0), lastTime = useRef(0), accumulator = useRef(0), ticksSinceSave = useRef(0);
  const alive = useRef(true), visible = useRef(active && !document.hidden), secretTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [game, setGame] = useState<GameState>(() => new RunnerGame('Rapid', 1).state);
  const [records, setRecords] = useState<ExplorationProgress['runner']>({ mode: 'Rapid', rapidBest: 0, infiniteHigh: 0, sound: true });
  const [started, setStarted] = useState(false), [busy, setBusy] = useState(true), [error, setError] = useState('');
  const [map, setMap] = useState(false), [teams, setTeams] = useState(false), [secret, setSecret] = useState(false), [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState<Mode | null>(null), [reduced, setReduced] = useState(false);
  const publish = useCallback(() => { if (alive.current && controller.current) { setGame(structuredClone(controller.current.game.state)); setRecords({ ...controller.current.records }); setError(controller.current.error); } }, []);
  const save = useCallback(() => { const target = controller.current; if (target) void target.flush().then(() => { if (controller.current === target) publish(); }); ticksSinceSave.current = 0; }, [publish]);
  const pause = useCallback(() => {
    held.current = 0; accumulator.current = 0;
    if (controller.current?.game.state.screen === 'play') controller.current.input({ kind: 'pause', paused: true });
    cancelAnimationFrame(raf.current); raf.current = 0; sound.current?.suspend(); save(); publish();
  }, [publish, save]);
  const begin = useCallback(async (mode: Mode) => {
    setBusy(true); setError('');
    try {
      await controller.current?.flush();
      const next = await RunnerController.create(system, mode);
      if (!alive.current) return;
      controller.current = next; held.current = 0; ticksSinceSave.current = 0; accumulator.current = 0;
      if (sound.current) sound.current.enabled = next.records.sound;
      setTeams(false); setMap(false); setSecret(false); setConfirm(null); publish();
    } catch(e) { if (alive.current) setError(String(e)); } finally { if (alive.current) setBusy(false); }
  }, [system, publish]);
  useEffect(() => {
    alive.current = true;
    const audio = new RunnerSound(); sound.current = audio;
    const paint = new RunnerRenderer(canvas.current!); renderer.current = paint;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => { paint.reducedMotion = media.matches; setReduced(media.matches); if (controller.current) paint.draw(controller.current.game.state); };
    motion(); media.addEventListener('change', motion);
    const resize = new ResizeObserver(() => { if (controller.current) paint.draw(controller.current.game.state); }); resize.observe(canvas.current!);
    let current = true;
    void system.dispatch<ExplorationProgress>('exploration.status', {}).then(async result => { if (current) await begin(result.ok ? result.value.runner.mode : 'Rapid'); });
    return () => { current = false; alive.current = false; cancelAnimationFrame(raf.current); raf.current = 0; if (secretTimer.current) clearTimeout(secretTimer.current); media.removeEventListener('change', motion); resize.disconnect(); paint.dispose(); audio.dispose(); void controller.current?.flush(); };
  }, [system, begin]);
  useEffect(() => {
    const change = () => { visible.current = active && !document.hidden; if (!visible.current) pause(); };
    change(); document.addEventListener('visibilitychange', change); window.addEventListener('blur', pause);
    return () => { document.removeEventListener('visibilitychange', change); window.removeEventListener('blur', pause); };
  }, [active, pause]);
  useEffect(() => {
    if (!started || game.screen !== 'play' || !active || document.hidden || map || teams || secret || confirm) { cancelAnimationFrame(raf.current); raf.current = 0; renderer.current?.draw(controller.current?.game.state ?? game); return; }
    let hud = 0; lastTime.current = performance.now(); accumulator.current = 0;
    const frame = (now: number) => {
      raf.current = 0;
      const target = controller.current; if (!target || !visible.current || target.game.state.screen !== 'play') return;
      // A delayed browser frame never creates an uncontrolled catch-up jump.
      accumulator.current += Math.min(.1, Math.max(0,(now-lastTime.current)/1000)); lastTime.current = now;
      const before = { score: target.game.state.score, wrong: target.game.state.wrong, screen: target.game.state.screen };
      while (accumulator.current >= STEP && target.game.state.screen === 'play') { target.input({ kind: 'frames', count: 1, input: held.current }); accumulator.current -= STEP; ticksSinceSave.current++; }
      const state = target.game.state;
      if (state.score > before.score) sound.current?.good();
      if (state.wrong > before.wrong) sound.current?.bad();
      if (ticksSinceSave.current >= 240 || state.score !== before.score || state.wrong !== before.wrong || state.screen !== before.screen) save();
      renderer.current?.draw(state);
      if (now-hud > 100 || state.screen !== before.screen) { hud = now; publish(); }
      if (target.error) { pause(); return; }
      if (state.screen === 'play') raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf.current); raf.current = 0; };
  }, [started, game.screen, active, map, teams, secret, confirm, publish, save, pause]);
  const resume = () => { if (!controller.current || !visible.current) return; sound.current?.gesture(); controller.current.input({ kind:'pause', paused:false }); held.current=0; save(); publish(); canvas.current?.focus(); };
  const choose = (team: Team) => { try { controller.current?.input({kind:'choose',team}); setTeams(false); setStarted(true); sound.current?.gesture(); save(); publish(); canvas.current?.focus(); } catch(e) { setError(String(e)); } };
  const openMap = () => { pause(); controller.current?.input({kind:'map'}); setMap(true); save(); };
  const openSecret = () => { pause(); setPassword(''); setSecret(true); secretTimer.current=null; };
  const holdSecret = () => { if (!secretTimer.current) secretTimer.current=setTimeout(openSecret,3000); };
  const releaseSecret = () => { if(secretTimer.current) clearTimeout(secretTimer.current); secretTimer.current=null; };
  const input = (bit: number, on: boolean) => { if(on && bit===INPUT.jump && !(held.current&bit) && controller.current?.game.state.screen==='play') sound.current?.jump(); held.current=on?held.current|bit:held.current&~bit; };
  useEffect(() => {
    const release = (event: KeyboardEvent) => { const k=event.key.toLowerCase(); if([' ','w','arrowup'].includes(k)) held.current&=~INPUT.jump; if(['a','arrowleft'].includes(k)) held.current&=~INPUT.left; if(['d','arrowright'].includes(k)) held.current&=~INPUT.right; if(k==='h') releaseSecret(); };
    const pointers = () => { held.current=0; releaseSecret(); };
    window.addEventListener('keyup',release); window.addEventListener('pointerup',pointers); window.addEventListener('pointercancel',pointers);
    return () => { window.removeEventListener('keyup',release); window.removeEventListener('pointerup',pointers); window.removeEventListener('pointercancel',pointers); };
  }, []);
  const toggleSound = async () => { const on=!records.sound; if(sound.current) {sound.current.enabled=on; if(on)sound.current.gesture(); else sound.current.suspend();} try {await controller.current?.sound(on);publish();}catch(e){setError(String(e));} };
  const key = (event: React.KeyboardEvent) => {
    if ((event.target as HTMLElement).matches('input,textarea,select')) return;
    const k=event.key.toLowerCase();
    if(k==='h') {if(!event.repeat)holdSecret(); return;}
    if(k==='escape') { if(map)setMap(false);else if(teams)setTeams(false);else if(secret)setSecret(false);else pause(); return; }
    if(map||teams||secret||confirm) return;
    if(k==='m') {event.preventDefault();if(!event.repeat)openMap();return;}
    if(k==='p') {event.preventDefault();if(!event.repeat)game.screen==='play'?pause():resume();return;}
    if(k==='r') {event.preventDefault();pause();setConfirm(game.mode);return;}
    // Buttons keep Space/Enter activation. Game keys are owned by the canvas only.
    if(event.target!==canvas.current) return;
    if([' ','w','arrowup'].includes(k)){event.preventDefault();if(!event.repeat)input(INPUT.jump,true);}
    if(['a','arrowleft'].includes(k)){event.preventDefault();input(INPUT.left,true);}
    if(['d','arrowright'].includes(k)){event.preventDefault();input(INPUT.right,true);}
  };
  const showPick = started && (game.screen==='pick'||teams);
  return <div ref={root} className="distro-runner" onKeyDown={key} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))pause();}}>
    <header className="runner-hud"><div><strong>{game.team??'Know Your Distro'}</strong><span>Score {game.score}</span><span>Total {game.total}</span><span>Lives {game.lives}/10</span><span>Combo {game.streak}</span><span>Best {game.mode==='Rapid'?records.rapidBest:records.infiniteHigh}</span></div><div><span>{game.mode}{game.mode==='Rapid'?` · round ${Math.min(3,game.rounds.length+1)}/3`:''}</span><span>{game.weather}</span><span>{(game.speed/170).toFixed(1)}×</span><button disabled={busy||!started||game.screen==='pick'||game.screen==='finish'} onClick={()=>game.screen==='play'?pause():resume()}>{game.screen==='paused'?'Resume':'Pause'}</button><button disabled={busy} onClick={openMap}>Family map</button><button disabled={busy||(game.mode==='Rapid'&&game.team!==null&&game.screen!=='pick')} onClick={()=>{pause();setTeams(true);setStarted(true);}}>Teams</button><button aria-pressed={records.sound} onClick={()=>void toggleSound()}>Sound {records.sound?'on':'off'}</button><button onClick={()=>{pause();setConfirm(game.mode);}}>Restart</button></div></header>
    <div className="runner-stage"><canvas ref={canvas} tabIndex={0} aria-label="Know Your Distro game. Space or W to jump; A and D to move; P to pause; M for the family map." onPointerDown={event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);event.currentTarget.focus();sound.current?.gesture();input(INPUT.jump,true);}} onPointerUp={()=>input(INPUT.jump,false)} onPointerCancel={()=>input(INPUT.jump,false)} />
      {(!started&&!map&&!secret)||busy ? <section className="runner-overlay"><h1>Know Your Distro</h1><p>Run into your family’s distros for +50. Jump over other families: each wrong pick costs 20 points and one life. Ten in a row makes a combo.</p><div className="runner-modes">{(['Rapid','Infinite'] as Mode[]).map(mode=><button key={mode} aria-pressed={game.mode===mode} disabled={busy} onClick={()=>void begin(mode)}><strong>{mode}</strong><span>{mode==='Rapid'?'3 different families · 10 lives each':'Endless · switch families any time'}</span></button>)}</div><p>Space/W/↑ or tap to jump; hold for height, with three extra air jumps. A/D/←/→ moves on the ground. Speed rises to 2×.</p><button disabled={busy} onClick={()=>{setStarted(true);sound.current?.gesture();}}>Choose a team →</button><p>Best Rapid {records.rapidBest} · Best Infinite {records.infiniteHigh}{records.legacyBest!==undefined?` · Historical best ${records.legacyBest}`:''}</p></section>:null}
      {showPick&&!map&&!secret&&!confirm&&<section className="runner-overlay"><h1>{game.mode==='Rapid'?`Choose team ${game.rounds.length+1} of 3`:'Choose your family'}</h1><p>{game.team?`${game.team}: ${game.score} points. `:''}{game.mode==='Rapid'?'Each round uses a different family.':'Your total carries over when you switch or run out of lives.'}</p><div className="runner-teams">{TEAM_NAMES.filter(team=>game.mode==='Infinite'||!game.played.includes(team)).map(team=><button key={team} onClick={()=>choose(team)}><img src={`/distros/${ICONS[team]}.png`} alt=""/><strong>{team}</strong><small>{TEAMS[team].length} relatives</small></button>)}</div>{teams&&game.team&&<button onClick={()=>setTeams(false)}>Back to paused game</button>}</section>}
      {started&&game.screen==='paused'&&!map&&!teams&&!secret&&!confirm&&<section className="runner-overlay compact"><h1>Paused</h1><p>Your run waits while this window is hidden or another app has focus.</p><button onClick={resume}>Resume game</button></section>}
      {game.screen==='finish'&&!map&&!secret&&!confirm&&<section className="runner-overlay"><h1>Rapid complete!</h1><p className="runner-total">{game.total} points</p><ul>{game.rounds.map((round,i)=><li key={round.team}>Round {i+1} · {round.team}: {round.score}</li>)}</ul><p>{game.demonstration?'Showcase run: personal records were not changed.':`Best Rapid: ${records.rapidBest}`}</p><button onClick={()=>{setStarted(false);void begin(game.mode);}}>Play again</button></section>}
      {map&&<section className="runner-overlay runner-map"><h1>Distro family map</h1><p>This is a broad family-history grouping, including older projects. It is not a list of installation recommendations.</p><div className="runner-family-grid">{TEAM_NAMES.map(team=><article key={team} style={{borderColor:TEAM_COLOR[team]}}><h2>{team}</h2><ul>{TEAMS[team].map(name=><li key={name}><img src={`/distros/${ICONS[name]}.png`} alt=""/>{name}</li>)}</ul></article>)}</div><details><summary>Family notes and sources</summary>{FAMILY_NOTES.map(note=><p key={note.url}>{note.text} <a href={note.url} target="_blank" rel="noopener noreferrer">Project source ↗</a></p>)}<p>ArcoLinux remains in the original game’s family set. Its site could not be verified during this migration; no maintenance status is asserted here.</p><a href="/distros/CREDITS.md" target="_blank" rel="noopener noreferrer">Artwork credits ↗</a></details><button onClick={()=>setMap(false)}>Close map</button></section>}
      {secret&&<section className="runner-overlay compact"><h1>Showcase mode</h1><p>Enter the familiar secret to let Tux play. Showcase runs keep personal scores unchanged.</p><form onSubmit={event=>{event.preventDefault();try{controller.current?.input({kind:'showcase',password});save();publish();setSecret(false);}catch{setError('That is not the showcase password.');}}}><label>Showcase password <input type="password" value={password} autoFocus autoComplete="off" onChange={event=>setPassword(event.target.value)}/></label><button>Toggle showcase</button><button type="button" onClick={()=>setSecret(false)}>Cancel</button></form></section>}
      {confirm&&<section className="runner-overlay compact"><h1>Start a new run?</h1><p>This ends the current run. Saved best scores and discoveries stay.</p><div className="runner-modes">{(['Rapid','Infinite'] as Mode[]).map(mode=><button key={mode} aria-pressed={confirm===mode} onClick={()=>setConfirm(mode)}>{mode}</button>)}</div><button onClick={()=>{setStarted(false);void begin(confirm);}}>Start new run</button><button onClick={()=>setConfirm(null)}>Keep current run</button></section>}
    </div>
    <footer className="runner-footer"><p role="status" aria-live="polite">{error||game.message}{game.showcase?' · Showcase on':''}</p>{error&&<button onClick={save}>Retry score save</button>}<div className="runner-touch">{[['Move left',INPUT.left],['Jump',INPUT.jump],['Move right',INPUT.right]].map(([label,bit])=><button key={label} onPointerDown={event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);sound.current?.gesture();input(bit as number,true);}} onPointerUp={()=>input(bit as number,false)} onPointerCancel={()=>input(bit as number,false)} onKeyDown={event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();if(!event.repeat)input(bit as number,true);}}} onKeyUp={()=>input(bit as number,false)}>{label}</button>)}<button className="runner-secret-hold" aria-label="Hold Tux for three seconds" onPointerDown={holdSecret} onPointerUp={releaseSecret} onPointerCancel={releaseSecret}>🐧</button></div><small>{reduced?'Reduced motion: static scenery, no snowfall or sparkle. ':''}Best scores save automatically. Reloading starts a new run. {game.demonstration?'Restart for a scored run.':''}</small></footer>
  </div>;
}

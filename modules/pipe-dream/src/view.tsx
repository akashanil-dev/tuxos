import { useEffect, useState } from 'react';
import { emptyExploration, type ExplorationProgress } from '@tuxos/sdk';
import type { AppViewProps } from '@tuxos/system';
import { LEVELS, MAX_STAGES } from './levels';
import { evaluatePuzzle } from './puzzle';
import './pipe.css';
export default function PipeDreamView({ system }: AppViewProps) {
  const [progress, setProgress] = useState(emptyExploration);
  const [levelId, setLevelId] = useState<string>(LEVELS[0].id);
  const [stages, setStages] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    void system.dispatch<ExplorationProgress>('exploration.status', {}).then(result => {
      if (!active || !result.ok) return;
      const id = LEVELS.find(level => level.id === result.value.pipe.current)?.id ?? LEVELS.find(level => !result.value.pipe.solved[level.id])?.id ?? LEVELS[0].id;
      setProgress(result.value); setLevelId(id); setStages(result.value.pipe.drafts?.[id] ?? []); setLoaded(true);
    });
    return () => { active = false; };
  }, [system]);
  const level = LEVELS.find(level => level.id === levelId)!;
  const result = evaluatePuzzle(level.id, stages);
  async function play(id: string, next: number[]) {
    setLevelId(id); setStages(next);
    const saved = await system.dispatch('pipe-dream.play', { id, stages: next });
    if (!saved.ok) { setError(saved.error.message); return; }
    const current = await system.dispatch<ExplorationProgress>('exploration.status', {});
    if (current.ok) setProgress(current.value);
  }
  if (!loaded) return <p role="status">Opening Pipe Dream…</p>;
  return <div className="pipe-dream">
    <nav aria-label="Pipe Dream levels"><h2>Pipe Dream</h2><p>{Object.keys(progress.pipe.solved).length} of 8 solved</p>{LEVELS.map((item, i) => <button key={item.id} aria-current={item.id === level.id ? 'step' : undefined} onClick={() => void play(item.id, progress.pipe.drafts?.[item.id] ?? [])}>{progress.pipe.solved[item.id] ? '✓' : i + 1} {item.title}</button>)}</nav>
    <main><div className="pipe-work"><h2>{level.title}</h2><p>{level.story}</p>{error && <p role="alert">{error}</p>}
      <div className="pipe-comparison"><section><h3>{result.solved ? '✓ Target reached!' : 'Target output'}</h3><pre>{result.target}</pre></section><section><h3>Your output</h3><pre>{result.output || '(nothing)'}</pre></section></div>
      <h3>Your pipeline · {stages.length}/{MAX_STAGES} blocks</h3>
      <div className="pipe-stages"><section><strong>cat {level.file}</strong><pre>{level.input}</pre></section>{stages.map((block, index) => <section key={index}><strong>{level.blocks[block]!.join(' ')}</strong><div><button aria-label={`Remove stage ${index + 1}`} onClick={() => void play(level.id, stages.filter((_, i) => i !== index))}>Remove</button><button disabled={index === 0} aria-label={`Move stage ${index + 1} left`} onClick={() => { const next = [...stages]; [next[index-1], next[index]] = [next[index]!, next[index-1]!]; void play(level.id, next); }}>←</button></div><pre>{result.results[index]!.stdout || '(nothing)'}</pre>{result.results[index]!.stderr && <p role="status">{result.results[index]!.stderr}</p>}</section>)}</div>
      <code className="pipe-command">{result.command}</code>
      </div><footer className="pipe-controls"><h3>Blocks · choose one to add</h3><div className="pipe-palette">{level.blocks.map((block, index) => <button key={index} disabled={stages.length >= MAX_STAGES || result.solved} onClick={() => void play(level.id, [...stages, index])}>{block.join(' ')}</button>)}</div>
      <button onClick={() => void play(level.id, [])}>Reset pipeline</button>
      {result.solved && <p role="status">Solved! This uses the same text filters as the TuxOS terminal. {LEVELS.findIndex(l => l.id === level.id) < LEVELS.length - 1 && <button onClick={() => void play(LEVELS[LEVELS.findIndex(l => l.id === level.id) + 1]!.id, [])}>Next level →</button>}</p>}
      </footer>
    </main>
  </div>;
}

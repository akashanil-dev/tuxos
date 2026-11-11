import { emptyExploration, type ExplorationProgress, type ModuleDefinition } from '@tuxos/sdk';
import { KernelError, type ActionContext } from '@tuxos/kernel';
import { RunnerGame, replay } from './model';
import type { Mode } from './data';
import { manifest } from './manifest';
export { manifest } from './manifest';
export interface GameStart { id: string; seed: number; mode: Mode; records: ExplorationProgress['runner'] }
export const knowYourDistro: ModuleDefinition = { manifest, activate(ctx) {
  let session: { id: string; game: RunnerGame; sequence: number; previous: string } | null = null;
  let serial = 0;
  const learner = (actor: ActionContext['actor']) => { if (actor.kind !== 'user') throw new KernelError('EPERM', 'Play the game yourself to record its results.'); };
  ctx.registerAction({ type: 'know-your-distro.start', capability: 'exploration:write', mutates: true, description: 'Start a new seeded runner game, keeping mode-specific records.', run: ({ state, actor, now }: ActionContext, input: { mode?: unknown }): GameStart => {
    learner(actor);
    if (input?.mode !== 'Rapid' && input?.mode !== 'Infinite') throw new KernelError('EINVAL', 'Choose Rapid or Infinite.');
    const progress = state.exploration ??= emptyExploration(), seed = (now + ++serial * 2654435761) >>> 0;
    const id = `${now}-${serial}`;
    session = { id, game: new RunnerGame(input.mode, seed), sequence: 0, previous: '' };
    progress.runner.mode = input.mode;
    return { id, seed, mode: input.mode, records: structuredClone(progress.runner) };
  } });
  ctx.registerAction({ type: 'know-your-distro.checkpoint', capability: 'exploration:write', mutates: true, description: 'Replay bounded game input to verify scores and discoveries.', run: ({ state, actor, now }: ActionContext, input: { id?: unknown; sequence?: unknown; events?: unknown }) => {
    learner(actor);
    if (!session || input?.id !== session.id) throw new KernelError('EAGAIN', 'This run is no longer active. Start a new game.');
    const fingerprint = JSON.stringify(input.events);
    if (input.sequence === session.sequence && fingerprint === session.previous) return structuredClone(state.exploration?.runner);
    if (!Number.isSafeInteger(input.sequence) || input.sequence !== session.sequence + 1) throw new KernelError('EAGAIN', 'A game checkpoint is missing. Retry saving this run.');
    const candidate = replay(session.game, input.events), game = candidate.state;
    const exploration = state.exploration ??= emptyExploration(), records = exploration.runner;
    const award = (id: string) => { exploration.achievements[id] ??= now; };
    if (game.mapSeen) award('runner_map');
    if (game.secretFound) award('runner_secret');
    if (game.team) records.family = game.team;
    if (game.played.length) award('runner_play');
    if (!game.demonstration) {
      if (game.mode === 'Infinite') records.infiniteHigh = Math.max(records.infiniteHigh, game.peakTotal);
      if (game.peakScore >= 500) award('runner_500');
      if (game.peakCombo >= 10) award('runner_combo');
      if (game.mode === 'Rapid' && game.screen === 'finish') { records.rapidBest = Math.max(records.rapidBest, game.total); award('runner_rapid'); }
    }
    session = { ...session, game: candidate, sequence: input.sequence as number, previous: fingerprint };
    return structuredClone(records);
  } });
  ctx.registerAction({ type: 'know-your-distro.sound', capability: 'exploration:write', mutates: true, description: 'Save the runner sound preference.', run: ({ state, actor }: ActionContext, input: { sound?: unknown }) => {
    learner(actor); if (typeof input?.sound !== 'boolean') throw new KernelError('EINVAL', 'Expected a sound preference.');
    (state.exploration ??= emptyExploration()).runner.sound = input.sound;
  } });
  return () => { session = null; };
} };
export default knowYourDistro;

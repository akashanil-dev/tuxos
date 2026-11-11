import { emptyExploration, type ModuleDefinition } from '@tuxos/sdk';
import { KernelError, type ActionContext } from '@tuxos/kernel';
import { LEVELS } from './levels';
import { evaluatePuzzle } from './puzzle';
import { manifest } from './manifest';
export { manifest } from './manifest';
export const pipeDream: ModuleDefinition = { manifest, activate(ctx) {
  ctx.registerAction({ type: 'pipe-dream.play', capability: 'exploration:write', mutates: true, description: 'Try a pipeline and record a verified solution.',
    run: ({ state, actor, now }: ActionContext, payload: { id?: unknown; stages?: unknown }) => {
      if (actor.kind !== 'user') throw new KernelError('EPERM', 'Play the puzzle yourself to record a solution.');
      const result = evaluatePuzzle(payload?.id, payload?.stages);
      const progress = state.exploration ??= emptyExploration();
      progress.pipe.current = result.id;
      (progress.pipe.drafts ??= {})[result.id] = result.stages;
      if (result.solved) {
        progress.pipe.solved[result.id] ??= now;
        progress.achievements.first_pipe ??= now;
        if (LEVELS.every(level => progress.pipe.solved[level.id])) progress.achievements.pipe_all ??= now;
      }
      return result;
    },
  });
} };
export default pipeDream;

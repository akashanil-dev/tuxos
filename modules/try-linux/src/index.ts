import { emptyExploration, type ModuleDefinition } from '@tuxos/sdk';
import { KernelError, type ActionContext } from '@tuxos/kernel';
import { recommendation } from './data';
import { manifest } from './manifest';
export { manifest } from './manifest';
export const tryLinux: ModuleDefinition = { manifest, activate(ctx) {
  ctx.registerAction({ type: 'try-linux.answer', capability: 'exploration:write', mutates: true, description: 'Save the four-question Linux preference selector and its result.', run: ({ state, actor, now }: ActionContext, input: { answers?: unknown }) => {
    if (actor.kind !== 'user') throw new KernelError('EPERM', 'Answer the quiz yourself to record this discovery.');
    const guide = recommendation(input?.answers);
    const exploration = state.exploration ??= emptyExploration();
    exploration.guide = guide;
    if (guide.recommendation) exploration.achievements.installer ??= now;
    return guide;
  } });
} };
export default tryLinux;

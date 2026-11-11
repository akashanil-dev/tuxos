import { emptyExploration, type KernelEvent, type ModuleDefinition } from '@tuxos/sdk';
import { KernelError, type ActionContext, type ShellRan } from '@tuxos/kernel';
import { WINDOWS_COMMANDS } from '@tuxos/shell';
import { manifest } from './manifest';
export { manifest } from './manifest';

export const exploration: ModuleDefinition = {
  manifest,
  activate(ctx) {
    let lastDesktop: string | undefined;
    ctx.registerAction({ type: 'exploration.discover', capability: 'exploration:write', mutates: true, description: 'Record a learner’s boot-menu or desktop discovery.',
      run: ({ state, actor, now }: ActionContext, input: { id?: unknown }) => {
        if (actor.kind !== 'user') throw new KernelError('EPERM', 'Only the learner can earn discoveries.');
        if (!['memtest', 'recovery', 'konami'].includes(input?.id as string)) throw new KernelError('EINVAL', 'Unsupported desktop discovery.');
        const progress = state.exploration ??= emptyExploration(); progress.achievements[input.id as string] ??= now;
      },
    });
    ctx.registerAction({ type: 'exploration.daemon', capability: 'exploration:write', mutates: true, description: 'Stop the fictional segfault daemon without changing course processes.',
      run: ({ state, actor, user, now }: ActionContext) => {
        if (actor.kind !== 'user' || user !== 'root') throw new KernelError('EPERM', 'The fictional daemon belongs to root. The learner can use sudo kill 666.');
        const progress = state.exploration ??= emptyExploration();
        if (progress.achievements.daemon) throw new KernelError('ESRCH', 'The fictional daemon has already been stopped.');
        progress.achievements.daemon = now; return 'The segfault daemon lets out a final “core dumped” and vanishes. Your crown is safe.\n';
      },
    });
    ctx.registerAction({ type: 'exploration.status', capability: 'exploration:read', mutates: false,
      description: 'Read adventure, discoveries, commands and game records.',
      run: ({ state }: ActionContext) => structuredClone(state.exploration ?? emptyExploration()),
    });
    ctx.registerAction({ type: 'exploration.observe', capability: 'exploration:write', mutates: true,
      description: 'Record verified exploration activity from the trusted observer.',
      run: ({ state, actor, now }: ActionContext, event: KernelEvent | null) => {
        if (actor.kind !== 'module' || actor.id !== 'exploration') throw new KernelError('EPERM', 'Only the exploration observer can record activity.');
        const progress = state.exploration ??= emptyExploration();
        const award = (id: string) => { progress.achievements[id] ??= now; };
        if (!event) { award('first_boot'); lastDesktop = state.session.desktop; return; }
        if (event.actor.kind !== 'user' || !event.ok) return;
        if (event.action.type === 'shell.ran') {
          const ran = event.action.payload as ShellRan;
          // Older events have no per-command successes and must not invent learned commands.
          const success = ran.successfulCommands ?? [];
          for (const name of success) if (/^[a-z][a-z0-9-]{0,39}$/.test(name)) progress.learned[name] ??= event.time;
          if (success.length) award('first_cmd');
          const count = Object.keys(progress.learned).length;
          if (count >= 10) award('ten_cmds');
          if (count >= 25) award('twenty_cmds');
          if (ran.code === 0 && /(^|[^|])\|([^|]|$)/.test(ran.line)) award('first_pipe');
          if (success.includes('sudo')) award('sudo_lecture');
          for (const name of ['cowsay', 'fortune', 'sl']) if (success.includes(name)) award(name);
          for (const [activity, id] of Object.entries({ 'vim-exit': 'vim_escape', matrix: 'matrix', 'root-refused': 'rm_rf', sandwich: 'sandwich', daemon: 'daemon' })) if (ran.activities?.includes(activity as NonNullable<ShellRan['activities']>[number])) award(id);
          if (ran.commands.some(name => Object.hasOwn(WINDOWS_COMMANDS, name.toLowerCase()))) award('windows_habit');
        }
        if (event.action.type === 'session.setDesktop') { if (lastDesktop !== state.session.desktop) award('theme_switch'); lastDesktop = state.session.desktop; }
        if (event.action.type === 'session.open') {
          const payload = event.action.payload as { appId?: string; args?: Record<string, string> };
          if (payload.appId === 'terminal' && payload.args?.from === 'files') award('files_terminal');
        }
      },
    });
    ctx.dispatch('exploration.observe', null);
    return ctx.onEvent(event => {
      if (event.actor.kind === 'user' && event.ok && ['shell.ran', 'session.setDesktop', 'session.open'].includes(event.action.type)) ctx.dispatch('exploration.observe', event);
    });
  },
};
export default exploration;

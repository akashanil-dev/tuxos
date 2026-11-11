import { emptyExploration, type KernelEvent, type ModuleDefinition } from '@tuxos/sdk';
import { KernelError, type ActionContext, type ShellRan } from '@tuxos/kernel';
import { manifest } from './manifest';
export { manifest } from './manifest';

export const exploration: ModuleDefinition = {
  manifest,
  activate(ctx) {
    let lastDesktop: string | undefined;
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
          if (success.includes('cmatrix') || success.includes('matrix')) award('matrix');
          if (ran.commands.some(name => ['dir', 'cls', 'ipconfig', 'copy', 'del', 'type'].includes(name))) award('windows_habit');
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

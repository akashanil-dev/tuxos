import type { ModuleDefinition } from '@tuxos/sdk';
import { manifest } from './manifest';

export { manifest } from './manifest';

export const about: ModuleDefinition = {
  manifest,
  activate(ctx) {
    ctx.registerCommand({
      name: 'uname', summary: 'Print the system name', usage: 'uname [-a]',
      run(command) {
        const all = command.args.includes('-a');
        const hostname = command.kernel.getState().hostname;
        command.stdout(all ? `Linux ${hostname} 6.10.0-tuxos #1 SMP x86_64 GNU/Linux\n` : 'Linux\n');
        return 0;
      },
    });
  },
};

export default about;

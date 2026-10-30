import type { ModuleDefinition } from '@tuxos/sdk';
import { learningRuntime } from '@tuxos/lessons';
import { manifest } from './manifest';

export { manifest } from './manifest';

// The escape sequence GNU `clear` prints: cursor home, erase the screen, erase the scrollback.
export const CLEAR_SEQUENCE = '\x1b[H\x1b[2J\x1b[3J';

export const terminal: ModuleDefinition = {
  manifest,
  activate(ctx) {
    ctx.registerCommand({
      name: 'clear',
      summary: 'Clear the terminal screen',
      usage: 'clear',
      run(command: { stdout(text: string): void }) {
        command.stdout(CLEAR_SEQUENCE);
        return 0;
      },
    });
    for (const name of ['hint', 'answer', 'task', 'next'] as const) {
      ctx.registerCommand({
        name,
        summary: manifest.contributes.commands!.find((command) => command.name === name)!.summary,
        usage: `/${name}`,
        learningOnly: true,
        async run(command: { stdout(text: string): void; stderr(text: string): void; shell: { learningModule?: string } }) {
          const runner = command.shell.learningModule ? learningRuntime.get(command.shell.learningModule) : undefined;
          if (!runner) {
            command.stderr('No active AI learning task. Open Learn Linux or Learn Docker and start a day first.\n');
            return 1;
          }
          const text = name === 'hint' ? await runner.hint()
            : name === 'answer' ? await runner.answer()
              : runner.next();
          command.stdout(`${text}\n`);
          return 0;
        },
      });
    }
  },
};

export default terminal;

// `shell.ran` records a command line a shell finished running. It changes nothing; it exists so the
// event log shows what was typed and what came back, which lessons check and the tutor reads.

import { KernelError } from '../errors';
import type { ActionDefinition } from '../kernel';

export interface ShellRan {
  line: string;
  cwd: string;
  code: number;
  stdout: string;
  stderr: string;
  /** Every command name that ran, in order, e.g. ['ls', 'grep'] for `ls | grep x`. */
  commands: string[];
  learningModule?: string;
}

function valid(payload: unknown): payload is ShellRan {
  const value = payload as Partial<ShellRan> | null;
  return typeof value?.line === 'string' && typeof value.cwd === 'string' && Number.isInteger(value.code)
    && typeof value.stdout === 'string' && typeof value.stderr === 'string'
    && Array.isArray(value.commands) && value.commands.every((name) => typeof name === 'string');
}

export const shellActions: ActionDefinition[] = [{
  type: 'shell.ran',
  capability: 'shell:exec',
  description: 'Record a command line that a shell ran, with its output and exit code.',
  mutates: false,
  run: (_ctx, payload) => {
    if (!valid(payload)) throw new KernelError('EINVAL', 'shell.ran needs line, cwd, code, stdout, stderr, commands');
    return undefined;
  },
}];

import type { CommandDefinition } from './types';
import { fileCommands } from './files';
import { navigationCommands } from './navigation';
import { systemCommands } from './system';
import { textCommands } from './text';

export function builtinCommands(): CommandDefinition[] {
  return [
    ...navigationCommands(),
    ...fileCommands(),
    ...textCommands(),
    ...systemCommands(),
  ];
}

export type {
  ShellIO,
  CommandContext,
  CommandDefinition,
  Completion,
  RunResult,
  Shell,
  ShellInternals,
  ShellOptions,
} from './types';

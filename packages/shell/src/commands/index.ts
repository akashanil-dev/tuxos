import type { CommandDefinition } from './types';
import { fileCommands } from './files';
import { navigationCommands } from './navigation';
import { systemCommands } from './system';
import { exploreCommands } from './explore';
import { teachingCommands } from './teaching';
import { textCommands } from './text';

export function builtinCommands(): CommandDefinition[] {
  return [
    ...navigationCommands(),
    ...fileCommands(),
    ...textCommands(),
    ...systemCommands(),
    ...teachingCommands(),
    ...exploreCommands(),
  ];
}

export type {
  ShellIO,
  EditorRequest,
  CommandContext,
  CommandDefinition,
  Completion,
  RunResult,
  Shell,
  ShellInternals,
  ShellOptions,
} from './types';

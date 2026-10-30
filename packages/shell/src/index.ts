import type { Kernel } from '@tuxos/kernel';
import { ShellImpl } from './executor';
import type { Shell, ShellOptions } from './commands';
export type { CommandContext, CommandDefinition, Completion, RunResult, Shell, ShellOptions, ShellIO } from './commands';
export { createCommandRegistry, type CommandRegistry } from './registry';

export function createShell(kernel: Kernel, options: ShellOptions = {}): Shell {
  return new ShellImpl(kernel, options);
}

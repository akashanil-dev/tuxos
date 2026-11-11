import type { KernelEvent } from '@tuxos/sdk';
import type { Condition, RanCondition } from './types';

/** A file or folder as a check sees it, or undefined if it doesn't exist (or can't be reached). */
export interface Entry {
  kind: 'file' | 'dir';
  mode: number;
  content?: string;
}

export interface CheckContext {
  /** Events since the current step started, oldest first. */
  events: readonly KernelEvent[];
  home: string;
  read(path: string): Entry | undefined;
  fact?(name: string): boolean;
}

interface ShellRan {
  line: string;
  cwd: string;
  code: number;
  stdout: string;
  stderr: string;
  commands: string[];
  successfulCommands?: string[];
}

export function satisfied(condition: Condition, ctx: CheckContext): boolean {
  if ('all' in condition) return condition.all.every((part) => satisfied(part, ctx));
  if ('any' in condition) return condition.any.some((part) => satisfied(part, ctx));
  if ('not' in condition) return !satisfied(condition.not, ctx);
  if ('ran' in condition) return shellRuns(ctx).some((run) => matchesRun(condition.ran, run));
  if ('fact' in condition) return ctx.fact?.(condition.fact) ?? false;
  if ('opened' in condition) return opened(ctx).includes(condition.opened);
  if ('cwd' in condition) return shellRuns(ctx).at(-1)?.cwd === expand(condition.cwd, ctx.home);
  if ('exists' in condition) {
    const entry = ctx.read(expand(condition.exists, ctx.home));
    return !!entry && (!condition.kind || entry.kind === condition.kind);
  }
  if ('missing' in condition) return !ctx.read(expand(condition.missing, ctx.home));
  if ('contains' in condition) {
    const content = ctx.read(expand(condition.contains.path, ctx.home))?.content;
    return content !== undefined && new RegExp(condition.contains.pattern, 'm').test(content);
  }
  const entry = ctx.read(expand(condition.mode.path, ctx.home));
  return !!entry && entry.mode === Number.parseInt(condition.mode.is, 8);
}

function matchesRun(want: RanCondition, run: ShellRan): boolean {
  return (want.command === undefined || run.commands.includes(want.command))
    && (!want.succeeded || (want.command !== undefined && (run.successfulCommands ?? []).includes(want.command)))
    && (want.line === undefined || new RegExp(want.line).test(run.line))
    && (want.code === undefined || run.code === want.code)
    && (want.stdout === undefined || new RegExp(want.stdout, 'm').test(run.stdout))
    && (want.stderr === undefined || new RegExp(want.stderr, 'm').test(run.stderr));
}

// Only the learner's own actions count: when the tutor demonstrates a command, the step is still theirs to do.
function byLearner(event: KernelEvent): boolean {
  return event.ok && event.actor.kind === 'user';
}

function shellRuns(ctx: CheckContext): ShellRan[] {
  return ctx.events.filter((event) => byLearner(event) && event.action.type === 'shell.ran')
    .map((event) => event.action.payload as ShellRan);
}

function opened(ctx: CheckContext): string[] {
  return ctx.events.filter((event) => byLearner(event) && event.action.type === 'session.open')
    .map((event) => (event.action.payload as { appId: string }).appId);
}

export function expand(path: string, home: string): string {
  return path === '~' || path.startsWith('~/') ? home + path.slice(1) : path;
}

// The kernel: owns the system state and is the only way to change it.
// Every request goes through dispatch, which checks the actor's capabilities, runs the action,
// and records the outcome in the event log that the UI, lessons and the tutor subscribe to.

import type {
  Action, ActionDefinition as SdkActionDefinition, ActionError, Actor, Capability, DispatchResult, KernelEvent,
} from '@tuxos/sdk';
import { KernelError } from './errors';
import { expandFilesystem } from './filesystem-layout';
import { createInitialState, emptySession, type KernelState } from './state';
import * as vfs from './vfs';

export interface ActionFs {
  read(path: string): string;
  write(path: string, content: string, options?: { append?: boolean }): void;
  list(path: string): vfs.Stat[];
  stat(path: string): vfs.Stat;
  mkdir(path: string, options?: { parents?: boolean }): void;
  remove(path: string, options?: { recursive?: boolean }): void;
}

export interface ActionContext {
  state: KernelState;
  actor: Actor;
  /** The Linux user the action runs as. */
  user: string;
  now: number;
  fs: ActionFs;
}

export type ActionDefinition<P = unknown, R = unknown> = SdkActionDefinition<P, R, ActionContext>;

export interface KernelSnapshot {
  version: typeof SNAPSHOT_VERSION;
  state: KernelState;
}

export interface KernelOptions {
  /** Enable the account learning journey for this product session. */
  journey?: boolean;
  /** A fresh system for this learner. Ignored when restoring from a snapshot. */
  username?: string;
  snapshot?: KernelSnapshot;
  /** How many events to keep in memory. Older ones are dropped. */
  logLimit?: number;
  now?: () => number;
}

export interface DispatchOptions {
  actor?: Actor;
  /** Run as this Linux user instead of the session's user, e.g. for sudo. */
  user?: string;
}

const SNAPSHOT_VERSION = 1;
const SYSTEM: Actor = { kind: 'system', id: 'kernel' };
const SWITCH_USER = 'user:switch';

export class Kernel {
  private state: KernelState;
  private readonly sessionUser: string;
  private readonly definitions = new Map<string, ActionDefinition>();
  private readonly grants = new Map<string, Capability[]>();
  private readonly listeners = new Set<(event: KernelEvent) => void>();
  private readonly log: KernelEvent[] = [];
  private readonly logLimit: number;
  private readonly now: () => number;
  private seq = 0;

  constructor(options: KernelOptions) {
    this.now = options.now ?? Date.now;
    if (options.snapshot) {
      if (options.snapshot.version !== SNAPSHOT_VERSION) {
        throw new KernelError('EINVAL', `unsupported snapshot version: ${options.snapshot.version}`);
      }
      this.state = restoreState(options.snapshot.state);
    } else if (options.username) {
      this.state = createInitialState(options.username, 'tuxos', this.now());
    } else {
      throw new KernelError('EINVAL', 'a kernel needs a username or a snapshot');
    }
    const user = Object.keys(this.state.users).find((name) => name !== 'root');
    if (!user) throw new KernelError('EINVAL', 'the system has no regular user');
    if ((this.state.filesystemVersion ?? 0) < 1) expandFilesystem(this.state, user, this.now());
    if (options.journey && !this.state.session.journey) this.state.session.journey = { lessons: [], steps: [], acknowledged: [] };
    this.sessionUser = user;
    this.logLimit = options.logLimit ?? 1000;
    // The learner and the system itself can do anything the system allows; others need grants.
    this.grant({ kind: 'user', id: user }, ['*']);
    this.grant(SYSTEM, ['*']);
  }

  get user(): string {
    return this.sessionUser;
  }

  register(definition: ActionDefinition<any, any>): void {
    if (this.definitions.has(definition.type)) {
      throw new KernelError('EEXIST', `action already registered: ${definition.type}`);
    }
    this.definitions.set(definition.type, definition);
  }

  unregister(type: string): void {
    if (!this.definitions.delete(type)) throw new KernelError('ENOENT', `unknown action: ${type}`);
  }

  /** All registered actions, e.g. to describe them to the tutor as tools. */
  actions(): ActionDefinition[] {
    return [...this.definitions.values()];
  }

  grant(actor: Actor, capabilities: Capability[]): void {
    this.grants.set(actorKey(actor), [...capabilities]);
  }

  revoke(actor: Actor): void {
    this.grants.delete(actorKey(actor));
  }

  can(actor: Actor, capability: Capability): boolean {
    const granted = this.grants.get(actorKey(actor)) ?? [];
    const [area] = capability.split(':');
    return granted.some((cap) => cap === '*' || cap === capability || cap === `${area}:*`);
  }

  dispatch<R = unknown>(action: Action, options: DispatchOptions = {}): DispatchResult<R> {
    const now = this.now();
    const actor = options.actor ?? { kind: 'user', id: this.sessionUser };
    const user = options.user ?? this.sessionUser;
    const definition = this.definitions.get(action.type);

    let result: DispatchResult<R>;
    if (!definition) {
      result = failure('ENOSYS', `unknown action: ${action.type}`);
    } else if (!this.can(actor, definition.capability)) {
      result = failure('EPERM', `${actor.kind}:${actor.id} lacks capability ${definition.capability}`);
    } else if (!this.state.users[user]) {
      result = failure('EINVAL', `no such user: ${user}`);
    } else if (user !== this.sessionUser && !this.can(actor, SWITCH_USER)) {
      // Acting as root (sudo) is its own permission, so a module or the tutor can't escalate on its own.
      result = failure('EPERM', `${actor.kind}:${actor.id} lacks capability ${SWITCH_USER}`);
    } else {
      result = this.run<R>(definition, {
        state: this.state, actor, user, now, fs: createActionFs(this.state, user, now),
      }, action.payload);
    }

    this.record({
      seq: ++this.seq,
      time: now,
      actor,
      user,
      action,
      ok: result.ok,
      ...(result.ok ? {} : { error: result.error }),
      mutates: result.ok && (definition?.mutates ?? false),
    });
    return result;
  }

  subscribe(listener: (event: KernelEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  events(): readonly KernelEvent[] {
    return this.log;
  }

  getState(): Readonly<KernelState> {
    return this.state;
  }

  snapshot(): KernelSnapshot {
    return { version: SNAPSHOT_VERSION, state: structuredClone(this.state) };
  }

  private run<R>(definition: ActionDefinition, ctx: ActionContext, payload: unknown): DispatchResult<R> {
    // Actions mutate state in place, so work on a copy and only keep it if the action succeeds.
    // That way a failed action can never leave the system half-changed.
    const draft = definition.mutates ? structuredClone(ctx.state) : ctx.state;
    try {
      const value = definition.run({
        ...ctx, state: draft, fs: createActionFs(draft, ctx.user, ctx.now),
      }, payload) as R;
      // A read-only action may dispatch other actions while it runs (a lesson starting creates files).
      // Those replace this.state themselves, so only a mutating action installs its own draft.
      if (definition.mutates) this.state = draft;
      return { ok: true, value };
    } catch (err) {
      if (err instanceof KernelError) return failure(err.code, err.message);
      throw err;
    }
  }

  private record(event: KernelEvent): void {
    this.log.push(event);
    if (this.log.length > this.logLimit) this.log.splice(0, this.log.length - this.logLimit);
    for (const listener of this.listeners) listener(event);
  }
}

function createActionFs(state: KernelState, user: string, now: number): ActionFs {
  const path = (value: string): string => {
    if (!value.startsWith('/')) throw new KernelError('EINVAL', `path must be absolute: ${value}`);
    return vfs.resolvePath(value);
  };
  return {
    read: (value) => vfs.readFile(state.fs, path(value), user),
    write: (value, content, options = {}) =>
      vfs.writeFile(state.fs, path(value), user, content, options.append ?? false, now),
    list: (value) => vfs.listDir(state.fs, path(value), user),
    stat: (value) => vfs.stat(state.fs, path(value), user),
    mkdir: (value, options = {}) =>
      vfs.makeDir(state.fs, path(value), user, options.parents ?? false, now),
    remove: (value, options = {}) =>
      vfs.remove(state.fs, path(value), user, options.recursive ?? false, now),
  };
}

function restoreState(state: KernelState): KernelState {
  const restored = structuredClone(state);
  // Older saves may lack the session, or its desktop settings: fill in the defaults.
  restored.session = { ...emptySession(), ...restored.session };
  const fill = (node: import('./vfs').VNode): void => {
    node.mtime ??= 0;
    if (node.kind === 'dir') for (const child of Object.values(node.children)) fill(child);
  };
  fill(restored.fs);
  return restored;
}

function actorKey(actor: Actor): string {
  return `${actor.kind}:${actor.id}`;
}

function failure(code: string, message: string): { ok: false; error: ActionError } {
  return { ok: false, error: { code, message } };
}

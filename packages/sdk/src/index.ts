// Shared contracts between the kernel, modules, the UI and the tutor.
// Everything that changes the system is an Action sent through the kernel's dispatch,
// whether it comes from the learner, a module or the AI tutor.

/** Who sent an action. The tutor is an actor like any other, limited by its capabilities. */
export interface Actor {
  kind: 'user' | 'tutor' | 'module' | 'system';
  id: string;
}

/**
 * A permission to use a group of actions, written "<area>:<verb>", e.g. "fs:read".
 * A grant of "fs:*" covers every fs capability and "*" covers everything.
 */
export type Capability = string;

export interface Action<P = unknown> {
  type: string;
  payload: P;
}

export interface ActionError {
  /** errno-style code, e.g. ENOENT, EACCES, EPERM, ENOSYS. */
  code: string;
  message: string;
}

export type DispatchResult<R = unknown> =
  | { ok: true; value: R }
  | { ok: false; error: ActionError };

/** One entry in the kernel's event log: every dispatch, successful or not. */
export interface KernelEvent {
  seq: number;
  time: number;
  actor: Actor;
  /** The Linux user the action ran as. */
  user: string;
  action: Action;
  ok: boolean;
  error?: ActionError;
  /** True when the action changed state, so replaying the log rebuilds the system. */
  mutates: boolean;
}

/** A desktop icon and the window it opens. */
export interface AppContribution {
  id: string;
  title: string;
  icon: string;
  description?: string;
  /** Where launchers file it, like a .desktop file's Categories: e.g. "System", "Education", "Games". */
  category?: string;
  defaultGeometry?: { width: number; height: number };
}

/** A program a module installs into the shell, e.g. "docker". */
export interface CommandContribution {
  name: string;
  summary: string;
}

/** A runtime-neutral action definition accepted by a module. */
export interface ActionDefinition<P = unknown, R = unknown, C = any> {
  type: string;
  capability: Capability;
  description: string;
  mutates: boolean;
  /** JSON Schema of the payload, so tools generated for the AI tutor say what to send. */
  params?: Record<string, unknown>;
  run(ctx: C, payload: P): R;
}

/** A runtime-neutral command definition accepted by a module. */
export interface CommandDefinition<C = any> {
  name: string;
  summary: string;
  usage: string;
  run(ctx: C): Promise<number> | number;
  /** False while the command isn't installed (e.g. its package is missing): help and completion leave it out. */
  available?(): boolean;
}

export type ActivationEvent = 'onStartup' | `onCommand:${string}` | `onApp:${string}`;

/** What a module declares about itself. The module host reads this before loading any code. */
export interface ModuleManifest {
  id: string;
  version: string;
  title: string;
  /** Capabilities the module needs. The kernel refuses actions outside this list. */
  capabilities: Capability[];
  requires?: string[];
  activation: ActivationEvent[];
  contributes: {
    apps?: AppContribution[];
    commands?: CommandContribution[];
  };
}

export interface ModuleContext {
  id: string;
  actor: Actor;
  /** The learner's Linux username; their home is /home/<user>. */
  user: string;
  dispatch<R>(type: string, payload: unknown, options?: { user?: string }): DispatchResult<R>;
  registerAction(definition: ActionDefinition<any, any, any>): void;
  registerCommand(definition: CommandDefinition<any>): void;
  /** Watch everything that happens in the system (read-only). Returns a function that stops watching. */
  onEvent(listener: (event: KernelEvent) => void): () => void;
  log(message: string): void;
  /** Optional server-side AI learning service. The module never receives an API key. */
  learning?: LearningBackend;
}

export interface LearningBackend {
  request(path: string, body: unknown): Promise<unknown>;
  /** False when no AI key is set up, so courses use their built-in lessons; unknown (undefined) counts as available. */
  available?(): boolean;
}

export interface ModuleDefinition {
  manifest: ModuleManifest;
  activate(ctx: ModuleContext): void | (() => void | Promise<void>)
    | Promise<void | (() => void | Promise<void>)>;
}

export function defineModule(definition: ModuleDefinition): ModuleDefinition {
  return definition;
}

/** Declarative desktop colours. Applying them is an explicit host UI action. */
export interface PluginTheme { id: string; name: string; accent: string; background: string; surface: string; foreground: string; }

/** A user-installable application package/plugin. */
export interface PluginManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly author?: string;
  readonly capabilities: readonly Capability[];
  readonly entry?: string;
  readonly icon?: string;
  readonly contributes: {
    readonly themes?: readonly PluginTheme[];
    readonly apps?: readonly (AppContribution & {
      readonly widget?: boolean;
      readonly defaultGeometry?: {
        readonly width: number;
        readonly height: number;
      };
    })[];
    readonly commands?: readonly {
      readonly name: string;
      readonly summary: string;
      readonly usage?: string;
    }[];
  };
}

export interface PluginRPCRequest {
  readonly jsonrpc: '2.0';
  readonly id: string;
  readonly method: 'kernel.dispatch' | 'kernel.subscribe' | 'fs.stat' | 'env.get' | string;
  readonly params: Record<string, unknown>;
}

export interface PluginRPCResponse {
  readonly jsonrpc: '2.0';
  readonly id: string;
  readonly ok: boolean;
  readonly result?: unknown;
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
}

export interface PluginRPCEvent {
  readonly jsonrpc: '2.0';
  readonly event: 'kernel.event' | string;
  readonly data: unknown;
}

export * from './plugins';

export { JOURNEY_LESSONS, REWARDS, JOURNEY_THEMES, journeyLevel, unlocked, desktopReward, desktopReady, desktopsFromStatus, DESKTOP_PACKAGES } from './journey';
export type { JourneyProgress, RewardId } from './journey';

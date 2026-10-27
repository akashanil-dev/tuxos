import { createKernel, type Kernel, type SessionState, type KernelSnapshot } from '@tuxos/kernel';
import { learningRuntime, type TrainerFeedback } from '@tuxos/lessons';
import { createModuleHost, type ModuleHost } from '@tuxos/module-host';
import { discoverPlugins, type PluginLoaderHooks } from './plugin-loader';
import { ManagedPlugins } from './plugins';
import type {
  Actor, AppContribution, DispatchResult, KernelEvent, ModuleDefinition, ModuleManifest, LearningBackend, PluginManager,
} from '@tuxos/sdk';
import {
  createCommandRegistry,
  createShell,
  type CommandRegistry,
  type Completion,
  type RunResult,
  type Shell,
  type ShellIO,
} from '@tuxos/shell';

export interface KeyValueStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface ModuleEntry {
  manifest: ModuleManifest;
  load: () => Promise<ModuleDefinition>;
}

/** One terminal window's shell: its own cwd, env and history, sharing the system's commands. */
/** A command's result; in a course's terminal it may carry the trainer's verdict, shown under the output. */
export type TerminalResult = RunResult & { feedback?: TrainerFeedback };

export interface TerminalSession {
  run(line: string, io?: ShellIO): Promise<TerminalResult>;
  cwd(): Promise<string>;
  prompt(): Promise<string>;
  complete(line: string, cursor: number): Promise<Completion>;
  history(): Promise<string[]>;
}

export interface TerminalOptions {
  /** Route learning slash commands and assessments to the course that owns this terminal. */
  learningModule?: string;
}

/**
 * Whether AI features run. They need the server to offer AI at all, the learner's switch (Settings → AI), and
 * the learner's own provider, model and key: the server has none. When they don't run, every module uses its
 * own built-in, offline behaviour.
 */
export interface AiStatus {
  /** The server offers AI features. While it doesn't, they stay off whatever the learner sets. */
  available: boolean;
  /** AI requests may be made: AI is available, the switch is on, and there are settings to use. */
  enabled: boolean;
  /** The learner's AI switch, off until they turn it on. Off means no AI request is made, even with a key. */
  on: boolean;
  /** Where the settings are: saved in the account, or kept in this browser (guests). */
  source: 'account' | 'browser' | null;
  /** The provider's id (e.g. groq), the chosen model, and the start and end of the key, to recognise it. */
  provider?: string;
  model?: string;
  hint?: string;
  /** A custom provider's address. */
  baseUrl?: string;
  /** Guests can't save settings in an account; they stay in their browser. */
  signedIn: boolean;
  /** Signed in, but this session can't unlock the saved settings (locked with the password): sign in again. */
  locked?: boolean;
}

/** An AI provider a learner can choose in Settings. */
export interface AiProviderInfo {
  id: string;
  name: string;
  /** Where to create a key. */
  keysUrl: string;
  /** Offers some models for free. */
  free: boolean;
}

/** A model a provider offers; free ones are listed first. */
export interface AiModelInfo {
  id: string;
  free: boolean;
}

/** What the learner saves: the provider, its model, the key (omit it to keep the saved one) and a custom address. */
export interface AiSettingsInput {
  provider: string;
  model: string;
  key?: string;
  baseUrl?: string;
}

/** The learner's own AI provider and key. Saving checks them first and rejects with the reason if they fail. */
export interface AiKeyStore {
  status(): AiStatus;
  onChange(listener: (status: AiStatus) => void): () => void;
  /** The providers to choose from, and whether a custom address may be used. */
  providers(): { providers: AiProviderInfo[]; custom: boolean };
  /** A provider's models, checked with the given key (or, signed in, the saved one when no key is given). */
  models(input: { provider: string; key?: string; baseUrl?: string }): Promise<AiModelInfo[]>;
  save(settings: AiSettingsInput): Promise<AiStatus>;
  remove(): Promise<AiStatus>;
  /** Turns AI features on or off, for this account or, for guests, this browser. */
  setOn(on: boolean): Promise<AiStatus>;
  /** Headers that carry a guest's settings with an AI request (empty for accounts, or while AI is off). */
  headers(): Record<string, string>;
}

export interface SystemClient {
  boot(username: string): Promise<void>;
  hasSave(): Promise<string | null>;
  dispatch<R>(type: string, payload: unknown, options?: { actor?: Actor; user?: string }): Promise<DispatchResult<R>>;
  subscribe(listener: (event: KernelEvent) => void): () => void;
  /** Successful state changes only (file writes, window moves...), from any source. */
  onChange(listener: (event: KernelEvent) => void): () => void;
  /** Called when saving to storage fails. The system keeps running; the learner should be told. */
  onSaveError(listener: (error: Error) => void): () => void;
  /** Save now instead of waiting for the debounce. Rejects if storage fails. */
  flush(): Promise<void>;
  user(): Promise<string>;
  hostname(): Promise<string>;
  session(): Promise<SessionState>;
  apps(): Promise<(AppContribution & { moduleId: string })[]>;
  onAppsChange?(listener: () => void): () => void;
  plugins?(): PluginManager;
  openApp(appId: string, args?: Record<string, string>): Promise<DispatchResult<string>>;
  createTerminal(options?: TerminalOptions): Promise<TerminalSession>;
  /** The AI tutor's own, permission-limited access to the system. */
  tutor(): TutorAccess;
  /** The shell's installed commands with their help text (Vasu's offline guide reads it). */
  commands?(): { name: string; summary: string; usage?: string }[];
  /** The learner's AI key, when this system has a key store (the browser app does; tests may not). */
  ai(): AiKeyStore | null;
  /** Replace the simulated system with a fresh account save and keep the user signed in. */
  restartLearning(): Promise<void>;
  onRestart(listener: () => void): () => void;
  reset(): Promise<void>;
  uninstallPlugin?(id: string): Promise<void>;
  reloadPlugins?(): Promise<void>;
}

export interface ActionInfo {
  type: string;
  description: string;
  capability: string;
  mutates: boolean;
  params?: Record<string, unknown>;
}

/**
 * Everything the tutor does goes through the kernel as the `tutor` actor, so the kernel's capability
 * checks decide what it may do. It never acts as root unless granted `user:switch`.
 */
export interface TutorAccess {
  readonly actor: Actor;
  setCapabilities(capabilities: string[]): void;
  can(capability: string): boolean;
  dispatch<R>(type: string, payload: unknown): Promise<DispatchResult<R>>;
  /** Open an app window as the tutor (activating its module first, like the desktop does). */
  openApp(appId: string, args?: Record<string, string>): Promise<DispatchResult<string>>;
  /** A shell of the tutor's own: commands run as the learner's Linux user, but checked as the tutor. */
  createTerminal(): Promise<TerminalSession>;
  actions(): ActionInfo[];
  /** The most recent events, oldest first, for building the tutor's picture of what the learner did. */
  recentEvents(limit: number): KernelEvent[];
}

const SAVE_KEY = 'tuxos.save';
const TUTOR: Actor = { kind: 'tutor', id: 'tutor' };
const SAVE_DELAY_MS = 500;

interface Running {
  kernel: Kernel;
  registry: CommandRegistry;
  host: ModuleHost;
  plugins: ManagedPlugins;
  unsubscribe: () => void;
}

export function createLocalSystem(options: {
  storage: KeyValueStorage;
  journey?: boolean;
  modules: ModuleEntry[];
  learning?: LearningBackend;
  ai?: AiKeyStore;
  plugins?: PluginLoaderHooks;
}): SystemClient {
  let running: Running | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const changeListeners = new Set<(event: KernelEvent) => void>();
  const saveErrorListeners = new Set<(error: Error) => void>();
  const appListeners = new Set<() => void>();
  const restartListeners = new Set<() => void>();
  const pendingSaves = new Set<Promise<void>>();
  let restarting = false;

  const current = (): Running => {
    if (!running) throw new Error('system has not booted');
    return running;
  };

  const writeSave = async (): Promise<void> => {
    if (restarting) return;
    const { kernel } = current();
    const write = options.storage.set(SAVE_KEY, JSON.stringify({ username: kernel.user, snapshot: kernel.snapshot() }));
    pendingSaves.add(write);
    try { await write; } finally { pendingSaves.delete(write); }
  };

  // Saving never blocks the learner: changes are batched and written after a short pause.
  const scheduleSave = (): void => {
    if (restarting) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      writeSave().catch((cause: unknown) => {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        for (const listener of saveErrorListeners) listener(error);
      });
    }, SAVE_DELAY_MS);
  };

  const boot = async (username: string): Promise<void> => {
    const snapshot = await savedSnapshot(options.storage, username);
    if (timer) clearTimeout(timer);
    timer = undefined;
    running?.unsubscribe();
    if (running) {
      await running.plugins.dispose();
      await running.host.dispose();
    }
    const kernel = createKernel({ ...(snapshot ? { snapshot } : { username }), journey: options.journey });
    const registry = createCommandRegistry();
    const host = createModuleHost({
      kernel,
      shell: createShell(kernel, { registry }),
      learning: options.learning ?? browserLearningBackend(options.ai),
    });
    for (const entry of options.modules) host.add(entry.manifest, entry.load);
    const unsubscribe = kernel.subscribe((event) => {
      if (restarting || !event.ok || !event.mutates) return;
      scheduleSave();
      for (const listener of changeListeners) listener(event);
    });
    const plugins = new ManagedPlugins(kernel, host, options.plugins ?? {}, () => client.flush());
    plugins.onChange(() => { for (const listener of appListeners) listener(); });
    running = { kernel, registry, host, plugins, unsubscribe };
    await discoverPlugins(client, host, options.plugins);
    await host.start();
    if (options.journey) kernel.dispatch({ type: 'journey.reconcile', payload: {} });
  };

  const client: SystemClient = {
    boot,
    async hasSave() {
      const saved = await options.storage.get(SAVE_KEY);
      if (!saved) return null;
      return (JSON.parse(saved) as { username?: string }).username ?? null;
    },
    async dispatch<R>(type: string, payload: unknown, options?: { actor?: Actor; user?: string }) {
      return current().kernel.dispatch<R>({ type, payload }, options);
    },
    subscribe(listener) {
      return current().kernel.subscribe(listener);
    },
    onChange(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    onSaveError(listener) {
      saveErrorListeners.add(listener);
      return () => saveErrorListeners.delete(listener);
    },
    async flush() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      await writeSave();
    },
    async user() {
      return current().kernel.user;
    },
    async hostname() {
      return current().kernel.getState().hostname;
    },
    async session() {
      return structuredClone(current().kernel.getState().session);
    },
    async apps() {
      return current().host.apps();
    },
    onAppsChange(listener) {
      appListeners.add(listener);
      return () => appListeners.delete(listener);
    },
    plugins: () => current().plugins,
    async openApp(appId, args) {
      const { host, kernel } = current();
      try {
        await host.openApp(appId);
      } catch (error) {
        return { ok: false, error: { code: 'EIO', message: error instanceof Error ? error.message : String(error) } };
      }
      const app = host.apps().find((candidate) => candidate.id === appId);
      if (current().host !== host || !app) return { ok: false, error: { code: 'ENOENT', message: 'This app is no longer available in the current session.' } };
      const geometry = app.defaultGeometry;
      return kernel.dispatch<string>({ type: 'session.open', payload: {
        appId, title: app?.title ?? appId, width: geometry?.width ?? 720, height: geometry?.height ?? 480, ...(args ? { args } : {}),
      } });
    },
    async createTerminal(options = {}) {
      const { kernel, registry } = current();
      const shell = createShell(kernel, { registry, plugins: current().plugins });
      if (options.learningModule === 'learn-linux') {
        const saved = kernel.getState().session.journey?.terminal;
        const active = learningRuntime.get('learn-linux')?.status().active?.lesson.id;
        if (saved && saved.lesson === active) {
          const directory = kernel.dispatch<{ kind: string }>({ type: 'fs.stat', payload: { path: saved.cwd } });
          if (directory.ok && directory.value.kind === 'dir') { shell.cwd = saved.cwd; shell.env = { ...shell.env, ...saved.env, PWD: saved.cwd }; }
        }
      }
      if (options.learningModule) shell.env.TUXOS_LEARNING_MODULE = options.learningModule;
      return terminalSession(kernel, shell, options.learningModule);
    },
    commands() {
      return current().registry.list().filter((command) => command.available?.() !== false)
        .map(({ name, summary, usage }) => ({ name, summary, usage }));
    },
    tutor() {
      const { kernel, registry } = current();
      return {
        actor: TUTOR,
        setCapabilities: (capabilities) => kernel.grant(TUTOR, capabilities),
        can: (capability) => kernel.can(TUTOR, capability),
        dispatch: async <R>(type: string, payload: unknown) => kernel.dispatch<R>({ type, payload }, { actor: TUTOR }),
        createTerminal: async () => terminalSession(kernel, createShell(kernel, { registry, actor: TUTOR })),
        actions: () => kernel.actions().map(({ type, description, capability, mutates, params }) => ({
          type, description, capability, mutates, ...(params ? { params } : {}),
        })),
        async openApp(appId, args) {
          try {
            await current().host.openApp(appId);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { ok: false, error: { code: 'EIO', message } };
          }
          const app = current().host.apps().find((candidate) => candidate.id === appId);
          return kernel.dispatch<string>({ type: 'session.open', payload: {
            appId, title: app?.title ?? appId, width: 720, height: 480, ...(args ? { args } : {}),
          } }, { actor: TUTOR });
        },
        recentEvents: (limit) => kernel.events().slice(-limit),
      };
    },
    ai: () => options.ai ?? null,
    onRestart(listener) {
      restartListeners.add(listener);
      return () => restartListeners.delete(listener);
    },
    async restartLearning() {
      if (restarting) throw new Error('A reset is already in progress.');
      const username = current().kernel.user;
      if (!current().kernel.getState().session.journey) throw new Error('Learning journey is not enabled.');
      restarting = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
      try {
        // Finish older writes before replacing the account save. If saving fails, keep the
        // current system running so Settings can show the error and offer another attempt.
        await Promise.allSettled([...pendingSaves]);
        const fresh = createKernel({ username, journey: true }).snapshot();
        await options.storage.set(SAVE_KEY, JSON.stringify({ username, snapshot: fresh }));
        await boot(username);
      } finally {
        restarting = false;
      }
      for (const listener of restartListeners) listener();
      scheduleSave();
    },
    async reset() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      running?.unsubscribe();
      if (running) {
        await running.plugins.dispose();
        await running.host.dispose();
      }
      running = undefined;
      changeListeners.clear();
      await options.storage.remove(SAVE_KEY);
    },
    async uninstallPlugin(id: string) {
      await current().plugins.uninstall(id);
    },
    async reloadPlugins() {
      await current().plugins.reload();
    },
  };
  return client;
}

const LEARNING_TIMEOUT_MS = 100_000;

/** The browser sends learning requests to the API, which makes the AI call with the learner's key. */
function browserLearningBackend(ai: AiKeyStore | undefined): LearningBackend {
  return {
    available: () => ai?.status().enabled ?? true,
    async request(path, body) {
      // A definite off: with AI switched off (or no key), nothing is sent, whatever a module asks.
      if (ai && !ai.status().enabled) throw new Error(ai.status().available ? 'AI is turned off. Turn it on in Settings → AI.' : 'AI features are being rebuilt and are off for now.');
      let response: Response;
      try {
        response = await fetch(`/api/learning${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...ai?.headers() },
          body: JSON.stringify(body),
          // The server gives the AI 90 seconds; never wait forever if the connection hangs.
          signal: AbortSignal.timeout(LEARNING_TIMEOUT_MS),
        });
      } catch (error) {
        const timedOut = error instanceof Error && error.name === 'TimeoutError';
        throw new Error(timedOut ? 'The learning service took too long to answer.' : 'The learning service is not reachable.');
      }
      const data = await response.json().catch(() => ({ error: `learning service returned HTTP ${response.status}` }));
      if (!response.ok) throw new Error((data as { error?: string }).error ?? `learning service returned HTTP ${response.status}`);
      return data;
    },
  };
}

async function savedSnapshot(storage: KeyValueStorage, username: string): Promise<KernelSnapshot | undefined> {
  const saved = await storage.get(SAVE_KEY);
  if (!saved) return undefined;
  const parsed = JSON.parse(saved) as { username?: string; snapshot?: KernelSnapshot };
  return parsed.username === username ? parsed.snapshot : undefined;
}

function terminalSession(kernel: Kernel, shell: Shell, learningModule?: string): TerminalSession {
  return {
    run: async (line, io) => {
      const previousLesson = learningModule === 'learn-linux' ? learningRuntime.get(learningModule)?.status().active?.lesson.id : undefined;
      const result = await shell.run(line, io);
      if (previousLesson && kernel.getState().session.journey) kernel.dispatch({ type: 'journey.terminal', payload: { lesson: previousLesson, cwd: shell.cwd, env: shell.env } });
      const runner = learningModule ? learningRuntime.get(learningModule) : learningRuntime.get();
      const assessment = await runner?.waitForAssessment();
      return assessment ? { ...result, feedback: assessment } : result;
    },
    cwd: async () => shell.cwd,
    prompt: async () => bashPrompt(kernel.user, kernel.getState().hostname, shell.cwd, shell.env.HOME ?? ''),
    complete: async (line, cursor) => shell.complete(line, cursor),
    history: async () => shell.history(),
  };
}

/** bash's default prompt, `\u@\h:\w\$ `: home shown as ~, and # instead of $ for root. */
export function bashPrompt(user: string, hostname: string, cwd: string, home: string): string {
  const inHome = home && (cwd === home || cwd.startsWith(`${home}/`));
  const dir = inHome ? `~${cwd.slice(home.length)}` : cwd;
  return `${user}@${hostname}:${dir}${user === 'root' ? '#' : '$'} `;
}

/** What the desktop passes to every app window's view. */
export interface AppViewProps {
  system: SystemClient;
  windowId: string;
  args?: Record<string, string>;
  /**
   * Ask before the learner closes this window from its title bar. The guard returns false to keep it open,
   * e.g. after the learner declines to discard unsaved changes. Pass null to remove it.
   */
  setCloseGuard?(guard: (() => boolean) | null): void;
}

export { PluginRPCGateway } from './plugin-rpc';
export { discoverPlugins, type PluginLoaderHooks } from './plugin-loader';

import type { Kernel, ActionDefinition as KernelActionDefinition } from '@tuxos/kernel';
import type {
  ActionDefinition,
  AppContribution,
  CommandDefinition,
  ModuleContext,
  ModuleDefinition,
  ModuleManifest,
  LearningBackend,
} from '@tuxos/sdk';
import type { CommandDefinition as ShellCommandDefinition, Shell } from '@tuxos/shell';

export type ModuleStatus = 'registered' | 'activating' | 'active' | 'failed';

export type HostEvent =
  | { type: 'activated'; id: string }
  | { type: 'failed'; id: string; error: Error };

export interface ModuleHost {
  add(manifest: ModuleManifest, load: () => Promise<ModuleDefinition>): void;
  validate(manifest: ModuleManifest, replacing?: string): void;
  dispose(): Promise<void>;
  start(): Promise<void>;
  activate(id: string): Promise<void>;
  apps(): (AppContribution & { moduleId: string })[];
  openApp(appId: string): Promise<void>;
  status(id: string): ModuleStatus;
  error(id: string): Error | undefined;
  uninstall(id: string): Promise<void>;
  on(listener: (event: HostEvent) => void): () => void;
}

interface Record {
  manifest: ModuleManifest;
  load: () => Promise<ModuleDefinition>;
  status: ModuleStatus;
  error?: Error;
  promise?: Promise<void>;
  commands: Map<string, CommandDefinition<any>>;
  actions: string[];
  /** Event subscriptions to cancel if activation fails. */
  subscriptions: (() => void)[];
  deactivate?: () => void | Promise<void>;
  retiring?: boolean;
}

export function createModuleHost(options: { kernel: Kernel; shell: Shell; learning?: LearningBackend }): ModuleHost {
  const records = new Map<string, Record>();
  const commandOwners = new Map<string, string>();
  const appOwners = new Map<string, string>();
  const listeners = new Set<(event: HostEvent) => void>();
  const builtins = new Set(options.shell.commands().map((command) => command.name));

  const host: ModuleHost = {
    validate(manifest, replacing) {
      validateManifest(manifest, new Map([...records].filter(([id]) => id !== replacing)),
        new Map([...commandOwners].filter(([, id]) => id !== replacing)),
        new Map([...appOwners].filter(([, id]) => id !== replacing)), builtins);
    },
    async dispose() {
      for (const id of [...records.keys()].reverse()) await host.uninstall(id);
      listeners.clear();
    },
    add(manifest, load) {
      validateManifest(manifest, records, commandOwners, appOwners, builtins);
      const record: Record = {
        manifest: structuredClone(manifest), load, status: 'registered',
        commands: new Map(), actions: [], subscriptions: [],
      };
      records.set(manifest.id, record);
      for (const command of manifest.contributes.commands ?? []) {
        commandOwners.set(command.name, manifest.id);
        options.shell.register(commandStub(host, records, command.name, manifest.id));
      }
      for (const app of manifest.contributes.apps ?? []) appOwners.set(app.id, manifest.id);
    },

    async start() {
      const startup = [...records.values()]
        .filter((record) => record.manifest.activation.includes('onStartup'))
        .map((record) => host.activate(record.manifest.id).catch(() => undefined));
      await Promise.all(startup);
    },

    activate(id) {
      if (!records.has(id)) return Promise.reject(new Error(`unknown module: ${id}`));
      return activateInternal(id, []);
    },

    apps() {
      const result: (AppContribution & { moduleId: string })[] = [];
      for (const record of records.values()) {
        for (const app of record.manifest.contributes.apps ?? []) {
          result.push({ ...app, moduleId: record.manifest.id });
        }
      }
      return result;
    },

    async openApp(appId) {
      const owner = appOwners.get(appId);
      if (!owner) throw new Error(`unknown app: ${appId}`);
      const record = getRecord(owner);
      await host.activate(owner);
      if (record.retiring || records.get(owner) !== record) throw new Error(`app is being removed: ${appId}`);
    },

    status(id) {
      return getRecord(id).status;
    },

    error(id) {
      return getRecord(id).error;
    },

    async uninstall(id) {
      const record = records.get(id);
      if (!record) return;
      record.retiring = true;
      // Finish in-flight activation before revoking what it registered.
      if (record.promise) await record.promise.catch(() => undefined);
      if (record.deactivate) {
        try {
          await record.deactivate();
        } catch (err) {
          console.error(`[module:${id}] deactivate error:`, err);
        }
      }
      cleanup(record);
      for (const [cmd, owner] of commandOwners.entries()) {
        if (owner === id) {
          options.shell.unregister(cmd);
          commandOwners.delete(cmd);
        }
      }
      for (const [app, owner] of appOwners.entries()) {
        if (owner === id) appOwners.delete(app);
      }
      records.delete(id);
    },

    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  async function activateInternal(id: string, chain: string[]): Promise<void> {
    const record = records.get(id);
    if (!record) throw dependencyError([...chain, id], `missing module '${id}'`);
    if (record.retiring) throw new Error(`module is being removed: ${id}`);
    if (record.status === 'active') return;
    if (record.status === 'failed') throw record.error;
    if (record.status === 'activating') {
      if (chain.includes(id)) throw dependencyError([...chain, id], 'dependency cycle');
      return record.promise;
    }

    record.status = 'activating';
    record.promise = finishActivation(record, [...chain, id]);
    return record.promise;
  }

  async function finishActivation(record: Record, chain: string[]): Promise<void> {
    try {
      for (const dependency of record.manifest.requires ?? []) {
        await activateInternal(dependency, chain);
      }
      const definition = await record.load();
      if (definition.manifest.id !== record.manifest.id) {
        throw new Error(
          `module '${record.manifest.id}' loaded definition for '${definition.manifest.id}'`,
        );
      }
      const actor = { kind: 'module' as const, id: record.manifest.id };
      options.kernel.grant(actor, [...record.manifest.capabilities]);
      const context = createContext(record, actor);
      const deactivate = await definition.activate(context);
      if (deactivate) record.deactivate = deactivate;
      record.status = 'active';
      emit({ type: 'activated', id: record.manifest.id });
    } catch (cause) {
      const error = asError(cause);
      cleanup(record);
      record.status = 'failed';
      record.error = error;
      emit({ type: 'failed', id: record.manifest.id, error });
      throw error;
    }
  }

  function createContext(record: Record, actor: { kind: 'module'; id: string }): ModuleContext {
    return {
      id: record.manifest.id,
      actor,
      user: options.kernel.user,
      dispatch<R>(type: string, payload: unknown, dispatchOptions: { user?: string } = {}) {
        return options.kernel.dispatch<R>({ type, payload }, { actor, ...dispatchOptions });
      },
      registerAction(definition) {
        validateAction(record.manifest, definition);
        options.kernel.register(definition as KernelActionDefinition);
        record.actions.push(definition.type);
      },
      registerCommand(definition) {
        const contribution = (record.manifest.contributes.commands ?? [])
          .find((command) => command.name === definition.name);
        if (!contribution) {
          throw new Error(`module '${record.manifest.id}' cannot register undeclared command '${definition.name}'`);
        }
        if (record.commands.has(definition.name)) {
          throw new Error(`module '${record.manifest.id}' registered command twice: ${definition.name}`);
        }
        record.commands.set(definition.name, definition);
      },
      onEvent(listener) {
        const unsubscribe = options.kernel.subscribe(listener);
        record.subscriptions.push(unsubscribe);
        return unsubscribe;
      },
      log(message) {
        console.log(`[module:${record.manifest.id}] ${message}`);
      },
      learning: options.learning,
    };
  }

  function emit(event: HostEvent): void {
    for (const listener of listeners) listener(event);
  }

  function getRecord(id: string): Record {
    const record = records.get(id);
    if (!record) throw new Error(`unknown module: ${id}`);
    return record;
  }

  function cleanup(record: Record): void {
    for (const type of record.actions) options.kernel.unregister(type);
    record.actions.length = 0;
    for (const unsubscribe of record.subscriptions) unsubscribe();
    record.subscriptions.length = 0;
    record.commands.clear();
    options.kernel.revoke({ kind: 'module', id: record.manifest.id });
  }

  return host;
}

function commandStub(
  host: ModuleHost, records: Map<string, Record>, name: string, moduleId: string,
): ShellCommandDefinition {
  return {
    get learningOnly() {
      const record = records.get(moduleId);
      return record?.commands.get(name)?.learningOnly ?? record?.manifest.contributes.commands?.find(command => command.name === name)?.learningOnly;
    },
    // Until the module is active, a command counts as there; then the module's own definition decides.
    // If the module was uninstalled, it is no longer available.
    available: () => {
      const record = records.get(moduleId);
      return record ? (record.commands.get(name)?.available?.() ?? true) : false;
    },
    name,
    summary: records.get(moduleId)?.manifest.contributes.commands
      ?.find((command) => command.name === name)?.summary ?? name,
    usage: name,
    async run(ctx: Parameters<ShellCommandDefinition['run']>[0]) {
      try {
        await host.activate(moduleId);
      } catch (cause) {
        ctx.stderr(`${name}: module '${moduleId}' failed to load: ${asError(cause).message}\n`);
        return 1;
      }
      const recordCommand = records.get(moduleId)?.commands.get(name);
      if (!recordCommand || records.get(moduleId)?.retiring) {
        ctx.stderr(`${name}: module '${moduleId}' did not provide this command\n`);
        return 1;
      }
      if (recordCommand.learningOnly && !ctx.shell.learningModule) {
        ctx.stderr(`${name}: command not found\n`);
        return 127;
      }
      return recordCommand.run(ctx);
    },
  };
}

function validateManifest(
  manifest: ModuleManifest,
  records: Map<string, Record>,
  commandOwners: Map<string, string>,
  appOwners: Map<string, string>,
  builtins: Set<string>,
): void {
  if (!/^[a-z][a-z0-9-]*$/.test(manifest.id)) throw new Error(`invalid module id: ${manifest.id}`);
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error(`invalid module version: ${manifest.version}`);
  if (records.has(manifest.id)) throw new Error(`duplicate module id: ${manifest.id}`);
  for (const capability of manifest.capabilities) {
    if (!/^(?:\*|[a-z]+:(?:[a-z]+|\*))$/.test(capability)) {
      throw new Error(`invalid capability: ${capability}`);
    }
  }
  const commands = manifest.contributes.commands ?? [];
  const apps = manifest.contributes.apps ?? [];
  assertUnique(commands.map((command) => command.name), 'command');
  assertUnique(apps.map((app) => app.id), 'app');
  for (const command of commands) {
    if (builtins.has(command.name)) throw new Error(`command clashes with shell built-in: ${command.name}`);
    if (commandOwners.has(command.name)) throw new Error(`command already claimed: ${command.name}`);
  }
  for (const app of apps) {
    if (appOwners.has(app.id)) throw new Error(`app already claimed: ${app.id}`);
  }
}

function assertUnique(values: string[], kind: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${kind}: ${value}`);
    seen.add(value);
  }
}

function validateAction(manifest: ModuleManifest, definition: ActionDefinition<any, any, any>): void {
  if (!definition.type.startsWith(`${manifest.id}.`)) {
    throw new Error(`module '${manifest.id}' action must start with '${manifest.id}.'`);
  }
  if (!manifest.capabilities.includes(definition.capability)) {
    throw new Error(`module '${manifest.id}' did not declare capability '${definition.capability}'`);
  }
}

function dependencyError(chain: string[], reason: string): Error {
  return new Error(`module dependency error (${chain.join(' -> ')}): ${reason}`);
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

// The tutor's tools. Vasu is a teacher with full control of the computer: he can look, click, type, run
// commands and change files. Everything still goes through the kernel as the `tutor` actor, so lessons
// only count the learner's own work, and he acts as root only after the learner grants him sudo.

import type { KernelEvent } from '@tuxos/sdk';
import type { ActionInfo, TerminalSession, TutorAccess } from '@tuxos/system';
import type { ToolSpec } from './protocol';

/** What Vasu may always do. Root (`user:switch`) is added only while the learner has granted sudo. */
export const CAPABILITIES = ['fs:read', 'fs:write', 'session:control', 'shell:exec', 'lessons:read', 'lessons:write'];
const SUDO = 'user:switch';

/** Something on screen Vasu can click or type into, named the way a screen reader would name it. */
export interface ScreenElement {
  id: string;
  role: string;
  name: string;
  /** The title of the window it is in, if any. */
  window?: string;
}

/** What only the screen can do. The desktop supplies it; tests supply a fake. */
export interface PuppetUi {
  pointAt(target: string, note?: string): void;
  /** The things on screen right now that can be clicked or typed into, each with a fresh id. */
  describeScreen(): ScreenElement[];
  /** Move Vasu's pointer to an element and click it. Throws if the element is gone. */
  click(elementId: string, double: boolean): Promise<void>;
  /** Type into a text field letter by letter, then optionally press Enter. */
  typeText(elementId: string, text: string, submit: boolean): Promise<void>;
  /** Press a key or shortcut, e.g. "Alt+Q", "Ctrl+Alt+T", "Escape". */
  pressKeys(keys: string): Promise<void>;
  /** Type into a terminal window, letter by letter, as if at its keyboard. */
  typeInTerminal(windowId: string, text: string): Promise<void>;
  /** Ask the learner for sudo, with their password. Resolves true only if they allow it. */
  requestSudo(reason: string): Promise<boolean>;
}

export interface Tool {
  spec: ToolSpec;
  run(args: Record<string, unknown>): Promise<unknown>;
}

const OUTPUT_LIMIT = 1500;
const CORE_ACTIONS = /^(fs|session|shell)\./;
/** How long to wait for a typed command to finish before reporting back without its output. */
const COMMAND_WAIT_MS = 15_000;

interface SessionInfo {
  windows: { id: string; appId: string; title: string; minimized: boolean; args?: Record<string, string> }[];
  focusedId: string | null;
  desktop: string;
  wallpaper: string;
}

export class Toolbox {
  private terminal: Promise<TerminalSession> | undefined;
  private readonly core: Tool[];
  private sudo = false;

  constructor(private readonly access: TutorAccess, private readonly ui: PuppetUi) {
    this.core = this.coreTools();
    access.setCapabilities(CAPABILITIES);
  }

  get hasSudo(): boolean {
    return this.sudo;
  }

  /** The learner takes sudo back (or a new session starts): Vasu is an ordinary user again. */
  revokeSudo(): void {
    this.sudo = false;
    this.access.setCapabilities(CAPABILITIES);
  }

  /** Module tools are read fresh each time: modules load lazily and can add actions at any point. */
  private get tools(): Tool[] {
    return [...this.core, ...this.moduleTools()];
  }

  specs(): ToolSpec[] {
    return this.tools.map((tool) => tool.spec);
  }

  async call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.find((candidate) => candidate.spec.function.name === name);
    if (!tool) return { error: `There is no tool called ${name}.` };
    try {
      return await tool.run(args);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async session(): Promise<SessionInfo> {
    const listed = await this.access.dispatch<SessionInfo>('session.list', {});
    if (!listed.ok) throw new Error(listed.error.message);
    return listed.value;
  }

  private coreTools(): Tool[] {
    const { access, ui } = this;
    return [
      tool('look_at_screen', 'See the screen: the desktop environment, open windows (id, app, title) and every '
        + 'button, field and icon you can click or type into, each with an element id. Look again after the screen '
        + 'changes: element ids are only valid until the next look.',
      {}, async () => {
        const session = await this.session();
        return {
          desktop: session.desktop,
          windows: session.windows.map(({ id, appId, title, minimized, args }) => ({
            id, app: appId, title, minimized, focused: id === session.focusedId,
            ...(args?.owner === 'vasu' ? { yours: true } : {}),
          })),
          elements: ui.describeScreen(),
        };
      }),
      tool('click', 'Move your pointer to an element (id from look_at_screen) and click it, as the learner would.',
        {
          element_id: { type: 'string' },
          double_click: { type: 'boolean', description: 'Double-click, e.g. to open a desktop icon.' },
        }, async (args) => {
          await ui.click(text(args.element_id), args.double_click === true);
          return { ok: true };
        }, ['element_id']),
      tool('type_text', 'Type into a text field (id from look_at_screen), letter by letter so the learner can follow. '
        + 'For terminals use type_in_terminal instead.',
      {
        element_id: { type: 'string' },
        text: { type: 'string' },
        press_enter: { type: 'boolean', description: 'Press Enter afterwards to submit.' },
      }, async (args) => {
        await ui.typeText(text(args.element_id), text(args.text), args.press_enter === true);
        return { ok: true };
      }, ['element_id', 'text']),
      tool('press_keys', 'Press a key or shortcut, e.g. "Alt+Q" (Hyprland terminal), "Alt+Space" (KRunner), '
        + '"Ctrl+Alt+T" (terminal), "Super" (launcher), "Escape", "Enter".',
      { keys: { type: 'string' } }, async (args) => {
        await ui.pressKeys(text(args.keys));
        return { ok: true };
      }, ['keys']),
      tool('type_in_terminal', 'Type a command into a terminal so the learner watches it happen, then wait for its '
        + 'output. Without window_id it uses your own terminal, "Vasu\'s terminal", opening it if needed: commands '
        + 'there are yours and never count towards the learner\'s lessons. Use sudo only after request_sudo.',
      {
        command: { type: 'string' },
        window_id: { type: 'string', description: 'A terminal window to type into instead of your own.' },
      }, async (args) => this.typeCommand(text(args.command), args.window_id === undefined ? undefined : text(args.window_id)),
      ['command']),
      tool('run_command', 'Run a command quietly in a hidden shell of yours to check something, without showing it. '
        + 'To demonstrate, use type_in_terminal instead.',
      { command: { type: 'string' } }, async (args) => {
        const terminal = await (this.terminal ??= access.createTerminal());
        const ran = await terminal.run(text(args.command));
        return { cwd: await terminal.cwd(), exit_code: ran.code, stdout: cap(ran.stdout), stderr: cap(ran.stderr) };
      }, ['command']),
      tool('request_sudo', 'Ask the learner to let you act as root (sudo), e.g. to demonstrate admin commands or repair '
        + 'the system. They see your reason and must type their password. If they say no, accept it gracefully.',
      { reason: { type: 'string', description: 'One sentence the learner will read.' } }, async (args) => {
        if (this.sudo) return { granted: true, note: 'You already have sudo.' };
        const granted = await ui.requestSudo(text(args.reason));
        if (!granted) return { granted: false, message: 'The learner said no to giving you sudo.' };
        this.sudo = true;
        access.setCapabilities([...CAPABILITIES, SUDO]);
        return { granted: true, note: 'You can now use sudo for the rest of this session, until the learner revokes it.' };
      }, ['reason']),
      tool('recent_activity', 'The commands the learner ran most recently, with exit codes and output.',
        { limit: { type: 'integer', description: 'How many commands, newest last (default 8, max 20).' } },
        async (args) => ({ commands: learnerCommands(access.recentEvents(400), clamp(args.limit, 8, 20)) })),
      tool('list_directory', 'List a directory (absolute path).',
        { path: { type: 'string' } },
        async (args) => result(await access.dispatch('fs.list', { path: text(args.path) })),
        ['path']),
      tool('read_file', 'Read a text file (absolute path).',
        { path: { type: 'string' } }, async (args) => {
          const read = await access.dispatch<string>('fs.read', { path: text(args.path) });
          return read.ok ? { content: cap(read.value) } : { error: read.error.message };
        }, ['path']),
      tool('write_file', 'Create or replace a text file (absolute path), e.g. to set up an exercise.',
        { path: { type: 'string' }, content: { type: 'string' } },
        async (args) => result(await access.dispatch('fs.write', {
          path: text(args.path), content: text(args.content),
        })),
        ['path', 'content']),
      tool('open_app', 'Open an app window, e.g. "terminal", "files", "editor", "settings".',
        { app: { type: 'string' }, path: { type: 'string', description: 'File to open (Text Editor only).' } },
        async (args) => result(await access.openApp(text(args.app), args.path ? { path: text(args.path) } : undefined)),
        ['app']),
      tool('manage_window', 'Focus, minimize, maximize (toggle) or close a window by id.',
        {
          window_id: { type: 'string' },
          action: { type: 'string', enum: ['focus', 'minimize', 'maximize', 'close'] },
        }, async (args) => {
          const types = { focus: 'session.focus', minimize: 'session.minimize', maximize: 'session.toggleMaximize',
            close: 'session.close' } as const;
          const type = types[text(args.action) as keyof typeof types];
          if (!type) throw new Error('action must be focus, minimize, maximize or close');
          return result(await access.dispatch(type, { id: text(args.window_id) }));
        }, ['window_id', 'action']),
      tool('change_appearance', 'Switch the desktop environment ("plasma", "gnome", "cde", "hyprland") and/or the '
        + 'wallpaper ("freedom", "command", "root", "rabbit", "tux", "linus", "topo", "gnu-zen", "gnu").',
      { desktop: { type: 'string' }, wallpaper: { type: 'string' } }, async (args) => {
        if (args.desktop !== undefined) {
          const set = await access.dispatch('session.setDesktop', { desktop: text(args.desktop) });
          if (!set.ok) return { error: set.error.message };
        }
        if (args.wallpaper !== undefined) {
          const set = await access.dispatch('session.setWallpaper', { wallpaper: text(args.wallpaper) });
          if (!set.ok) return { error: set.error.message };
        }
        return { ok: true };
      }),
      tool('point_at', 'Point at something without clicking it, so the learner can find it.',
        {
          target: { type: 'string', description: '"app:<id>" for a desktop icon or "window:<window id>".' },
          note: { type: 'string', description: 'A few words shown next to the pointer.' },
        }, async (args) => {
          ui.pointAt(text(args.target), args.note === undefined ? undefined : text(args.note));
          return { ok: true };
        }, ['target']),
    ];
  }

  /** Types a command into a terminal and waits for the shell to report it finished. */
  private async typeCommand(command: string, windowId?: string): Promise<unknown> {
    const target = windowId ?? await this.ownTerminal();
    const before = this.access.recentEvents(1).at(-1)?.seq ?? 0;
    await this.ui.typeInTerminal(target, `${command}\r`);
    const ran = await this.waitFor((event) => event.seq > before && event.action.type === 'shell.ran');
    if (!ran) return { window_id: target, typed: true, note: 'The command has not finished yet.' };
    const done = ran.action.payload as { code: number; stdout: string; stderr: string };
    return { window_id: target, exit_code: done.code, stdout: cap(done.stdout), stderr: cap(done.stderr) };
  }

  /** Vasu's own terminal window, opened (or restored) when he needs it. */
  private async ownTerminal(): Promise<string> {
    const session = await this.session();
    const mine = session.windows.find((window) => window.appId === 'terminal' && window.args?.owner === 'vasu');
    if (mine) {
      await this.access.dispatch('session.focus', { id: mine.id });
      return mine.id;
    }
    const opened = await this.access.openApp('terminal', { owner: 'vasu' });
    if (!opened.ok) throw new Error(opened.error.message);
    return opened.value;
  }

  private async waitFor(match: (event: KernelEvent) => boolean): Promise<KernelEvent | undefined> {
    const deadline = Date.now() + COMMAND_WAIT_MS;
    while (Date.now() < deadline) {
      const found = this.access.recentEvents(50).find(match);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return undefined;
  }

  /** One tool per module action (e.g. a course's status and start), so new modules extend the tutor. */
  private moduleTools(): Tool[] {
    return this.access.actions()
      .filter((action) => !CORE_ACTIONS.test(action.type))
      .map((action) => {
        const params = (action.params ?? { type: 'object', properties: {} }) as Record<string, unknown>;
        return {
          spec: {
            type: 'function',
            function: { name: toolName(action), description: action.description, parameters: params },
          },
          run: async (args) => result(await this.access.dispatch(action.type, args)),
        } satisfies Tool;
      });
  }
}

function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  run: Tool['run'],
  required: string[] = [],
): Tool {
  return {
    spec: { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } },
    run,
  };
}

/** `learn-linux.start` becomes `learn-linux__start`: tool names allow only letters, digits, _ and -. */
export function toolName(action: ActionInfo): string {
  return action.type.replace(/\./g, '__').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function result(dispatched: { ok: true; value: unknown } | { ok: false; error: { message: string } }): unknown {
  return dispatched.ok ? { ok: true, value: dispatched.value ?? null } : { error: dispatched.error.message };
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('expected a string argument');
  return value;
}

function clamp(value: unknown, fallback: number, max: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? Math.min(value, max) : fallback;
}

function cap(value: string): string {
  return value.length > OUTPUT_LIMIT ? `${value.slice(0, OUTPUT_LIMIT)}… (${value.length - OUTPUT_LIMIT} more)` : value;
}

export interface LearnerCommand {
  line: string;
  cwd: string;
  exit_code: number;
  stdout: string;
  stderr: string;
}

/** The learner's own commands (not the tutor's), newest last. */
export function learnerCommands(events: readonly KernelEvent[], limit: number): LearnerCommand[] {
  return events
    .filter((event) => event.ok && event.actor.kind === 'user' && event.action.type === 'shell.ran')
    .slice(-limit)
    .map((event) => {
      const ran = event.action.payload as { line: string; cwd: string; code: number; stdout: string; stderr: string };
      return { line: ran.line, cwd: ran.cwd, exit_code: ran.code, stdout: cap(ran.stdout), stderr: cap(ran.stderr) };
    });
}

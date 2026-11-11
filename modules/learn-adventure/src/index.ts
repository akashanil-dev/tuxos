import { emptyExploration, type ExplorationProgress, type KernelEvent, type ModuleDefinition } from '@tuxos/sdk';
import { KernelError, resolvePath, type ActionContext, type ShellRan } from '@tuxos/kernel';
import { LessonRunner, type Entry, type LessonHost, type LessonStatus, type Progress, validateCourse } from '@tuxos/lessons';
import type { CommandContext } from '@tuxos/shell';
import { course } from './course';
import { assets, cryptAssets, GATE, nodeAt, preview, put, seed, STAIRS, type RepairItem } from './assets';
import { manifest } from './manifest';
export { manifest } from './manifest';
export interface AdventureStatus { lesson: LessonStatus; progress: ExplorationProgress['adventure']; repair: RepairItem[] }
const own = (actor: ActionContext['actor']) => { if (actor.kind !== 'module' || actor.id !== manifest.id) throw new KernelError('EPERM', 'Adventure history is recorded by the quest observer.'); };
const learner = (actor: ActionContext['actor']) => { if (actor.kind !== 'user') throw new KernelError('EPERM', 'This adventure action is for the learner.'); };

export const learnAdventure: ModuleDefinition = { manifest, activate(ctx) {
  const problems = validateCourse(course); if (problems.length) throw new Error(problems.join('; '));
  const home = `/home/${ctx.user}`;
  const dispatch = <T,>(type: string, payload: unknown): T => { const result = ctx.dispatch<T>(type, payload); if (!result.ok) throw new KernelError(result.error.code, result.error.message); return result.value; };
  const history = () => dispatch<ExplorationProgress>('exploration.status', {}).adventure;
  ctx.registerAction({ type: 'learn-adventure.inspect', capability: 'exploration:read', mutates: false, description: 'Inspect fixed quest conditions.',
    run: ({ state, actor, fs }: ActionContext, input: { path?: string; fact?: string }) => {
      own(actor);
      if (input.path) { try { const stat = fs.stat(input.path); return { kind: stat.kind, mode: stat.mode, ...(stat.kind === 'file' ? { content: fs.read(input.path) } : {}) }; } catch { return undefined; } }
      const progress = state.exploration ?? emptyExploration(), seen = progress.adventure.seen;
      const get = (path: string) => nodeAt(state.fs, path);
      switch (input.fact) {
        case 'read-letter': return !!seen[`${home}/welcome.txt`];
        case 'read-map': return !!seen[`${home}/dungeon/.map`];
        case 'read-crown': return !!seen['sudo:/root/crown.txt'];
        case 'listed-hidden': return !!seen['action:listed-hidden'];
        case 'stairs': return !!seen['action:stairs'];
        case 'gate-executable': { const n = get(`${home}/dungeon/gate.sh`); return n?.kind === 'file' && !!(n.mode & (n.owner === ctx.user ? 0o100 : 0o1)); }
        case 'goblins-gone': { const n = get(`${home}/dungeon/crypt/goblins`); return get(`${home}/dungeon/crypt`)?.kind === 'dir' && (!n || (n.kind === 'dir' && !Object.keys(n.children).length)); }
        case 'three-puzzles': return Object.keys(progress.pipe.solved).length >= 3;
        case 'count-errors': return !!seen['action:count-errors'];
        case 'cowsay-installed': return !!get('/usr/bin/cowsay');
        default: return false;
      }
    },
  });
  ctx.registerAction({ type: 'learn-adventure.observe', capability: 'exploration:write', mutates: true, description: 'Remember learner file reads and adventure actions.',
    run: ({ state, actor }: ActionContext, event: KernelEvent) => {
      own(actor); if (event.actor.kind !== 'user' || !event.ok) return;
      const adventure = (state.exploration ??= emptyExploration()).adventure, seen = adventure.seen;
      if (event.action.type === 'fs.read') {
        const path = resolvePath((event.action.payload as { path: string }).path);
        if ([`${home}/welcome.txt`, `${home}/dungeon/.map`, '/root/crown.txt'].includes(path)) { seen[path] = true; if (event.user === 'root') seen[`sudo:${path}`] = true; }
      }
      if (!adventure.started) return;
      const current = course.lessons.find(lesson => !adventure.done[lesson.id])?.id;
      if (event.action.type === 'shell.ran') {
        const ran = event.action.payload as ShellRan;
        if (current === 'dungeon' && ran.cwd === `${home}/dungeon` && ran.successfulCommands?.includes('ls') && /\bls\s+-[a-zA-Z]*a/.test(ran.line)) seen['action:listed-hidden'] = true;
        const log = nodeAt(state.fs, '/var/log/syslog');
        if (current === 'pipes' && log?.kind === 'file' && ran.commands.includes('grep') && ran.successfulCommands?.includes('wc') && /\|/.test(ran.line) && /\/var\/log\/syslog/.test(ran.line) && ran.code === 0 && ran.stdout.trim() === String(log.content.split('\n').filter(line => line.includes('ERROR')).length)) seen['action:count-errors'] = true;
      }
    },
  });
  ctx.registerAction({ type: 'learn-adventure.record', capability: 'exploration:write', mutates: true, description: 'Persist verified quest objectives without changing course mastery.',
    run: ({ state, actor, now }: ActionContext, progress: Progress) => {
      own(actor); const exploration = state.exploration ??= emptyExploration(), adventure = exploration.adventure;
      adventure.started = true;
      for (const quest of course.lessons) {
        const completed = progress.completed[quest.id] ?? [];
        adventure.progress[quest.id] = quest.steps.map((step, i) => !!adventure.progress[quest.id]?.[i] || completed.includes(step.id));
        if (adventure.progress[quest.id]!.every(Boolean)) adventure.done[quest.id] ??= now;
      }
      const count = course.lessons.filter(quest => adventure.done[quest.id]).length;
      if (count >= 5) exploration.achievements.quest_half ??= now;
      if (count === course.lessons.length) exploration.achievements.quest_all ??= now;
    },
  });
  ctx.registerAction({ type: 'learn-adventure.prepare', capability: 'exploration:write', mutates: true, description: 'Add missing adventure assets, retaining all existing files.',
    run: ({ state, actor, now }: ActionContext) => { learner(actor); seed(state, ctx.user, now); (state.exploration ??= emptyExploration()).adventure.started = true; return preview(state, ctx.user); },
  });
  ctx.registerAction({ type: 'learn-adventure.repair', capability: 'exploration:write', mutates: true, description: 'Repair the previewed adventure files, with a recoverable backup.',
    run: ({ state, actor, now }: ActionContext, input: { paths?: unknown }) => {
      learner(actor); const items = preview(state, ctx.user), paths = items.map(item => item.path);
      if (!Array.isArray(input?.paths) || JSON.stringify(input.paths) !== JSON.stringify(paths)) throw new KernelError('EAGAIN', 'The files changed. Review the recovery preview again.');
      if (items.some(item => item.state === 'blocked')) throw new KernelError('EEXIST', 'A personal file or directory occupies an adventure path. Move it before recovery; it will not be deleted.');
      if (!items.length) return;
      const adventure = (state.exploration ??= emptyExploration()).adventure;
      adventure.recovery = { createdAt: now, files: Object.fromEntries(paths.map(path => { const n = nodeAt(state.fs, path); return [path, n?.kind === 'file' ? { content: n.content, owner: n.owner, mode: n.mode, mtime: n.mtime } : null]; })) };
      const source = assets(state, ctx.user);
      for (const path of paths) { const asset = source[path]!; put(state.fs, path, { kind: 'file', ...asset, owner: asset.owner === 'user' ? ctx.user : asset.owner, mtime: now }, ctx.user, now); }
    },
  });
  ctx.registerAction({ type: 'learn-adventure.undoRepair', capability: 'exploration:write', mutates: true, description: 'Restore the previous adventure file backup; retain all progress and unrelated files.',
    run: ({ state, actor, now }: ActionContext) => {
      learner(actor); const adventure = (state.exploration ??= emptyExploration()).adventure, backup = adventure.recovery;
      if (!backup) throw new KernelError('ENOENT', 'There is no adventure recovery backup.');
      const allowed = { ...assets(state, ctx.user), ...cryptAssets(home) };
      const current: typeof backup.files = {};
      for (const [path, saved] of Object.entries(backup.files)) {
        if (!Object.hasOwn(allowed, path)) throw new KernelError('EINVAL', 'The recovery backup contains an unsupported path.');
        const node = nodeAt(state.fs, path);
        if (node?.kind === 'dir') throw new KernelError('EEXIST', `${path} is now a directory. Move it before restoring.`);
        current[path] = node ? { content: node.content, owner: node.owner, mode: node.mode, mtime: node.mtime } : null;
        put(state.fs, path, saved ? { ...saved, kind: 'file' } : null, ctx.user, now);
      }
      adventure.recovery = { createdAt: now, files: current };
    },
  });
  ctx.registerAction({ type: 'learn-adventure.script', capability: 'fs:write', mutates: true, description: 'Run one of the two known adventure practice scripts; never evaluate saved code.',
    run: ({ state, actor, fs, user, now }: ActionContext, input: { path?: unknown; args?: unknown }) => {
      learner(actor);
      if (typeof input?.path !== 'string' || !Array.isArray(input.args) || input.args.some(arg => typeof arg !== 'string')) throw new KernelError('EINVAL', 'Expected a script path and arguments.');
      const path = resolvePath(input.path), gate = `${home}/dungeon/gate.sh`, stairs = `${home}/dungeon/crypt/stairs.sh`;
      if (path !== gate && path !== stairs) throw new KernelError('ENOSYS', 'This practice shell runs only the adventure gate and stairs scripts.');
      const stat = fs.stat(path), content = fs.read(path);
      const executable = user === 'root' ? stat.mode & 0o111 : stat.mode & (stat.owner === user ? 0o100 : 0o1);
      if (!executable) throw new KernelError('EACCES', `${path}: Permission denied. Use chmod +x to make this practice script executable.`);
      if (content !== (path === gate ? GATE : STAIRS)) throw new KernelError('EINVAL', 'This practice script has changed. Use Adventure → Recover practice files to restore it. Saved script contents are never executed.');
      if (path === gate) {
        if (!input.args[0]) return '“Speak the secret word, traveller.”\nUsage: ./gate.sh <secret-word>\n';
        if ((input.args[0] as string).toLowerCase() !== 'freedom') throw new KernelError('EINVAL', 'The gate does not budge. That is not the secret word.');
        const existing = nodeAt(state.fs, `${home}/dungeon/crypt`);
        if (existing && existing.kind !== 'dir') throw new KernelError('EEXIST', 'A file named crypt is in the way. Move it before opening the gate.');
        if (!existing) seed(state, ctx.user, now, cryptAssets(home));
        return 'The word echoes: “freedom”. The gate swings open!\nA new directory appeared: crypt/\nTry: cd crypt && ls\n';
      }
      const goblins = nodeAt(state.fs, `${home}/dungeon/crypt/goblins`);
      if (goblins && (goblins.kind !== 'dir' || Object.keys(goblins.children).length)) throw new KernelError('EAGAIN', 'Goblins still block the stairs. Remove them with rm first.');
      (state.exploration ??= emptyExploration()).adventure.seen['action:stairs'] = true;
      return 'You walk down the long stairs…\nThe crown rests in /root, home of the superuser.\nTry: sudo cat /root/crown.txt\n';
    },
  });
  const host: LessonHost = {
    home, onEvent: listener => ctx.onEvent(event => {
      if (!event.ok || (!['user', 'module'].includes(event.actor.kind))) return;
      if (event.actor.kind === 'user' && ['fs.read', 'shell.ran'].includes(event.action.type)) dispatch('learn-adventure.observe', event);
      if (event.actor.kind === 'user' && !event.action.type.startsWith('learn-adventure.') && !event.action.type.endsWith('.status')) listener(event);
    }),
    read: path => dispatch<Entry | undefined>('learn-adventure.inspect', { path }),
    fact: name => dispatch<boolean>('learn-adventure.inspect', { fact: name }),
    mkdir: () => { throw new Error('Adventure assets require explicit preparation.'); }, write: () => { throw new Error('Adventure assets require explicit preparation.'); },
    load: () => { const saved = history(); const next = course.lessons.find(quest => !saved.done[quest.id]); return {
      completed: Object.fromEntries(course.lessons.map(quest => [quest.id, quest.steps.filter((_, i) => saved.done[quest.id] || saved.progress[quest.id]?.[i]).map(step => step.id)])),
      active: (saved.started || Object.keys(saved.done).length || Object.keys(saved.progress).length) && next ? { lesson: next.id, step: 0 } : null,
    }; },
    save: progress => { dispatch('learn-adventure.record', progress); },
  };
  const runner = new LessonRunner(course, host, { parallelObjectives: true, resumeOnStart: true });
  const advance = () => { const saved = history(), next = course.lessons.find(quest => !saved.done[quest.id]); if (next && (saved.started || Object.keys(saved.done).length)) runner.start(next.id); };
  let disposed = false;
  runner.on(event => { if (event.type === 'lesson-done') queueMicrotask(() => { if (!disposed) advance(); }); });
  ctx.registerAction({ type: 'learn-adventure.status', capability: 'exploration:read', mutates: false, description: 'Show the adventure journal, objectives, hints and recovery preview.',
    run: ({ state }: ActionContext): AdventureStatus => ({ lesson: runner.status(), progress: structuredClone(state.exploration?.adventure ?? emptyExploration().adventure), repair: preview(state, ctx.user) }),
  });
  ctx.registerAction({ type: 'learn-adventure.start', capability: 'exploration:write', mutates: false, description: 'Continue the adventure after explicitly preparing its files.',
    run: ({ actor }: ActionContext) => { learner(actor); if (!history().started) throw new KernelError('EINVAL', 'Prepare the adventure from its journal first.'); advance(); return runner.status(); },
  });
  ctx.registerCommand({ name: 'quest', summary: 'Read the current adventure and its hints', usage: 'quest [hint]', run: (command: CommandContext) => {
    const status = runner.status();
    if (!status.active) { command.stdout(course.lessons.every(q => history().done[q.id]) ? 'All ten quests complete! Open Try Linux for the next step.\n' : 'Open Tux’s Adventure from Play to prepare your practice files.\n'); return 0; }
    command.stdout(command.args[0] === 'hint' ? status.active.step.hints.join('\n') + '\n' : `${status.active.lesson.title}\n${status.active.lesson.story}\n\n${status.active.steps.map(step => `[${step.done ? 'x' : ' '}] ${step.task}`).join('\n')}\n\nUse quest hint when you are stuck.\n`); return 0;
  } });
  advance();
  return () => { disposed = true; runner.dispose(); };
} };
export default learnAdventure;

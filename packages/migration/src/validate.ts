import { validatePluginTheme, type ExplorationProgress } from '@tuxos/sdk';
import type { KernelSnapshot, VNode } from '@tuxos/kernel';
import { LEVELS } from '@tuxos/module-pipe-dream/levels';

// Match the account API's limit, including the encoded request envelope checked at output.
export const MAX_BYTES = 4 * 1024 * 1024;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
export const bytes = (text: string) => new TextEncoder().encode(text).byteLength;
export function demand(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
export function object(value: unknown, label: string): Record<string, any> {
  demand(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`);
  return value as Record<string, any>;
}
export const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
export const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
export const username = (v: unknown): v is string => typeof v === 'string' && /^[a-z_][a-z0-9_-]{0,31}$/.test(v) && v !== 'root' && !forbidden.has(v);
export const filename = (v: string) => v.length > 0 && v.length <= 255 && !['.', '..'].includes(v) && !forbidden.has(v) && !/[\\/\u0000-\u001f\u007f]/.test(v);
export const path = (v: unknown): v is string => typeof v === 'string' && v.startsWith('/') && (v === '/' || v.slice(1).split('/').every(filename));
export function parseBounded(raw: string): Record<string, any> {
  demand(bytes(raw) <= MAX_BYTES, 'The export exceeds 4 MiB. Keep it unchanged; export a smaller save after moving large personal files to separate downloads.');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('This file is not valid JSON. Choose the original exported save.'); }
  let count = 0;
  const walk = (v: unknown, depth: number): void => {
    demand(++count <= 100_000 && depth <= 80, 'The save is too complex (100,000 values or 80 levels maximum).');
    if (typeof v === 'number') demand(Number.isFinite(v), 'Numbers in a save must be finite.');
    if (v && typeof v === 'object') for (const [key, child] of Object.entries(v)) {
      demand(!forbidden.has(key), `Reserved key ${key} is not allowed in a save.`);
      walk(child, depth + 1);
    }
  };
  walk(value, 0);
  return object(value, 'Save');
}
export function timestamps(value: unknown, label: string): Record<string, number> {
  const v = object(value ?? {}, label);
  demand(Object.entries(v).every(([key, time]) => key.length <= 256 && finite(time)), `${label} must contain nonnegative timestamps.`);
  return v;
}
export function tree(value: unknown, legacy = false, depth = 0, counter = { nodes: 0 }): void {
  demand(++counter.nodes <= 20_000 && depth <= 32, 'The filesystem exceeds 20,000 nodes or 32 folder levels.');
  const n = object(value, 'Filesystem node');
  const kind = legacy ? n.t : n.kind;
  demand(legacy ? ['f', 'd'].includes(kind) : ['file', 'dir'].includes(kind), 'Unsupported filesystem node type.');
  demand(typeof (legacy ? n.o : n.owner) === 'string', 'File ownership must be text.');
  demand(legacy ? typeof n.m === 'string' && /^[0-7]{3,4}$/.test(n.m) : Number.isInteger(n.mode) && n.mode >= 0 && n.mode <= 0o7777, 'Invalid file permissions.');
  if (n.mtime !== undefined) demand(finite(n.mtime), 'Invalid modification time.');
  if (kind === 'f' || kind === 'file') demand(typeof (legacy ? n.c : n.content) === 'string', 'File content must be text.');
  else for (const [name, child] of Object.entries(object(legacy ? n.ch : n.children, 'Folder children'))) {
    demand(filename(name), `Unsafe or unsupported filename: ${JSON.stringify(name)}.`); tree(child, legacy, depth + 1, counter);
  }
}
export function exploration(value: unknown): asserts value is ExplorationProgress {
  const e = object(value, 'Exploration history');
  demand(e.version === 1, 'This exploration history needs a newer TuxOS version.');
  timestamps(e.learned, 'Learned commands'); timestamps(e.achievements, 'Discoveries');
  const a = object(e.adventure, 'Adventure'); timestamps(a.done, 'Completed quests');
  demand(Object.values(object(a.progress, 'Quest progress')).every(v => Array.isArray(v) && v.length <= 32 && v.every(x => typeof x === 'boolean')), 'Invalid quest objectives.');
  demand(Object.values(object(a.seen, 'Seen files')).every(v => typeof v === 'boolean'), 'Invalid adventure read history.');
  if (a.started !== undefined) demand(typeof a.started === 'boolean', 'Invalid adventure start flag.');
  if (a.recovery !== undefined) {
    const r = object(a.recovery, 'Adventure backup'); demand(finite(r.createdAt), 'Invalid recovery date.');
    for (const [p, f] of Object.entries(object(r.files, 'Adventure backup files'))) {
      demand(path(p), 'Invalid recovery path.');
      if (f !== null) tree({ ...object(f, 'Recovery file'), kind: 'file' });
    }
  }
  const p = object(e.pipe, 'Pipe Dream'); timestamps(p.solved, 'Solved puzzles');
  if (p.current !== undefined) demand(typeof p.current === 'string', 'Invalid puzzle selection.');
  if (p.drafts !== undefined) for (const [id, draft] of Object.entries(object(p.drafts, 'Puzzle drafts'))) {
    const level = LEVELS.find(l => l.id === id);
    demand(level && Array.isArray(draft) && draft.length <= 6 && draft.every(n => Number.isInteger(n) && n >= 0 && n < level.blocks.length), 'Invalid puzzle draft.');
  }
  const r = object(e.runner, 'Runner');
  demand(['Rapid', 'Infinite'].includes(r.mode) && finite(r.rapidBest) && finite(r.infiniteHigh) && typeof r.sound === 'boolean', 'Invalid runner preferences or scores.');
  if (r.legacyBest !== undefined) demand(finite(r.legacyBest), 'Invalid historical runner score.');
  if (r.family !== undefined) demand(['Debian', 'Red Hat', 'Arch', 'Gentoo', 'Slackware', 'debian', 'redhat', 'arch', 'gentoo', 'slackware'].includes(r.family), 'Unknown runner family.');
  if (e.guide !== undefined) { const g = object(e.guide, 'Guide'); demand(Array.isArray(g.answers) && g.answers.length <= 4 && g.answers.every(n => Number.isInteger(n) && n >= 0 && n <= 3) && (g.recommendation === undefined || typeof g.recommendation === 'string'), 'Invalid guide answers.'); }
  demand(Array.isArray(e.imports) && e.imports.every(i => i && typeof i.id === 'string' && finite(i.importedAt) && typeof i.source === 'string'), 'Invalid import history.');
  for (const i of e.imports) if (i.report !== undefined) { const r = object(i.report, 'Import report'); demand(strings(r.notes) && strings(r.unsupported), 'Invalid historical import report.'); }
}
export interface NativeSave { username: string; snapshot: KernelSnapshot }
/** Validate external state before the kernel, plugin discovery or app views see it. */
export function nativeSave(value: unknown): NativeSave {
  const n = object(value, 'TuxOS backup'), snapshot = object(n.snapshot, 'Snapshot'), s = object(snapshot.state, 'System state');
  demand(username(n.username), 'Invalid learner name.');
  demand(snapshot.version === 1 || snapshot.version === 2, 'This backup needs a compatible TuxOS version (supported: 1 and 2).');
  tree(s.fs); demand(s.fs.kind === 'dir', 'The root filesystem must be a folder.');
  const users = object(s.users, 'Users');
  demand(Object.keys(users).filter(u => u !== 'root')[0] === n.username, 'The backup identity does not match its first regular user.');
  for (const [name, user] of Object.entries(users)) {
    demand(name === 'root' || username(name), 'Invalid simulated user.'); const u = object(user, 'User');
    demand(Number.isInteger(u.uid) && u.uid >= 0 && path(u.home), 'Invalid user account.');
  }
  demand(users.root?.uid === 0 && users[n.username]?.home === `/home/${n.username}`, 'The backup has incompatible account homes.');
  demand(typeof s.hostname === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(s.hostname), 'Invalid hostname.');
  if (s.filesystemVersion !== undefined) demand(s.filesystemVersion === 1, 'Unsupported filesystem version.');
  const session = object(s.session ?? {}, 'Desktop session');
  if (session.windows !== undefined) {
    demand(Array.isArray(session.windows) && session.windows.length <= 100, 'Too many windows.');
    const ids = new Set();
    for (const w of session.windows) {
      object(w, 'Window'); demand(typeof w.id === 'string' && !ids.has(w.id) && typeof w.appId === 'string' && typeof w.title === 'string', 'Invalid window identity.'); ids.add(w.id);
      demand(['x', 'y', 'width', 'height', 'z'].every(k => typeof w[k] === 'number' && Number.isFinite(w[k])) && w.width > 0 && w.height > 0 && typeof w.minimized === 'boolean' && typeof w.maximized === 'boolean', 'Invalid window geometry.');
      if (w.args !== undefined) demand(Object.values(object(w.args, 'Window arguments')).every(v => typeof v === 'string'), 'Invalid window arguments.');
    }
  }
  if (session.nextId !== undefined) demand(Number.isSafeInteger(session.nextId) && session.nextId > 0, 'Invalid next window ID.');
  if (session.focusedId !== undefined) demand(session.focusedId === null || typeof session.focusedId === 'string', 'Invalid focused window.');
  for (const k of ['desktop', 'wallpaper']) if (session[k] !== undefined) demand(typeof session[k] === 'string', `Invalid ${k}.`);
  if (session.theme !== undefined) validatePluginTheme(session.theme);
  if (session.preferences !== undefined) {
    const p = object(session.preferences, 'Preferences');
    for (const k of ['fastBoot', 'showVasu', 'richVasu']) if (p[k] !== undefined) demand(typeof p[k] === 'boolean', 'Invalid preference.');
    if (p.resume !== undefined) demand(['desktop', 'learn'].includes(p.resume), 'Invalid resume preference.');
  }
  if (session.appearanceGrants !== undefined) demand(strings(session.appearanceGrants), 'Invalid appearance history.');
  if (session.widgets !== undefined) demand(Array.isArray(session.widgets) && session.widgets.every(w => w && typeof w.appId === 'string' && ['x', 'y', 'width', 'height'].every(k => typeof w[k] === 'number' && Number.isFinite(w[k]))), 'Invalid widgets.');
  const terminal = (t: any) => { object(t, 'Terminal'); demand(path(t.cwd) && Object.values(object(t.env, 'Environment')).every(v => typeof v === 'string'), 'Invalid terminal context.'); };
  if (session.terminals !== undefined) for (const t of Object.values(object(session.terminals, 'Terminals'))) { terminal(t); demand(strings(t.history) && t.history.length <= 100, 'Invalid terminal history.'); }
  if (session.journey !== undefined) { const j = object(session.journey, 'Learning history'); for (const k of ['lessons', 'steps', 'acknowledged']) demand(strings(j[k]), 'Invalid lesson history.'); if (j.installedDesktops !== undefined) demand(strings(j.installedDesktops), 'Invalid desktop package history.'); if (j.terminal !== undefined) { terminal(j.terminal); demand(typeof j.terminal.lesson === 'string', 'Invalid lesson terminal.'); } }
  if (s.exploration !== undefined) exploration(s.exploration);
  return n as NativeSave;
}

export function nodeAt(root: VNode, p: string): VNode | undefined {
  let n: VNode | undefined = root;
  for (const part of p.split('/').filter(Boolean)) n = n?.kind === 'dir' ? n.children[part] : undefined;
  return n;
}

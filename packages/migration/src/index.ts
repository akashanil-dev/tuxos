import { createKernel, type VNode, type DirNode, type KernelState } from '@tuxos/kernel';
import { emptyExploration, defaultPreferences, EXPLORATION_ACHIEVEMENTS } from '@tuxos/sdk';
import { WALLPAPERS } from '@tuxos/appearance';
import { CATALOG, findPackage } from '@tuxos/module-apt/catalog';
import { ensureDatabase, fetchLists, installed, resolve, unpack, type Files } from '@tuxos/module-apt/dpkg';
import { LEVELS } from '@tuxos/module-pipe-dream/levels';
import { course } from '@tuxos/module-learn-adventure/course';
import { bytes, demand, finite, nativeSave, nodeAt, object, parseBounded, strings, timestamps, tree, username, MAX_BYTES, type NativeSave } from './validate';
export { nativeSave, parseBounded, MAX_BYTES } from './validate';
export type { NativeSave } from './validate';

export interface ImportOptions {
  files?: 'keep' | 'replace' | 'both';
  choices?: Record<string, 'keep' | 'replace' | 'both'>;
  preferences?: 'keep' | 'source';
  adventure?: 'keep' | 'source';
  now: number;
}
export interface ImportReport {
  id: string; source: 'Tuxplore' | 'TuxOS'; sourceUser: string; destinationUser: string;
  notes: string[]; unsupported: string[]; packages: string[];
  files: { added: number; replaced: number; kept: number; copied: number };
  quests: number; discoveries: number; puzzles: number;
}
export interface ImportPreview {
  id: string; source: 'Tuxplore' | 'TuxOS'; sourceUser: string; destinationUser: string;
  alreadyImported: boolean; conflicts: { path: string; kind: 'file' | 'folder'; choice: 'keep' | 'replace' | 'both'; copyPath?: string }[];
  report: ImportReport; data: string; bytes: number;
}
const DE: Record<string, string> = { kde: 'plasma', retro: 'cde', tiling: 'hyprland', gnome: 'gnome' };
const FAMILY: Record<string, string> = { debian: 'Debian', redhat: 'Red Hat', arch: 'Arch', gentoo: 'Gentoo', slackware: 'Slackware' };
const FIELDS = ['username', 'theme', 'wallpaper', 'fastBoot', 'unlockedThemes', 'achievements', 'learned', 'quests', 'tracks', 'pipe', 'runner', 'installed', 'history', 'fs', 'seen', 'daemonKilled', 'savedAt'];
function canonical(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
async function digest(value: unknown): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('');
}
function output(save: NativeSave): { data: string; bytes: number } {
  nativeSave(save);
  const data = JSON.stringify(save), size = bytes(data);
  // API body includes an escaped JSON string plus its revision; reserve enough for the latter.
  demand(size <= MAX_BYTES && bytes(JSON.stringify({ data, version: Number.MAX_SAFE_INTEGER })) <= MAX_BYTES * 2, 'The converted save exceeds the account’s 4 MiB save limit. No data was removed. Keep your export and download large personal files separately before retrying.');
  return { data, bytes: size };
}
function mergeTimes(target: Record<string, number>, source: Record<string, number>): void {
  for (const [id, time] of Object.entries(source)) target[id] = target[id] === undefined ? time : Math.min(target[id]!, time);
}
const mapPath = (p: string, from: string, to: string) => p === `/home/${from}` || p.startsWith(`/home/${from}/`) ? `/home/${to}${p.slice(`/home/${from}`.length)}` : p;

/** Rename structured identities and paths only. Personal text and shell history are never rewritten. */
export function renameNative(save: NativeSave, destination: string): NativeSave {
  demand(username(destination), 'Invalid destination username.');
  const copy = structuredClone(save), from = copy.username;
  if (from === destination) return copy;
  const state = copy.snapshot.state, home = nodeAt(state.fs, '/home');
  demand(home?.kind === 'dir' && home.children[from]?.kind === 'dir', 'The source home is missing.');
  demand(!home.children[destination] && !state.users[destination], 'That name already belongs to another simulated user in this backup.');
  home.children[destination] = home.children[from]!; delete home.children[from];
  state.users = Object.fromEntries(Object.entries(state.users).map(([name, account]) => [name === from ? destination : name, { ...account, home: mapPath(account.home, from, destination) }]));
  const walk = (n: VNode) => { if (n.owner === from) n.owner = destination; if (n.kind === 'dir') Object.values(n.children).forEach(walk); }; walk(state.fs);
  // These two system identity files have defined colon-separated fields; this is not a content search/replace.
  for (const p of ['/etc/passwd', '/etc/shadow', '/etc/group', '/etc/gshadow']) {
    const n = nodeAt(state.fs, p);
    if (n?.kind === 'file') n.content = n.content.split('\n').map(line => {
      const fields = line.split(':');
      if (fields[0] === from) { fields[0] = destination; if (p === '/etc/passwd') { fields[4] = fields[4] === from ? destination : fields[4]!; fields[5] = `/home/${destination}`; } }
      if (p === '/etc/group' || p === '/etc/gshadow') for (const i of p === '/etc/group' ? [3] : [2, 3]) if (fields[i]) fields[i] = fields[i]!.split(',').map(u => u === from ? destination : u).join(',');
      return fields.join(':');
    }).join('\n');
  }
  const session = state.session;
  for (const w of session.windows ?? []) if (w.args) for (const key of ['path', 'cwd']) if (w.args[key]) w.args[key] = mapPath(w.args[key]!, from, destination);
  const terminals = [...Object.values(session.terminals ?? {}), ...(session.journey?.terminal ? [session.journey.terminal] : [])];
  for (const t of terminals) {
    t.cwd = mapPath(t.cwd, from, destination);
    for (const key of ['HOME', 'PWD', 'OLDPWD']) if (t.env[key]) t.env[key] = mapPath(t.env[key]!, from, destination);
    for (const key of ['USER', 'LOGNAME']) if (t.env[key] === from) t.env[key] = destination;
  }
  const a = state.exploration?.adventure;
  if (a) {
    a.seen = Object.fromEntries(Object.entries(a.seen).map(([p, v]) => [p.startsWith('sudo:') ? `sudo:${mapPath(p.slice(5), from, destination)}` : mapPath(p, from, destination), v]));
    if (a.recovery) a.recovery.files = Object.fromEntries(Object.entries(a.recovery.files).map(([p, v]) => [mapPath(p, from, destination), v ? { ...v, owner: v.owner === from ? destination : v.owner } : null]));
  }
  copy.username = destination;
  return copy;
}
/** Imported plugin files stay recoverable but require new, explicit permission approval. */
function disableImportedPlugins(state: KernelState, user: string, notes: string[]): void {
  const plugins = nodeAt(state.fs, `/home/${user}/.local/share/tuxos/plugins`);
  if (plugins?.kind !== 'dir') return;
  for (const folder of Object.values(plugins.children)) if (folder.kind === 'dir') {
    const metadata = folder.children['install.json'];
    if (metadata?.kind === 'file') metadata.content = JSON.stringify({ enabled: false, approved: [] });
  }
  notes.push('Imported plugins are disabled. Their files are retained; review and enable them in Plugins.');
}
export async function previewImport(raw: string, destinationRaw: string, options: ImportOptions): Promise<ImportPreview> {
  const input = parseBounded(raw), destination = nativeSave(parseBounded(destinationRaw));
  const isNative = !!input.snapshot;
  let source = input;
  if (input.format !== undefined) { demand(input.format === 'tuxplore-export' && input.version === 1, 'Unsupported export format or version.'); source = object(input.save, 'Tuxplore save'); }
  if (!isNative && source.version !== undefined) demand(source.version === 1, 'Unsupported Tuxplore save version.');
  if (isNative) nativeSave(source); else {
    demand(source.username === null || username(source.username), 'Invalid Tuxplore learner name.');
    if (source.fs !== null && source.fs !== undefined) { tree(source.fs, true); demand(source.fs.t === 'd', 'The legacy root must be a folder.'); }
    for (const key of ['theme', 'wallpaper']) if (source[key] !== undefined) demand(typeof source[key] === 'string', `Invalid ${key}.`);
    for (const key of ['fastBoot', 'daemonKilled']) if (source[key] !== undefined) demand(typeof source[key] === 'boolean', `Invalid ${key}.`);
    if (source.savedAt !== undefined) demand(finite(source.savedAt), 'Invalid saved date.');
  }
  const sourceUser = typeof source.username === 'string' ? source.username : destination.username;
  const kind = isNative ? 'TuxOS' : 'Tuxplore';
  // Envelope time, analytics preference and excluded authentication fields do not make another import.
  const portable = isNative ? source : Object.fromEntries(FIELDS.filter(k => source[k] !== undefined).map(k => [k, source[k]]));
  const id = `${kind.toLowerCase()}:${await digest(portable)}`;
  const report: ImportReport = { id, source: kind, sourceUser, destinationUser: destination.username, notes: [], unsupported: [], packages: [], files: { added: 0, replaced: 0, kept: 0, copied: 0 }, quests: 0, discoveries: 0, puzzles: 0 };
  const conflicts: ImportPreview['conflicts'] = [];
  const alreadyImported = destination.snapshot.state.exploration?.imports.some(i => i.id === id) ?? false;
  if (alreadyImported) return { ...report, report, conflicts, alreadyImported, ...output(destination) };
  if (isNative) {
    const save = renameNative(nativeSave(source), destination.username);
    // Only the save contract is accepted, never unknown envelope credentials.
    const clean: NativeSave = { username: save.username, snapshot: save.snapshot };
    clean.snapshot.version = 2;
    disableImportedPlugins(clean.snapshot.state, clean.username, report.notes);
    const e = clean.snapshot.state.exploration ??= emptyExploration();
    report.notes.push('This TuxOS backup replaces the whole destination system. Its files, courses and settings are restored together; the current system is backed up first.');
    if (sourceUser !== clean.username) report.notes.push(`Home and ownership change from ${sourceUser} to ${clean.username}. Personal text, command history and embedded paths inside file contents stay unchanged.`);
    e.imports.push({ id, importedAt: options.now, source: kind, report: { notes: report.notes, unsupported: report.unsupported } });
    report.quests = Object.keys(e.adventure.done).length; report.discoveries = Object.keys(e.achievements).length; report.puzzles = Object.keys(e.pipe.solved).length;
    return { ...report, report, conflicts, alreadyImported, ...output(clean) };
  }
  const state = structuredClone(destination.snapshot.state), e = state.exploration ??= emptyExploration();
  for (const key of Object.keys(source)) if (!FIELDS.includes(key)) report.unsupported.push(`Field ${key}: excluded. The original file retains it.`);
  if (source.tracks && canonical(source.tracks) !== canonical({ active: null, done: {}, progress: {} })) report.unsupported.push('Legacy track records remain in the original export; they do not grant TuxOS course mastery.');
  const stamp = finite(source.savedAt) ? source.savedAt : options.now;
  const achievements = timestamps(source.achievements, 'Discoveries'), learned = timestamps(source.learned, 'Learned commands');
  mergeTimes(e.achievements, achievements); mergeTimes(e.learned, learned);
  for (const key of Object.keys(achievements)) if (!EXPLORATION_ACHIEVEMENTS.some(a => a.id === key)) report.unsupported.push(`Historical discovery ${key}: retained, without a current badge.`);
  const quests = object(source.quests ?? {}, 'Quests'), done = timestamps(quests.done, 'Completed quests'), progress = object(quests.progress ?? {}, 'Quest progress');
  if (options.adventure === 'source') e.adventure.progress = {};
  for (const [key, value] of Object.entries(progress)) demand(Array.isArray(value) && value.every(x => typeof x === 'boolean'), `Invalid objectives for ${key}.`);
  for (const quest of course.lessons) {
    if (done[quest.id] !== undefined) mergeTimes(e.adventure.done, { [quest.id]: done[quest.id]! });
    if (progress[quest.id] !== undefined) {
      demand(progress[quest.id].length === quest.steps.length, `The objectives for ${quest.id} are incompatible. Keep the original export for recovery.`);
      // Partial objectives and lab files must be chosen coherently. Completed quests remain monotonic.
      if (options.adventure === 'source' || !e.adventure.progress[quest.id]) e.adventure.progress[quest.id] = [...progress[quest.id]];
    }
    if (e.adventure.done[quest.id] !== undefined) e.adventure.progress[quest.id] = quest.steps.map(() => true);
  }
  for (const key of new Set([...Object.keys(done), ...Object.keys(progress)])) if (!course.lessons.some(q => q.id === key)) report.unsupported.push(`Unknown quest ${key}: retained in original export.`);
  const seen = object(source.seen ?? {}, 'Seen files'); demand(Object.values(seen).every(x => typeof x === 'boolean'), 'Invalid seen-file history.');
  if (options.adventure === 'source' || !e.adventure.started) e.adventure.seen = Object.fromEntries(Object.entries(seen).map(([p, v]) => [p.startsWith('sudo:') ? `sudo:${mapPath(p.slice(5), sourceUser, destination.username)}` : mapPath(p, sourceUser, destination.username), v]));
  if (Object.keys(done).length || Object.keys(progress).length) e.adventure.started = true;
  const pipe = object(source.pipe ?? {}, 'Pipe Dream');
  for (const [key, time] of Object.entries(timestamps(pipe.solved, 'Solved puzzles'))) {
    if (LEVELS.some(l => l.id === key)) mergeTimes(e.pipe.solved, { [key]: time });
    else report.unsupported.push(`Unknown puzzle ${key}: retained in original export.`);
  }
  const runner = object(source.runner ?? {}, 'Runner');
  if (runner.family !== undefined) demand(typeof runner.family === 'string', 'Invalid runner family.');
  for (const [label, value, allowed] of [['Runner', runner, ['best', 'rapidBest', 'infiniteHigh', 'mode', 'sound', 'family']], ['Pipe Dream', pipe, ['solved']], ['Quests', quests, ['done', 'progress']]] as const) for (const key of Object.keys(value)) if (!(allowed as readonly string[]).includes(key)) report.unsupported.push(`${label} field ${key}: retained in the original export.`);
  for (const key of ['best', 'rapidBest', 'infiniteHigh']) if (runner[key] !== undefined) demand(finite(runner[key]), `Invalid runner ${key}.`);
  if (runner.mode !== undefined) demand(['Rapid', 'Infinite'].includes(runner.mode), 'Invalid runner mode.');
  if (runner.sound !== undefined) demand(typeof runner.sound === 'boolean', 'Invalid game sound setting.');
  e.runner.rapidBest = Math.max(e.runner.rapidBest, runner.rapidBest ?? 0); e.runner.infiniteHigh = Math.max(e.runner.infiniteHigh, runner.infiniteHigh ?? 0);
  if (runner.best !== undefined) e.runner.legacyBest = Math.max(e.runner.legacyBest ?? 0, runner.best);
  if (options.preferences === 'source') {
    if (source.theme !== undefined) { demand(typeof source.theme === 'string', 'Invalid desktop.'); if (DE[source.theme]) state.session.desktop = DE[source.theme]!; else report.unsupported.push(`Desktop ${source.theme}: current desktop retained.`); }
    if (source.wallpaper !== undefined) { demand(typeof source.wallpaper === 'string', 'Invalid wallpaper.'); if (WALLPAPERS.some(w => w.id === source.wallpaper)) { state.session.wallpaper = source.wallpaper; if (source.wallpaper === 'kde-30th') state.session.appearanceGrants = [...new Set([...(state.session.appearanceGrants ?? []), 'anniversary' as const])]; } else report.unsupported.push(`Wallpaper ${source.wallpaper}: current wallpaper retained.`); }
    if (source.fastBoot !== undefined) { demand(typeof source.fastBoot === 'boolean', 'Invalid fast boot preference.'); state.session.preferences = { ...defaultPreferences(), ...state.session.preferences, fastBoot: source.fastBoot }; }
    if (runner.mode) e.runner.mode = runner.mode; if (runner.sound !== undefined) e.runner.sound = runner.sound;
    if (runner.family !== undefined) { demand(typeof runner.family === 'string', 'Invalid runner family.'); const family = FAMILY[runner.family] ?? Object.values(FAMILY).find(f => f === runner.family); if (family) e.runner.family = family; else report.unsupported.push(`Runner family ${runner.family}: current selection retained.`); }
  }
  if (source.unlockedThemes !== undefined) { demand(strings(source.unlockedThemes), 'Invalid desktop history.'); report.notes.push(`Previously available desktops: ${source.unlockedThemes.join(', ') || 'none'}. All four TuxOS desktops are available independently of course mastery.`); }
  const convert = (n: any): VNode => n.t === 'f'
    ? { kind: 'file', owner: n.o === 'user' || n.o === sourceUser ? destination.username : n.o, mode: parseInt(n.m, 8), mtime: n.mtime ?? stamp, content: n.c }
    : { kind: 'dir', owner: n.o === 'user' || n.o === sourceUser ? destination.username : n.o, mode: parseInt(n.m, 8), mtime: n.mtime ?? stamp, children: Object.fromEntries(Object.entries(n.ch).map(([name, child]) => [name, convert(child)])) };
  const same = (a: VNode, b: VNode) => a.kind === b.kind && a.owner === b.owner && a.mode === b.mode && (a.kind === 'file' && b.kind === 'file' ? a.content === b.content : true);
  const merge = (parent: DirNode, name: string, incoming: VNode, p: string): void => {
    const existing = parent.children[name];
    if (!existing) { parent.children[name] = incoming; report.files.added++; return; }
    if (existing.kind === 'dir' && incoming.kind === 'dir') {
      if (!same(existing, incoming)) { const choice = (options.choices?.[p] ?? options.files) === 'replace' ? 'replace' : 'keep'; conflicts.push({ path: p, kind: 'folder', choice }); if (choice === 'replace') { existing.mode = incoming.mode; existing.owner = incoming.owner; existing.mtime = incoming.mtime; } }
      for (const [key, child] of Object.entries(incoming.children)) merge(existing, key, child, `${p}/${key}`);
      return;
    }
    if (same(existing, incoming)) { report.files.kept++; return; }
    const choice = options.choices?.[p] ?? options.files ?? 'keep';
    const conflict: ImportPreview['conflicts'][number] = { path: p, kind: existing.kind === 'dir' || incoming.kind === 'dir' ? 'folder' : 'file', choice };
    conflicts.push(conflict);
    if (choice === 'replace') { parent.children[name] = incoming; report.files.replaced++; }
    else if (choice === 'both') {
      const suffix = `.tuxplore-${id.slice(-8)}`; let candidate = `${name.slice(0, 220)}${suffix}`, n = 2;
      while (parent.children[candidate]) candidate = `${name.slice(0, 210)}${suffix}-${n++}`;
      parent.children[candidate] = incoming; conflict.copyPath = `${p.slice(0, p.lastIndexOf('/') + 1)}${candidate}`; report.files.copied++;
    } else report.files.kept++;
  };
  if (source.fs) {
    const converted = convert(source.fs), home = nodeAt(converted, `/home/${sourceUser}`), destHome = nodeAt(state.fs, '/home');
    if (home) { demand(home.kind === 'dir' && destHome?.kind === 'dir', 'A learner home must be a folder.'); merge(destHome, destination.username, home, `/home/${destination.username}`); }
    else report.notes.push('No source home was found. Progress is still importable; the original export retains its filesystem.');
    report.notes.push('Only the learner’s home is merged. Legacy system paths and serialized executable metadata stay in the original export; current system identity and supported adventure actions are retained.');
  }
  // Plugins cannot inherit permission consent from another product or origin.
  // Disable only source-supplied plugin metadata; keep existing target plugins untouched when keeping conflicts.
  const sourcePlugins = source.fs?.ch?.home?.ch?.[sourceUser]?.ch?.['.local']?.ch?.share?.ch?.tuxos?.ch?.plugins;
  if (sourcePlugins) disableImportedPlugins(state, destination.username, report.notes);
  const history = source.history ?? []; demand(strings(history), 'Command history must be text.');
  if (history.length) {
    const home = nodeAt(state.fs, `/home/${destination.username}`); demand(home?.kind === 'dir', 'Missing destination home.');
    merge(home, `tuxplore-history-${id.slice(-8)}.txt`, { kind: 'file', owner: destination.username, mode: 0o600, mtime: stamp, content: history.join('\n') + '\n' }, `/home/${destination.username}/tuxplore-history-${id.slice(-8)}.txt`);
    (state.session.terminals ??= {}).legacy = { cwd: `/home/${destination.username}`, env: {}, history: history.slice(-100).map(line => line.slice(0, 4096)) };
    report.notes.push('Full command history is preserved in a text file. New terminals can recall its most recent 100 commands, bounded to 4096 characters each.');
  }
  const packages = object(source.installed ?? {}, 'Installed software'); demand(Object.values(packages).every(v => typeof v === 'boolean'), 'Invalid installed package flags.');
  // Install through the same package database and dependency resolver used by apt, in a detached kernel.
  const kernel = createKernel({ snapshot: { version: 2, state }, now: () => options.now });
  const run = (type: string, payload: unknown) => { const result = kernel.dispatch<any>({ type, payload }, { user: 'root' }); if (!result.ok) throw new Error(result.error.message); return result.value; };
  const files: Files = { read(p) { const r = kernel.dispatch<string>({ type: 'fs.read', payload: { path: p } }, { user: 'root' }); return r.ok ? r.value : undefined; }, write: (p, content) => run('fs.write', { path: p, content }), mkdir: p => run('fs.mkdir', { path: p, parents: true }), remove: p => run('fs.remove', { path: p, recursive: true }), chmod: (p, mode) => run('fs.chmod', { path: p, mode }) };
  ensureDatabase(files);
  for (const [name, enabled] of Object.entries(packages)) if (enabled) {
    const mapped = name === 'fortune' ? 'fortune-mod' : name;
    if (!CATALOG.some(p => p.name === mapped) || !findPackage(mapped)) { report.unsupported.push(`Package ${name}: retained in the original export; no compatible package was installed.`); continue; }
    fetchLists(files);
    for (const pkg of resolve(mapped, installed(files))) unpack(files, pkg, pkg.name !== mapped);
    report.packages.push(mapped);
  }
  const result = kernel.snapshot(), finalHistory = result.state.exploration!;
  report.quests = Object.keys(finalHistory.adventure.done).length; report.discoveries = Object.keys(finalHistory.achievements).length; report.puzzles = Object.keys(finalHistory.pipe.solved).length;
  report.notes.push('Completed quests, discoveries and game bests never decrease. Partial adventure objectives use the selected source; they are not combined into invented completions. TuxOS course mastery is unchanged.');
  if (sourceUser !== destination.username) report.notes.push(`Home and ownership map to ${destination.username}. Personal file contents and command history are unchanged.`);
  finalHistory.imports.push({ id, importedAt: options.now, source: kind, report: { notes: report.notes, unsupported: report.unsupported } });
  return { ...report, report, conflicts, alreadyImported, ...output({ username: destination.username, snapshot: result }) };
}

import type { CommandContext, CommandDefinition } from '@tuxos/shell';
import { filesFor } from './apt';
import { CATALOG } from './catalog';
import { PROGRAMS } from './programs';

export type Family = 'fedora' | 'arch';
const ENV = 'TUXOS_PACKAGE_LAB';
const names = ['cowsay', 'cmatrix', 'lolcat', 'neofetch', 'htop', 'firefox', 'gimp', 'vlc', 'git', 'python3', 'steam', 'tree', 'fortune-mod', 'sl'];
const summaries: Record<string, string> = { htop: 'Process viewer', firefox: 'Web browser', gimp: 'Image editor', vlc: 'Media player', git: 'Version control', python3: 'Python interpreter', steam: 'Game platform' };
export const FAMILY_CATALOG = names.map(name => ({ name, summary: CATALOG.find(pkg => pkg.name === name)?.summary ?? summaries[name] ?? name }));
interface Lab { version: 1; installed: string[]; updated: boolean; tasks: string[] }
const fresh = (): Lab => ({ version: 1, installed: [], updated: false, tasks: [] });
function parse(raw: string): Lab {
  const lab = JSON.parse(raw) as Lab;
  if (lab.version !== 1 || !Array.isArray(lab.installed) || lab.installed.length > names.length || !lab.installed.every(name => names.includes(name)) || typeof lab.updated !== 'boolean' || !Array.isArray(lab.tasks) || lab.tasks.some(task => !['search', 'install', 'list', 'remove', 'run', 'update'].includes(task))) throw new Error('Invalid package exercise save. Export a backup before using pkg-lab reset.');
  return lab;
}
function location(ctx: CommandContext, family: Family) { return `/home/${ctx.kernel.user}/.local/share/tuxos/package-labs/${family}.json`; }
function read(ctx: CommandContext, path: string): string | null {
  const result = ctx.dispatch<string>('fs.read', { path });
  if (!result.ok) { if (result.error.code === 'ENOENT') return null; throw new Error(result.error.message); }
  return result.value;
}
function write(ctx: CommandContext, path: string, content: string) {
  const mkdir = ctx.dispatch('fs.mkdir', { path: path.slice(0, path.lastIndexOf('/')), parents: true });
  if (!mkdir.ok) throw new Error(mkdir.error.message);
  const result = ctx.dispatch('fs.write', { path, content }); if (!result.ok) throw new Error(result.error.message);
}
function selected(ctx: CommandContext): Family | undefined {
  const value = ctx.shell.env[ENV]; return value === 'fedora' || value === 'arch' ? value : undefined;
}
const intro = (family: Family) => `Package exercise: ${family === 'fedora' ? 'Fedora / dnf' : 'Arch / pacman'}.\nA separate teaching catalog; the desktop's apt database is unchanged.\n${family === 'fedora' ? 'dnf search cowsay\nsudo dnf install cowsay\ndnf list --installed\nsudo dnf remove cowsay' : 'pacman -Ss cowsay\nsudo pacman -S cowsay\npacman -Q\nsudo pacman -R cowsay'}\nAfter installing: pkg-lab run cowsay hello\nUse pkg-lab status, pkg-lab leave, or pkg-lab reset (with backup).\n`;

/** Each selected exercise has its own tiny package record. No dpkg writes or fake host installation. */
export function familyPracticeCommands(): CommandDefinition[] {
  const locks = new Set<string>();
  return ['pkg-lab', 'dnf', 'pacman'].map(name => ({ name,
    summary: name === 'pkg-lab' ? 'Choose a Fedora or Arch package exercise' : `Practise ${name} in its selected package exercise`,
    usage: name === 'pkg-lab' ? 'pkg-lab fedora|arch|status|leave|reset|restore|run COMMAND' : name === 'dnf' ? 'dnf search|info|install|remove|list|upgrade PACKAGE' : 'pacman -Ss|-Si|-S|-R|-Q|-Syu PACKAGE',
    async run(ctx) {
      const fail = (message: string) => { ctx.stderr(`${name}: ${message}\n`); return 1; };
      if (ctx.args[0] === '--help') { ctx.stdout('Bounded package exercise. Select pkg-lab fedora or pkg-lab arch first. Supported names use a fixed teaching catalog; no real network, dependencies or binaries are installed.\n'); return 0; }
      if (name === 'pkg-lab' && ctx.user !== ctx.kernel.user) return fail('Run pkg-lab as your own user; use sudo only with dnf/pacman package changes.');
      if (name === 'pkg-lab' && ['fedora', 'arch'].includes(ctx.args[0]!) && ctx.args.length === 1) {
        try { const family = ctx.args[0] as Family; const path = location(ctx, family); if (read(ctx, path) === null) write(ctx, path, JSON.stringify(fresh())); ctx.shell.env[ENV] = family; ctx.stdout(intro(family)); return 0; }
        catch (error) { return fail(error instanceof Error ? error.message : String(error)); }
      }
      if (name === 'pkg-lab' && ctx.args[0] === 'leave' && ctx.args.length === 1) { delete ctx.shell.env[ENV]; ctx.stdout('Left the package exercise. Your desktop continues to use apt. Exercise records are saved.\n'); return 0; }
      const family = selected(ctx);
      if (!family) return fail('Choose pkg-lab fedora or pkg-lab arch first. The desktop uses apt.');
      if (name !== 'pkg-lab' && name !== (family === 'fedora' ? 'dnf' : 'pacman')) return fail(`This is the ${family} exercise. Select pkg-lab ${name === 'dnf' ? 'fedora' : 'arch'} to practise ${name}.`);
      const path = location(ctx, family);
      if (locks.has(path)) return fail('Another transaction is awaiting confirmation in this exercise. Finish or cancel it first.');
      locks.add(path);
      try {
        const raw = read(ctx, path);
        if (name === 'pkg-lab' && ['reset', 'restore'].includes(ctx.args[0]!) && ctx.args.length === 1) {
          const undo = read(ctx, path + '.backup');
          if (ctx.args[0] === 'restore' && undo === null) return fail('No exercise backup is available.');
          if (ctx.args[0] === 'restore') parse(undo!);
          if (!ctx.readLine) return fail('Reset and restore require an interactive confirmation.');
          const answer = await ctx.readLine(`${ctx.args[0] === 'reset' ? 'Reset' : 'Restore'} only the ${family} package exercise? Current record will be backed up. [y/N] `);
          if (!/^y(es)?$/i.test(answer ?? '') || ctx.signal?.aborted) return fail('Cancelled.');
          if (read(ctx, path) !== raw) return fail('Exercise changed while confirmation was open. Try again.');
          write(ctx, path + '.backup', raw ?? JSON.stringify(fresh()));
          write(ctx, path, ctx.args[0] === 'restore' ? undo! : JSON.stringify(fresh()));
          ctx.stdout('Exercise restored/reset; previous record is in its .backup file. Personal files, apt, courses and achievements are unchanged.\n'); return 0;
        }
        const lab = raw === null ? fresh() : parse(raw);
        const finish = (task: string) => {
          if (read(ctx, path) !== raw) throw new Error('Exercise changed in another window. Try again.');
          lab.tasks = [...new Set([...lab.tasks, task])]; write(ctx, path, JSON.stringify(lab));
        };
        if (name === 'pkg-lab') {
          if ((!ctx.args.length || ctx.args[0] === 'status') && ctx.args.length <= 1) {
            ctx.stdout(intro(family) + `Completed practice: ${lab.tasks.join(', ') || 'none yet'}\nInstalled: ${lab.installed.join(', ') || 'none'}\n`); return 0;
          }
          if (ctx.args[0] !== 'run' || !ctx.args[1]) return fail('Use pkg-lab fedora|arch|status|leave|reset|restore|run COMMAND.');
          const command = ctx.args[1]!;
          const pkg = CATALOG.find(pkg => pkg.commands.includes(command));
          if (!pkg || !lab.installed.includes(pkg.name) || !PROGRAMS[command]) return fail('This runnable example is not installed in the exercise. Try installing cowsay, then pkg-lab run cowsay hello. Graphical/other catalog entries are package records only.');
          const files = filesFor(ctx);
          // Shared implementations and real user files; the fortune example has a bundled teaching quote.
          const code = await PROGRAMS[command]!({ ...ctx, args: ctx.args.slice(2) }, { ...files, read: path => path === '/usr/share/games/fortunes/fortunes' ? 'Small commands can do big things.\n' : files.read(path) });
          if (code === 0 || (command === 'cmatrix' && code === 130)) finish('run'); return code;
        }
        const yes = ctx.args.includes('-y') || ctx.args.includes('--noconfirm');
        const args = ctx.args.filter(arg => arg !== '-y' && arg !== '--noconfirm');
        const [op, ...targets] = args;
        const action = name === 'dnf' ? ({ search: 'search', info: 'info', install: 'install', remove: 'remove', list: 'list', update: 'update', upgrade: 'update', makecache: 'update' } as Record<string, string>)[op ?? ''] : ({ '-Ss': 'search', '-Si': 'info', '-S': 'install', '-R': 'remove', '-Q': 'list', '-Syu': 'update' } as Record<string, string>)[op ?? ''];
        if (!action) return fail(`Unsupported practice operation. ${name === 'pacman' ? 'Use -Syu for a full upgrade; isolated -Sy is deliberately not taught.' : 'Use search, info, install, remove, list --installed, or upgrade.'}`);
        if (action === 'search') { if (targets.length !== 1) return fail('Provide one search term.'); ctx.stdout(FAMILY_CATALOG.filter(pkg => `${pkg.name} ${pkg.summary}`.toLowerCase().includes(targets[0]!.toLowerCase())).map(pkg => `${pkg.name}\t${pkg.summary}`).join('\n') + '\n'); finish('search'); return 0; }
        if (action === 'info') { const pkg = FAMILY_CATALOG.find(pkg => pkg.name === targets[0]); if (!pkg || targets.length !== 1) return fail('Provide one supported package name.'); ctx.stdout(`${pkg.name}\n${pkg.summary}\nFixed teaching catalog; versions and dependencies are omitted.\n`); return 0; }
        if (action === 'list') {
          if (name === 'dnf' ? targets.join(' ') !== '--installed' : targets.length > 0) return fail(name === 'dnf' ? 'Use dnf list --installed.' : 'Use pacman -Q.');
          ctx.stdout(lab.installed.map(pkg => `${pkg}\tteaching`).join('\n') + '\n'); finish('list'); return 0;
        }
        if (ctx.user !== 'root') return fail('Permission denied. Use sudo for package changes.');
        if (action === 'update') { if (targets.length) return fail('This exercise supports only a full update without package targets.'); lab.updated = true; finish('update'); ctx.stdout('Teaching package database is current. No host packages were updated.\n'); return 0; }
        if (!targets.length || targets.some(target => !names.includes(target))) return fail('Provide supported names from search; no packages were changed.');
        if (action === 'remove' && targets.some(target => !lab.installed.includes(target))) return fail('A requested package is not installed in this exercise.');
        ctx.stdout(`${action === 'install' ? 'Install' : 'Remove'} in ${family} exercise: ${targets.join(', ')}\n`);
        if (!yes && ctx.readLine) { const answer = await ctx.readLine('Proceed? [Y/n] '); if (answer === null || !/^(y(es)?)?$/i.test(answer.trim()) || ctx.signal?.aborted) return fail('Cancelled.'); }
        lab.installed = action === 'install' ? [...new Set([...lab.installed, ...targets])] : lab.installed.filter(pkg => !targets.includes(pkg));
        finish(action); ctx.stdout(`Complete. ${action === 'install' ? 'Try pkg-lab run cowsay hello after installing cowsay.' : 'The selected exercise record was updated.'}\n`); return 0;
      } catch (error) { return fail(error instanceof Error ? error.message : String(error)); }
      finally { locks.delete(path); }
    },
  }));
}

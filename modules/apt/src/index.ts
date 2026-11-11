import type { ModuleContext, ModuleDefinition } from '@tuxos/sdk';
import { aptCommand, dpkgCommand, whichCommand } from './apt';
import { CATALOG } from './catalog';
import { ensureDatabase, type Files } from './dpkg';
import { manifest } from './manifest';
import { familyPracticeCommands } from './family-practice';
import { PROGRAMS, program } from './programs';

export { manifest } from './manifest';

/** The module's own access, as root: only to create dpkg's database on a system that doesn't have one yet. */
function rootFiles(ctx: ModuleContext): Files {
  const run = (type: string, payload: unknown) => {
    const result = ctx.dispatch(type, payload, { user: 'root' });
    if (!result.ok) throw new Error(result.error.message);
  };
  return {
    read(path) {
      const result = ctx.dispatch<string>('fs.read', { path }, { user: 'root' });
      return result.ok ? result.value : undefined;
    },
    write: (path, content) => run('fs.write', { path, content }),
    mkdir: (path) => run('fs.mkdir', { path, parents: true }),
    remove: (path) => run('fs.remove', { path, recursive: true }),
    chmod: (path, mode) => run('fs.chmod', { path, mode }),
  };
}

export const apt: ModuleDefinition = {
  manifest,
  activate(ctx) {
    ensureDatabase(rootFiles(ctx));
    for (const command of familyPracticeCommands()) ctx.registerCommand(command);
    ctx.registerCommand({ name: 'apt', summary: 'Install, remove and search for software packages', usage: 'apt install|remove|search|show|list|update PACKAGE', run: aptCommand('apt') });
    ctx.registerCommand({ name: 'apt-get', summary: 'Install and remove packages (the older apt interface)', usage: 'apt-get install|remove|update PACKAGE', run: aptCommand('apt-get') });
    ctx.registerCommand({ name: 'dpkg', summary: 'List installed packages and the files they own', usage: 'dpkg -l | -L PACKAGE | -s PACKAGE', run: dpkgCommand });
    ctx.registerCommand({ name: 'which', summary: 'Show where a command is installed', usage: 'which COMMAND', run: whichCommand });
    for (const pkg of CATALOG) {
      for (const name of pkg.commands) {
        ctx.registerCommand({
          name, summary: `${pkg.summary} (package ${pkg.name})`, usage: name,
          run: program(name, PROGRAMS[name]!),
          // help and Tab completion only offer it once it is installed.
          available: () => ctx.dispatch('fs.stat', { path: `/usr/bin/${name}` }).ok,
        });
      }
    }
  },
};

export default apt;

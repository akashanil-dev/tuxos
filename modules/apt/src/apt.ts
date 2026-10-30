import { DESKTOP_PACKAGES, desktopReward, REWARDS, unlocked } from '@tuxos/sdk';
// apt, apt-get, dpkg and which, printing what Ubuntu 24.04 prints. Changing packages needs root, so learners
// meet apt's real "are you root?" errors and learn to use sudo.

import type { CommandContext } from '@tuxos/shell';
import { ALL, findPackage, packageForCommand, type Package } from './catalog';
import {
  autoInstalled, fetchLists, filesOf, installed, listsFetched, orphans, removePackage, resolve, stanza, unpack,
  type Files,
} from './dpkg';

const READING = 'Reading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\n';
const MIRROR = 'http://archive.ubuntu.com/ubuntu';
const PRACTICE_MIRROR = 'tuxos://practice-repository';
const mirrorFor = (pkg: Package) => pkg.practice ? PRACTICE_MIRROR : MIRROR;
const TRIGGERS = 'Processing triggers for man-db (2.12.0-4build2) ...\n';
/** Shell builtins have no file in /usr/bin, so `which` finds nothing for them, as in bash. */
const SHELL_BUILTINS = new Set(['cd', 'export', 'help']);

/** The filesystem as the user running the command; failures become exceptions with the kernel's message. */
export function filesFor(ctx: CommandContext): Files {
  const run = (type: string, payload: unknown) => {
    const result = ctx.dispatch(type, payload);
    if (!result.ok) throw new Error(result.error.message);
  };
  return {
    read(path) {
      const result = ctx.dispatch<string>('fs.read', { path });
      return result.ok ? result.value : undefined;
    },
    write: (path, content) => run('fs.write', { path, content }),
    mkdir: (path) => run('fs.mkdir', { path, parents: true }),
    remove: (path) => run('fs.remove', { path, recursive: true }),
    chmod: (path, mode) => run('fs.chmod', { path, mode }),
  };
}

interface Parsed {
  words: string[];
  yes: boolean;
  flags: Set<string>;
}

function parse(args: string[]): Parsed {
  const flags = new Set(args.filter((arg) => arg.startsWith('-')));
  return {
    words: args.filter((arg) => !arg.startsWith('-')),
    yes: ['-y', '--yes', '--assume-yes', '-qy', '-yq'].some((flag) => flags.has(flag)),
    flags,
  };
}

const kb = (value: number) => `${value.toLocaleString('en-US')} kB`;
const debName = (pkg: Package) => `${pkg.name}_${pkg.version.replace(/^\d+:/, '')}_amd64.deb`;
const indent = (names: string[]) => `  ${names.join(' ')}\n`;

/** apt and apt-get refuse to change packages without root, exactly as on Ubuntu. */
function needsRoot(ctx: CommandContext, lock: 'frontend' | 'lists'): number | undefined {
  if (ctx.user === 'root') return undefined;
  if (lock === 'lists') {
    ctx.stdout('Reading package lists... Done\n');
    ctx.stderr('E: Could not open lock file /var/lib/apt/lists/lock - open (13: Permission denied)\nE: Unable to lock directory /var/lib/apt/lists/\n');
  } else {
    ctx.stderr('E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\n'
      + 'E: Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), are you root?\n');
  }
  return 100;
}

/** Human terminals can answer; headless calls must supply stdin or explicitly opt in with -y. */
async function confirm(ctx: CommandContext, tool: string, operation: string, names: string[]): Promise<boolean> {
  if (ctx.readLine) {
    const answer = await ctx.readLine('Do you want to continue? [Y/n] ');
    if (answer !== null && /^(y|yes)?$/i.test(answer.trim()) && !ctx.signal?.aborted) return true;
    ctx.stdout('Abort.\n');
    return false;
  }
  if (ctx.stdin) {
    const answer = ctx.stdin.split(/\r?\n/)[0]!.trim();
    ctx.stdout(`Do you want to continue? [Y/n] ${answer}\n`);
    if (/^(y|yes)?$/i.test(answer)) return true;
    ctx.stdout('Abort.\n');
    return false;
  }
  ctx.stdout('Do you want to continue? [Y/n] Abort.\n');
  ctx.stderr(`No interactive input. To approve in advance: sudo ${tool} ${operation} -y ${names.join(' ')}\n`);
  return false;
}

function databaseCount(have: Set<string>): number {
  return 21_604 + have.size * 7;
}

function update(ctx: CommandContext, files: Files): number {
  const denied = needsRoot(ctx, 'lists');
  if (denied !== undefined) return denied;
  fetchLists(files);
  ctx.stdout(`Hit:1 ${MIRROR} noble InRelease\nGet:2 http://security.ubuntu.com/ubuntu noble-security InRelease [126 kB]\n`
    + `Get:3 ${MIRROR} noble-updates InRelease [126 kB]\nHit:4 ${MIRROR} noble-backports InRelease\n`
    + `Fetched 252 kB in 1s (241 kB/s)\n${READING}All packages are up to date.\n`);
  return 0;
}

function upgrade(ctx: CommandContext): number {
  const denied = needsRoot(ctx, 'frontend');
  if (denied !== undefined) return denied;
  ctx.stdout(`${READING}Calculating upgrade... Done\n0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.\n`);
  return 0;
}

async function install(ctx: CommandContext, files: Files, tool: string, args: string[]): Promise<number> {
  const { words, yes, flags } = parse(args);
  const simulate = flags.has('-s') || flags.has('--simulate') || flags.has('--dry-run');
  const denied = simulate ? undefined : needsRoot(ctx, 'frontend');
  if (denied !== undefined) return denied;
  ctx.stdout(READING);
  // Before `apt update` the lists are empty, so apt knows no package to install: the classic first lesson.
  const unknown = words.filter((name) => !findPackage(name) || (!listsFetched(files) && !installed(files).has(name)));
  if (unknown.length) {
    ctx.stderr(unknown.map((name) => `E: Unable to locate package ${name}\n`).join(''));
    if (!listsFetched(files)) ctx.stderr('Hint: run sudo apt update to load the package catalog, then try again.\n');
    else ctx.stderr('TuxOS has a small practice repository, not the full Ubuntu archive. Use apt list to see supported packages.\n');
    return 100;
  }
  const journey = ctx.kernel.getState().session.journey;
  for (const desktop of DESKTOP_PACKAGES.filter(item => words.includes(item.package))) {
    if (!unlocked(journey, desktopReward(desktop.id))) {
      const milestone = REWARDS.find(item => item.id === desktopReward(desktop.id))!;
      ctx.stderr(`E: ${desktop.name} unlocks after lesson ${milestone.at}. Finish that milestone, then install it.\n`);
      return 100;
    }
  }
  const have = installed(files);
  const plan: Package[] = [];
  for (const name of words) {
    if (have.has(name)) {
      ctx.stdout(`${name} is already the newest version (${findPackage(name)!.version}).\n`);
      continue;
    }
    for (const pkg of resolve(name, new Set([...have, ...plan.map((each) => each.name)]))) plan.push(pkg);
  }
  if (!plan.length) {
    ctx.stdout('0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.\n');
    return 0;
  }
  const extras = plan.filter((pkg) => !words.includes(pkg.name));
  const names = plan.map((pkg) => pkg.name).sort();
  if (extras.length) ctx.stdout(`The following additional packages will be installed:\n${indent(extras.map((pkg) => pkg.name).sort())}`);
  ctx.stdout(`The following NEW packages will be installed:\n${indent(names)}`
    + `0 upgraded, ${plan.length} newly installed, 0 to remove and 0 not upgraded.\n`
    + `Need to get ${kb(plan.reduce((sum, pkg) => sum + pkg.downloadSize, 0))} of archives.\n`
    + `After this operation, ${kb(plan.reduce((sum, pkg) => sum + pkg.installedSize, 0))} of additional disk space will be used.\n`);
  const desktopInstall = plan.some(pkg => DESKTOP_PACKAGES.some(desktop => desktop.package === pkg.name));
  // Like apt, ask only when it installs more than was asked for.
  if (simulate) {
    for (const pkg of plan) ctx.stdout(`Inst ${pkg.name} (${pkg.version})\nConf ${pkg.name} (${pkg.version})\n`);
    return 0;
  }
  if (flags.has('--assume-no')) { ctx.stdout('Abort.\n'); return 1; }
  if (extras.length && !yes && !await confirm(ctx, tool, 'install', words)) return ctx.signal?.aborted ? 130 : 1;
  if (desktopInstall) ctx.stdout('TuxOS desktop installation · simulated downloads and packages\n');
  const total = plan.length * 3;
  let phase = 0;
  const progress = async (label: string) => {
    if (ctx.signal?.aborted) return false;
    if (desktopInstall && ctx.terminal) {
      const percent = Math.floor(++phase / total * 100);
      ctx.stdout(`Progress: [${'#'.repeat(Math.floor(percent / 5)).padEnd(20, '.')} ] ${percent}% ${label}\n`);
      return installationPause(ctx.signal);
    }
    return true;
  };
  const interrupted = () => { ctx.stdout('\nInstallation cancelled. Run the install command again to retry.\n'); return 130; };
  for (const [index, pkg] of plan.entries()) {
    ctx.stdout(`Get:${index + 1} ${mirrorFor(pkg)} noble/${pkg.component} amd64 ${pkg.name} amd64 ${pkg.version} [${kb(pkg.downloadSize)}]\n`);
    if (!await progress('Downloading packages')) return interrupted();
  }
  const fetched = plan.reduce((sum, pkg) => sum + pkg.downloadSize, 0);
  ctx.stdout(`Fetched ${kb(fetched)}${desktopInstall ? ' (simulated)' : ` in 0s (${kb(fetched * 4)}/s)`}\n`);
  for (const pkg of plan) {
    ctx.stdout(`Selecting previously unselected package ${pkg.name}.\n(Reading database ... ${databaseCount(installed(files))} files and directories currently installed.)\n`
      + `Preparing to unpack .../${debName(pkg)} ...\nUnpacking ${pkg.name} (${pkg.version}) ...\n`);
    if (!await progress(`Unpacking ${pkg.name}`)) return interrupted();
  }
  for (const pkg of plan) {
    ctx.stdout(`Setting up ${pkg.name} (${pkg.version}) ...\n`);
    if (!await progress(`Configuring ${pkg.name}`)) return interrupted();
  }
  // Commit only after all staged phases succeed, so Ctrl+C leaves a retryable installation.
  for (const pkg of plan) unpack(files, pkg, !words.includes(pkg.name));
  if (desktopInstall) ctx.stdout('Desktop session registered. Installation complete. Launch it from the learning screen or Settings.\n');
  ctx.stdout(TRIGGERS);
  return 0;
}

/** Installed packages that need `name`, directly or through others: removing it removes them too. */
function dependents(name: string, have: Set<string>): Package[] {
  const found = new Set<string>([name]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const pkg of ALL) {
      if (have.has(pkg.name) && !found.has(pkg.name) && pkg.depends.some((dependency) => found.has(dependency))) {
        found.add(pkg.name);
        grew = true;
      }
    }
  }
  return ALL.filter((pkg) => found.has(pkg.name));
}

async function remove(ctx: CommandContext, files: Files, tool: string, args: string[], purge: boolean, auto = false): Promise<number> {
  const { words, yes, flags } = parse(args);
  const simulate = flags.has('-s') || flags.has('--simulate') || flags.has('--dry-run');
  const denied = simulate ? undefined : needsRoot(ctx, 'frontend');
  if (denied !== undefined) return denied;
  ctx.stdout(READING);
  const have = installed(files);
  const unknown = words.filter((name) => !findPackage(name));
  if (unknown.length) {
    ctx.stderr(unknown.map((name) => `E: Unable to locate package ${name}\n`).join(''));
    return 100;
  }
  const targets: Package[] = auto ? orphans(files) : [];
  for (const name of words) {
    if (!have.has(name)) {
      ctx.stdout(`Package '${name}' is not installed, so not removed\n`);
      continue;
    }
    for (const pkg of dependents(name, have)) if (!targets.includes(pkg)) targets.push(pkg);
  }
  const currentDesktop = DESKTOP_PACKAGES.find(desktop => desktop.id === ctx.kernel.getState().session.desktop);
  if (!simulate && currentDesktop && have.has(currentDesktop.package) && targets.some(pkg => [currentDesktop.package, ...currentDesktop.dependencies].some(name => name === pkg.name))) {
    ctx.stderr('E: This desktop is in use. Switch to another installed desktop before removing it.\n');
    return 100;
  }
  const essential = targets.filter((pkg) => pkg.essential);
  if (essential.length) {
    ctx.stderr(`E: ${essential.map((pkg) => pkg.name).join(', ')} ${essential.length === 1 ? 'is' : 'are'} part of the TuxOS base system and can't be removed here.\n`);
    return 100;
  }
  if (!targets.length) {
    ctx.stdout('0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.\n');
    return 0;
  }
  // What removing these would leave behind, unneeded.
  const autos = autoInstalled(files);
  const remaining = new Set([...have].filter((name) => !targets.some((pkg) => pkg.name === name)));
  const leftovers = auto ? [] : ALL.filter((pkg) => remaining.has(pkg.name) && autos.has(pkg.name)
    && !ALL.some((other) => remaining.has(other.name) && !autos.has(other.name) && needs(other, pkg.name, remaining)));
  if (leftovers.length) {
    ctx.stdout(`The following packages were automatically installed and are no longer required:\n${indent(leftovers.map((pkg) => pkg.name))}`
      + `Use 'sudo ${tool} autoremove' to remove them.\n`);
  }
  const names = targets.map((pkg) => `${pkg.name}${purge ? '*' : ''}`).sort();
  ctx.stdout(`The following packages will be REMOVED:\n${indent(names)}`
    + `0 upgraded, 0 newly installed, ${targets.length} to remove and 0 not upgraded.\n`
    + `After this operation, ${kb(targets.reduce((sum, pkg) => sum + pkg.installedSize, 0))} disk space will be freed.\n`);
  // apt always asks before removing anything.
  if (simulate) {
    for (const pkg of targets) ctx.stdout(`Remv ${pkg.name} [${pkg.version}]\n`);
    return 0;
  }
  if (flags.has('--assume-no')) { ctx.stdout('Abort.\n'); return 1; }
  if (!yes && !await confirm(ctx, tool, auto ? 'autoremove' : purge ? 'purge' : 'remove', words)) return ctx.signal?.aborted ? 130 : 1;
  ctx.stdout(`(Reading database ... ${databaseCount(have)} files and directories currently installed.)\n`);
  for (const pkg of targets) {
    removePackage(files, pkg, purge);
    ctx.stdout(`Removing ${pkg.name} (${pkg.version}) ...\n`);
  }
  if (purge) for (const pkg of targets) ctx.stdout(`Purging configuration files for ${pkg.name} (${pkg.version}) ...\n`);
  ctx.stdout(TRIGGERS);
  return 0;
}

/** Whether `pkg` needs `name`, directly or through installed dependencies. */
function needs(pkg: Package, name: string, have: Set<string>, seen = new Set<string>()): boolean {
  if (seen.has(pkg.name)) return false;
  seen.add(pkg.name);
  return pkg.depends.some((dependency) => dependency === name
    || (have.has(dependency) && needs(findPackage(dependency)!, name, have, seen)));
}

function search(ctx: CommandContext, files: Files, args: string[]): number {
  const term = parse(args).words.join(' ').toLowerCase();
  if (!term) {
    ctx.stderr('E: You must give at least one search pattern\n');
    return 100;
  }
  ctx.stdout('Sorting... Done\nFull Text Search... Done\n');
  const have = installed(files);
  const known = listsFetched(files) ? ALL : ALL.filter((pkg) => have.has(pkg.name));
  for (const pkg of known) {
    if (!`${pkg.name} ${pkg.summary}`.toLowerCase().includes(term)) continue;
    const mark = have.has(pkg.name) ? ',now' : '';
    ctx.stdout(`${pkg.name}/noble${mark} ${pkg.version} amd64${have.has(pkg.name) ? ' [installed]' : ''}\n  ${pkg.summary}\n\n`);
  }
  return 0;
}

function show(ctx: CommandContext, files: Files, args: string[]): number {
  const names = parse(args).words;
  const known = (name: string) => findPackage(name) && (listsFetched(files) || installed(files).has(name));
  const missing = names.filter((name) => !known(name));
  if (!names.length || missing.length) {
    ctx.stderr(`${missing.map((name) => `N: Unable to locate package ${name}\n`).join('')}E: No packages found\n`);
    return 100;
  }
  for (const name of names) {
    const pkg = findPackage(name)!;
    ctx.stdout([
      `Package: ${pkg.name}`, `Version: ${pkg.version}`, `Priority: ${pkg.essential ? 'required' : 'optional'}`,
      `Section: ${pkg.section}`, `Origin: ${pkg.practice ? 'TuxOS practice repository' : 'Ubuntu'}`, `Maintainer: ${pkg.practice ? 'TuxOS teaching repository' : 'Ubuntu Developers <ubuntu-devel-discuss@lists.ubuntu.com>'}`,
      `Installed-Size: ${kb(pkg.installedSize)}`, ...(pkg.depends.length ? [`Depends: ${pkg.depends.join(', ')}`] : []),
      ...(pkg.homepage ? [`Homepage: ${pkg.homepage}`] : []), `Download-Size: ${kb(pkg.downloadSize)}`,
      `APT-Sources: ${mirrorFor(pkg)} noble/${pkg.component} amd64 Packages`, `Description: ${pkg.summary}`, ` ${pkg.description}`,
    ].join('\n') + '\n\n');
  }
  return 0;
}

function list(ctx: CommandContext, files: Files, args: string[]): number {
  const { flags, words } = parse(args);
  ctx.stdout('Listing... Done\n');
  if (flags.has('--upgradable')) return 0;
  const have = installed(files);
  const autos = autoInstalled(files);
  const onlyInstalled = flags.has('--installed');
  const pattern = words[0] ? new RegExp(`^${words[0].replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`) : null;
  for (const pkg of [...ALL].sort((a, b) => a.name.localeCompare(b.name))) {
    const isInstalled = have.has(pkg.name);
    if (onlyInstalled && !isInstalled) continue;
    if (!isInstalled && !listsFetched(files)) continue;
    if (pattern && !pattern.test(pkg.name)) continue;
    const state = isInstalled ? ` [installed${autos.has(pkg.name) ? ',automatic' : ''}]` : '';
    ctx.stdout(`${pkg.name}/noble${isInstalled ? ',now' : ''} ${pkg.version} amd64${state}\n`);
  }
  return 0;
}

const APT_USAGE = `apt 2.7.14 (amd64)
Usage: apt [options] command

apt is a commandline package manager. Most used commands:
  list - list packages based on package names
  search - search in package descriptions
  show - show package details
  install - install packages
  remove - remove packages
  autoremove - automatically remove all unused packages
  update - update list of available packages
  upgrade - upgrade the system by installing/upgrading packages
  purge - remove packages and their configuration files

Changing packages needs root: use sudo, e.g. sudo apt install tree
Start with sudo apt update. Try: sudo apt install cmatrix, then cmatrix.
Options: -y (answer yes), -s (preview install/remove), --assume-no (cancel).
TuxOS uses a small simulated repository. apt list shows the supported packages.
`;

const packageLocks = new WeakSet<CommandContext['kernel']>();

export function aptCommand(tool: 'apt' | 'apt-get') {
  return async (ctx: CommandContext): Promise<number> => {
    // Options may come before the operation too: apt -y install tree.
    const at = ctx.args.findIndex((arg) => !arg.startsWith('-'));
    const operation = at < 0 ? undefined : ctx.args[at];
    const rest = ctx.args.filter((_, index) => index !== at);
    const files = filesFor(ctx);
    if (ctx.args.includes('-h') || ctx.args.includes('--help')) { ctx.stdout(APT_USAGE); return 0; }
    const supported = new Set(['-y', '--yes', '--assume-yes', '-qy', '-yq', '-q', '--installed', '--upgradable', '--assume-no', '-s', '--simulate', '--dry-run']);
    const unsupported = rest.find((arg) => arg.startsWith('-') && !supported.has(arg));
    if (unsupported) {
      ctx.stderr(`E: Option ${unsupported} is not supported by TuxOS. Try ${tool} --help.\n`);
      return 100;
    }
    if (rest.some((arg) => ['-s', '--simulate', '--dry-run'].includes(arg))
      && !['install', 'remove', 'purge', 'autoremove'].includes(operation ?? '')) {
      ctx.stderr('E: TuxOS supports previews for install, remove, purge and autoremove.\n');
      return 100;
    }
    const changes = ['update', 'upgrade', 'full-upgrade', 'dist-upgrade', 'install', 'remove', 'purge', 'autoremove'].includes(operation ?? '');
    if (changes && packageLocks.has(ctx.kernel)) {
      ctx.stderr('E: Another package operation is running. Answer its prompt or cancel it with Ctrl+C, then try again.\n');
      return 100;
    }
    if (changes) packageLocks.add(ctx.kernel);
    try {
      switch (operation) {
        case undefined:
          ctx.stdout(tool === 'apt' ? APT_USAGE : 'apt-get 2.7.14 (amd64)\nUsage: apt-get [options] command\nCommands: update, upgrade, install, remove, purge, autoremove\n');
          return tool === 'apt' ? 0 : 1;
        case 'update': return update(ctx, files);
        case 'upgrade': case 'full-upgrade': case 'dist-upgrade': return upgrade(ctx);
        case 'install': return await install(ctx, files, tool, rest);
        case 'remove': return await remove(ctx, files, tool, rest, false);
        case 'purge': return await remove(ctx, files, tool, rest, true);
        case 'autoremove': return await remove(ctx, files, tool, rest, false, true);
        case 'search': if (tool === 'apt') return search(ctx, files, rest); break;
        case 'show': if (tool === 'apt') return show(ctx, files, rest); break;
        case 'list': if (tool === 'apt') return list(ctx, files, rest); break;
      }
      ctx.stderr(`E: Invalid operation ${operation}\n`);
      return 100;
    } catch (error) {
      ctx.stderr(`E: ${error instanceof Error ? error.message : String(error)}\n`);
      return 100;
    } finally {
      if (changes) {
        packageLocks.delete(ctx.kernel);
        if (ctx.kernel.getState().session.journey) ctx.dispatch('journey.reconcile', {});
      }
    }
  };
}

export function dpkgCommand(ctx: CommandContext): number {
  const files = filesFor(ctx);
  const [action, ...names] = ctx.args;
  const have = installed(files);
  switch (action) {
    case '-l': case '--list': {
      const pattern = names[0] ? new RegExp(`^${names[0].replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`) : null;
      const rows = ALL.filter((pkg) => have.has(pkg.name) && (!pattern || pattern.test(pkg.name)));
      if (!rows.length) {
        ctx.stderr(`dpkg-query: no packages found matching ${names[0]}\n`);
        return 1;
      }
      const width = (pick: (pkg: Package) => string, min: number) => Math.max(min, ...rows.map((pkg) => pick(pkg).length));
      const nameWidth = width((pkg) => pkg.name, 14);
      const versionWidth = width((pkg) => pkg.version, 12);
      ctx.stdout('Desired=Unknown/Install/Remove/Purge/Hold\n'
        + '| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend\n'
        + '|/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)\n'
        + `||/ ${'Name'.padEnd(nameWidth)} ${'Version'.padEnd(versionWidth)} Architecture Description\n`
        + `+++-${'='.repeat(nameWidth)}-${'='.repeat(versionWidth)}-============-${'='.repeat(40)}\n`);
      for (const pkg of rows) ctx.stdout(`ii  ${pkg.name.padEnd(nameWidth)} ${pkg.version.padEnd(versionWidth)} amd64        ${pkg.summary}\n`);
      return 0;
    }
    case '-L': case '--listfiles': case '-s': case '--status': {
      if (!names.length) {
        ctx.stderr(`dpkg-query: error: --${action === '-L' || action === '--listfiles' ? 'listfiles' : 'status'} needs at least one package name argument\n`);
        return 2;
      }
      let code = 0;
      for (const name of names) {
        const pkg = findPackage(name);
        if (!pkg || !have.has(name)) {
          ctx.stderr(action === '-s' || action === '--status'
            ? `dpkg-query: package '${name}' is not installed and no information is available\n`
            : `dpkg-query: package '${name}' is not installed\nUse dpkg --contents (= dpkg-deb --contents) to list archive files contents.\n`);
          code = 1;
          continue;
        }
        ctx.stdout(action === '-s' || action === '--status' ? `${stanza(pkg)}\n` : `/.\n${filesOf(pkg).join('\n')}\n`);
      }
      return code;
    }
    case '-i': case '--install':
      ctx.stderr('dpkg: TuxOS has no .deb files to install; use apt install instead (e.g. sudo apt install tree).\n');
      return 2;
    default:
      ctx.stderr('dpkg: error: need an action option\n\nType dpkg --help for help about installing and deinstalling packages [*];\nUse \'apt\' or \'aptitude\' for user-friendly package management;\nType dpkg -Dhelp for a list of dpkg debug flag values;\nType dpkg --force-help for a list of forcing options;\nType dpkg-deb --help for help about manipulating *.deb files;\n\nOptions marked [*] produce a lot of output - pipe it through \'less\' or \'more\' !\n');
      return 2;
  }
}

export function whichCommand(ctx: CommandContext): number {
  const files = filesFor(ctx);
  const names = ctx.args.filter((arg) => !arg.startsWith('-'));
  const registered = new Set(ctx.shell.commands().map((command) => command.name));
  let code = names.length ? 0 : 1;
  for (const name of names) {
    const pkg = packageForCommand(name);
    const found = pkg ? files.read(`/usr/bin/${name}`) !== undefined : registered.has(name) && !SHELL_BUILTINS.has(name);
    if (found) ctx.stdout(`/usr/bin/${name}\n`);
    else code = 1;
  }
  return code;
}

/** Brief, abortable animation only for interactive desktop installs. */
function installationPause(signal?: AbortSignal): Promise<boolean> {
  return new Promise(resolve => {
    if (signal?.aborted) { resolve(false); return; }
    const finish = (ok: boolean) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve(ok); };
    const abort = () => finish(false);
    const timer = setTimeout(() => finish(true), 160);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

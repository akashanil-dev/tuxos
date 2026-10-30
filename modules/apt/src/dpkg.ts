// dpkg's database, kept where Ubuntu keeps it so learners can look: /var/lib/dpkg/status lists what is
// installed, /var/lib/dpkg/info/<package>.list the files each package owns, /var/lib/apt/extended_states which
// packages came in only as dependencies, and /var/lib/apt/lists the package lists `apt update` downloads.

import { ALL, BASE, findPackage, type Package } from './catalog';

/** The filesystem as the user running the command (root under sudo), so permissions apply. */
export interface Files {
  read(path: string): string | undefined;
  write(path: string, content: string): void;
  mkdir(path: string): void;
  remove(path: string): void;
  chmod(path: string, mode: number): void;
}

export const STATUS = '/var/lib/dpkg/status';
const INFO = '/var/lib/dpkg/info';
const EXTENDED = '/var/lib/apt/extended_states';
const LISTS = '/var/lib/apt/lists';
const RELEASE = `${LISTS}/archive.ubuntu.com_ubuntu_dists_noble_InRelease`;

export const MAINTAINER = 'Ubuntu Developers <ubuntu-devel-discuss@lists.ubuntu.com>';

/** The status-file entry for an installed package, as dpkg writes it. */
export function stanza(pkg: Package): string {
  return [
    `Package: ${pkg.name}`,
    'Status: install ok installed',
    `Priority: ${pkg.essential ? 'required' : 'optional'}`,
    `Section: ${pkg.section}`,
    `Installed-Size: ${pkg.installedSize}`,
    `Maintainer: ${pkg.practice ? 'TuxOS teaching repository' : MAINTAINER}`,
    'Architecture: amd64',
    `Version: ${pkg.version}`,
    ...(pkg.depends.length ? [`Depends: ${pkg.depends.join(', ')}`] : []),
    ...(pkg.essential ? ['Essential: yes'] : []),
    `Description: ${pkg.summary}`,
    ...(pkg.homepage ? [`Homepage: ${pkg.homepage}`] : []),
  ].join('\n');
}

/** A system saved before apt existed has no database yet: give it the base system's. */
export function ensureDatabase(files: Files): void {
  if (files.read(STATUS) !== undefined) return;
  files.mkdir(INFO);
  files.mkdir(LISTS);
  writeStatus(files, BASE.map((pkg) => pkg.name));
}

/** Installed packages, by name. */
export function installed(files: Files): Set<string> {
  return installedNames(files.read(STATUS));
}

export function installedNames(text: string | undefined): Set<string> {
  if (text === undefined) return new Set(BASE.map((pkg) => pkg.name));
  const names = new Set<string>();
  for (const block of text.split(/\n\s*\n/)) {
    const name = /^Package: (.+)$/m.exec(block)?.[1];
    if (name && /^Status: install ok installed$/m.test(block)) names.add(name.trim());
  }
  return names;
}

function writeStatus(files: Files, names: string[]): void {
  const packages = ALL.filter((pkg) => names.includes(pkg.name));
  files.write(STATUS, `${packages.map(stanza).join('\n\n')}\n`);
}

/** Packages that were installed only because something else needed them. */
export function autoInstalled(files: Files): Set<string> {
  const text = files.read(EXTENDED) ?? '';
  return new Set([...text.matchAll(/^Package: (.+)\n(?:.+\n)*?Auto-Installed: 1$/gm)].map((match) => match[1]!.trim()));
}

function writeAuto(files: Files, names: Set<string>): void {
  files.write(EXTENDED, [...names].sort().map((name) => `Package: ${name}\nArchitecture: amd64\nAuto-Installed: 1\n`).join('\n'));
}

/** Whether `apt update` has fetched the package lists; until then apt knows no packages to install. */
export function listsFetched(files: Files): boolean {
  return files.read(RELEASE) !== undefined;
}

export function fetchLists(files: Files): void {
  files.mkdir(LISTS);
  files.write(RELEASE, 'Origin: Ubuntu\nLabel: Ubuntu\nSuite: noble\nVersion: 24.04\nCodename: noble\nArchitectures: amd64\nComponents: main restricted universe multiverse\n');
}

/** The files a package owns once installed. */
export function filesOf(pkg: Package): string[] {
  return [
    ...pkg.commands.map((command) => `/usr/bin/${command}`),
    ...Object.keys(pkg.files ?? {}),
    `/usr/share/doc/${pkg.name}/copyright`,
  ];
}

function parent(path: string): string {
  return path.slice(0, path.lastIndexOf('/')) || '/';
}

/** Unpack a package: its programs (as executable stubs), data files, docs, and its entry in the database. */
export function unpack(files: Files, pkg: Package, auto: boolean): void {
  for (const command of pkg.commands) {
    const path = `/usr/bin/${command}`;
    files.mkdir('/usr/bin');
    // There are no real binaries; the stub says so if anyone reads it, and the command is built into TuxOS.
    files.write(path, `#!/bin/sh\n# ${command}, from the ${pkg.name} package. TuxOS runs it as a built-in program.\n`);
    files.chmod(path, 0o755);
  }
  for (const [path, content] of Object.entries(pkg.files ?? {})) {
    files.mkdir(parent(path));
    files.write(path, content);
  }
  files.mkdir(`/usr/share/doc/${pkg.name}`);
  files.write(`/usr/share/doc/${pkg.name}/copyright`, pkg.practice ? `${pkg.name}: simulated package from the TuxOS teaching repository. No native binary is included.\n` : `${pkg.name} is free software, packaged for Ubuntu by ${MAINTAINER}.\n`);
  files.mkdir(INFO);
  files.write(`${INFO}/${pkg.name}.list`, `${filesOf(pkg).join('\n')}\n`);
  const names = installed(files);
  names.add(pkg.name);
  writeStatus(files, [...names]);
  const autos = autoInstalled(files);
  if (auto) autos.add(pkg.name);
  else autos.delete(pkg.name);
  writeAuto(files, autos);
}

/** Remove a package's files and its entry. Purging also removes its documentation folder. */
export function removePackage(files: Files, pkg: Package, purge: boolean): void {
  for (const path of filesOf(pkg)) {
    if (path.startsWith('/usr/share/doc/') && !purge) continue;
    if (files.read(path) !== undefined) files.remove(path);
  }
  if (purge && files.read(`/usr/share/doc/${pkg.name}/copyright`) === undefined) {
    try { files.remove(`/usr/share/doc/${pkg.name}`); } catch { /* already gone */ }
  }
  if (files.read(`${INFO}/${pkg.name}.list`) !== undefined) files.remove(`${INFO}/${pkg.name}.list`);
  const names = installed(files);
  names.delete(pkg.name);
  writeStatus(files, [...names]);
  const autos = autoInstalled(files);
  autos.delete(pkg.name);
  writeAuto(files, autos);
}

/** The package and everything it needs that isn't installed yet, dependencies first. */
export function resolve(name: string, have: Set<string>): Package[] {
  const order: Package[] = [];
  const visit = (current: string) => {
    if (have.has(current) || order.some((pkg) => pkg.name === current)) return;
    const pkg = findPackage(current);
    if (!pkg) return;
    for (const dependency of pkg.depends) visit(dependency);
    order.push(pkg);
  };
  visit(name);
  return order;
}

/** Auto-installed packages nothing installed needs any more (what `apt autoremove` would remove). */
export function orphans(files: Files): Package[] {
  const have = installed(files);
  const autos = autoInstalled(files);
  const needed = new Set<string>();
  const keep = (name: string) => {
    if (needed.has(name)) return;
    needed.add(name);
    for (const dependency of findPackage(name)?.depends ?? []) keep(dependency);
  };
  for (const name of have) if (!autos.has(name)) keep(name);
  return ALL.filter((pkg) => have.has(pkg.name) && autos.has(pkg.name) && !needed.has(pkg.name));
}

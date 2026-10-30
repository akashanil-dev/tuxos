import { DESKTOP_PACKAGES } from '@tuxos/sdk';
// The packages this pretend Ubuntu 24.04 ("noble") knows about. Each has the details `apt show` prints; its
// commands are written in TypeScript (programs.ts), since there are no real binaries to unpack.

export interface Package {
  name: string;
  /** Abbreviated packages from the TuxOS teaching repository. */
  practice?: boolean;
  version: string;
  section: string;
  /** main for Canonical-supported packages, universe for community ones; shows in apt's output. */
  component: 'main' | 'universe';
  /** One line for search results and `apt list`. */
  summary: string;
  description: string;
  depends: string[];
  /** Kilobytes on disk once installed, and to download. */
  installedSize: number;
  downloadSize: number;
  homepage?: string;
  /** Commands it puts in /usr/bin. */
  commands: string[];
  /** Other files it installs, with their contents. */
  files?: Record<string, string>;
  /** Installed from the start and kept: removing it would break the system or a course. */
  essential?: boolean;
}

const FORTUNES = [
  'Simplicity is prerequisite for reliability.\n\t\t-- Edsger W. Dijkstra',
  'Talk is cheap. Show me the code.\n\t\t-- Linus Torvalds',
  'The best way to predict the future is to invent it.\n\t\t-- Alan Kay',
  'Programs must be written for people to read, and only incidentally for machines to execute.\n\t\t-- Harold Abelson',
  'Any sufficiently advanced technology is indistinguishable from magic.\n\t\t-- Arthur C. Clarke',
  'First, solve the problem. Then, write the code.\n\t\t-- John Johnson',
  'Read the manual. Then read it again.',
  'There is no place like 127.0.0.1',
];

const desktopPackages: Package[] = DESKTOP_PACKAGES.flatMap(desktop => [
  ...desktop.dependencies.map((name, i): Package => ({
    name, practice: true, version: '1.0-tuxos1', section: 'x11', component: 'universe',
    summary: `${name} — ${desktop.name} component`, description: 'Simulated desktop component from the TuxOS teaching repository.',
    depends: [], installedSize: 12000 + i * 1400, downloadSize: 3200 + i * 400, commands: [],
    files: { [`/usr/share/tuxos/desktop-components/${name}`]: `Simulated ${desktop.name} component: ${name}\n` },
  })),
  { name: desktop.package, practice: true, version: '1.0-tuxos1', section: 'metapackages', component: 'universe',
    summary: `${desktop.name} desktop environment`, description: `Installs the ${desktop.name} experience inside TuxOS. The package list and sizes are simplified for practice.`,
    depends: [...desktop.dependencies], installedSize: 450, downloadSize: 35, commands: [],
    files: { [`/usr/share/${desktop.id === 'hyprland' ? 'wayland-sessions' : 'xsessions'}/tuxos-${desktop.id}.desktop`]: `[Desktop Entry]\nName=${desktop.name} (TuxOS)\nType=Application\nComment=Browser simulation; not a native session executable\n` },
  },
]);
export const CATALOG: Package[] = [
  ...desktopPackages,
  {
    name: 'cmatrix', version: '2.0-6', section: 'misc', component: 'universe',
    summary: 'simulates the display from The Matrix',
    description: 'Animated falling characters in your terminal. TuxOS implements a browser version; press Ctrl+C to return to the shell.',
    depends: [], installedSize: 67, downloadSize: 19, commands: ['cmatrix'],
  },
  {
    name: 'tree', version: '2.1.1-2', section: 'utils', component: 'universe',
    summary: 'displays an indented directory tree, in color',
    description: 'Tree is a recursive directory listing command that produces a depth indented listing of files.',
    depends: [], installedSize: 112, downloadSize: 48, homepage: 'https://oldmanprogrammer.net/source.php?dir=projects/tree',
    commands: ['tree'],
  },
  {
    name: 'hello', version: '2.10-3build1', section: 'devel', component: 'main',
    summary: 'example package based on GNU hello',
    description: 'The GNU hello program produces a familiar, friendly greeting. It is the classic first package to install.',
    depends: [], installedSize: 112, downloadSize: 28, homepage: 'https://www.gnu.org/software/hello/',
    commands: ['hello'],
  },
  {
    name: 'cowsay', version: '3.03+dfsg2-8', section: 'games', component: 'universe',
    summary: 'configurable talking cow',
    description: 'Cowsay generates an ASCII picture of a cow saying something provided by the user.',
    depends: ['libtext-charwidth-perl'], installedSize: 93, downloadSize: 18,
    commands: ['cowsay'],
  },
  {
    name: 'libtext-charwidth-perl', version: '0.04-11build3', section: 'perl', component: 'main',
    summary: 'get display widths of characters on the terminal',
    description: 'A Perl module that tells how wide each character is when printed on a terminal.',
    depends: [], installedSize: 34, downloadSize: 9, commands: [],
  },
  {
    name: 'sl', version: '5.02-1', section: 'games', component: 'universe',
    summary: 'Correct you if you type `sl\' by mistake',
    description: 'Sl makes a steam locomotive run across your terminal when you mistype "ls" as "sl".',
    depends: [], installedSize: 60, downloadSize: 13, commands: ['sl'],
  },
  {
    name: 'neofetch', version: '7.1.0-4', section: 'universe/utils', component: 'universe',
    summary: 'Shows Linux System Information with Distribution Logo',
    description: 'Neofetch displays information about your system next to an image of your operating system logo.',
    depends: [], installedSize: 360, downloadSize: 75, homepage: 'https://github.com/dylanaraps/neofetch',
    commands: ['neofetch'],
  },
  {
    name: 'fortune-mod', version: '1:1.99.1-7.3build1', section: 'games', component: 'universe',
    summary: 'provides fortune cookies on demand',
    description: 'The fortune program prints a random, hopefully interesting, adage. Its sayings come from fortune packages such as fortunes-min.',
    depends: ['fortunes-min', 'librecode0'], installedSize: 89, downloadSize: 24,
    commands: ['fortune'],
  },
  {
    name: 'fortunes-min', version: '1:1.99.1-7.3build1', section: 'games', component: 'universe',
    summary: 'Data files containing fortune cookies',
    description: 'A small set of sayings for the fortune program.',
    depends: [], installedSize: 154, downloadSize: 50, commands: [],
    files: { '/usr/share/games/fortunes/fortunes': `${FORTUNES.join('\n%\n')}\n` },
  },
  {
    name: 'librecode0', version: '3.6-26', section: 'libs', component: 'main',
    summary: 'Shared library on which recode is based',
    description: 'A library for converting text between character sets, used by fortune.',
    depends: [], installedSize: 541, downloadSize: 159, commands: [],
  },
  {
    name: 'jq', version: '1.7.1-3build1', section: 'utils', component: 'main',
    summary: 'lightweight and flexible command-line JSON processor',
    description: 'jq is like sed for JSON data: it slices, filters and transforms structured data. This TuxOS jq knows the basic filters: . .key .[n] .[] keys length.',
    depends: ['libjq1', 'libonig5'], installedSize: 102, downloadSize: 65, homepage: 'https://jqlang.github.io/jq/',
    commands: ['jq'],
  },
  {
    name: 'libjq1', version: '1.7.1-3build1', section: 'libs', component: 'main',
    summary: 'lightweight and flexible command-line JSON processor - shared library',
    description: 'The library that does jq\'s work.', depends: ['libonig5'], installedSize: 414, downloadSize: 141, commands: [],
  },
  {
    name: 'libonig5', version: '6.9.9-1build1', section: 'libs', component: 'main',
    summary: 'regular expressions library',
    description: 'Oniguruma, a regular expressions library used by jq.', depends: [], installedSize: 627, downloadSize: 172, commands: [],
  },
];

/** What a fresh system has installed. The commands come with the system (or, for Docker, with Learn Docker). */
export const BASE: Package[] = [
  { name: 'base-files', version: '13ubuntu10', section: 'admin', component: 'main', summary: 'Debian base system miscellaneous files', description: 'The basic filesystem layout of the system.', depends: [], installedSize: 404, downloadSize: 70, commands: [], essential: true },
  { name: 'bash', version: '5.2.21-2ubuntu4', section: 'shells', component: 'main', summary: 'GNU Bourne Again SHell', description: 'The shell you type commands into.', depends: ['base-files'], installedSize: 1708, downloadSize: 794, commands: [], essential: true },
  { name: 'coreutils', version: '9.4-3ubuntu6', section: 'utils', component: 'main', summary: 'GNU core utilities', description: 'The basic file, shell and text manipulation utilities: ls, cp, mv, cat, head, sort...', depends: [], installedSize: 7136, downloadSize: 1413, commands: [], essential: true },
  { name: 'grep', version: '3.11-4build1', section: 'utils', component: 'main', summary: 'GNU grep, egrep and fgrep', description: 'Searches text for lines that match a pattern.', depends: [], installedSize: 1264, downloadSize: 409, commands: [], essential: true },
  { name: 'sudo', version: '1.9.15p5-3ubuntu5', section: 'admin', component: 'main', summary: 'Provide limited super user privileges to specific users', description: 'Runs a command as root.', depends: [], installedSize: 3856, downloadSize: 947, commands: [], essential: true },
  { name: 'docker.io', version: '24.0.7-0ubuntu4', section: 'universe/admin', component: 'universe', summary: 'Linux container runtime', description: 'Docker runs applications in containers. TuxOS keeps it installed for the Learn Docker course.', depends: [], installedSize: 108000, downloadSize: 29000, homepage: 'https://www.docker.com/community-edition', commands: [], essential: true },
];

export const ALL: Package[] = [...BASE, ...CATALOG];

export function findPackage(name: string): Package | undefined {
  return ALL.find((pkg) => pkg.name === name);
}

/** The package that puts this command in /usr/bin, if it is one of ours. */
export function packageForCommand(command: string): Package | undefined {
  return CATALOG.find((pkg) => pkg.commands.includes(command));
}

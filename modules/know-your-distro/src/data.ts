// Family grouping and game artwork adapted from Tuxplore / Know Your Distro.
// This is a family-history game; entries are not recommendations to install an OS.
export const TEAMS = {
  Debian: ['Ubuntu', 'Kali', 'ParrotOS', 'Debian', 'Linux Mint', 'Pop!_OS', 'MX Linux', 'Zorin OS', 'elementary OS', 'Kubuntu', 'Raspberry Pi OS', 'Deepin', 'Tails'],
  'Red Hat': ['Fedora', 'CentOS', 'AlmaLinux', 'RHEL', 'Rocky Linux', 'Oracle Linux'],
  Arch: ['Arch', 'Manjaro', 'EndeavourOS', 'BlackArch', 'ArcoLinux', 'Artix', 'SteamOS'],
  Slackware: ['Slackware', 'Salix OS', 'Absolute Linux'],
  Gentoo: ['Gentoo', 'Funtoo', 'Calculate Linux'],
} as const;
export type Team = keyof typeof TEAMS;
export type Mode = 'Rapid' | 'Infinite';
export const TEAM_NAMES = Object.keys(TEAMS) as Team[];
export const TEAM_COLOR: Record<Team, string> = { Debian: '#d70a53', 'Red Hat': '#ee0000', Arch: '#1793d1', Slackware: '#4b5ea8', Gentoo: '#7a6bb0' };
export const ICONS: Record<string, string> = { Debian: 'debian', Ubuntu: 'ubuntu', Kali: 'kali', ParrotOS: 'parrotos', 'Red Hat': 'red_hat', Fedora: 'fedora', CentOS: 'centos', AlmaLinux: 'almalinux', Arch: 'arch', Manjaro: 'manjaro', EndeavourOS: 'endeavouros', Slackware: 'slackware', 'Salix OS': 'salixos', Gentoo: 'gentoo', Funtoo: 'funtoo', 'Linux Mint': 'mint', 'Pop!_OS': 'popos', 'MX Linux': 'mx', 'Zorin OS': 'zorin', 'elementary OS': 'elementary', Kubuntu: 'kubuntu', 'Raspberry Pi OS': 'raspios', Deepin: 'deepin', Tails: 'tails', RHEL: 'red_hat', 'Rocky Linux': 'rocky', 'Oracle Linux': 'oracle', BlackArch: 'blackarch', ArcoLinux: 'arcolinux', Artix: 'artix', SteamOS: 'steamos', 'Absolute Linux': 'absolute', 'Calculate Linux': 'calculate' };
export const teamOf = (name: string): Team | undefined => TEAM_NAMES.find(team => (TEAMS[team] as readonly string[]).includes(name));
export const FAMILY_NOTES = [
  { text: 'SteamOS here means the current Arch-based generation; early SteamOS was Debian-based.', url: 'https://store.steampowered.com/steamos/?lang=en' },
  { text: 'CentOS is shown in the Red Hat family. CentOS Stream and the former CentOS Linux have different release models.', url: 'https://docs.centos.org/centos-stream-docs/' },
  { text: 'Funtoo is a historical entry. Its official site says the project has ended and the wiki is archived.', url: 'https://www.funtoo.org/' },
  { text: 'Absolute Linux’s site describes a new maintainer and work toward a new release.', url: 'https://www.absolutelinux.org/' },
];

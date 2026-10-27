/** Shared learning milestones. Rewards are cumulative and never removed by practice/retries. */
export const JOURNEY_LESSONS = [
  'first-words', 'moving-around', 'making-things', 'reading-and-searching', 'pipes', 'permissions', 'installing-software',
  'paths-and-layout', 'quoting-and-globs', 'environment-and-status', 'text-pipelines', 'shell-checkpoint',
  'admin-orientation', 'users-and-groups', 'directory-permissions', 'ssh-and-hardening',
  'processes', 'systemd-services', 'journals', 'packages-maintenance', 'boot-and-recovery',
  'network-basics', 'listeners-and-firewall', 'disk-and-memory', 'filesystems-and-lvm', 'network-storage',
  'backup-and-restore', 'cron-scheduling', 'shell-scripting', 'config-management', 'monitoring-and-response',
  'capstone-web', 'capstone-access', 'capstone-recovery',
] as const;
export interface JourneyProgress { lessons: string[]; steps: string[]; acknowledged: string[]; installedDesktops?: string[]; terminal?: { lesson: string; cwd: string; env: Record<string, string> }; }
export const REWARDS = [
  { id: 'first-command', at: 1, title: 'Terminal Explorer', description: 'Your first badge. You can ask Linux who you are and where you are.', icon: '⌘' },
  { id: 'desktop', at: 2, title: 'Hello, KDE!', description: 'You can now install KDE Plasma. Run sudo apt update, then sudo apt install kde-plasma-desktop.', icon: '▦' },
  { id: 'wallpaper', at: 3, title: 'Make it yours', description: 'Choose your wallpaper in Settings. The anniversary edition has its own milestone.', icon: '▧' },
  { id: 'gnome', at: 7, title: 'A new perspective', description: 'Install GNOME with sudo apt install gnome-core, then select it in Settings.', icon: '◉' },
  { id: 'themes', at: 12, title: 'Colour your world', description: 'Personalise desktop colours with palettes in Settings.', icon: '◐' },
  { id: 'anniversary', at: 16, title: 'KDE at 30', description: 'You earned the special KDE 30th Anniversary wallpaper. Apply it whenever you like.', icon: '30' },
  { id: 'hyprland', at: 21, title: 'Think in tiles', description: 'Install Hyprland with sudo apt install hyprland from the TuxOS practice repository.', icon: '▥' },
  { id: 'plugins', at: 26, title: 'Open-source maker', description: 'Install and contribute plugins, add widgets and explore community themes.', icon: '✧' },
  { id: 'cde', at: 31, title: 'Time traveller', description: 'Install the classic desktop with sudo apt install tuxos-cde from the TuxOS practice repository.', icon: '▣' },
  { id: 'complete', at: 34, title: 'Your system. Your freedom.', description: 'Every desktop and customisation is unlocked. Keep experimenting and revisit any lesson.', icon: '★' },
] as const;
export type RewardId = typeof REWARDS[number]['id'];
export function journeyLevel(progress: JourneyProgress): number {
  const next = JOURNEY_LESSONS.findIndex(id => !progress.lessons.includes(id));
  return next < 0 ? JOURNEY_LESSONS.length : next;
}
export function unlocked(progress: JourneyProgress | undefined, reward: RewardId): boolean {
  return !progress || journeyLevel(progress) >= REWARDS.find(r => r.id === reward)!.at;
}
export function desktopReward(desktop: string): RewardId {
  return desktop === 'gnome' ? 'gnome' : desktop === 'hyprland' ? 'hyprland' : desktop === 'cde' ? 'cde' : 'desktop';
}
export const JOURNEY_THEMES = [
  { id: 'journey-breeze', name: 'Breeze Blue', accent: '#3daee9', background: '#232629', surface: '#31363b', foreground: '#eff0f1' },
  { id: 'journey-forest', name: 'Forest', accent: '#83c9a4', background: '#182822', surface: '#263d32', foreground: '#edf7ef' },
  { id: 'journey-violet', name: 'Twilight', accent: '#c4a7e7', background: '#232136', surface: '#393552', foreground: '#e0def4' },
];

/** Desktop packages in TuxOS's teaching repository; dependencies are deliberately abbreviated. */
export const DESKTOP_PACKAGES = [
  { id: 'plasma', name: 'KDE Plasma', package: 'kde-plasma-desktop', dependencies: ['plasma-desktop', 'kwin-x11', 'sddm', 'konsole', 'dolphin'] },
  { id: 'gnome', name: 'GNOME', package: 'gnome-core', dependencies: ['gnome-shell', 'gnome-session', 'gdm3'] },
  { id: 'hyprland', name: 'Hyprland', package: 'hyprland', dependencies: ['waybar', 'xdg-desktop-portal-hyprland'] },
  { id: 'cde', name: 'CDE', package: 'tuxos-cde', dependencies: ['tuxos-dtwm'] },
] as const;
export function desktopReady(progress: JourneyProgress | undefined, desktop = 'plasma'): boolean {
  return !progress || (unlocked(progress, desktopReward(desktop)) && Boolean(progress.installedDesktops?.includes(desktop)));
}
export function desktopsFromStatus(status: string): string[] {
  const packages = new Set(status.split(/\n\s*\n/).filter(block => /^Status: install ok installed$/m.test(block)).map(block => /^Package: (.+)$/m.exec(block)?.[1]?.trim()));
  return DESKTOP_PACKAGES.filter(desktop => [desktop.package, ...desktop.dependencies].every(name => packages.has(name))).map(desktop => desktop.id);
}

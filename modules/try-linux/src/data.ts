import { KernelError } from '@tuxos/kernel';
// Quiz weights retain Tuxplore's four-question selector. Recommendations are preferences,
// not a hardware compatibility test. Descriptions and links reviewed on 2026-11-11.
export const DISTROS = {
  mint: { name: 'Linux Mint', family: 'Debian / Ubuntu', url: 'https://linuxmint.com/download.php', guide: 'https://linuxmint-installation-guide.readthedocs.io/en/latest/', why: 'A traditional desktop to explore if you prefer a familiar panel and application menu. Cinnamon, MATE and lighter Xfce editions offer different tradeoffs.', check: 'Choose an edition and check its current requirements. A lightweight desktop cannot guarantee support for every older computer.' },
  ubuntu: { name: 'Ubuntu', family: 'Debian', url: 'https://ubuntu.com/desktop', guide: 'https://ubuntu.com/desktop/docs/en/latest/tutorial/try-ubuntu-desktop/', why: 'A general-purpose desktop with extensive official documentation and a large community. Its live USB tutorial is a useful starting point.', check: 'Check certified hardware and the image architecture. Apple Silicon needs a different, device-specific route.' },
  fedora: { name: 'Fedora Workstation', family: 'Red Hat', url: 'https://fedoraproject.org/workstation/', guide: 'https://fedoraproject.org/workstation/download/', why: 'A current GNOME desktop with tools for development. Fedora also offers other desktop editions if you prefer a different layout.', check: 'Read the current requirements and release notes. Use Fedora Media Writer and the official verification instructions.' },
  pop: { name: 'Pop!_OS', family: 'Debian / Ubuntu', url: 'https://system76.com/pop', guide: 'https://system76.com/support/install-pop/', why: 'System76’s desktop offers automatic window tiling and a focus on productivity. Its download guide distinguishes generic and NVIDIA images.', check: 'Follow the current hardware, graphics and firmware requirements. Game compatibility depends on the individual game, launcher and anti-cheat support.' },
  endeavour: { name: 'EndeavourOS', family: 'Arch', url: 'https://endeavouros.com/', guide: 'https://discovery.endeavouros.com/', why: 'A terminal-focused Arch-based distribution for people who want to configure and maintain their system. Its documentation covers package management and rolling-release upkeep.', check: 'Expect to read update notices and troubleshoot occasionally. Check hardware support before choosing it for your main computer.' },
  debian: { name: 'Debian', family: 'Debian', url: 'https://www.debian.org/distrib/', guide: 'https://www.debian.org/distrib/', why: 'A community distribution with a stable release and several desktop choices. Live images let you compare GNOME, Xfce and KDE before installing.', check: 'For a live desktop, choose a live ISO rather than the small network installer. Verify the supported architecture and current requirements.' },
} as const;
export type DistroId = keyof typeof DISTROS;
type Choice = { label: string; points: Partial<Record<DistroId, number>> };
export const QUESTIONS: { question: string; choices: Choice[] }[] = [
  { question: 'How do you like your computer?', choices: [
    { label: 'It should just work', points: { mint: 2, ubuntu: 1 } },
    { label: 'I like tweaking a bit', points: { fedora: 2, pop: 1 } },
    { label: 'I want to understand and control everything', points: { endeavour: 3, debian: 1 } },
  ] },
  { question: 'What will you mostly do?', choices: [
    { label: 'Web, school, office work', points: { mint: 2, ubuntu: 1 } },
    { label: 'Gaming', points: { pop: 3, endeavour: 1 } },
    { label: 'Programming', points: { fedora: 2, ubuntu: 1 } },
    { label: 'Revive an old computer', points: { debian: 3, mint: 1 } },
  ] },
  { question: 'What do you use right now?', choices: [
    { label: 'Windows', points: { mint: 2, pop: 1 } },
    { label: 'macOS', points: { fedora: 2, ubuntu: 1 } },
    { label: 'Something else / nothing', points: { ubuntu: 1, debian: 1 } },
  ] },
  { question: 'Updates: newest features or maximum stability?', choices: [
    { label: 'Newest, always', points: { fedora: 2, endeavour: 2 } },
    { label: 'Balanced', points: { ubuntu: 1, pop: 1 } },
    { label: 'Stable and boring is good', points: { debian: 2, mint: 2 } },
  ] },
];
export function recommendation(input: unknown): { answers: number[]; recommendation?: DistroId } {
  if (!Array.isArray(input) || input.length > QUESTIONS.length || Array.from(input).some((answer, index) => !Number.isInteger(answer) || !QUESTIONS[index]?.choices[answer])) throw new KernelError('EINVAL', 'Choose a valid answer for each question.');
  const answers = [...input] as number[];
  if (answers.length !== QUESTIONS.length) return { answers };
  const scores: Partial<Record<DistroId, number>> = {};
  answers.forEach((answer, i) => Object.entries(QUESTIONS[i]!.choices[answer]!.points).forEach(([id, points]) => { const key = id as DistroId; scores[key] = (scores[key] ?? 0) + points; }));
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return { answers, recommendation: ranked[0]![0] as DistroId };
}

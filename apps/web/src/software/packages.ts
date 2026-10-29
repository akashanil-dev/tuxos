import { CATALOG } from '@tuxos/module-apt/catalog';
import { installedNames, STATUS } from '@tuxos/module-apt/dpkg';
import type { SystemClient } from '@tuxos/system';

export const RECIPES: Record<string, { title: string; description: string; category: string; command: string; preview: string; color: string }> = {
  cmatrix: { title: 'Step into The Matrix', description: 'Turn your terminal into a glowing rain of green characters. Stop it whenever you like.', category: 'Just for fun', command: 'cmatrix', preview: '0  1   K   0  1\n1  0   D   1  0\n   1   E      1\n0      0   1   ', color: 'green' },
  cowsay: { title: 'Make a cow talk', description: 'Give a tiny ASCII cow something to say. Your first command can be a joke.', category: 'Just for fun', command: 'cowsay "Hello, KDE!"', preview: ' ______________\n< Hello, KDE! >\n --------------\n        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\       )\\/\\\n                ||----w |\n                ||     ||', color: 'amber' },
  tree: { title: 'See your folders as a tree', description: 'Explore how files fit together with a clear, branching view of your home folder.', category: 'Everyday tools', command: 'tree', preview: '.\n└── Documents\n    ├── ideas.txt\n    └── projects\n        └── hello.sh', color: 'blue' },
  sl: { title: 'All aboard the terminal', description: 'A little locomotive for a classic Linux joke: what happens when you mistype ls?', category: 'Just for fun', command: 'sl', preview: '      ====        ________\n  _D _|  |_______/        |\n   |(_)---  |   H        |\n   /     |  |   H        |\n  |______|__|___H________|\n    O-O-O       O-O-O', color: 'peach' },
  neofetch: { title: 'Meet your Linux system', description: 'See your username, desktop and system details beside colourful ASCII art.', category: 'Everyday tools', command: 'neofetch', preview: '    .--.      you@tuxos\n   |o_o |     OS: TuxOS\n   |:_/ |     Shell: bash\n  //   \\ \\    DE: KDE Plasma\n (|     | )   Ready to explore.', color: 'purple' },
  'fortune-mod': { title: 'A little wisdom, on demand', description: 'Get a short saying from the fortune collection. Run it again for another surprise.', category: 'Just for fun', command: 'fortune', preview: '“The best way to learn\n is to try something.”\n\n$ fortune\nWhat will yours say?', color: 'purple' },
  hello: { title: 'Say hello to free software', description: 'Meet the GNU Hello program and try a friendly first terminal command.', category: 'Learn & explore', command: 'hello', preview: '$ hello\nHello, world!\n\nOne command.\nYour first little program.', color: 'peach' },
  jq: { title: 'Make sense of JSON', description: 'Turn compact data into something readable. Try a small example about Konqi.', category: 'Learn & explore', command: `echo '{"name":"Konqi","likes":["Linux","KDE"]}' | jq .`, preview: '{\n  "name": "Konqi",\n  "likes": [\n    "Linux", "KDE"\n  ]\n}', color: 'blue' },
};
const order = Object.keys(RECIPES);
export const SOFTWARE = CATALOG.filter(pkg => pkg.commands.length > 0).sort((a, b) => (order.indexOf(a.name) < 0 ? 999 : order.indexOf(a.name)) - (order.indexOf(b.name) < 0 ? 999 : order.indexOf(b.name)));
export async function readInstalled(system: SystemClient): Promise<Set<string>> {
  const result = await system.dispatch<string>('fs.read', { path: STATUS });
  if (!result.ok && result.error.code !== 'ENOENT') throw new Error(result.error.message);
  return installedNames(result.ok ? result.value : undefined);
}
/** Use apt itself: dependencies, locks, errors and persistence are identical in both interfaces. */
export async function changePackage(system: SystemClient, name: string, operation: 'install' | 'remove'): Promise<string> {
  if (!SOFTWARE.some(pkg => pkg.name === name)) throw new Error('This package is not in the software collection.');
  const terminal = await system.createTerminal();
  let log = '';
  for (const command of [...(operation === 'install' ? ['sudo apt update'] : []), `sudo apt ${operation} -y ${name}`]) {
    const result = await terminal.run(command);
    log += `$ ${command}\n${result.stdout}${result.stderr}`;
    if (result.code !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || 'The package operation failed.');
  }
  try { await system.flush(); } catch { throw new Error('The package changed, but saving failed. Retry saving before leaving.'); }
  return log;
}

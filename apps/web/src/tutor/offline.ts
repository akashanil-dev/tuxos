// Vasu without AI: when AI is off (Settings → AI) or there is no key, he answers from this offline guide
// instead. It knows the shell's own help for every installed command, explains the learner's last failed
// command from its error, and covers the main topics of the courses. Nothing leaves the browser.

import type { KernelEvent } from '@tuxos/sdk';

export interface GuideCommand {
  name: string;
  summary: string;
  usage?: string;
}

interface ShellRun {
  line: string;
  code: number;
  stderr?: string;
}

/** English words that are also command names: only treated as commands when quoted or alone. */
const AMBIGUOUS = new Set(['help', 'true', 'false', 'sort', 'head', 'tail', 'touch', 'export', 'env', 'timer', 'next', 'task', 'hint', 'answer', 'clear', 'hello', 'tree', 'echo', 'cat', 'plugin', 'fortune']);

const TOPICS: { pattern: RegExp; text: string }[] = [
  {
    pattern: /\b(permissions?|chmod|rwx|octal|755|644|600|read.?only|executable)\b/i,
    text: 'Every file has three sets of permissions: for its **owner**, its **group** and **everyone else**. Each set is '
      + '`r` (read, 4), `w` (write, 2) and `x` (execute, 1). `ls -l` shows them, e.g. `-rw-r--r--`. Change them with '
      + '`chmod`: `chmod 600 file` (owner reads and writes, nobody else), `chmod u+x script.sh` (owner may run it). '
      + 'The chmod Arcade is a good way to practise.',
  },
  {
    pattern: /\b(sudo|root|superuser|admin)\b/i,
    text: '`root` is the administrator and may change anything. Your own user can\'t touch system files such as '
      + '`/etc/shadow`, which keeps mistakes contained. Put `sudo` in front of a command to run it as root, e.g. '
      + '`sudo apt install tree`, and only when it is really needed.',
  },
  {
    pattern: /\b(apt|install(ing)?|packages?|dpkg|uninstall)\b/i,
    text: 'Software comes in packages. First `sudo apt update` fetches the package lists, then '
      + '`sudo apt install tree` installs one and `sudo apt remove tree` removes it. `apt search` and `apt show` '
      + 'tell you what is available. Try `tree`, `cowsay`, `sl` or `neofetch`.',
  },
  {
    pattern: /\b(where am i|director(y|ies)|folders?|navigate|paths?|cd|pwd|home)\b/i,
    text: '`pwd` prints the directory you are in, `ls` lists what is there and `cd name` moves into a directory '
      + '(`cd ..` goes up, `cd` alone goes home, `~`). Paths starting with `/` start at the top of the filesystem. '
      + 'Press Tab to complete names.',
  },
  {
    pattern: /\b(pipe|redirect|grep|\|)\b|>>?/i,
    text: '`|` sends one command\'s output into the next: `ls -l | grep txt`. `>` writes output to a file, replacing '
      + 'it, and `>>` adds to the end: `echo hi > notes.txt`. `&&` runs the next command only if the first worked.',
  },
  {
    pattern: /\b(docker|containers?|images?)\b/i,
    text: 'Open **Learn Docker** for a guided lab. A container is a running copy of an image: `docker run -d -p 8080:80 '
      + 'nginx` starts one, `docker ps` lists them, `docker logs` shows their output and `docker stop` stops them.',
  },
  {
    pattern: /\b(learn|lessons?|courses?|start|begin|beginner|teach)\b/i,
    text: 'Open **Learn Linux** from the desktop: it teaches one command at a time, and checks each task in the '
      + 'Terminal. In a lesson, type `/hint` for a nudge and `/task` to see the task again.',
  },
];

/** Vasu's offline answer to a question, from the commands' help and the learner's recent commands. */
export interface OfflineContext { adventure?: { title: string; task: string; hints: string[] }; adventureComplete?: boolean }
export function offlineAnswer(question: string, commands: GuideCommand[], recent: KernelEvent[], context: OfflineContext = {}): string {
  const asked = question.trim();
  const byName = new Map(commands.map((command) => [command.name, command]));

  if (/\b(fail|failed|wrong|error|didn'?t work|not work|broken|stuck|why)\b/i.test(asked)) {
    const failure = lastFailure(recent);
    if (failure) return explainFailure(failure, byName);
  }

  if (/\b(quest|adventure|hint|what next|next step)\b/i.test(asked)) {
    if (context.adventure) return `**${context.adventure.title}**\n\n${context.adventure.task}\n\n${context.adventure.hints[0] ?? 'Open the adventure journal to review the checklist.'}\n\nType \`hint\` in a desktop Terminal, or open Tux’s Adventure for the full checklist.`;
    return context.adventureComplete ? 'You have finished all ten adventure quests. Open Try Linux for your next step, or Play for more puzzles and courses.' : 'Open **Tux’s Adventure** from Play and prepare its files. In a course terminal, \`/hint\` refers to that course; in an ordinary Terminal, \`hint\` refers to the adventure.';
  }
  if (/\b(copy|paste|clipboard|shortcuts?|switch window|terminal here)\b/i.test(asked)) return 'Copy selected terminal output with Ctrl+C or the browser copy action; Ctrl+C without a selection interrupts a running command. Paste normally, use Tab to complete file names, and Up/Down to recall commands. In Files, **Open terminal here** keeps the current folder. Learning windows have **Focus view** and **Explore desktop** controls. Settings can hide me or change the desktop.';
  if (/\b(vim|nano|editor|quit vim)\b/i.test(asked)) return 'The teaching editors use the same files as Text Editor. In nano, edit normally, then Ctrl+O saves and Ctrl+X exits; visible buttons work too. In Vim, press i to insert, Esc for normal mode, then :wq and Enter to save and exit. :q! discards changes. Unsaved buffers ask before closing the window.';
  if (/\b(dnf|pacman|fedora|arch|package practice)\b/i.test(asked)) return 'Open **Package Practice**, or type \`pkg-lab fedora\` / \`pkg-lab arch\` to choose a separate exercise. Try \`sudo dnf install cowsay\` or \`sudo pacman -S cowsay\`, then \`pkg-lab run cowsay hello\`. The desktop keeps using apt; each exercise has its own package record. \`pkg-lab leave\` exits the exercise.';

  const quoted = [...asked.matchAll(/[`'"“‘]([a-z][\w.-]*)[`'"”’]/gi)].map((match) => match[1]!.toLowerCase());
  const words = asked.toLowerCase().match(/[a-z][\w.-]*/g) ?? [];
  const alone = words.length === 1 ? words : [];
  const mentioned = [...new Set([...quoted, ...alone, ...words.filter((word) => !AMBIGUOUS.has(word))])]
    .map((word) => byName.get(word)).filter((command): command is GuideCommand => !!command).slice(0, 3);
  if (mentioned.length) return mentioned.map(describe).join('\n\n');

  const topic = TOPICS.find((candidate) => candidate.pattern.test(asked));
  if (topic) return topic.text;

  if (/\b(commands?|what can i|list)\b/i.test(asked)) {
    return `These commands are installed: ${commands.map((command) => `\`${command.name}\``).join(', ')}. `
      + 'Ask me about any of them, or type `help` in the Terminal.';
  }
  return 'I\'m working offline right now (AI is off), so I answer from my guide. Ask me what a command does '
    + '("what does `ls` do?"), why your last command failed, or about permissions, sudo, apt, paths or pipes. '
    + 'Type `help` in the Terminal to see every command.';
}

function describe(command: GuideCommand): string {
  return `\`${command.name}\`: ${command.summary}.${command.usage ? ` Usage: \`${command.usage}\`` : ''}`;
}

function lastFailure(recent: KernelEvent[]): ShellRun | undefined {
  for (const event of [...recent].reverse()) {
    if (event.action.type !== 'shell.ran' || event.actor.kind !== 'user' || !event.ok) continue;
    const run = event.action.payload as ShellRun;
    return run.code === 0 ? undefined : run;
  }
  return undefined;
}

function explainFailure(run: ShellRun, byName: Map<string, GuideCommand>): string {
  const program = run.line.trim().split(/\s+/).find((word) => word !== 'sudo') ?? '';
  const error = (run.stderr ?? '').trim().split('\n')[0] ?? '';
  const said = error ? ` It said: \`${error.slice(0, 160)}\`.` : '';
  const usage = byName.get(program)?.usage;
  const how = usage ? ` Its usage is \`${usage}\`.` : '';
  if (/command .*not found|command not found/i.test(error) || run.code === 127) {
    const suggestion = (run.stderr ?? '').split('\n').find(line => /^(Windows habit|Did you mean|sudo apt install)/.test(line));
    return `\`${run.line}\` could not find that command.${said} ${suggestion ? `The shell suggests: ${suggestion}. ` : ''}Read \`man COMMAND\`, check spelling with Tab, or type \`help\`. Suggestions are not run automatically.`;
  }
  if (/permission denied|operation not permitted/i.test(error)) {
    return `\`${run.line}\` was refused: your user isn't allowed to do that.${said} Run \`ls -l\` on the file to `
      + 'see its permissions and owner. For a file you own, `chmod` can change them; for system files, use `sudo` '
      + 'if you really need to.';
  }
  if (/no such file or directory/i.test(error)) {
    return `\`${run.line}\` couldn't find a file or directory.${said} Check where you are with \`pwd\`, look `
      + 'with `ls`, and use Tab to complete names so they are spelled exactly (Linux names are case-sensitive).';
  }
  if (/missing operand|requires an argument|usage:/i.test(error)) {
    return `\`${program}\` needs more to work with.${said}${how}`;
  }
  if (/invalid option|unrecognized option/i.test(error)) {
    return `\`${program}\` doesn't have that option.${said}${how}`;
  }
  return `\`${run.line}\` ended with an error (exit status ${run.code}).${said}${how} Read the message closely: it `
    + 'usually names the file or option that was the problem.';
}

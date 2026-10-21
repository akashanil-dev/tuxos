// Vasi without AI: when AI is off (Settings → AI) or there is no key, he answers from this offline guide
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

/** Vasi's offline answer to a question, from the commands' help and the learner's recent commands. */
export function offlineAnswer(question: string, commands: GuideCommand[], recent: KernelEvent[]): string {
  const asked = question.trim();
  const byName = new Map(commands.map((command) => [command.name, command]));

  if (/\b(fail|failed|wrong|error|didn'?t work|not work|broken|stuck|why)\b/i.test(asked)) {
    const failure = lastFailure(recent);
    if (failure) return explainFailure(failure, byName);
  }

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
  if (/command not found/i.test(error)) {
    return `\`${run.line}\` failed because there is no \`${program}\` command.${said} Check the spelling, or type `
      + '`help` to see the commands. If it is a program you can install, run `sudo apt update` and then '
      + `\`sudo apt install ${program}\`.`;
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

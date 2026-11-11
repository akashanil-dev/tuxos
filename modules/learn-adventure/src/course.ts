// Adapted from Tuxplore quests.js. See docs/migration/licenses/Tuxplore-LICENSE.txt.
import type { Course, Condition, Step } from '@tuxos/lessons';
const step = (id: string, task: string, hint: string, check: Condition): Step => ({ id, task, hints: [hint], check });
const cmd = (command: string): Condition => ({ ran: { command, succeeded: true } });
const fact = (name: string): Condition => ({ fact: name });
export const course: Course = {
  id: 'learn-adventure', title: 'Tux’s Adventure', summary: 'Rescue the Kernel Crown in ten quests. Explore at your own pace; your other courses keep their own progress.',
  lessons: [
    { id: 'hello', title: 'Hello, Terminal', story: 'The terminal is a way to talk to your computer by typing. It is just a conversation. Open Terminal and ask three simple questions.', steps: [
      step('who', 'Ask who you are: whoami', 'Type whoami and press Enter.', cmd('whoami')),
      step('where', 'Ask where you are: pwd', 'pwd means “print working directory”. It shows your current folder.', cmd('pwd')),
      step('look', 'Look around: ls', 'ls lists the files in the current folder.', cmd('ls')),
    ], solution: ['whoami', 'pwd', 'ls'] },
    { id: 'letter', title: 'A Letter from Tux', story: 'Tux needs your help! Read welcome.txt in your home folder. cat is short for concatenate. You can also read the letter in Files.', steps: [
      step('letter', 'Read the letter: cat ~/welcome.txt', 'Type cat ~/welcome.txt. Tab completes file names. A preview in Files counts too.', fact('read-letter')),
    ], solution: ['cat ~/welcome.txt'] },
    { id: 'dungeon', title: 'Into the Dungeon', story: 'Folders are called directories. Move with cd (change directory). Hidden file names start with a dot; plain ls does not show them.', steps: [
      step('enter', 'Enter the dungeon: cd ~/dungeon', 'Type cd ~/dungeon. cd .. goes back up.', { cwd: '~/dungeon' }),
      step('hidden', 'Reveal hidden files: ls -a', 'Inside the dungeon, type ls -a. The -a option means all.', fact('listed-hidden')),
      step('map', 'Read the hidden map', 'The file is .map, including the dot: cat .map', fact('read-map')),
    ], solution: ['cd ~/dungeon', 'ls -a', 'cat .map'] },
    { id: 'library', title: 'The Library', story: 'The gate needs a secret word hidden in one of a dozen books. grep searches inside files; -r searches every file in a directory.', steps: [
      step('secret', 'Find the secret word with grep', 'From the dungeon: grep -r secret library', { ran: { command: 'grep', succeeded: true, stdout: 'freedom' } }),
    ], solution: ['grep -r secret ~/dungeon/library'] },
    { id: 'gate', title: 'The Locked Gate', story: 'gate.sh is a practice script. Linux requires execute permission (x) to run a file. ls -l shows permissions; chmod changes them.', steps: [
      step('execute', 'Make the gate runnable: chmod +x gate.sh', 'Try ./gate.sh first, then chmod +x gate.sh and compare ls -l.', fact('gate-executable')),
      step('open', 'Open the gate with the secret word', 'From the dungeon: ./gate.sh freedom', { exists: '~/dungeon/crypt', kind: 'dir' }),
    ], solution: ['chmod +x ~/dungeon/gate.sh', '~/dungeon/gate.sh freedom'] },
    { id: 'goblins', title: 'Goblin Trouble', story: 'Goblins block the stairs. rm removes files; * matches file names. Practise only inside the crypt. Adventure recovery can restore its practice files.', steps: [
      step('remove', 'Remove every goblin', 'cd ~/dungeon/crypt, then rm goblins/*', fact('goblins-gone')),
      step('stairs', 'Take the stairs: ./stairs.sh', 'From the crypt, type ./stairs.sh after removing the goblins.', fact('stairs')),
    ], solution: ['cd ~/dungeon/crypt', 'rm goblins/*', './stairs.sh'] },
    { id: 'crown', title: 'The Superuser', story: 'The crown belongs to root, the administrator. sudo runs one command as root. Permission denied explains when that extra power is needed.', steps: [
      step('read', 'Read the crown: sudo cat /root/crown.txt', 'Try cat /root/crown.txt, then add sudo in front.', fact('read-crown')),
      step('folder', 'Make a trophies folder in your home', 'mkdir ~/trophies', { exists: '~/trophies', kind: 'dir' }),
      step('copy', 'Copy the crown into it', 'sudo cp /root/crown.txt ~/trophies/', { exists: '~/trophies/crown.txt', kind: 'file' }),
    ], solution: ['sudo cat /root/crown.txt', 'mkdir ~/trophies', 'sudo cp /root/crown.txt ~/trophies/'] },
    { id: 'pipes', title: 'The Plumber', story: 'Small tools become powerful when joined with pipes |. Each command sends its output into the next. Practise in Pipe Dream, then use the terminal.', steps: [
      step('puzzles', 'Solve three levels in Pipe Dream', 'Open Pipe Dream from the button below. Any three levels count, including earlier solves.', fact('three-puzzles')),
      step('log', 'Count ERROR lines in /var/log/syslog with a pipe', 'grep ERROR /var/log/syslog | wc -l. A count of zero is valid when this log has no ERROR lines.', fact('count-errors')),
    ], solution: [{ open: 'pipe-dream' }, 'grep ERROR /var/log/syslog | wc -l'] },
    { id: 'packages', title: 'The App Store', story: 'Package managers install software from repositories. This desktop uses apt. Fedora uses dnf and Arch uses pacman; their practice modes are separate.', steps: [
      step('install', 'Install cowsay', 'sudo apt update, then sudo apt install cowsay. Answer y if asked.', fact('cowsay-installed')),
      step('cow', 'Make the cow talk', 'cowsay Hello! Bonus: fortune | cowsay', cmd('cowsay')),
    ], solution: ['sudo apt update', 'sudo apt install -y cowsay', 'cowsay Hello!'] },
    { id: 'graduate', title: 'Graduation', story: 'You rescued the crown and practised navigation, permissions, search, pipes and packages. Show your system with neofetch, then explore the real Linux guide.', steps: [
      step('show', 'Show off: neofetch', 'Install it with sudo apt install neofetch if needed, then run neofetch.', cmd('neofetch')),
      step('guide', 'Open Try Linux', 'Use the Try Linux button below for distributions, virtual machines and USB guidance.', { opened: 'try-linux' }),
    ], solution: ['sudo apt install -y neofetch', 'neofetch', { open: 'try-linux' }] },
  ],
};

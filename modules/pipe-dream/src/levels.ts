// Adapted from Tuxplore; see docs/migration/licenses/Tuxplore-LICENSE.txt.
export const LEVELS = [
    {
      id: 'fruit', title: 'Pick the apples', file: 'fruits.txt',
      story: 'grep keeps only the lines that contain a word. Keep every line that mentions apple.',
      input: 'apple\nbanana\ncherry\npineapple\nbanana bread\napple pie\nkiwi',
      solution: [['grep', 'apple']],
      blocks: [['grep', 'apple'], ['grep', 'banana'], ['sort'], ['wc', '-l']],
    },
    {
      id: 'abc', title: 'Alphabet soup', file: 'names.txt',
      story: 'sort puts lines in alphabetical order.',
      input: 'tux\nlinus\nada\ngrace\nken\ndennis',
      solution: [['sort']],
      blocks: [['sort'], ['sort', '-r'], ['head', '-3'], ['rev']],
    },
    {
      id: 'count', title: 'How bad is it?', file: 'server.log',
      story: 'Chain two tools: find the ERROR lines, then count them with wc -l.',
      input: 'INFO boot ok\nERROR disk full\nINFO user login\nERROR network down\nWARN slow\nERROR fan on fire\nINFO all good',
      solution: [['grep', 'ERROR'], ['wc', '-l']],
      blocks: [['grep', 'ERROR'], ['grep', 'INFO'], ['wc', '-l'], ['sort'], ['head', '-1']],
    },
    {
      id: 'dedupe', title: 'Seeing double', file: 'guests.txt',
      story: 'uniq removes repeated lines, but only when they are next to each other. Get a clean, sorted guest list.',
      input: 'mint\narch\nmint\nfedora\narch\ndebian\nmint',
      solution: [['sort'], ['uniq']],
      blocks: [['uniq'], ['sort'], ['sort', '-r'], ['wc', '-l'], ['tail', '-2']],
    },
    {
      id: 'top3', title: 'High scores', file: 'scores.txt',
      story: 'sort -n sorts numbers properly (so 9 comes before 10). -r reverses. Show the top 3 scores, highest first.',
      input: '42 tux\n9 gnu\n100 linus\n77 ada\n10 grace\n88 ken',
      solution: [['sort', '-rn'], ['head', '-3']],
      blocks: [['sort'], ['sort', '-n'], ['sort', '-rn'], ['head', '-3'], ['tail', '-3']],
    },
    {
      id: 'shout', title: 'LOUD NOISES', file: 'chat.txt',
      story: 'tr translates characters. tr a-z A-Z turns lowercase into uppercase. Shout only the lines about linux.',
      input: 'i love linux\nwhat is for lunch\nlinux runs everywhere\ncats are great',
      solution: [['grep', 'linux'], ['tr', 'a-z', 'A-Z']],
      blocks: [['tr', 'a-z', 'A-Z'], ['grep', 'linux'], ['grep', '-v', 'linux'], ['rev'], ['sort']],
    },
    {
      id: 'logins', title: 'Who logged in?', file: 'events.csv',
      story: 'cut -d, -f1 keeps only the first column of comma-separated lines. List each person who logged in, once, in order.',
      input: 'sam,09:00,login\nalex,09:05,logout\nkim,09:10,login\nsam,09:30,login\nalex,10:00,login\nkim,11:00,logout',
      solution: [['grep', 'login'], ['cut', '-d,', '-f1'], ['sort'], ['uniq']],
      blocks: [['grep', 'logout'], ['grep', ',login'], ['grep', 'login'], ['cut', '-d,', '-f1'], ['cut', '-d,', '-f2'], ['sort'], ['uniq']],
    },
    {
      id: 'popular', title: 'Distro election', file: 'votes.txt',
      story: 'The classic: sort | uniq -c | sort -rn counts how often each line appears, most popular first. Find the winner (just the top line).',
      input: 'mint\narch\nfedora\nmint\ndebian\narch\nmint\nubuntu\narch\nmint',
      solution: [['sort'], ['uniq', '-c'], ['sort', '-rn'], ['head', '-1']],
      blocks: [['sort'], ['uniq', '-c'], ['sort', '-rn'], ['head', '-1'], ['uniq'], ['tail', '-1'], ['wc', '-l']],
    },
  ] as const;
export const MAX_STAGES = 6;

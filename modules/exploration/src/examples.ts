export const EXAMPLES: Record<string, string> = {
  whoami: 'whoami', pwd: 'pwd', ls: 'ls -la', cd: 'cd ~/Documents', cat: 'cat welcome.txt',
  mkdir: 'mkdir projects', touch: 'touch notes.txt', echo: 'echo hello', cp: 'cp notes.txt backup.txt', mv: 'mv old.txt new.txt',
  rm: 'rm unwanted.txt', rmdir: 'rmdir empty-folder', grep: 'grep ERROR server.log', sort: 'sort names.txt', uniq: 'sort names.txt | uniq',
  wc: 'cat notes.txt | wc -l', head: 'head -n 3 notes.txt', tail: 'tail -n 3 notes.txt', tr: 'echo linux | tr a-z A-Z',
  cut: "cut -d, -f1 events.csv", rev: 'echo linux | rev', chmod: 'chmod +x script.sh', sudo: 'sudo cat /etc/shadow',
  apt: 'sudo apt update', dpkg: 'dpkg -l', help: 'help', man: 'man grep', whatis: 'whatis chmod', clear: 'clear',
  export: 'export PROJECT=tuxos', env: 'env', printenv: 'printenv HOME', history: 'history', uname: 'uname -a',
  date: 'date', hostname: 'hostname', id: 'id', tree: 'tree ~/Documents', find: 'find . -name notes.txt',
  cowsay: 'cowsay hello', fortune: 'fortune', neofetch: 'neofetch', sl: 'sl', cmatrix: 'cmatrix',
  docker: 'docker ps', ps: 'ps aux', kill: 'kill 1234', nano: 'nano notes.txt', vim: 'vim notes.txt',
};

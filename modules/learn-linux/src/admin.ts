import type { DispatchResult, ModuleContext } from '@tuxos/sdk';

/** A deliberately bounded training machine. It never executes host commands or sends network traffic. */
interface Machine {
  version: 1;
  users: Record<string, { uid: number; groups: string[] }>;
  groups: string[];
  services: Record<string, { active: boolean; enabled: boolean; log: string[] }>;
  processes: { pid: number; user: string; command: string }[];
  firewall: { enabled: boolean; rules: string[] };
  cron: Record<string, string>;
}
interface Shell {
  args: string[]; stdin: string; user: string;
  stdout(text: string): void; stderr(text: string): void;
  resolve(path: string): string;
  dispatch<R>(type: string, payload: unknown): DispatchResult<R>;
}
export const adminCommands = [
  ['lab', 'Inspect or reset the simulated administration machine'],
  ['hostname', 'Show the training hostname'],
  ['id', 'Inspect a training account'], ['useradd', 'Create a training account'],
  ['groupadd', 'Create a training group'], ['usermod', 'Add a training account to a group'],
  ['ps', 'List simulated processes'], ['kill', 'Signal a simulated process'],
  ['systemctl', 'Inspect and manage simulated services'], ['journalctl', 'Read the simulated service journal'],
  ['ip', 'Inspect training addresses and routes'], ['ss', 'Inspect simulated listening sockets'],
  ['ping', 'Test reachability inside the training network'],
  ['df', 'Inspect training filesystem capacity'], ['lsblk', 'Inspect the training disk layout'],
  ['free', 'Inspect training memory usage'], ['ufw', 'Manage the training firewall'],
  ['crontab', 'Install or inspect a simulated cron schedule'],
  ['tar', 'Archive and restore virtual text files (training format)'],
].map(([name, summary]) => ({ name: name!, summary: summary! }));

function fresh(user: string): Machine {
  return {
    version: 1,
    users: { root: { uid: 0, groups: ['root'] }, [user]: { uid: 1000, groups: [user, 'sudo'] } },
    groups: ['root', user, 'sudo'],
    services: {
      nginx: { active: false, enabled: false, log: ['nginx: service stopped; no listener on port 80'] },
      ssh: { active: true, enabled: true, log: ['ssh: listening on port 22'] },
      cron: { active: true, enabled: true, log: ['cron: scheduler started'] },
    },
    processes: [{ pid: 1, user: 'root', command: 'systemd' }, { pid: 420, user, command: 'report-worker' }],
    firewall: { enabled: false, rules: [] }, cron: {},
  };
}

export function activateAdmin(ctx: ModuleContext): void {
  const dir = `/home/${ctx.user}/.local/share/tuxos/admin`;
  const path = `${dir}/machine.json`;
  let machine = fresh(ctx.user);
  const saved = ctx.dispatch<string>('fs.read', { path });
  if (saved.ok) {
    try {
      const parsed = JSON.parse(saved.value) as Machine;
      if (parsed.version === 1 && parsed.users && parsed.groups && parsed.services && parsed.processes && parsed.firewall && parsed.cron) machine = parsed;
    } catch { /* A damaged training snapshot starts a new sandbox. */ }
  }
  const persist = () => {
    ctx.dispatch('fs.mkdir', { path: dir, parents: true });
    ctx.dispatch('fs.write', { path, content: JSON.stringify(machine) });
  };
  for (const { name, summary } of adminCommands) ctx.registerCommand({
    name, summary, usage: `${name} --help`,
    run(shell: Shell) {
      const out = (text: string, code = 0) => { shell.stdout(`${text}\n`); return code; };
      const fail = (text: string) => { shell.stderr(`${name}: ${text}\n`); return 1; };
      const root = () => { if (shell.user !== 'root') throw new Error('Permission denied; use sudo for this administration change'); };
      const args = shell.args;
      const usage: Record<string, string> = {
        lab: 'lab status | lab reset (resets only the administration sandbox)',
        hostname: 'hostname', id: 'id [USER]', useradd: 'sudo useradd -m USER',
        groupadd: 'sudo groupadd GROUP', usermod: 'sudo usermod -aG GROUP USER',
        ps: 'ps [aux]', kill: 'kill [-TERM|-15|-KILL|-9] PID',
        systemctl: 'systemctl status|is-active|is-enabled UNIT; sudo systemctl start|stop|restart|enable|disable UNIT',
        journalctl: 'journalctl -u UNIT [-n NUMBER]', ip: 'ip addr | ip route', ss: 'ss -tln',
        ping: 'ping -c 1 192.0.2.1 (training gateway) or server.lab (training DNS)',
        df: 'df -h | df -i', lsblk: 'lsblk', free: 'free -h',
        ufw: 'sudo ufw allow 22/tcp|80/tcp|443/tcp; sudo ufw enable|disable; ufw status',
        crontab: 'crontab FILE | crontab -l | crontab -r (stores schedules; no clock execution)',
        tar: 'tar -cf ARCHIVE FILE... | tar -tf ARCHIVE | tar -xf ARCHIVE -C DIRECTORY (virtual text files only)',
      };
      if (args[0] === '--help') return out(`${usage[name]}\nTuxOS simulation: ${name === 'tar' ? 'archives use a JSON teaching format, not real tar bytes.' : 'this command affects only the training machine.'}`);
      try {
        let code: number;
        switch (name) {
          case 'lab':
            if (args.length !== 1 || !['status', 'reset'].includes(args[0]!)) return fail(usage[name]!);
            if (args[0] === 'reset') machine = fresh(ctx.user);
            code = out(`${args[0] === 'reset' ? 'Reset complete. ' : ''}Administration sandbox: server.lab\nSimulated accounts, services, processes, network, disks and schedules. No host or network access.\nUse --help on a command for its supported subset.`); break;
          case 'hostname':
            return args.length ? fail(usage[name]!) : out('server.lab');
          case 'id': {
            if (args.length > 1 || args[0]?.startsWith('-')) return fail(usage[name]!);
            const user = args[0] ?? shell.user, account = machine.users[user];
            return account ? out(`uid=${account.uid}(${user}) gid=${account.uid}(${user}) groups=${account.groups.join(',')}`) : fail(`${user}: no such training user`);
          }
          case 'groupadd': {
            root(); const group = args[0];
            if (args.length !== 1 || !validName(group)) return fail(usage[name]!);
            if (machine.groups.includes(group!)) return fail(`group '${group}' already exists`);
            machine.groups.push(group!); code = 0; break;
          }
          case 'useradd': {
            root(); const user = args[1];
            if (args.length !== 2 || args[0] !== '-m' || !validName(user)) return fail(usage[name]!);
            if (machine.users[user!]) return fail(`user '${user}' already exists`);
            machine.users[user!] = { uid: Math.max(...Object.values(machine.users).map((u) => u.uid)) + 1, groups: [user!] };
            if (!machine.groups.includes(user!)) machine.groups.push(user!);
            code = 0; break;
          }
          case 'usermod': {
            root(); const [, group, user] = args;
            if (args.length !== 3 || args[0] !== '-aG') return fail(usage[name]!);
            if (!machine.groups.includes(group!)) return fail(`group '${group}' does not exist`);
            if (!machine.users[user!]) return fail(`user '${user}' does not exist`);
            machine.users[user!]!.groups = [...new Set([...machine.users[user!]!.groups, group!])]; code = 0; break;
          }
          case 'ps': {
            if (args.length && args.join(' ') !== 'aux') return fail(usage[name]!);
            const serviceProcesses = Object.entries(machine.services).filter(([, s]) => s.active).map(([unit], i) => `root ${800 + i} ${unit}`);
            return out(['USER PID COMMAND', ...machine.processes.map((p) => `${p.user} ${p.pid} ${p.command}`), ...serviceProcesses].join('\n'));
          }
          case 'kill': {
            const signal = args.length === 2 ? args[0] : '-TERM';
            const pid = Number(args.at(-1));
            if (![1, 2].includes(args.length) || !['-TERM', '-15', '-KILL', '-9'].includes(signal!) || !Number.isInteger(pid)) return fail(usage[name]!);
            const proc = machine.processes.find((p) => p.pid === pid);
            if (!proc) return fail('no such controllable process; use systemctl for services');
            if (pid === 1) return fail('PID 1 is protected in this sandbox');
            if (proc.user !== shell.user) root();
            machine.processes = machine.processes.filter((p) => p.pid !== pid); code = 0; break;
          }
          case 'systemctl': {
            const [action, rawUnit] = args, unit = rawUnit?.replace(/\.service$/, ''), service = unit && machine.services[unit];
            if (args.length !== 2) return fail(usage[name]!);
            if (!service) return fail(`Unit ${rawUnit} could not be found`);
            if (action === 'status') return out(`${unit}.service\nLoaded: loaded; ${service.enabled ? 'enabled' : 'disabled'}\nActive: ${service.active ? 'active (running)' : 'inactive (dead)'}`, service.active ? 0 : 3);
            if (action === 'is-active') return out(service.active ? 'active' : 'inactive', service.active ? 0 : 3);
            if (action === 'is-enabled') return out(service.enabled ? 'enabled' : 'disabled', service.enabled ? 0 : 1);
            if (!['start', 'stop', 'restart', 'enable', 'disable'].includes(action!)) return fail(usage[name]!);
            root();
            if (action === 'enable' || action === 'disable') service.enabled = action === 'enable';
            else service.active = action !== 'stop';
            service.log.push(`${unit}: ${action}; active=${service.active}, enabled=${service.enabled}`);
            service.log = service.log.slice(-100); code = 0; break;
          }
          case 'journalctl': {
            if (args[0] !== '-u' || ![2, 4].includes(args.length) || (args.length === 4 && (args[2] !== '-n' || !/^\d+$/.test(args[3]!) || Number(args[3]) < 1))) return fail(usage[name]!);
            const service = machine.services[args[1]!.replace(/\.service$/, '')];
            return service ? out(service.log.slice(-Number(args[3] ?? 100)).join('\n')) : fail('unknown training unit');
          }
          case 'ip':
            if (args.join(' ') === 'addr') return out('1: lo: UP inet 127.0.0.1/8\n2: eth0: UP inet 192.0.2.10/24');
            if (args.join(' ') === 'route') return out('default via 192.0.2.1 dev eth0\n192.0.2.0/24 dev eth0 src 192.0.2.10');
            return fail(usage[name]!);
          case 'ss':
            if (args.join(' ') !== '-tln') return fail(usage[name]!);
            return out(['State Local Address:Port', ...(machine.services.ssh!.active ? ['LISTEN 0.0.0.0:22'] : []), ...(machine.services.nginx!.active ? ['LISTEN 0.0.0.0:80'] : [])].join('\n'));
          case 'ping':
            if (args.length !== 3 || args[0] !== '-c' || args[1] !== '1') return fail(usage[name]!);
            return ['192.0.2.1', '192.0.2.10', 'server.lab', '127.0.0.1'].includes(args[2]!)
              ? out(`64 bytes from ${args[2]}: icmp_seq=1 ttl=64 time=0.1 ms\n1 packets transmitted, 1 received, 0% packet loss (simulated)`)
              : fail('name or address is outside the training network');
          case 'df':
            if (args.join(' ') === '-i') return out('Filesystem Inodes IUsed IFree IUse% Mounted on\n/dev/vda1 655360 131072 524288 20% /');
            return args.join(' ') === '-h' ? out('Filesystem Size Used Avail Use% Mounted on\n/dev/vda1 20G 8G 12G 40% /') : fail(usage[name]!);
          case 'lsblk':
            return args.length ? fail(usage[name]!) : out('NAME SIZE TYPE MOUNTPOINTS\nvda 20G disk\n  vda1 20G part /\nvdb 10G disk');
          case 'free':
            return args.join(' ') === '-h' ? out('       total used free shared buff/cache available\nMem:   2.0Gi 512Mi 512Mi 0B 1.0Gi 1.3Gi\nSwap:  1.0Gi 0B 1.0Gi') : fail(usage[name]!);
          case 'ufw':
            if (args.join(' ') === 'status') return out(`Status: ${machine.firewall.enabled ? 'active' : 'inactive'}\n${machine.firewall.rules.map((r) => `${r} ALLOW Anywhere`).join('\n')}`);
            root();
            if (args.length === 1 && ['enable', 'disable'].includes(args[0]!)) machine.firewall.enabled = args[0] === 'enable';
            else if (args.length === 2 && args[0] === 'allow' && ['22/tcp', '80/tcp', '443/tcp'].includes(args[1]!)) machine.firewall.rules = [...new Set([...machine.firewall.rules, args[1]!])];
            else return fail(usage[name]!);
            code = out('Training firewall updated'); break;
          case 'crontab': {
            if (args.length !== 1) return fail(usage[name]!);
            if (args[0] === '-l') return machine.cron[shell.user] ? out(machine.cron[shell.user]!.trimEnd()) : fail(`no crontab for ${shell.user}`);
            if (args[0] === '-r') { delete machine.cron[shell.user]; code = 0; break; }
            if (args[0]!.startsWith('-')) return fail(usage[name]!);
            const content = read(shell, args[0]!);
            const lines = content.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
            if (!lines.length || lines.some((line) => !validCron(line))) return fail('expected five valid numeric or * time fields followed by a command');
            machine.cron[shell.user] = content; code = 0; break;
          }
          case 'tar': return archive(shell);
          default: return fail('unsupported training command');
        }
        persist(); return code;
      } catch (error) { return fail(error instanceof Error ? error.message : String(error)); }
    },
  });
}
function validName(value: string | undefined): boolean { return !!value && /^[a-z_][a-z0-9_-]{0,31}$/.test(value); }
function read(shell: Shell, path: string): string {
  const result = shell.dispatch<string>('fs.read', { path: shell.resolve(path) });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}
function validCron(line: string): boolean {
  const fields = line.trim().split(/\s+/);
  return fields.length >= 6 && fields.slice(0, 5).every((value, i) => value === '*' || (/^\d+$/.test(value) && Number(value) >= [0, 0, 1, 1, 0][i]! && Number(value) <= [59, 23, 31, 12, 7][i]!));
}
function archive(shell: Shell): number {
  const [action, name, ...files] = shell.args;
  if (!name || !['-cf', '-tf', '-xf'].includes(action!)) throw new Error('use tar --help for supported operations');
  const write = (path: string, content: string) => {
    const result = shell.dispatch('fs.write', { path: shell.resolve(path), content });
    if (!result.ok) throw new Error(result.error.message);
  };
  if (action === '-cf') {
    if (!files.length || files.some((f) => f.startsWith('/') || f.split('/').includes('..') || f.startsWith('-'))) throw new Error('archive relative files under the current directory');
    const entries = files.map((file) => ({ path: file, content: read(shell, file) }));
    write(name, JSON.stringify({ format: 'tuxos-training-tar-v1', entries })); return 0;
  }
  if ((action === '-tf' && files.length) || (action === '-xf' && (files.length !== 2 || files[0] !== '-C'))) throw new Error('use tar -tf ARCHIVE or tar -xf ARCHIVE -C DIRECTORY');
  const data = JSON.parse(read(shell, name)) as { format?: string; entries?: { path: string; content: string }[] };
  if (data.format !== 'tuxos-training-tar-v1' || !Array.isArray(data.entries) || data.entries.some((e) => typeof e.path !== 'string' || typeof e.content !== 'string' || !e.path || e.path.startsWith('/') || e.path.split('/').includes('..'))) throw new Error('invalid training archive');
  if (action === '-tf') { shell.stdout(data.entries.map((e) => e.path).join('\n') + '\n'); return 0; }
  const target = shell.resolve(files[1]!);
  const stat = shell.dispatch<{ kind: string }>('fs.stat', { path: target });
  if (!stat.ok || stat.value.kind !== 'dir') throw new Error('restore target must be an existing directory');
  for (const entry of data.entries) {
    const parent = `${target}/${entry.path}`.split('/').slice(0, -1).join('/');
    const made = shell.dispatch('fs.mkdir', { path: parent, parents: true });
    if (!made.ok) throw new Error(made.error.message);
    write(`${target}/${entry.path}`, entry.content);
  }
  return 0;
}

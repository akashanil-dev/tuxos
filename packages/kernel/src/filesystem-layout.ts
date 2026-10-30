import type { KernelState } from './state';
import { dir, file, type DirNode } from './vfs';

/** Representative teaching files, never host files or real device/boot images. */
export function expandFilesystem(state: KernelState, username: string, now = 0): void {
  if ((state.filesystemVersion ?? 0) >= 1) return;
  const root = dir('root', 0o755);
  const folder = (path: string, owner = 'root', mode = 0o755): DirNode => {
    let node = root;
    for (const part of path.split('/').filter(Boolean)) {
      node.children[part] ??= dir(owner, mode, {}, now);
      node = node.children[part] as DirNode;
    }
    return node;
  };
  const sample = (path: string, content: string, mode = 0o644, owner = 'root') => {
    const parts = path.split('/'); const name = parts.pop()!;
    folder(parts.join('/'), owner).children[name] = file(owner, mode, content + '\n', now);
  };
  for (const path of [
    '/bin', '/sbin', '/boot/grub', '/boot/efi', '/dev/pts', '/dev/shm', '/etc/apt/sources.list.d',
    '/etc/cron.d', '/etc/default', '/etc/skel', '/etc/ssh', '/etc/systemd/system', '/etc/NetworkManager/system-connections',
    '/etc/sudoers.d', '/etc/xdg', '/home', '/lib/modules', '/lib64', '/media', '/mnt', '/opt',
    '/proc/1', '/proc/sys/kernel', '/run/user/1000', '/run/lock', '/srv/www', '/sys/class/net/eth0',
    '/sys/block/vda', '/sys/devices', '/usr/bin', '/usr/sbin', '/usr/lib/systemd/system',
    '/usr/include', '/usr/src', '/usr/share/doc/tuxos', '/usr/share/man/man1', '/usr/share/applications',
    '/usr/share/icons', '/usr/share/fonts', '/usr/local/bin', '/usr/local/lib', '/usr/local/share',
    '/var/cache/apt/archives', '/var/lib/dpkg/info', '/var/lib/apt/lists', '/var/log/apt',
    '/var/log/journal', '/var/spool/cron', '/var/mail', '/var/backups',
  ]) folder(path);
  folder('/root', 'root', 0o700);
  folder('/lost+found', 'root', 0o700);
  folder('/tmp', 'root', 0o777); folder('/var/tmp', 'root', 0o777);
  sample('/etc/os-release', 'NAME="TuxOS Learning Environment"\nID=tuxos\nPRETTY_NAME="TuxOS (simulated Linux)"');
  sample('/etc/hosts', '127.0.0.1 localhost\n127.0.1.1 ' + state.hostname + '\n# Local names can be mapped to IP addresses here.');
  sample('/etc/resolv.conf', '# Teaching example: on Linux a network service often generates this file.\n# This does not configure real DNS in TuxOS.\nnameserver 192.0.2.53');
  sample('/etc/fstab', '# Teaching example only; no disks are mounted by this file in TuxOS.\n# device       mountpoint type options  dump pass\n/dev/vda1      /          ext4 defaults 0    1');
  sample('/etc/group', `root:x:0:\n${username}:x:1000:\nsudo:x:27:${username}`);
  sample('/etc/shells', '# Example login shells\n/bin/bash\n/bin/sh');
  sample('/etc/environment', '# System-wide environment example; not executed by the TuxOS shell.\nLANG=en_US.UTF-8');
  sample('/etc/profile', '# Example login shell configuration. Not sourced by this simulation.\nexport EDITOR=nano');
  sample('/etc/skel/.bashrc', '# Example copied to a new account on Linux.\n# Interactive shell preferences go here.');
  sample('/etc/ssh/sshd_config', '# Teaching example. Does not configure the simulated SSH service.\nPort 22\nPermitRootLogin no\nPasswordAuthentication no');
  sample('/etc/sudoers', '# Teaching example; use visudo on real Linux to validate edits.\nroot ALL=(ALL:ALL) ALL\n%sudo ALL=(ALL:ALL) ALL', 0o440);
  sample('/etc/apt/sources.list.d/training.sources', '# Documentation example only; TuxOS apt uses its built-in catalog.\n# Real repositories define Types, URIs, Suites, Components and Signed-By.');
  sample('/etc/crontab', '# Example: minute hour day-of-month month day-of-week user command\n# 0 9 * * * root /usr/local/bin/backup\n# No jobs run from this file in TuxOS.');
  sample('/etc/default/grub', '# Example only. Never edit boot settings without a recovery plan.\nGRUB_TIMEOUT=5');
  sample('/etc/xdg/kdeglobals', '# Example system defaults; not connected to TuxOS appearance.\n[General]\nColorScheme=BreezeDark');
  sample('/etc/systemd/system/hello.service', '# Teaching example, not an installed service in the administration sandbox.\n[Unit]\nDescription=Hello service\n[Service]\nType=oneshot\nExecStart=/usr/bin/echo Hello\n[Install]\nWantedBy=multi-user.target');
  sample('/boot/grub/grub.cfg', '# Teaching placeholder: generated boot menu.\n# On real Linux, use your distribution tools instead of editing this generated file.');
  sample('/boot/vmlinuz-example', 'Teaching placeholder for the Linux kernel image. Not a bootable binary.');
  sample('/boot/initrd.img-example', 'Teaching placeholder for the initial RAM filesystem. Not a bootable image.');
  sample('/dev/null', '', 0o666);
  sample('/dev/zero', 'Teaching placeholder; does not generate zero bytes.', 0o444);
  sample('/dev/random', 'Teaching placeholder; does not supply randomness.', 0o444);
  sample('/dev/vda', 'Teaching placeholder for a disk device; no real hardware access.', 0o600);
  sample('/proc/cpuinfo', '# Static teaching sample, not your computer\nprocessor : 0\nmodel name : TuxOS Virtual Training CPU', 0o444);
  sample('/proc/meminfo', '# Static teaching sample, in kB\nMemTotal: 2097152 kB\nMemFree: 1048576 kB', 0o444);
  sample('/proc/mounts', '# Static teaching sample\n/dev/vda1 / ext4 rw 0 0\nproc /proc proc rw 0 0');
  sample('/proc/1/status', '# Static example\nName:\tsystemd\nPid:\t1\nUid:\t0 0 0 0', 0o444);
  sample('/proc/sys/kernel/hostname', state.hostname, 0o444);
  sample('/sys/class/net/eth0/operstate', 'up', 0o444);
  sample('/sys/block/vda/size', '41943040', 0o444);
  sample('/run/motd.dynamic', 'Static teaching sample: real /run contains temporary state from the current boot.');
  sample('/srv/www/index.html', '<!doctype html>\n<title>My practice site</title>\n<h1>Hello, Linux!</h1>');
  sample('/var/log/syslog', 'Oct 30 10:00:00 tuxos training: example boot completed\nOct 30 10:00:01 tuxos training: this is a static sample log');
  sample('/var/log/auth.log', 'Oct 30 10:01:00 tuxos training: example login succeeded (sample only)', 0o640);
  sample('/var/log/apt/history.log', '# Real apt records package changes here. This is a teaching example.');
  sample('/usr/share/doc/tuxos/filesystem.txt', 'Explore with Learn Linux Filesystem.\nThis is a representative Linux tree, not a complete distribution.\nDevices, boot files, proc and sys are teaching samples.\nPrograms run through TuxOS commands, not native binaries.\nModern distributions commonly link /bin, /sbin and /lib into /usr; this simulator uses ordinary directories.\nMounts, symlinks, groups and sticky bits are not fully modeled.\nUse help in Terminal for supported commands.');
  const home = state.users[username]?.home ?? `/home/${username}`;
  for (const name of ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos', 'Public', 'Templates', '.config', '.cache', '.local/share', '.local/bin']) folder(`${home}/${name}`, username);
  sample(`${home}/.bashrc`, '# Your interactive shell preferences on real Linux.\n# Teaching example: TuxOS does not source this file.\n# alias ll="ls -la"', 0o644, username);
  sample(`${home}/.profile`, '# Login shell preferences on real Linux.\n# Teaching example: TuxOS does not source this file.', 0o644, username);
  sample(`${home}/.config/kdeglobals`, '# Example only. Change the live desktop using Settings.\n[General]\nColorScheme=BreezeDark', 0o644, username);
  // Add missing entries only; never replace learner edits, permissions, or conflicting files.
  const merge = (target: DirNode, source: DirNode): void => {
    for (const [name, node] of Object.entries(source.children)) {
      const existing = target.children[name];
      if (!existing) target.children[name] = node;
      else if (existing.kind === 'dir' && node.kind === 'dir') merge(existing, node);
    }
  };
  merge(state.fs, root);
  state.filesystemVersion = 1;
}

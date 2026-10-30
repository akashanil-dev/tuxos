import { createLocalSystem, type KeyValueStorage } from '@tuxos/system';
import { describe, expect, it } from 'vitest';
import { learnLinux } from './index';

const storage = (): KeyValueStorage => {
  const data = new Map<string, string>();
  return { get: async (key) => data.get(key) ?? null, set: async (key, value) => { data.set(key, value); }, remove: async (key) => { data.delete(key); } };
};
async function boot(saved = storage()) {
  const system = createLocalSystem({ storage: saved, modules: [{ manifest: learnLinux.manifest, load: async () => learnLinux }] });
  await system.boot('ada');
  return { system, shell: await system.createTerminal() };
}

describe('administration training machine', () => {
  it('requires privilege, separates service activation from boot enablement, and records real transitions', async () => {
    const { shell } = await boot();
    expect(await shell.run('systemctl start nginx')).toMatchObject({ code: 1, stderr: expect.stringContaining('Permission denied') });
    expect(await shell.run('systemctl is-active nginx')).toMatchObject({ code: 3, stdout: 'inactive\n' });
    expect((await shell.run('sudo systemctl enable nginx')).code).toBe(0);
    expect(await shell.run('systemctl is-active nginx')).toMatchObject({ code: 3 });
    expect((await shell.run('sudo systemctl start nginx')).code).toBe(0);
    expect(await shell.run('systemctl status nginx')).toMatchObject({ code: 0, stdout: expect.stringContaining('enabled\nActive: active') });
    expect((await shell.run('ss -tln')).stdout).toContain(':80');
    expect((await shell.run('sudo systemctl stop nginx')).code).toBe(0);
    expect((await shell.run('ss -tln')).stdout).not.toContain(':80');
    expect((await shell.run('journalctl -u nginx -n 1')).stdout).toContain('stop; active=false');
    expect((await shell.run('sudo systemctl start unknown')).code).toBe(1);
  });

  it('persists accounts, additive membership and schedules across sessions', async () => {
    const saved = storage();
    const first = await boot(saved);
    for (const command of ['sudo groupadd ops', 'sudo useradd -m trainee', 'sudo usermod -aG ops trainee']) expect((await first.shell.run(command)).code).toBe(0);
    expect((await first.shell.run('id trainee')).stdout).toContain('groups=trainee,ops');
    expect((await first.shell.run('sudo usermod -aG absent trainee')).code).toBe(1);
    expect((await first.shell.run('sudo useradd -m trainee')).code).toBe(1);
    await first.shell.run('echo "0 2 * * * /usr/local/bin/report" > ~/schedule');
    expect((await first.shell.run('crontab ~/schedule')).code).toBe(0);
    await first.system.flush();
    const second = await boot(saved);
    expect((await second.shell.run('id trainee')).stdout).toContain('groups=trainee,ops');
    expect((await second.shell.run('crontab -l')).stdout).toContain('0 2 * * *');
    await second.shell.run('echo "99 2 * * * /bin/report" > ~/bad-schedule');
    expect((await second.shell.run('crontab ~/bad-schedule')).code).toBe(1);
    expect((await second.shell.run('crontab -l')).stdout).toContain('0 2 * * *');
  });

  it('restores an actual snapshot of virtual files and rejects archive traversal', async () => {
    const { shell, system } = await boot();
    await shell.run('echo original > ~/source.txt');
    expect((await shell.run('tar -cf backup.tar source.txt')).code).toBe(0);
    await shell.run('echo modified > ~/source.txt');
    await shell.run('mkdir restore');
    expect((await shell.run('tar -xf backup.tar -C restore')).code).toBe(0);
    expect((await shell.run('cat restore/source.txt')).stdout).toBe('original\n');
    expect((await shell.run('cat source.txt')).stdout).toBe('modified\n');
    await system.dispatch('fs.write', { path: '/home/ada/bad.tar', content: JSON.stringify({ format: 'tuxos-training-tar-v1', entries: [{ path: '../source.txt', content: 'escaped' }] }) });
    expect((await shell.run('tar -xf bad.tar -C restore')).code).toBe(1);
    expect((await shell.run('cat source.txt')).stdout).toBe('modified\n');
    expect((await shell.run('tar -cf bad.tar /etc/shadow')).code).toBe(1);
  });

  it('rejects unsupported flags, invalid targets and unauthorized changes', async () => {
    const { shell } = await boot();
    for (const command of ['sudo usermod -G ops ada', 'sudo systemctl enable --now nginx', 'journalctl -u ssh -n nope', 'ip addr flush', 'ping -c 1 example.com', 'ufw allow 22/tcp', 'kill -TERM 1']) {
      expect((await shell.run(command)).code, command).not.toBe(0);
    }
    expect((await shell.run('systemctl is-active ssh')).stdout).toBe('active\n');
    expect((await shell.run('ufw status')).stdout).toContain('inactive');
  });
});

import { describe, it, expect } from 'vitest';
import { createKernel } from './index';
import { dir, file, lookup, readFile } from './vfs';

describe('teaching filesystem', () => {
  it('exposes the Linux hierarchy, personal ownership and protected system files', () => {
    const kernel = createKernel({ username: 'ada' });
    const fs = kernel.getState().fs;
    for (const path of ['/boot/efi', '/etc/ssh', '/etc/systemd/system', '/lib/modules', '/lib64', '/media', '/mnt', '/opt', '/proc/1', '/run/user/1000', '/sbin', '/srv/www', '/sys/class/net/eth0', '/usr/local/bin', '/var/cache/apt/archives', '/var/spool/cron']) expect(lookup(fs, path, 'ada').kind).toBe('dir');
    expect(lookup(fs, '/home/ada/.config', 'ada').owner).toBe('ada');
    expect(readFile(fs, '/etc/hosts', 'ada')).toContain('localhost');
    expect(readFile(fs, '/proc/cpuinfo', 'ada')).toContain('Static teaching sample');
    expect(() => readFile(fs, '/etc/shadow', 'ada')).toThrow('Permission denied');
    expect(kernel.dispatch({ type: 'fs.write', payload: { path: '/etc/hosts', content: 'bad' } }).ok).toBe(false);
  });
  it('upgrades old saves once, preserving content, permission changes and conflicting files', () => {
    const snapshot = createKernel({ username: 'ada' }).snapshot();
    delete snapshot.state.filesystemVersion;
    snapshot.state.fs = dir('root', 0o755, {
      home: dir('root', 0o755, { ada: dir('ada', 0o700, { 'notes.txt': file('ada', 0o600, 'keep me') }) }),
      etc: dir('root', 0o755, { hosts: file('root', 0o600, 'custom hosts') }),
      opt: file('root', 0o644, 'conflicting old file'),
    });
    const kernel = createKernel({ snapshot });
    const upgraded = kernel.getState();
    expect(readFile(upgraded.fs, '/etc/hosts', 'root')).toBe('custom hosts');
    expect(lookup(upgraded.fs, '/etc/hosts', 'root').mode).toBe(0o600);
    expect(readFile(upgraded.fs, '/home/ada/notes.txt', 'ada')).toBe('keep me');
    expect(lookup(upgraded.fs, '/home/ada', 'ada').mode).toBe(0o700);
    expect(readFile(upgraded.fs, '/opt', 'root')).toBe('conflicting old file');
    expect(lookup(upgraded.fs, '/sys', 'ada').kind).toBe('dir');
    kernel.dispatch({ type: 'fs.remove', payload: { path: '/etc/hosts' } }, { user: 'root' });
    expect(createKernel({ snapshot: kernel.snapshot() }).dispatch({ type: 'fs.stat', payload: { path: '/etc/hosts' } }).ok).toBe(false);
    expect(snapshot.state.fs.children.sys).toBeUndefined();
  });
});

// The virtual filesystem: a tree of plain objects, so the whole system can be snapshotted as JSON.
// Permissions follow Unix owner/other bits (groups are left out for now); root bypasses read and write checks.
// Every function takes an absolute path; resolving relative paths against a cwd is the caller's job.

import { KernelError } from './errors';

export interface FileNode {
  kind: 'file';
  owner: string;
  mode: number;
  content: string;
  mtime: number;
}

export interface DirNode {
  kind: 'dir';
  owner: string;
  mode: number;
  children: Record<string, VNode>;
  mtime: number;
}

export type VNode = FileNode | DirNode;

export interface Stat {
  name: string;
  kind: VNode['kind'];
  owner: string;
  mode: number;
  size: number;
  mtime: number;
}

type Access = 'r' | 'w' | 'x';
const NULL_DEVICE = '/dev/null';
const BITS: Record<Access, number> = { r: 4, w: 2, x: 1 };

export function file(owner: string, mode: number, content = '', mtime = 0): FileNode {
  return { kind: 'file', owner, mode, content, mtime };
}

export function dir(owner: string, mode: number, children: Record<string, VNode> = {}, mtime = 0): DirNode {
  return { kind: 'dir', owner, mode, children, mtime };
}

/** Turn a path into a clean absolute one, resolving ".", ".." and repeated slashes. */
export function resolvePath(path: string, cwd = '/'): string {
  if (!path) throw new KernelError('ENOENT', 'No such file or directory');
  const parts = (path.startsWith('/') ? path : `${cwd}/${path}`).split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return `/${out.join('/')}`;
}

export function allows(node: VNode, user: string, want: Access): boolean {
  if (user === 'root') {
    // root may read and write anything, but only executes files that have some x bit.
    return want !== 'x' || node.kind === 'dir' || (node.mode & 0o111) !== 0;
  }
  const shift = node.owner === user ? 6 : 0;
  return ((node.mode >> shift) & BITS[want]) !== 0;
}

function segments(path: string): string[] {
  return resolvePath(path).split('/').filter(Boolean);
}

function demand(node: VNode, user: string, want: Access, path: string): void {
  if (!allows(node, user, want)) throw new KernelError('EACCES', `${path}: Permission denied`);
}

/** Walk to a node. Like Linux, every directory on the way needs execute (search) permission. */
export function lookup(root: DirNode, path: string, user: string): VNode {
  let node: VNode = root;
  let walked = '';
  for (const name of segments(path)) {
    if (node.kind !== 'dir') throw new KernelError('ENOTDIR', `${walked}: Not a directory`);
    demand(node, user, 'x', walked || '/');
    walked += `/${name}`;
    const next: VNode | undefined = node.children[name];
    if (!next) throw new KernelError('ENOENT', `${walked}: No such file or directory`);
    node = next;
  }
  return node;
}

function parentOf(root: DirNode, path: string, user: string): { parent: DirNode; name: string } {
  const parts = segments(path);
  const name = parts.pop();
  if (!name) throw new KernelError('EPERM', '/: Operation not permitted');
  const parentPath = `/${parts.join('/')}`;
  const parent = lookup(root, parentPath, user);
  if (parent.kind !== 'dir') throw new KernelError('ENOTDIR', `${parentPath}: Not a directory`);
  demand(parent, user, 'x', parentPath);
  return { parent, name };
}

function statOf(name: string, node: VNode): Stat {
  const size = node.kind === 'file' ? node.content.length : 4096;
  return { name, kind: node.kind, owner: node.owner, mode: node.mode, size, mtime: node.mtime };
}

export function stat(root: DirNode, path: string, user: string): Stat {
  const name = segments(path).at(-1) ?? '/';
  return statOf(name, lookup(root, path, user));
}

export function readFile(root: DirNode, path: string, user: string): string {
  const node = lookup(root, path, user);
  if (node.kind === 'dir') throw new KernelError('EISDIR', `${path}: Is a directory`);
  demand(node, user, 'r', path);
  return node.content;
}

export function writeFile(root: DirNode, path: string, user: string, content: string, append = false, now = 0): void {
  const { parent, name } = parentOf(root, path, user);
  const existing = parent.children[name];
  if (existing?.kind === 'dir') throw new KernelError('EISDIR', `${path}: Is a directory`);
  if (existing) {
    demand(existing, user, 'w', path);
    // The null device swallows everything written to it, so `> /dev/null` discards output as on Linux.
    if (resolvePath(path) === NULL_DEVICE) return;
    existing.content = append ? existing.content + content : content;
    existing.mtime = now;
    return;
  }
  demand(parent, user, 'w', path);
  parent.children[name] = file(user, 0o644, content, now);
  parent.mtime = now;
}

export function makeDir(root: DirNode, path: string, user: string, parents = false, now = 0): void {
  if (parents) {
    let current = '';
    for (const name of segments(path)) {
      current += `/${name}`;
      const { parent } = parentOf(root, current, user);
      const existing = parent.children[name];
      if (existing?.kind === 'file') throw new KernelError('ENOTDIR', `${current}: Not a directory`);
      if (!existing) {
        demand(parent, user, 'w', current);
        parent.children[name] = dir(user, 0o755, {}, now);
        parent.mtime = now;
      }
    }
    return;
  }
  const { parent, name } = parentOf(root, path, user);
  if (parent.children[name]) throw new KernelError('EEXIST', `${path}: File exists`);
  demand(parent, user, 'w', path);
  parent.children[name] = dir(user, 0o755, {}, now);
  parent.mtime = now;
}

export function listDir(root: DirNode, path: string, user: string): Stat[] {
  const node = lookup(root, path, user);
  if (node.kind !== 'dir') throw new KernelError('ENOTDIR', `${path}: Not a directory`);
  demand(node, user, 'r', path);
  return Object.entries(node.children)
    .map(([name, child]) => statOf(name, child))
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

export function remove(root: DirNode, path: string, user: string, recursive = false, now = 0): void {
  const { parent, name } = parentOf(root, path, user);
  const node = parent.children[name];
  if (!node) throw new KernelError('ENOENT', `${path}: No such file or directory`);
  if (node.kind === 'dir' && !recursive) {
    const code = Object.keys(node.children).length ? 'ENOTEMPTY' : 'EISDIR';
    throw new KernelError(code, code === 'ENOTEMPTY' ? `${path}: Directory not empty` : `${path}: Is a directory`);
  }
  demand(parent, user, 'w', path);
  delete parent.children[name];
  parent.mtime = now;
}

export function removeEmptyDirectory(root: DirNode, path: string, user: string, now = 0): void {
  const node = lookup(root, path, user);
  if (node.kind !== 'dir') throw new KernelError('ENOTDIR', `${path}: Not a directory`);
  if (Object.keys(node.children).length) throw new KernelError('ENOTEMPTY', `${path}: Directory not empty`);
  remove(root, path, user, true, now);
}

export function changeMode(root: DirNode, path: string, user: string, mode: number): void {
  if (!Number.isInteger(mode) || mode < 0 || mode > 0o777) throw new KernelError('EINVAL', `invalid mode: ${mode}`);
  const node = lookup(root, path, user);
  if (user !== 'root' && node.owner !== user) throw new KernelError('EPERM', `${path}: Operation not permitted`);
  node.mode = mode;
}

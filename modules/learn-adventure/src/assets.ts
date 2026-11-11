import { KernelError, type KernelState, type VNode, type DirNode } from '@tuxos/kernel';
import initial from './assets.json';
export const GATE = initial['~/dungeon/gate.sh'].content;
export const STAIRS = '#!/bin/bash\n# Leads down.';
type Asset = { content: string; owner: string; mode: number };
export type RepairItem = { path: string; state: 'missing' | 'changed' | 'blocked' };
export function nodeAt(root: DirNode, path: string): VNode | undefined {
  let node: VNode | undefined = root;
  for (const key of path.split('/').filter(Boolean)) node = node?.kind === 'dir' ? node.children[key] : undefined;
  return node;
}
export function cryptAssets(home: string): Record<string, Asset> {
  const at = `${home}/dungeon/crypt`;
  return {
    ...Object.fromEntries([1,2,3,4,5].map(i => [`${at}/goblins/goblin-${i}`, { content: `Goblin #${i}. It is grumpy. It says: "grr".`, owner: 'user', mode: 0o644 }])),
    [`${at}/note.txt`]: { content: 'Goblins block the stairs. Remove their files with rm goblins/*, then run ./stairs.sh.\n', owner: 'user', mode: 0o644 },
    [`${at}/stairs.sh`]: { content: STAIRS, owner: 'user', mode: 0o755 },
  };
}
export function assets(state: KernelState, user: string): Record<string, Asset> {
  const home = `/home/${user}`;
  const files = Object.fromEntries(Object.entries(initial).map(([path, file]) => [path.replace(/^~/, home), file]));
  if (nodeAt(state.fs, `${home}/dungeon/crypt`) || state.exploration?.adventure.done.gate) Object.assign(files, cryptAssets(home));
  return files;
}
export function preview(state: KernelState, user: string): RepairItem[] {
  return Object.entries(assets(state, user)).flatMap(([path, asset]) => {
    const parents = path.split('/').filter(Boolean).slice(0, -1);
    const blocked = parents.some((_, i) => nodeAt(state.fs, '/' + parents.slice(0, i + 1).join('/'))?.kind === 'file');
    const node = nodeAt(state.fs, path);
    const status = blocked || node?.kind === 'dir' ? 'blocked' : !node ? 'missing' : node.content !== asset.content || node.mode !== asset.mode ? 'changed' : null;
    return status ? [{ path, state: status }] : [];
  });
}
function parent(root: DirNode, path: string, owner: string, now: number): DirNode {
  let node = root;
  for (const key of path.split('/').filter(Boolean).slice(0, -1)) {
    node.children[key] ??= { kind: 'dir', owner, mode: 0o755, children: {}, mtime: now };
    const child = node.children[key]!;
    if (child.kind !== 'dir') throw new KernelError('ENOTDIR', `${path}: a parent is a file. Move it before recovering this exercise.`);
    node = child;
  }
  return node;
}
export function put(root: DirNode, path: string, node: VNode | null, user: string, now: number): void {
  const folder = parent(root, path, user, now), name = path.split('/').at(-1)!;
  if (node) folder.children[name] = node;
  else delete folder.children[name];
}
/** Write only this module's fixed assets; ordinary preparation fills gaps and preserves changes. */
export function seed(state: KernelState, user: string, now: number, files = assets(state, user)): void {
  for (const [path, asset] of Object.entries(files)) {
    if (nodeAt(state.fs, path)) continue;
    try { put(state.fs, path, { kind: 'file', ...asset, owner: asset.owner === 'user' ? user : asset.owner, mtime: now }, user, now); }
    catch (error) { if (!(error instanceof KernelError) || error.code !== 'ENOTDIR') throw error; }
  }
}

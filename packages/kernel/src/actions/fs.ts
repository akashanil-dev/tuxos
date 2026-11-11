// Filesystem actions. Paths must be absolute: the shell or app resolves them against its cwd first.

import { KernelError } from '../errors';
import type { ActionDefinition } from '../kernel';
import * as vfs from '../vfs';

function field<T extends 'string' | 'number' | 'boolean'>(
  payload: unknown,
  key: string,
  type: T,
  optional = false,
): (T extends 'string' ? string : T extends 'number' ? number : boolean) | undefined {
  const value = (payload as Record<string, unknown> | null)?.[key];
  if (value === undefined && optional) return undefined;
  if (typeof value !== type) throw new KernelError('EINVAL', `"${key}" must be a ${type}`);
  return value as never;
}

function path(payload: unknown): string {
  const value = field(payload, 'path', 'string')!;
  if (!value.startsWith('/')) throw new KernelError('EINVAL', `path must be absolute: ${value}`);
  return vfs.resolvePath(value);
}

export const fsActions: ActionDefinition[] = [
  {
    type: 'fs.stat',
    capability: 'fs:read',
    description: 'Get the type, owner, permissions and size of a file or directory.',
    mutates: false,
    run: ({ fs }, payload) => fs.stat(path(payload)),
  },
  {
    type: 'fs.read',
    capability: 'fs:read',
    description: 'Read the text of a file.',
    mutates: false,
    run: ({ fs }, payload) => fs.read(path(payload)),
  },
  {
    type: 'fs.list',
    capability: 'fs:read',
    description: 'List the entries of a directory.',
    mutates: false,
    run: ({ fs }, payload) => fs.list(path(payload)),
  },
  {
    type: 'fs.write',
    capability: 'fs:write',
    description: 'Create or overwrite a file, or append to it.',
    mutates: true,
    run: ({ fs }, payload) => fs.write(path(payload), field(payload, 'content', 'string')!, {
      append: field(payload, 'append', 'boolean', true),
    }),
  },
  {
    type: 'fs.mkdir',
    capability: 'fs:write',
    description: 'Create a directory, and its parents too when "parents" is true.',
    mutates: true,
    run: ({ fs }, payload) => fs.mkdir(path(payload), {
      parents: field(payload, 'parents', 'boolean', true),
    }),
  },
  { type: 'fs.rmdir', capability: 'fs:write', description: 'Remove only an empty directory.', mutates: true,
    run: ({ state, user, now }, payload) => vfs.removeEmptyDirectory(state.fs, path(payload), user, now),
  },
  {
    type: 'fs.remove',
    capability: 'fs:write',
    description: 'Delete a file, or a directory and everything in it when "recursive" is true.',
    mutates: true,
    run: ({ fs }, payload) => fs.remove(path(payload), {
      recursive: field(payload, 'recursive', 'boolean', true),
    }),
  },
  {
    type: 'fs.chmod',
    capability: 'fs:write',
    description: 'Change the permission bits of a file or directory, e.g. mode 0o755.',
    mutates: true,
    run: ({ state, user }, payload) =>
      vfs.changeMode(state.fs, path(payload), user, field(payload, 'mode', 'number')!),
  },
];

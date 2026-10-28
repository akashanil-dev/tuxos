import type { ModuleManifest } from '@tuxos/sdk';
export const manifest: ModuleManifest = {
  id: 'learn-filesystem', version: '1.0.0', title: 'Learn Linux Filesystem', capabilities: [],
  activation: ['onApp:learn-filesystem'],
  contributes: { apps: [{ id: 'learn-filesystem', title: 'Learn Linux Filesystem', icon: 'learn-filesystem',
    category: 'Education', description: 'Explore Linux from /, understand important files, and practise configuration safely.' }] },
};

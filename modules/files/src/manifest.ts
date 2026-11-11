import type { ModuleManifest } from '@tuxos/sdk';

export const manifest: ModuleManifest = {
  id: 'files',
  version: '1.0.0',
  title: 'Files',
  capabilities: [],
  activation: ['onApp:files'],
  contributes: {
    apps: [{
      id: 'files',
      defaultGeometry: { width:900, height:560 },
      title: 'Files',
      icon: 'files',
      category: 'System',
      description: 'Browse folders and files by pointing and clicking.',
    }],
  },
};

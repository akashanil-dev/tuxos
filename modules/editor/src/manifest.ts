import type { ModuleManifest } from '@tuxos/sdk';

export const manifest: ModuleManifest = {
  id: 'editor',
  version: '1.0.0',
  title: 'Text Editor',
  capabilities: [],
  activation: ['onApp:editor'],
  contributes: {
    apps: [{
      id: 'editor',
      instance: 'document',
      title: 'Text Editor',
      icon: 'editor',
      category: 'Utilities',
      description: 'Open, change and save text files.',
    }],
  },
};

import type { ModuleManifest } from '@tuxos/sdk';
export const manifest: ModuleManifest = {
  id: 'learn-adventure', title: 'Tux’s Adventure', version: '1.0.0', requires: ['exploration'],
  capabilities: ['exploration:read', 'exploration:write', 'fs:read', 'fs:write'], activation: ['onStartup'],
  contributes: {
    apps: [{ id: 'learn-adventure', title: 'Tux’s Adventure', icon: 'learn-adventure', category: 'Education', description: 'Ten short quests: find a hidden map, rescue the crown and learn Linux by exploring.', defaultGeometry: { width: 760, height: 600 } }],
    commands: [{ name: 'quest', summary: 'Show Tux’s current adventure quest and hints' }],
  },
};

import type { ModuleManifest } from '@tuxos/sdk';
export const manifest: ModuleManifest = {
  id: 'try-linux', title: 'Try Linux', version: '1.0.0', requires: ['exploration'], capabilities: ['exploration:read', 'exploration:write'], activation: ['onApp:try-linux'],
  contributes: { apps: [{ id: 'try-linux', title: 'Try Linux', icon: 'try-linux', category: 'Education', description: 'Find a distribution and explore real Linux through a VM or live USB.', defaultGeometry: { width: 820, height: 650 } }] },
};

import type { ModuleManifest } from '@tuxos/sdk';
export const manifest: ModuleManifest = {
  id: 'pipe-dream', title: 'Pipe Dream', version: '1.0.0', requires: ['exploration'], capabilities: ['exploration:read', 'exploration:write'],
  activation: ['onApp:pipe-dream'], contributes: { apps: [{ id: 'pipe-dream', title: 'Pipe Dream', icon: 'pipe-dream', category: 'Games', description: 'Eight puzzles: chain command blocks and see text flow through each stage.', defaultGeometry: { width: 940, height: 620 } }] },
};

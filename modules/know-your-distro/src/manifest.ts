import type { ModuleManifest } from '@tuxos/sdk';
export const manifest: ModuleManifest = {
  id: 'know-your-distro', title: 'Know Your Distro', version: '1.0.0', requires: ['exploration'], capabilities: ['exploration:read', 'exploration:write'], activation: ['onApp:know-your-distro'],
  contributes: { apps: [{ id: 'know-your-distro', title: 'Know Your Distro', icon: 'know-your-distro', category: 'Games', description: 'Run with Tux: five distro families, Rapid and Infinite modes.', defaultGeometry: { width: 1000, height: 650 } }] },
};

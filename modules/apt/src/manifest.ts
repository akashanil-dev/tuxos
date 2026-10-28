import type { ModuleManifest } from '@tuxos/sdk';
import { CATALOG } from './catalog';

export const manifest: ModuleManifest = {
  id: 'apt',
  version: '1.0.0',
  title: 'Package manager',
  // user:switch lets the module create dpkg's root-owned database on first start, as an installed system has.
  capabilities: ['fs:read', 'fs:write', 'user:switch'],
  activation: ['onStartup'],
  contributes: {
    apps: [{ id: 'software', title: 'Software', icon: 'software', category: 'System', defaultGeometry: { width: 1040, height: 720 } }],
    commands: [
      { name: 'apt', summary: 'Install, remove and search for software packages' },
      { name: 'apt-get', summary: 'Install and remove packages (the older apt interface)' },
      { name: 'dpkg', summary: 'List installed packages and the files they own' },
      { name: 'which', summary: 'Show where a command is installed' },
      // Commands from packages in the catalog: "command not found" until their package is installed.
      ...CATALOG.flatMap((pkg) => pkg.commands.map((name) => ({ name, summary: `${pkg.summary} (package ${pkg.name})` }))),
    ],
  },
};

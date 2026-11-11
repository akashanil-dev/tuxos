import type { ModuleManifest } from '@tuxos/sdk';
export const manifest: ModuleManifest = {
  id: 'exploration', title: 'Exploration journal', version: '1.0.0', capabilities: ['exploration:read', 'exploration:write'],
  activation: ['onStartup', 'onApp:play', 'onApp:command-reference', 'onApp:exploration-achievements'],
  contributes: { apps: [
    { id: 'play', title: 'Play', icon: 'play', category: 'Games', description: 'Learn through Pipe Dream, Know Your Distro and Linux adventures.', defaultGeometry: { width: 780, height: 540 } },
    { id: 'command-reference', title: 'Command Reference', icon: 'command-reference', category: 'Education', description: 'Your learned commands, examples and printable cheat sheet.' },
    { id: 'exploration-achievements', title: 'Discoveries', icon: 'exploration-achievements', category: 'Education', description: 'Thirty Tuxplore discoveries, alongside your course milestones.' },
  ] },
};

import type { ModuleManifest } from '@tuxos/sdk';
import { adminCommands } from './admin';

export const manifest: ModuleManifest = {
  id: 'learn-linux',
  version: '2.0.0',
  title: 'Learn Linux',
  // fs: lesson setup files and checks, as the learner. lessons: the actions the window and tutor call.
  capabilities: ['fs:read', 'fs:write', 'lessons:read', 'lessons:write', 'journey:write'],
  // Starts with the system so an active lesson keeps tracking progress even when its window is closed.
  activation: ['onStartup', 'onApp:learn-linux', 'onApp:learn-linux-terminal'],
  contributes: {
    commands: adminCommands,
    apps: [{
      id: 'learn-linux',
      title: 'Learn Linux',
      icon: 'learn-linux',
      category: 'Education',
      description: 'From your first command to Linux administration: lessons, sandbox labs and practical assessments.',
      defaultGeometry: { width: 780, height: 620 },
    }, { id: 'learn-linux-terminal', title: 'Learn Linux Terminal', icon: 'terminal', category: 'Education', instance: 'singleton', defaultGeometry: { width: 820, height: 540 } }],
  },
};

import type { ModuleManifest } from '@tuxos/sdk';

export const manifest: ModuleManifest = {
  id: 'terminal',
  version: '1.0.0',
  title: 'Terminal',
  capabilities: [],
  activation: ['onStartup', 'onApp:terminal', 'onCommand:clear'],
  contributes: {
    apps: [{
      id: 'terminal',
      title: 'Terminal',
      icon: 'terminal',
      category: 'System',
      description: 'Type commands into a bash shell.',
    }],
    commands: [
      { name: 'clear', summary: 'Clear the terminal screen' },
      { name: 'hint', learningOnly: true, summary: 'Ask the active trainer for a hint (/hint)' },
      { name: 'answer', learningOnly: true, summary: 'Show the answer for the active task after five tries; a nudge before that (/answer)' },
      { name: 'task', learningOnly: true, summary: 'Show the current industry task (/task)' },
      { name: 'next', learningOnly: true, summary: 'Show the next task (/next)' },
    ],
  },
};

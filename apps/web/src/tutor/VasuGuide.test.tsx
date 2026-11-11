import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { createLocalSystem } from '@tuxos/system';
import { exploration } from '../../../../modules/exploration/src';
import { learnAdventure } from '../../../../modules/learn-adventure/src';
import { VasuGuide } from './VasuGuide';

afterEach(cleanup);
it('guides a learner using their actual adventure progress without AI', async () => {
  const system = createLocalSystem({ journey: true, storage: { get: async () => null, set: async () => {}, remove: async () => {} }, modules: [exploration, learnAdventure].map(m => ({ manifest: m.manifest, load: async () => m })) });
  await system.boot('ada');
  render(<VasuGuide system={system} onClose={() => {}} />);
  expect(screen.getByText(/choose Prepare adventure/)).toBeTruthy();
  await act(async () => {
    await system.dispatch('learn-adventure.prepare', {});
    await system.dispatch('learn-adventure.start', {});
  });
  expect(await screen.findByText('Ask who you are: whoami')).toBeTruthy();
  fireEvent.click(screen.getByText('Give me a hint'));
  expect(screen.getByText('Type whoami and press Enter.')).toBeTruthy();
  await act(async () => { const terminal = await system.createTerminal(); await terminal.run('whoami'); });
  expect(await screen.findByText('Ask where you are: pwd')).toBeTruthy();
  expect(screen.queryByText('Type whoami and press Enter.')).toBeNull();
  cleanup();
  await system.reset();
});

import { expect, it } from 'vitest';
import { createKernel } from '@tuxos/kernel';
import { createShell, runTextStage } from '@tuxos/shell';
import { createLocalSystem } from '@tuxos/system';
import { exploration } from '../../exploration/src';
import { pipeDream } from './index';
import { LEVELS } from './levels';
import { evaluatePuzzle } from './puzzle';

for (const level of LEVELS) it(`solves ${level.id} with the same intermediate output as real terminal filters`, async () => {
  const kernel = createKernel({ username: 'ada' });
  const shell = createShell(kernel);
  const indices = level.solution.map(stage => level.blocks.findIndex(block => JSON.stringify(block) === JSON.stringify(stage)));
  const solved = evaluatePuzzle(level.id, indices);
  expect(solved.solved).toBe(true);
  expect(evaluatePuzzle(level.id, []).solved).toBe(false);
  kernel.dispatch({ type: 'fs.write', payload: { path: '/home/ada/' + level.file, content: level.input } });
  for (let i = 0; i < level.solution.length; i++) {
    const command = `cat ${level.file} | ${level.solution.slice(0, i + 1).map(stage => stage.join(' ')).join(' | ')}`;
    const result = await shell.run(command);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(solved.results[i]!.stdout);
  }
});
it('rejects invalid blocks and stage limits, and cannot read any filesystem through a puzzle filter', () => {
  for (const stages of [[-1], [99], [0,0,0,0,0,0,0], ['0']]) expect(() => evaluatePuzzle('fruit', stages)).toThrow();
  expect(() => evaluatePuzzle('unknown', [])).toThrow();
  expect(() => runTextStage(['rm', '-rf', '/'], 'x')).toThrow();
  expect(runTextStage(['head', '/etc/shadow'], 'x').code).not.toBe(0);
  expect(runTextStage(['grep', 'missing'], 'apple\n').stdout).toBe('');
});
it('records all eight puzzles once, retains partial pipelines and rejects tutor awards', async () => {
  let value: string | null = null;
  const system = createLocalSystem({ storage: { get: async () => value, set: async (_, v) => { value = v; }, remove: async () => { value = null; } }, modules: [exploration,pipeDream].map(m => ({ manifest: m.manifest, load: async () => m })) });
  await system.boot('ada'); await system.openApp('pipe-dream');
  for (const level of LEVELS) {
    const stages = level.solution.map(stage => level.blocks.findIndex(block => JSON.stringify(block) === JSON.stringify(stage)));
    const result = await system.dispatch<{ solved: boolean }>('pipe-dream.play', { id: level.id, stages });
    expect(result).toMatchObject({ ok: true, value: { solved: true } });
  }
  const before = await system.dispatch<any>('exploration.status', {});
  expect(before.ok && Object.keys(before.value.pipe.solved)).toHaveLength(8);
  expect(before.ok && before.value.achievements.pipe_all).toBeGreaterThan(0);
  const tutor = system.tutor(); tutor.setCapabilities(['exploration:write']);
  expect((await tutor.dispatch('pipe-dream.play', { id: 'fruit', stages: [0] })).ok).toBe(false);
  await system.dispatch('pipe-dream.play', { id: 'logins', stages: [2,3] });
  await system.flush(); await system.boot('ada');
  const restored = await system.dispatch<any>('exploration.status', {});
  expect(restored.ok && restored.value.pipe.solved).toEqual(before.ok && before.value.pipe.solved);
  expect(restored.ok && restored.value.pipe.drafts.logins).toEqual([2,3]);
  await system.reset();
});

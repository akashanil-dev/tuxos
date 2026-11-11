import { runTextPipeline } from '@tuxos/shell';
import { KernelError } from '@tuxos/kernel';
import { LEVELS, MAX_STAGES } from './levels';
export function evaluatePuzzle(id: unknown, indices: unknown) {
  const level = LEVELS.find(level => level.id === id);
  if (!level || !Array.isArray(indices) || indices.length > MAX_STAGES || indices.some(index => !Number.isInteger(index) || index < 0 || index >= level.blocks.length)) throw new KernelError('EINVAL', 'Choose a known puzzle and up to six available blocks.');
  const stages = (indices as number[]).map(index => level.blocks[index]!);
  const results = runTextPipeline(stages, level.input);
  const output = results.at(-1)?.stdout ?? level.input;
  const target = runTextPipeline(level.solution, level.input).at(-1)!.stdout;
  return { id: level.id, stages: [...indices] as number[], results, output, target,
    solved: stages.length > 0 && results.every(result => result.code === 0) && output === target,
    command: `cat ${level.file}${stages.map(stage => ' | ' + stage.join(' ')).join('')}` };
}

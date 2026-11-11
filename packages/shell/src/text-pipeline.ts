import { textCommands } from './commands/text';
export interface TextStageResult { stdout: string; stderr: string; code: number }
const filters = new Map(textCommands().filter(command => command.name !== 'echo').map(command => [command.name, command]));
/** Same implementations as the terminal, with no filesystem or shell execution available. */
export function runTextStage(stage: readonly string[], input: string): TextStageResult {
  const command = filters.get(stage[0] ?? '');
  if (!command) throw new Error('Unsupported text filter.');
  let stdout = '', stderr = '';
  const code = command.run({ args: stage.slice(1), stdin: input,
    stdout: text => { stdout += text; }, stderr: text => { stderr += text; }, resolve: path => path,
    dispatch: () => ({ ok: false, error: { code: 'EPERM', message: 'Puzzle filters only read their input.' } }),
  });
  return { stdout, stderr, code };
}
export function runTextPipeline(stages: readonly (readonly string[])[], input: string): TextStageResult[] {
  return stages.map(stage => { const result = runTextStage(stage, input); input = result.stdout; return result; });
}

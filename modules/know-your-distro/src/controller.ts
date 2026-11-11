import type { SystemClient } from '@tuxos/system';
import type { ExplorationProgress } from '@tuxos/sdk';
import type { GameStart } from './index';
import type { Mode } from './data';
import { RunnerGame, type GameEvent } from './model';
/** Coalesce frame inputs; persist only bounded checkpoints, never per-frame filesystem writes. */
export class RunnerController {
  game: RunnerGame;
  private pending: GameEvent[] = [];
  private sequence = 0;
  private queue: { sequence: number; events: GameEvent[] }[] = [];
  private saving: Promise<void> | null = null;
  records: ExplorationProgress['runner'];
  error = '';
  constructor(private system: SystemClient, private start: GameStart) { this.game = new RunnerGame(start.mode, start.seed); this.records = start.records; }
  static async create(system: SystemClient, mode: Mode): Promise<RunnerController> {
    const result = await system.dispatch<GameStart>('know-your-distro.start', { mode });
    if (!result.ok) throw new Error(result.error.message);
    return new RunnerController(system, result.value);
  }
  input(event: GameEvent): void {
    this.game.apply(event);
    const last = this.pending.at(-1);
    if (event.kind === 'frames' && last?.kind === 'frames' && last.input === event.input && last.count + event.count <= 1200) last.count += event.count;
    else this.pending.push(structuredClone(event));
  }
  async flush(): Promise<void> {
    if (this.pending.length) { this.queue.push({ sequence: ++this.sequence, events: this.pending }); this.pending = []; }
    if (!this.saving) {
      this.saving = (async () => {
        while (this.queue.length) {
          const batch = this.queue[0]!;
          try {
            const result = await this.system.dispatch<ExplorationProgress['runner']>('know-your-distro.checkpoint', { id: this.start.id, ...batch });
            if (!result.ok) throw new Error(result.error.message);
            this.records = result.value; this.queue.shift(); this.error = '';
          } catch (error) { this.error = error instanceof Error ? error.message : String(error); break; }
        }
      })().finally(() => { this.saving = null; });
    }
    await this.saving;
  }
  async sound(on: boolean): Promise<void> {
    const result = await this.system.dispatch('know-your-distro.sound', { sound: on });
    if (!result.ok) throw new Error(result.error.message);
    this.records.sound = on;
  }
}

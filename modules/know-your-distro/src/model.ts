import { KernelError } from '@tuxos/kernel';
import { TEAMS, TEAM_NAMES, teamOf, type Mode, type Team } from './data';
export const STEP = 1 / 120;
export const WIDTH = 1000, HEIGHT = 500, GROUND = 430, TILE = 60;
export const INPUT = { jump: 1, left: 2, right: 4 } as const;
export type Screen = 'launch' | 'pick' | 'play' | 'paused' | 'finish';
export interface Tile { id: number; name: string; x: number; y: number; correct: boolean; missed: boolean }
export interface Tux { x: number; y: number; vy: number; ground: boolean; held: boolean; airJumps: number; step: number; squash: number; hurt: number; sparkle: number; blink: number }
export interface GameState {
  mode: Mode; screen: Screen; team: Team | null; score: number; total: number; wrong: number; lives: number; streak: number;
  peakScore: number; peakCombo: number; peakTotal: number; rounds: { team: Team; score: number }[]; played: Team[];
  showcase: boolean; demonstration: boolean; mapSeen: boolean; secretFound: boolean;
  elapsed: number; distance: number; speed: number; weather: 'Clear' | 'Snow' | 'Overcast'; weatherTime: number;
  tux: Tux; tiles: Tile[]; nextTile: number; nextId: number; rng: number; input: number; message: string; messageTime: number;
}
export type GameEvent = { kind: 'choose'; team: Team } | { kind: 'frames'; count: number; input: number } | { kind: 'pause'; paused: boolean } | { kind: 'map' } | { kind: 'showcase'; password: string };
export function speedMultiplier(score: number): number { return Math.min(2, 1 + Math.max(0, Math.min(score - 50, 50)) * .001 + Math.max(0, score - 100) * .002); }
const newTux = (): Tux => ({ x: WIDTH * .22, y: GROUND, vy: 0, ground: true, held: false, airJumps: 3, step: 0, squash: 0, hurt: 0, sparkle: 0, blink: 2 });
/** Fixed simulation steps and seeded spawns make playback independent of rendering frequency. */
export class RunnerGame {
  state: GameState;
  constructor(mode: Mode, seed: number) {
    this.state = { mode, screen: 'pick', team: null, score: 0, total: 0, wrong: 0, lives: 10, streak: 0, peakScore: 0, peakCombo: 0, peakTotal: 0, rounds: [], played: [], showcase: false, demonstration: false, mapSeen: false, secretFound: false, elapsed: 0, distance: 400, speed: 170, weather: 'Clear', weatherTime: 0, tux: newTux(), tiles: [], nextTile: 260, nextId: 1, rng: seed >>> 0 || 1, input: 0, message: 'Choose a family to begin.', messageTime: 0 };
  }
  clone(): RunnerGame { const copy = new RunnerGame(this.state.mode, 1); copy.state = structuredClone(this.state); return copy; }
  private random(): number { let x = this.state.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.state.rng = x >>> 0; return this.state.rng / 4294967296; }
  apply(event: GameEvent): void {
    const state = this.state;
    switch (event.kind) {
      case 'choose': {
        if (!TEAM_NAMES.includes(event.team) || state.screen === 'finish') throw new KernelError('EINVAL', 'Choose an available family.');
        if (state.mode === 'Rapid' && (state.screen !== 'pick' || state.played.includes(event.team))) throw new KernelError('EINVAL', 'Rapid uses three different families; finish this round before switching.');
        state.team = event.team; state.score = 0; state.wrong = 0; state.lives = 10; state.streak = 0;
        state.played.push(event.team); state.played = state.played.slice(-100);
        state.screen = 'play'; state.tux = newTux(); state.tiles = []; state.nextTile = 260; state.input = 0;
        state.elapsed = 0; state.distance = 400; state.speed = 170; state.weather = 'Clear'; state.weatherTime = 0;
        state.message = `Collect ${event.team} relatives; jump over other families.`; state.messageTime = 4;
        return;
      }
      case 'pause':
        if (typeof event.paused !== 'boolean') throw new KernelError('EINVAL', 'Invalid pause input.');
        if (event.paused && state.screen === 'play') state.screen = 'paused';
        else if (!event.paused && state.screen === 'paused') state.screen = 'play';
        state.input = 0; state.tux.held = false; return;
      case 'map': state.mapSeen = true; return;
      case 'showcase':
        if (event.password !== 'ecoholic') throw new KernelError('EINVAL', 'That is not the showcase password.');
        state.showcase = !state.showcase; state.secretFound = true; state.demonstration = true; return;
      case 'frames':
        if (!Number.isInteger(event.count) || event.count < 1 || event.count > 1200 || !Number.isInteger(event.input) || event.input < 0 || event.input > 7) throw new KernelError('EINVAL', 'Invalid game input.');
        for (let i = 0; i < event.count; i++) this.step(event.input);
        return;
      default: throw new KernelError('EINVAL', 'Unknown game input.');
    }
  }
  private spawn(offset: number): void {
    const state = this.state, own = this.random() < .45;
    const pool: readonly string[] = own ? TEAMS[state.team!] : TEAM_NAMES.filter(team => team !== state.team).flatMap(team => [...TEAMS[team]]);
    const name = pool[Math.floor(this.random() * pool.length)]!;
    state.tiles.push({ id: state.nextId++, name, x: WIDTH + 20 + offset, y: GROUND - TILE - this.random() * 8, correct: teamOf(name) === state.team, missed: false });
  }
  private jump(): void {
    const tux = this.state.tux;
    if (tux.ground) { tux.vy = -620; tux.ground = false; tux.airJumps = 3; tux.squash = -.14; }
    else if (tux.airJumps > 0) { tux.vy = -434; tux.airJumps--; tux.sparkle = .3; }
  }
  private step(input: number): void {
    const s = this.state, t = s.tux;
    if (s.screen !== 'play') return;
    s.elapsed += STEP; s.speed = 170 * speedMultiplier(s.score); const move = s.speed * STEP; s.distance += move;
    s.weatherTime += STEP;
    if (s.weatherTime >= 20) { s.weatherTime -= 20; const choices = (['Clear','Snow','Overcast'] as const).filter(w => w !== s.weather); s.weather = choices[Math.floor(this.random() * choices.length)]!; }
    let jump = !!(input & INPUT.jump) && !(s.input & INPUT.jump);
    let held = !!(input & INPUT.jump);
    if (s.showcase) {
      const threat = s.tiles.find(tile => !tile.correct && tile.x - (t.x + 17) < 30 + s.speed * .12 && tile.x + TILE > t.x - 14);
      jump = !!threat && t.ground; held = !!threat;
    } else if (t.ground) t.x += ((input & INPUT.right ? 1 : 0) - (input & INPUT.left ? 1 : 0)) * 190 * STEP;
    t.x = Math.max(WIDTH * .1, Math.min(WIDTH * .8, t.x));
    if (jump) this.jump();
    s.input = input; t.held = held;
    t.vy += (t.vy < 0 && held ? 1040 : 1840) * STEP; t.y += t.vy * STEP;
    if (t.y >= GROUND) { if (!t.ground && t.vy > 250) t.squash = .16; t.y = GROUND; t.vy = 0; t.ground = true; t.airJumps = 3; }
    t.squash *= Math.pow(.0005, STEP); t.step += STEP * (6 + s.speed / 40);
    t.hurt = Math.max(0, t.hurt - STEP); t.sparkle = Math.max(0, t.sparkle - STEP);
    t.blink -= STEP; if (t.blink < -.12) t.blink = 2 + this.random() * 4;
    s.messageTime = Math.max(0, s.messageTime - STEP);
    s.nextTile -= move;
    if (s.nextTile <= 0) { const pair = this.random() < .25; this.spawn(0); if (pair) this.spawn(190); s.nextTile = 330 + this.random() * 170; }
    const box = { left: t.x - 14.4, right: t.x + 16.8, top: t.y - 48, bottom: t.y - 3 };
    const hit = new Set<number>();
    for (const tile of s.tiles) {
      tile.x -= move;
      if (!(box.left < tile.x + TILE - 5 && box.right > tile.x + 5 && box.top < tile.y + TILE - 5 && box.bottom > tile.y + 5)) {
        if (tile.correct && !tile.missed && tile.x + TILE < box.left) { tile.missed = true; s.streak = 0; }
        continue;
      }
      hit.add(tile.id);
      if (tile.correct) { s.score += 50; s.total += 50; s.streak++; s.message = `+50 · ${tile.name} belongs to ${s.team}.`; t.sparkle = .3; }
      else { s.score = Math.max(0, s.score - 20); s.total = Math.max(0, s.total - 20); s.wrong++; s.lives--; s.streak = 0; s.message = `−20 · ${tile.name} belongs to ${teamOf(tile.name)}.`; t.hurt = .6; }
      if (s.mode === 'Rapid') s.total = s.rounds.reduce((sum, round) => sum + round.score, 0) + s.score;
      s.messageTime = 3; s.peakScore = Math.max(s.peakScore, s.score); s.peakCombo = Math.max(s.peakCombo, s.streak); s.peakTotal = Math.max(s.peakTotal, s.total);
      if (s.lives === 0) {
        if (s.mode === 'Rapid') s.rounds.push({ team: s.team!, score: s.score });
        s.screen = s.mode === 'Rapid' && s.rounds.length === 3 ? 'finish' : 'pick';
        s.input = 0; t.held = false; break;
      }
    }
    s.tiles = s.tiles.filter(tile => tile.x + TILE > -40 && !hit.has(tile.id));
  }
}

/** Browser and module replay exactly the same bounded inputs, never caller-supplied scores. */
export function replay(game: RunnerGame, events: unknown): RunnerGame {
  if (!Array.isArray(events) || events.length > 1500) throw new KernelError('EINVAL', 'Game checkpoint is too large.');
  const copy = game.clone(); let frames = 0;
  for (const event of events) {
    if (!event || typeof event !== 'object') throw new KernelError('EINVAL', 'Invalid game event.');
    if (event.kind === 'frames') { frames += event.count; if (frames > 1200) throw new KernelError('EINVAL', 'Checkpoint exceeds ten seconds of play.'); }
    copy.apply(event as GameEvent);
  }
  return copy;
}

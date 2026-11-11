import { expect, it } from 'vitest';
import { createLocalSystem } from '@tuxos/system';
import { exploration } from '../../exploration/src';
import { knowYourDistro, type GameStart } from './index';
import { TEAM_NAMES, TEAMS, teamOf } from './data';
import { GROUND, INPUT, RunnerGame, replay, speedMultiplier, type GameEvent } from './model';
import { RunnerController } from './controller';

it('retains five complete families, every tile and the original speed ramp', () => {
  expect(TEAM_NAMES).toHaveLength(5);
  expect(TEAM_NAMES.flatMap(team => [...TEAMS[team]])).toHaveLength(32);
  expect(teamOf('SteamOS')).toBe('Arch'); expect(teamOf('Funtoo')).toBe('Gentoo');
  expect([0,50,100,300,1000].map(speedMultiplier)).toEqual([1,1,1.05,1.4500000000000002,2]);
});
it('produces identical physics at 30, 60 and 120 rendering frames per second', () => {
  const run = (ticksPerFrame: number) => {
    const game = new RunnerGame('Infinite', 12345); game.apply({kind:'choose',team:'Debian'});
    for (let ticks=0;ticks<6000;ticks+=ticksPerFrame) game.apply({kind:'frames', count:ticksPerFrame, input:ticks>=120&&ticks<240?INPUT.jump:0});
    return game.state;
  };
  expect(run(4)).toEqual(run(2)); expect(run(2)).toEqual(run(1));
});
it('supports held jumps, three air jumps, ground movement and pause without simulation drift', () => {
  const game = new RunnerGame('Rapid', 123); game.apply({kind:'choose',team:'Arch'});
  game.apply({kind:'frames', count:30,input:INPUT.right}); expect(game.state.tux.x).toBeGreaterThan(220);
  game.apply({kind:'frames', count:1,input:INPUT.jump}); expect(game.state.tux.ground).toBe(false);
  for(let i=0;i<3;i++) {game.apply({kind:'frames',count:1,input:0});game.apply({kind:'frames',count:1,input:INPUT.jump});}
  expect(game.state.tux.airJumps).toBe(0);
  const x=game.state.tux.x; game.apply({kind:'frames',count:20,input:INPUT.right}); expect(game.state.tux.x).toBe(x);
  game.apply({kind:'pause',paused:true});const paused=structuredClone(game.state);
  game.apply({kind:'frames',count:1200,input:INPUT.jump});expect(game.state).toEqual(paused);
  game.apply({kind:'pause',paused:false});game.apply({kind:'frames',count:1,input:0});expect(game.state.elapsed).toBeGreaterThan(paused.elapsed);
});
it('scores correct/wrong collisions, missed combos and all three Rapid rounds with distinct teams', () => {
  const game = new RunnerGame('Rapid', 123);game.apply({kind:'choose',team:'Debian'});
  const hit=(name:string,correct:boolean)=>{game.state.tiles=[{id:1,name,correct,x:game.state.tux.x,y:GROUND-60,missed:false}];game.apply({kind:'frames',count:1,input:0});};
  for(let i=0;i<10;i++)hit('Debian',true);
  expect(game.state).toMatchObject({score:500,total:500,streak:10,peakCombo:10});
  hit('Arch',false);expect(game.state).toMatchObject({score:480,total:480,lives:9,streak:0});
  for(let i=0;i<9;i++)hit('Arch',false);
  expect(game.state.screen).toBe('pick');expect(game.state.rounds[0]).toEqual({team:'Debian',score:300});
  expect(()=>game.apply({kind:'choose',team:'Debian'})).toThrow();
  game.apply({kind:'choose',team:'Arch'});
  for(let i=0;i<10;i++)hit('Debian',false);
  expect(game.state.total).toBe(300); // A new round's zero floor does not subtract earlier rounds.
  game.apply({kind:'choose',team:'Gentoo'});for(let i=0;i<10;i++)hit('Debian',false);
  expect(game.state.screen).toBe('finish');expect(game.state.rounds).toHaveLength(3);expect(game.state.total).toBe(300);
  expect(()=>game.apply({kind:'choose',team:'Slackware'})).toThrow();
});
it('finishes naturally generated Rapid games and lets Infinite carry totals across team switches', () => {
  const game = new RunnerGame('Rapid', 998);
  for(const team of TEAM_NAMES.slice(0,3)) {
    game.apply({kind:'choose',team});
    for(let count=0;count<200&&game.state.screen==='play';count++) game.apply({kind:'frames',count:1200,input:0});
    expect(game.state.screen).not.toBe('play');
  }
  expect(game.state.screen).toBe('finish');
  const infinite=new RunnerGame('Infinite',998);infinite.apply({kind:'choose',team:'Debian'});infinite.apply({kind:'frames',count:1200,input:0});
  const total=infinite.state.total;infinite.apply({kind:'choose',team:'Arch'});expect(infinite.state.total).toBe(total);expect(infinite.state.lives).toBe(10);
});
it('bounds replay input, changes weather, and marks showcase runs separately', () => {
  const game=new RunnerGame('Infinite',99);game.apply({kind:'choose',team:'Debian'});
  const unchanged=structuredClone(game.state);
  expect(()=>replay(game,[{kind:'frames',count:1201,input:0}])).toThrow();
  expect(()=>replay(game,[{kind:'frames',count:1000,input:0},{kind:'frames',count:1000,input:0}])).toThrow();
  expect(()=>replay(game,[{kind:'frames',count:1,input:99}])).toThrow();
  expect(()=>replay(game,[{kind:'choose',team:'nope'}])).toThrow();expect(game.state).toEqual(unchanged);
  game.apply({kind:'frames',count:1200,input:0});game.apply({kind:'frames',count:1200,input:0});game.apply({kind:'frames',count:1,input:0});
  expect(game.state.weather).not.toBe('Clear');
  game.apply({kind:'showcase',password:'ecoholic'});expect(game.state.demonstration).toBe(true);expect(game.state.showcase).toBe(true);
  game.apply({kind:'showcase',password:'ecoholic'});expect(game.state.showcase).toBe(false);expect(game.state.demonstration).toBe(true);
});

it('replays verified checkpoints, rejects stale/tutor submissions, and saves independent mode records', async () => {
  let saved: string|null=null;
  const system=createLocalSystem({modules:[exploration,knowYourDistro].map(m=>({manifest:m.manifest,load:async()=>m})),storage:{get:async()=>saved,set:async(_,next)=>{saved=next;},remove:async()=>{saved=null;}}});
  await system.boot('ada');await system.openApp('know-your-distro');
  const start=await system.dispatch<GameStart>('know-your-distro.start',{mode:'Rapid'});if(!start.ok)throw Error(start.error.message);
  let seq=0;const local=new RunnerGame('Rapid',start.value.seed);
  const checkpoint=async(events:GameEvent[])=>{for(const event of events)local.apply(event);const payload={id:start.value.id,sequence:++seq,events};const result=await system.dispatch('know-your-distro.checkpoint',payload);expect(result.ok,!result.ok?result.error.message:'').toBe(true);return payload;};
  for(const team of TEAM_NAMES.slice(0,3)) {
    await checkpoint([{kind:'choose',team}]);
    for(let i=0;i<200&&local.state.screen==='play';i++)await checkpoint([{kind:'frames',count:1200,input:0}]);
  }
  const status=async()=>{const r=await system.dispatch<any>('exploration.status',{});if(!r.ok)throw Error(r.error.message);return r.value;};
  expect((await status()).achievements.runner_rapid).toBeGreaterThan(0);
  expect((await status()).runner.rapidBest).toBe(local.state.total);
  expect((await status()).runner.infiniteHigh).toBe(0);
  const payload=await checkpoint([{kind:'map'}]);const before=await status();
  await system.dispatch('know-your-distro.checkpoint',payload);expect(await status()).toEqual(before);
  const tutor=system.tutor();tutor.setCapabilities(['exploration:write']);expect((await tutor.dispatch('know-your-distro.checkpoint',payload)).ok).toBe(false);
  const controller=await RunnerController.create(system,'Infinite');controller.input({kind:'choose',team:'Arch'});
  for(let i=0;i<8;i++){controller.input({kind:'frames',count:1200,input:0});await controller.flush();}
  expect(controller.error).toBe('');expect(controller.records.infiniteHigh).toBe(controller.game.state.peakTotal);
  expect((await system.dispatch('know-your-distro.checkpoint',payload)).ok).toBe(false);
  await controller.sound(false);await system.flush();await system.boot('ada');
  expect((await status()).runner).toMatchObject({rapidBest:local.state.total,infiniteHigh:controller.game.state.peakTotal,sound:false,mode:'Infinite',family:'Arch'});
  await system.reset();
});

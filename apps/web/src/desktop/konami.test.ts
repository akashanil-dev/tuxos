import { expect,it } from 'vitest';
import { createKonamiTracker } from './konami';
it('requires the complete ordered sequence without repeated or stale partial matches',()=>{
  const track=createKonamiTracker();let time=0;
  const code=['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  expect(code.map(key=>track(key,time+=50))).toEqual([...Array(9).fill(false),true]);
  expect(track('a',time+=50)).toBe(false);
  track('ArrowUp',time+=50);track('ArrowUp',time+=50);
  expect(code.slice(2).some(key=>track(key,time+=4000))).toBe(false);
});

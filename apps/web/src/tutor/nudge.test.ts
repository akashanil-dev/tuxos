import { expect,it } from 'vitest';
import type { KernelEvent } from '@tuxos/sdk';
import { createNudgePolicy, NUDGE_COOLDOWN } from './useStuckNudge';
const run=(code:number,actor='user')=>({action:{type:'shell.ran',payload:{line:'cat absent',code}},actor:{kind:actor},ok:true}) as KernelEvent;
it('offers help after two failures, expires its cooldown, respects dismissal, and ignores tutor/cancellation',()=>{
  let clock=100;const policy=createNudgePolicy(()=>clock);
  expect(policy.observe(run(1))).toBeUndefined();expect(policy.observe(run(1,'tutor'))).toBeUndefined();
  expect(policy.observe(run(1))?.text).toContain('cat absent');
  for(let i=0;i<10;i++)expect(policy.observe(run(1))).toBeUndefined();
  clock+=NUDGE_COOLDOWN;expect(policy.observe(run(1))).toBeTruthy();
  policy.dismiss();expect(policy.observe(run(1))).toBeUndefined();
  expect(policy.observe(run(130))).toBeNull();
  clock+=NUDGE_COOLDOWN;
  expect(policy.observe(run(1))).toBeUndefined();expect(policy.observe(run(1))).toBeTruthy();
  expect(policy.observe(run(0))).toBeNull();
});

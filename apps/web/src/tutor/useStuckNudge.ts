import type { SystemClient } from '@tuxos/system';
import type { KernelEvent } from '@tuxos/sdk';
import { useCallback, useEffect, useRef, useState } from 'react';
export interface Nudge { text: string; question: string }
export const NUDGE_COOLDOWN = 90_000;
export function createNudgePolicy(now = Date.now) {
  let failures=0,next=0;
  return {
    dismiss() { failures=0; next=now()+NUDGE_COOLDOWN; },
    observe(event: KernelEvent): Nudge | null | undefined {
      if(event.action.type!=='shell.ran'||event.actor.kind!=='user'||!event.ok)return undefined;
      const run=event.action.payload as {code:number;line:string};
      if(run.code===0||run.code===130){failures=0;return null;}
      failures++;
      if(failures<2||now()<next)return undefined;
      failures=0;next=now()+NUDGE_COOLDOWN;
      return { text:`“${run.line.slice(0,100)}” did not work. I can explain the error.`, question:'My last commands failed. What went wrong, and what should I try?' };
    },
  };
}
/** Local observation only. Dismissible, expires after 12 seconds, and never sends an AI request itself. */
export function useStuckNudge(system: SystemClient) {
  const [nudge,setNudge]=useState<Nudge|null>(null);
  const policy=useRef(createNudgePolicy());
  const expiry=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const dismiss=useCallback(()=>{policy.current.dismiss();clearTimeout(expiry.current);setNudge(null);},[]);
  useEffect(()=>{
    policy.current=createNudgePolicy();
    const stop=system.subscribe(event=>{
      const suggestion=policy.current.observe(event);if(suggestion===undefined)return;
      clearTimeout(expiry.current);setNudge(suggestion);
      if(suggestion)expiry.current=setTimeout(()=>setNudge(null),12_000);
    });
    return ()=>{stop();clearTimeout(expiry.current);};
  },[system]);
  return {nudge,dismiss};
}

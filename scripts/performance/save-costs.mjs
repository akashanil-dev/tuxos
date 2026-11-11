// CPU measurements of the actual kernel snapshot and portable save format. No user saves are read.
import { build } from 'esbuild';
import { cpus, totalmem, freemem } from 'node:os';
import { performance } from 'node:perf_hooks';
const code = await build({ entryPoints:['packages/kernel/src/index.ts'], bundle:true, write:false, format:'esm', platform:'node', target:'node22', logLevel:'silent' });
const { createKernel } = await import(`data:text/javascript;base64,${Buffer.from(code.outputFiles[0].text).toString('base64')}`);
const results=[];
function sample(fn) {
  for(let n=0;n<10;n++)fn();
  const times=[]; for(let n=0;n<50;n++){const start=performance.now();fn();times.push(performance.now()-start);}
  times.sort((a,b)=>a-b);return { samples:times.length, medianMs:+times[25].toFixed(3),p95Ms:+times[47].toFixed(3),maxMs:+times[49].toFixed(3) };
}
for(const count of [0,128,1024,3000]) {
  const kernel=createKernel({username:'explorer',journey:true,logLimit:0,now:()=>100});
  const content='A personal learning note. '.repeat(42);
  for(let i=0;i<count;i++){ const r=kernel.dispatch({type:'fs.write',payload:{path:`/home/explorer/Documents/note-${i}.txt`,content}});if(!r.ok)throw new Error(r.error.message); }
  const snapshot=kernel.snapshot(), portable={username:'explorer',snapshot},raw=JSON.stringify(portable);
  results.push({personalFiles:count,bytes:Buffer.byteLength(raw),snapshotClone:sample(()=>kernel.snapshot()),serialize:sample(()=>JSON.stringify(portable)),parse:sample(()=>JSON.parse(raw)),previousExport:sample(()=>JSON.stringify({username:kernel.user,snapshot:kernel.snapshot()})),completeExport:sample(()=>kernel.serializeSave()),atomicFileWrite:sample(()=>kernel.dispatch({type:'fs.write',payload:{path:'/home/explorer/Documents/probe.txt',content:'A bounded edit'}}))});
}
console.log(JSON.stringify({measuredAt:new Date().toISOString(),runtime:process.version,cpu:cpus()[0]?.model,logicalCpus:cpus().length,totalMemoryBytes:totalmem(),freeMemoryBytes:freemem(),method:'50 samples after 10 warmups; Node CPU timings, not browser storage/network latency. Synthetic files only; no performance assertions in functional tests.',results},null,2));

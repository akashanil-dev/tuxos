// Disposable filesystem + HTTP rehearsal. No deployment credentials, real service or user database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, cp, symlink, readlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile), deploy=resolve('deploy');
async function fixture(t,{legacy=false,broken=false}={}) {
  const work=await mkdtemp(join(tmpdir(),'tuxos-release-drill-')), root=join(work,'system'), candidate=join(work,'candidate'), previous=join(root,'releases','prior');
  t.after(()=>rm(work,{recursive:true,force:true}));
  const metadata=await readFile(join(deploy,'release.json'));
  async function release(path,marked=true) {
    await mkdir(join(path,'web'),{recursive:true});await mkdir(join(path,'api/src'),{recursive:true});
    await writeFile(join(path,'web/index.html'),'fictional release');await writeFile(join(path,'api/src/server.ts'),'// fictional service');
    if(marked)await writeFile(join(path,'release.json'),metadata);
  }
  await release(previous,!legacy);await release(candidate);await cp(deploy,join(candidate,'deploy'),{recursive:true});
  await symlink(previous,join(root,'current'));await writeFile(join(root,'learner-data'),'unchanged simulated account and new progress');
  const server=createServer(async(req,res)=>{const current=await readlink(join(root,'current'));res.statusCode=broken&&current.endsWith('/next')?503:200;res.end('{}');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const env={...process.env,TUXOS_ROOT:root,TUXOS_RESTART:'true',TUXOS_HEALTH_ATTEMPTS:'1',TUXOS_HEALTH_URL:`http://127.0.0.1:${server.address().port}/api/health`};
  async function run(name='next',extra={}){return exec('bash',[join(candidate,'deploy/deploy.sh'),name],{env:{...env,...extra}});}
  return {work,root,candidate,previous,release,run,env,unchanged:async()=>assert.equal(await readFile(join(root,'learner-data'),'utf8'),'unchanged simulated account and new progress')};
}
test('activates an immutable compatible release and retains previous release and data',async t=>{
  const f=await fixture(t);await f.run();assert.equal(await readlink(join(f.root,'current')),join(f.root,'releases/next'));await readFile(join(f.previous,'release.json'));await f.unchanged();
  await assert.rejects(f.run(),/already exists/);await f.unchanged();
});
test('failed health restores the compatible release without restoring the database',async t=>{
  const f=await fixture(t,{broken:true});await assert.rejects(f.run(),/Restoring compatible release prior/);assert.equal(await readlink(join(f.root,'current')),f.previous);await f.unchanged();
});
test('blocks an unsafe first rollout until a compatible recovery release is supplied',async t=>{
  const f=await fixture(t,{legacy:true});await assert.rejects(f.run(),/compatibility check failed/);assert.equal(await readlink(join(f.root,'current')),f.previous);
  await assert.rejects(f.run('next',{TUXOS_ROLLBACK_RELEASE:'missing'}),/does not exist/);
  const recovery=join(f.root,'releases/recovery');await f.release(recovery);await f.run('next',{TUXOS_ROLLBACK_RELEASE:'recovery'});await f.unchanged();
});
test('manual rollback refuses an old reader and accepts a compatible reader',async t=>{
  const f=await fixture(t);await f.run();await exec('bash',[join(deploy,'rollback.sh'),'prior'],{env:f.env});assert.equal(await readlink(join(f.root,'current')),f.previous);
  await f.release(join(f.root,'releases/old'),false);await assert.rejects(exec('bash',[join(deploy,'rollback.sh'),'old'],{env:f.env}),/compatibility check failed/);await f.unchanged();
});
test('invalid release identifiers cannot escape the releases directory',async t=>{
  const f=await fixture(t);for(const name of ['../escape','.','/tmp/escape','name with spaces'])await assert.rejects(f.run(name),/Invalid release name/);assert.equal(await readlink(join(f.root,'current')),f.previous);await f.unchanged();
});
test('a rejected restart also restores the compatible release',async t=>{
  const f=await fixture(t);const restart=join(f.work,'restart.sh');await writeFile(restart,`#!/usr/bin/env bash\n[[ "$(readlink "$TUXOS_ROOT/current")" != */next ]]\n`,{mode:0o700});await assert.rejects(f.run('next',{TUXOS_RESTART:restart}),/Restoring compatible release prior/);assert.equal(await readlink(join(f.root,'current')),f.previous);await f.unchanged();
});

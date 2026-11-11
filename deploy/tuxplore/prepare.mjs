// Build a reviewable legacy export candidate. Never changes the supplied source or deploys it.
import { cp, mkdir, readFile, writeFile, stat, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
const [input,output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node deploy/tuxplore/prepare.mjs <legacy-source> <new-output-directory>');
const source=resolve(input), target=resolve(output);
if(await stat(target).catch(()=>null)) throw new Error('Output already exists; choose a new directory.');
const boot=await readFile(join(source,'js/boot.js'),'utf8'), settings=await readFile(join(source,'js/apps/system.js'),'utf8'), about=await readFile(join(source,'about.html'),'utf8');
const bootNeedle='greeter.render(screen, { mode, ...steps[mode]() }, ctx);';
const settingsNeedle="link('about.html', 'About Tuxplore ↗'), link('stats.html', 'Public stats ↗'),";
for(const [text,needle] of [[boot,bootNeedle],[settings,settingsNeedle],[about,'</main>']]) if(text.split(needle).length!==2) throw new Error('Legacy structure differs from the reviewed source. Inspect it before preparing an export release.');
await mkdir(target,{recursive:true});
// Deliberate public-asset allowlist: never copy .git, credentials, databases or account backend files.
for(const name of ['index.html','about.html','stats.html','404.html','favicon.ico','favicon.svg','robots.txt','sitemap.xml','site.webmanifest','LICENSE','css','js','images']) {
  await cp(join(source,name),join(target,name),{recursive:true,filter:async path=>!(await lstat(path)).isSymbolicLink()});
}
await writeFile(join(target,'js/boot.js'),boot.replace(bootNeedle,"const continuationStep = steps[mode]();\n    continuationStep.links = [...(continuationStep.links || []), ['Tuxplore continues in TuxOS · export your progress', () => { location.href = 'export.html'; }]];\n    greeter.render(screen, { mode, ...continuationStep }, ctx);"));
await writeFile(join(target,'js/apps/system.js'),settings.replace(settingsNeedle,"link('export.html', 'Continue in TuxOS · export progress ↗'),\n            "+settingsNeedle));
await writeFile(join(target,'about.html'),about.replace('</main>','<section><h2>Tuxplore continues in TuxOS</h2><p>Your adventures and games can continue with deeper Linux lessons. <a href="export.html">Export your progress</a> before importing it into TuxOS. Keep playing here while you check the migration. No retirement date has been set.</p></section></main>'));
for(const name of ['export.html','export.mjs','archive.html']) await cp(new URL(name,import.meta.url),join(target,name));
await cp(join(source,'index.html'),join(target,'play.html'));
await writeFile(join(target,'export-candidate.json'),JSON.stringify({preparedAt:new Date().toISOString(),source,sourceHashes:Object.fromEntries([['js/boot.js',boot],['js/apps/system.js',settings],['about.html',about]].map(([path,text])=>[path,createHash('sha256').update(text).digest('hex')])),stage:'export bridge; legacy play, accounts, About and Stats retained; not deployed'},null,2)+'\n');
console.log(target);

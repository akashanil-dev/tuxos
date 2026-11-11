import { readFile, readdir } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { gzipSync } from 'node:zlib';
import { init, parse } from 'es-module-lexer';
await init;
const root = resolve(process.argv[2] || 'apps/web/dist');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const entry = /<script[^>]*type="module"[^>]*src="([^"]+)"/.exec(html)?.[1];
if (!entry) throw new Error('No production module entry found.');
const chunks = [];
for (const file of (await readdir(resolve(root, 'assets'))).filter(p => p.endsWith('.js'))) {
  const code = await readFile(resolve(root, 'assets', file), 'utf8');
  const [imports] = parse(code);
  chunks.push({ file, raw: Buffer.byteLength(code), gzip: gzipSync(code, { level: 9 }).length, staticImports: imports.filter(i => i.d === -1 && i.n?.startsWith('.')).map(i => basename(i.n)), dynamicImports: imports.filter(i => i.d >= 0 && i.n?.startsWith('.')).map(i => basename(i.n)) });
}
const initial = new Set();
function visit(name) { if (initial.has(name)) return; initial.add(name); const chunk = chunks.find(c => c.file === name); if (!chunk) throw new Error(`Missing ${name}`); chunk.staticImports.forEach(visit); }
visit(basename(entry));
const initialGzip = chunks.filter(c => initial.has(c.file)).reduce((n,c) => n+c.gzip,0);
if (process.argv.includes('--check') && initialGzip > 180000) throw new Error(`Startup JavaScript exceeds the continuation budget: ${initialGzip} > 180000 gzip bytes`);
console.log(JSON.stringify({ root, compression: 'gzip level 9, individual files', entry: chunks.find(c => c.file === basename(entry)), initial: { files: [...initial], raw: chunks.filter(c => initial.has(c.file)).reduce((n,c) => n+c.raw,0), gzip: chunks.filter(c => initial.has(c.file)).reduce((n,c) => n+c.gzip,0) }, chunks }, null, 2));

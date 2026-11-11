// Read-only local production comparison. The optional probe observes DOM/Performance entries;
// it never clicks, reads application storage, sends analytics, or enters data.
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
const args = process.argv.slice(2), root = await realpath(resolve(args[0] || 'apps/web/dist')), port = Number(args[1] || 5182), label = args[2] || 'current';
const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.jpg':'image/jpeg', '.ico':'image/x-icon', '.txt':'text/plain', '.woff2':'font/woff2' };
const probe = await readFile(new URL('./probe.js', import.meta.url));
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    let body, type;
    if (url.pathname === '/__performance-probe.js') { body = probe; type = 'text/javascript'; }
    else {
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      if (relative.split('/').some(part => part.startsWith('.'))) throw new Error('Unavailable path');
      const filename = await realpath(resolve(root, relative));
      if (!filename.startsWith(root+sep)) throw new Error('Unavailable path');
      type = types[extname(filename)]; if (!type) throw new Error('Unavailable type');
      body = await readFile(filename);
      if (extname(filename) === '.html' && url.searchParams.has('measure')) body = Buffer.from(body.toString().replace('<head>', `<head><script src="/__performance-probe.js" data-product="${label}" defer></script>`));
    }
    const gzip = /gzip/.test(request.headers['accept-encoding'] || '') && /text|json|svg/.test(type);
    const encoded = gzip ? gzipSync(body, { level: 9 }) : body;
    response.writeHead(200, { 'content-type': type, 'content-length': encoded.length, 'cache-control': 'no-cache', ...(gzip ? {'content-encoding':'gzip'} : {}) }); response.end(request.method === 'HEAD' ? undefined : encoded);
  } catch { response.writeHead(404); response.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`${label}: http://127.0.0.1:${port}/?measure`));

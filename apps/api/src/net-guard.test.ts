/**
 * @vitest-environment node
 */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { guardedFetch } from './net-guard.ts';

let server: Server;
let base = '';
const hits: string[] = [];

beforeAll(async () => {
  server = createServer((request, response) => {
    hits.push(request.url ?? '');
    if (request.url === '/redirect') { response.writeHead(302, { location: 'http://127.0.0.1/secret' }); response.end(); return; }
    if (request.url === '/big') { response.end('x'.repeat(5000)); return; }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ method: request.method, auth: request.headers.authorization ?? null }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('guardedFetch', () => {
  it('refuses this machine and private networks, by IP or by name, before connecting', async () => {
    const strict = guardedFetch({ allowPrivate: false, maxBytes: 1_000_000 });
    const before = hits.length;
    await expect(strict(`${base}/`)).rejects.toThrow('only https');
    await expect(strict(`${base.replace('http:', 'https:')}/`)).rejects.toThrow('not a public internet address');
    await expect(strict(`https://localhost:${new URL(base).port}/`)).rejects.toThrow('not a public internet address');
    expect(hits.length).toBe(before);
  });

  it('sends method, headers and body, never follows a redirect, and caps the response size', async () => {
    const local = guardedFetch({ allowPrivate: true, maxBytes: 1000 });
    const echoed = await local(`${base}/echo`, { method: 'POST', headers: { authorization: 'Bearer k' }, body: '{}' });
    expect(await echoed.json()).toEqual({ method: 'POST', auth: 'Bearer k' });
    const redirected = await local(`${base}/redirect`);
    expect(redirected.status).toBe(302);
    expect(hits).not.toContain('/secret');
    await expect(local(`${base}/big`)).rejects.toThrow('too large');
  });
});

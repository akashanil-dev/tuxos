// The API server. Node's own http module: no framework, and Node runs this TypeScript file directly.
//   GET  /api/health  -> { ok }
//   POST /api/tutor   -> one model call for the tutor (see tutor.ts)
//   /api/learning/*   -> the course trainers (see learning.ts)
//   /api/auth/*, /api/save -> accounts and saved progress (see accounts.ts)
//   /api/ai/*         -> the learner's own AI provider, model and key (see ai-keys.ts)
// AI calls use only the learner's own settings: a guest's from the request headers, else the account's saved
// ones (unless the account turned AI off). The server has no key of its own, so it never pays for anyone's AI.
// AI_FEATURES=1 is the master switch: without it no AI request is made at all, whatever a learner sets.

import { chmodSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Accounts, MAX_SAVE_BYTES } from './accounts.ts';
import { AI_HEADERS, AI_UNAVAILABLE, handleAiKey, savedSettings } from './ai-keys.ts';
import { redactKeys, resolveSettings } from './providers.ts';
import { RateLimiter } from './rate-limit.ts';
import { handleTutor, type AiCall } from './tutor.ts';
import { handleLearning } from './learning.ts';

// What AI the server allows. Everything is off unless switched on: AI itself (AI_FEATURES=1), learners'
// own addresses (ALLOW_CUSTOM_AI_URL=1, public https only) and private ones (ALLOW_PRIVATE_AI_URL=1, which is
// for local development only: it lets the server reach its own network).
const aiPolicy = {
  available: process.env.AI_FEATURES === '1',
  customAllowed: process.env.ALLOW_CUSTOM_AI_URL === '1',
  privateAllowed: process.env.ALLOW_CUSTOM_AI_URL === '1' && process.env.ALLOW_PRIVATE_AI_URL === '1',
};
const port = Number(process.env.PORT || 8787);
const MAX_BODY_BYTES = 512 * 1024;
const limiter = new RateLimiter(Number(process.env.TUTOR_REQUESTS_PER_MINUTE || 30), 60_000);
// Guessing passwords: a handful of sign-in attempts per minute per visitor is plenty for a person.
const authLimiter = new RateLimiter(Number(process.env.AUTH_ATTEMPTS_PER_MINUTE || 10), 60_000);
// Accounts live in SQLite. COOKIE_SECURE=0 only for plain-http setups other than localhost.
const databasePath = process.env.DATABASE_PATH || 'data/tuxos.db';
const accounts = new Accounts(databasePath, process.env.COOKIE_SECURE !== '0');
// Saved keys used to be sealed with this server-held secret. They are deleted on start (accounts.ts), so the
// secret can no longer open anything: remove it too.
if (databasePath !== ':memory:') rmSync(join(dirname(databasePath), 'key-secret'), { force: true });
if (process.env.OPENAI_API_KEY) console.warn('OPENAI_API_KEY is set but ignored: learners use their own keys. Remove it from the environment.');
if (aiPolicy.privateAllowed) console.warn('ALLOW_PRIVATE_AI_URL=1: custom AI addresses may reach this machine\'s network. Use it only in development.');
// Behind a reverse proxy (Caddy, then Cloudflare) every request comes from the proxy, so the rate limit
// would be shared by everyone. Only then trust the proxy's header naming the real visitor.
const trustProxy = process.env.TRUST_PROXY === '1';
const host = process.env.HOST || undefined;
// In production the API listens on a Unix socket that only the web server (Caddy, in Docker) can reach.
const socket = process.env.SOCKET || undefined;

/** The visitor's address: Cloudflare's or the proxy's header when trusted, else the socket's. */
function clientAddress(request: IncomingMessage): string {
  if (trustProxy) {
    const header = request.headers['cf-connecting-ip'] ?? request.headers['x-forwarded-for'];
    const first = (Array.isArray(header) ? header[0] : header)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.socket.remoteAddress ?? 'unknown';
}

const server = createServer(async (request, response) => {
  try {
    await route(request, response);
  } catch (error) {
    console.error(redactKeys(error instanceof Error ? error.stack ?? error.message : String(error)));
    send(response, 500, { error: 'Something went wrong on the server.' });
  }
});

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/api/health') {
    return send(response, 200, { ok: true });
  }
  if (request.method === 'POST' && url.pathname === '/api/tutor') {
    if (!limiter.allow(clientAddress(request))) {
      return send(response, 429, { error: 'Slow down a little: too many questions in a minute.' });
    }
    if (!aiPolicy.available) return send(response, 503, { error: AI_UNAVAILABLE });
    const body = await readJson(request);
    if (body === undefined) return send(response, 400, { error: 'The request body must be JSON under 512 KB.' });
    const reply = await handleTutor(body, requestAi(request));
    return send(response, reply.status, reply.body);
  }
  if (request.method === 'POST' && /^\/api\/learning\/(plan|evaluate|hint|answer)$/.test(url.pathname)) {
    if (!limiter.allow(clientAddress(request))) {
      return send(response, 429, { error: 'Slow down a little: too many learning requests in a minute.' });
    }
    if (!aiPolicy.available) return send(response, 503, { error: AI_UNAVAILABLE });
    const body = await readJson(request);
    if (body === undefined) return send(response, 400, { error: 'The request body must be JSON under 512 KB.' });
    const operation = url.pathname.slice('/api/learning/'.length);
    const reply = await handleLearning({ ...(body as Record<string, unknown>), operation }, requestAi(request));
    return send(response, reply.status, reply.body);
  }
  if (url.pathname.startsWith('/api/ai/')) {
    // Each check calls OpenAI, so share the AI rate limit; and refuse cross-site form posts, as below.
    if (!limiter.allow(clientAddress(request))) return send(response, 429, { error: 'Too many requests. Wait a minute and try again.' });
    if (request.method !== 'GET' && !request.headers['content-type']?.startsWith('application/json')) {
      return send(response, 415, { error: 'Send JSON.' });
    }
    const body = request.method === 'GET' ? null : await readJson(request);
    if (body === undefined) return send(response, 400, { error: 'The request body must be valid JSON.' });
    const cookie = request.headers.cookie;
    const reply = await handleAiKey(request.method ?? 'GET', url.pathname, body, cookie, !!accounts.user(cookie), accounts, aiPolicy);
    return send(response, reply.status, reply.body);
  }
  if (url.pathname.startsWith('/api/auth/') || url.pathname === '/api/save') {
    const guarded = request.method === 'POST' && /^\/api\/auth\/(login|register|verify)$/.test(url.pathname);
    if (guarded && !authLimiter.allow(clientAddress(request))) {
      return send(response, 429, { error: 'Too many attempts. Wait a minute and try again.' });
    }
    // The session is a cookie, so refuse cross-site form posts: those can't send a JSON content type.
    if (request.method !== 'GET' && !request.headers['content-type']?.startsWith('application/json')) {
      return send(response, 415, { error: 'Send JSON.' });
    }
    const limit = url.pathname === '/api/save' ? MAX_SAVE_BYTES * 2 : MAX_BODY_BYTES;
    const body = request.method === 'GET' ? null : await readJson(request, limit);
    if (body === undefined) return send(response, 400, { error: 'The request body must be valid JSON.' });
    const reply = await accounts.handle(request.method ?? 'GET', url.pathname, body, request.headers.cookie);
    return send(response, reply.status, reply.body, reply.cookie);
  }
  send(response, 404, { error: 'Not found.' });
}

/** This request's AI: a guest's settings from its headers, or the account's saved ones if its AI is on. */
function requestAi(request: IncomingMessage): AiCall | undefined {
  const header = (name: string) => {
    const value = request.headers[name];
    return typeof value === 'string' ? value : undefined;
  };
  const guest = header(AI_HEADERS.key) && {
    key: header(AI_HEADERS.key), provider: header(AI_HEADERS.provider), model: header(AI_HEADERS.model), baseUrl: header(AI_HEADERS.baseUrl),
  };
  const cookie = request.headers.cookie;
  const settings = guest || (accounts.aiEnabled(cookie) ? savedSettings(accounts, cookie) : undefined);
  if (!settings) return undefined;
  const resolved = resolveSettings(settings, aiPolicy);
  return 'error' in resolved ? undefined : resolved;
}

async function readJson(request: IncomingMessage, limit = MAX_BODY_BYTES): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > limit) return undefined;
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
}

function send(response: ServerResponse, status: number, body: unknown, cookie?: string): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...(cookie ? { 'set-cookie': cookie } : {}),
  });
  response.end(JSON.stringify(body));
}

if (socket) {
  // A socket file left behind by a crash would stop the server from starting.
  rmSync(socket, { force: true });
  server.listen(socket, () => {
    // The web server runs as a different user, so it must be allowed to connect.
    chmodSync(socket, 0o666);
    console.log(`tuxos API on ${socket} (AI ${aiPolicy.available ? 'on, with learners\' own keys' : 'off'})`);
  });
} else {
  server.listen(port, host, () => {
    console.log(`tuxos API on http://${host ?? 'localhost'}:${port} (AI ${aiPolicy.available ? 'on, with learners\' own keys' : 'off'})`);
  });
}

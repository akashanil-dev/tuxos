/**
 * @vitest-environment node
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { Accounts, type AccountReply } from './accounts.ts';
import { handleAiKey, KeyBox, savedSettings, sessionBox, unwrapVault } from './ai-keys.ts';

const KEY = 'gsk_abcdefghijklmnopqrstuvwxyz0123';
const SETTINGS = { provider: 'groq', model: 'llama-3.3-70b-versatile', key: KEY };
const policy = { available: true, customAllowed: false, privateAllowed: false };
const secret = Buffer.alloc(32, 7);
const cookieFrom = (reply: AccountReply) => reply.cookie!.split(';')[0]!;

/** A stand-in for a provider: GET /models lists two models for KEY only. */
const provider = (calls: string[] = []): typeof fetch => (async (url: string, init?: RequestInit) => {
  const auth = new Headers(init?.headers).get('authorization') ?? '';
  calls.push(`${url} ${auth}`);
  if (auth !== `Bearer ${KEY}`) return Response.json({ error: { message: 'Invalid API Key' } }, { status: 401 });
  return Response.json({ data: [{ id: 'llama-3.3-70b-versatile' }, { id: 'whisper-large-v3' }, { id: 'llama-3.1-8b-instant' }] });
}) as unknown as typeof fetch;

describe('KeyBox', () => {
  it('seals text so the stored form does not contain it, and opens it again', () => {
    const box = new KeyBox(secret);
    const sealed = box.seal(KEY);
    expect(sealed).not.toContain(KEY.slice(3, 20));
    expect(box.open(sealed)).toBe(KEY);
    // Two seals of the same key differ (random IV).
    expect(box.seal(KEY)).not.toBe(sealed);
  });

  it('refuses text sealed with another key, or tampered with', () => {
    const sealed = new KeyBox(secret).seal(KEY);
    expect(new KeyBox(Buffer.alloc(32, 8)).open(sealed)).toBeUndefined();
    const [version, iv, tag, data] = sealed.split('.');
    const flipped = `${data!.startsWith('A') ? 'B' : 'A'}${data!.slice(1)}`;
    expect(new KeyBox(secret).open([version, iv, tag, flipped].join('.'))).toBeUndefined();
  });
});

describe('/api/ai routes', () => {
  let accounts: Accounts | undefined;
  afterEach(() => accounts?.close());

  async function signedIn(path = ':memory:') {
    accounts = new Accounts(path, false);
    const reply = await accounts.handle('POST', '/api/auth/register', { username: 'ada', password: 'correct horse' }, undefined);
    return { accounts, cookie: cookieFrom(reply) };
  }
  const route = (store: Accounts, cookie: string | undefined, method: string, body: unknown = null, path = '/api/ai/key', options = policy, fetcher = provider()) =>
    handleAiKey(method, path, body, cookie, !!store.user(cookie), store, options, fetcher);

  it('lists the providers, and whether AI and custom addresses are available', async () => {
    const { accounts } = await signedIn();
    const reply = await route(accounts, undefined, 'GET', null, '/api/ai/providers', { ...policy, available: false });
    expect(reply.body).toMatchObject({ available: false, custom: false });
    expect((reply.body as { providers: { id: string }[] }).providers.map((each) => each.id)).toEqual(
      expect.arrayContaining(['groq', 'nvidia', 'openrouter', 'gemini', 'openai']),
    );
  });

  it('makes no provider request at all while the server has AI switched off', async () => {
    const { accounts, cookie } = await signedIn();
    const calls: string[] = [];
    const off = { ...policy, available: false };
    for (const [method, path] of [['POST', '/api/ai/models'], ['POST', '/api/ai/test'], ['PUT', '/api/ai/key']]) {
      expect(await route(accounts, cookie, method!, SETTINGS, path, off, provider(calls))).toMatchObject({ status: 503, body: { error: expect.stringContaining('rebuilt') } });
    }
    expect(calls).toHaveLength(0);
  });

  it('lists chat models for a key, leaving out ones that cannot chat', async () => {
    const { accounts } = await signedIn();
    expect(await route(accounts, undefined, 'POST', { provider: 'groq', key: KEY }, '/api/ai/models')).toEqual({
      status: 200, body: { models: [{ id: 'llama-3.1-8b-instant', free: false }, { id: 'llama-3.3-70b-versatile', free: false }] },
    });
    expect(await route(accounts, undefined, 'POST', { provider: 'groq', key: 'gsk_wrong-key-000000000' }, '/api/ai/models')).toMatchObject({ status: 400 });
    expect(await route(accounts, undefined, 'POST', { provider: 'nope', key: KEY }, '/api/ai/models')).toMatchObject({ status: 400 });
  });

  it('saves checked settings, reports only a hint, and forgets them', async () => {
    const { accounts, cookie } = await signedIn();
    expect(await route(accounts, cookie, 'GET')).toEqual({ status: 200, body: { saved: false, enabled: false } });
    expect(await route(accounts, cookie, 'PUT', { ...SETTINGS, model: 'not-a-groq-model' })).toMatchObject({ status: 400, body: { error: expect.stringContaining('does not offer') } });
    expect(await route(accounts, cookie, 'PUT', SETTINGS)).toEqual({ status: 200, body: { saved: true, provider: 'groq', model: SETTINGS.model, hint: 'gsk_…0123' } });
    expect(savedSettings(accounts, cookie)).toEqual(SETTINGS);
    expect(await route(accounts, cookie, 'GET')).toEqual({ status: 200, body: { saved: true, provider: 'groq', model: SETTINGS.model, hint: 'gsk_…0123', enabled: false } });
    // Changing the model keeps the saved key, but a key is never reused for another provider.
    expect(await route(accounts, cookie, 'PUT', { provider: 'groq', model: 'llama-3.1-8b-instant' })).toMatchObject({ status: 200 });
    expect(savedSettings(accounts, cookie)?.key).toBe(KEY);
    expect(await route(accounts, cookie, 'PUT', { provider: 'mistral', model: 'x' })).toMatchObject({ status: 400, body: { error: expect.stringContaining('Enter your API key') } });
    expect(await route(accounts, cookie, 'DELETE', {})).toEqual({ status: 200, body: { saved: false } });
    expect(savedSettings(accounts, cookie)).toBeUndefined();
  });

  it('stores the settings so that the database and server files alone cannot reveal the key', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'tuxos-vault-')), 'tuxos.db');
    const { accounts: first, cookie } = await signedIn(path);
    await route(first, cookie, 'PUT', SETTINGS);
    first.close();
    // Nothing in the database file (or its write-ahead log) contains the key, a usable part of it, or the provider.
    for (const file of [path, `${path}-wal`]) {
      const bytes = (() => { try { return readFileSync(file).toString('latin1'); } catch { return ''; } })();
      expect(bytes).not.toContain(KEY.slice(4, 20));
      expect(bytes).not.toContain('0123');
      expect(bytes).not.toContain('llama');
    }
    // What the server stores about the session is a hash of its token: it does not open the session's vault.
    const db = new DatabaseSync(path);
    const session = db.prepare('SELECT token_hash, vault FROM sessions').get() as { token_hash: string; vault: string };
    expect(unwrapVault(sessionBox(session.token_hash), session.vault)).toBeUndefined();
    // The learner's own cookie does.
    expect(unwrapVault(sessionBox(cookie.split('=')[1]!), session.vault)).toHaveLength(32);
    db.close();
    accounts = new Accounts(path, false);
    expect(savedSettings(accounts, cookie)).toEqual(SETTINGS);
  });

  it('unlocks the settings in every new session with the password, and not after signing out', async () => {
    const { accounts, cookie } = await signedIn();
    await route(accounts, cookie, 'PUT', SETTINGS);
    const again = await accounts.handle('POST', '/api/auth/login', { username: 'ada', password: 'correct horse' }, undefined);
    expect(savedSettings(accounts, cookieFrom(again))).toEqual(SETTINGS);
    await accounts.handle('POST', '/api/auth/logout', {}, cookie);
    expect(savedSettings(accounts, cookie)).toBeUndefined();
    expect(savedSettings(accounts, cookieFrom(again))).toEqual(SETTINGS);
  });

  it('deletes keys saved before providers, and asks old sessions to sign in again', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'tuxos-legacy-')), 'tuxos.db');
    const db = new DatabaseSync(path);
    db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE ai_keys (user_id INTEGER PRIMARY KEY, sealed TEXT NOT NULL, updated_at INTEGER NOT NULL);
      INSERT INTO users VALUES (1, 'ada', 'scrypt$x$y', 0);
      INSERT INTO sessions VALUES ('${createHashHex('old-token')}', 1, ${Date.now() + 86_400_000});
      INSERT INTO ai_keys VALUES (1, 'v2.a.b.c', 0);`);
    db.close();
    accounts = new Accounts(path, false);
    const old = 'tuxos_session=old-token';
    expect(accounts.user(old)?.username).toBe('ada');
    expect(accounts.hasAiSecret(old)).toBe(false);
    expect(await route(accounts, old, 'GET')).toEqual({ status: 200, body: { saved: false, enabled: false, locked: true } });
    expect(await route(accounts, old, 'PUT', SETTINGS)).toMatchObject({ status: 409, body: { error: expect.stringContaining('sign in again') } });
  });

  it('keeps AI off until the learner turns it on', async () => {
    const { accounts, cookie } = await signedIn();
    expect(accounts.aiEnabled(cookie)).toBe(false);
    expect(await route(accounts, cookie, 'PUT', { enabled: 'no' }, '/api/ai/settings')).toMatchObject({ status: 400 });
    expect(await route(accounts, cookie, 'PUT', { enabled: true }, '/api/ai/settings')).toEqual({ status: 200, body: { enabled: true } });
    expect(accounts.aiEnabled(cookie)).toBe(true);
    await route(accounts, cookie, 'PUT', { enabled: false }, '/api/ai/settings');
    expect(accounts.aiEnabled(cookie)).toBe(false);
  });

  it('needs an account to save, but lets guests check their settings', async () => {
    const { accounts } = await signedIn();
    expect(await route(accounts, undefined, 'PUT', SETTINGS)).toMatchObject({ status: 401 });
    expect(await route(accounts, undefined, 'PUT', { enabled: false }, '/api/ai/settings')).toMatchObject({ status: 401 });
    const calls: string[] = [];
    expect(await route(accounts, undefined, 'POST', SETTINGS, '/api/ai/test', policy, provider(calls)))
      .toEqual({ status: 200, body: { ok: true, hint: 'gsk_…0123' } });
    expect(calls).toEqual([`https://api.groq.com/openai/v1/models Bearer ${KEY}`]);
    expect(await route(accounts, undefined, 'POST', { ...SETTINGS, key: 'nope' }, '/api/ai/test')).toMatchObject({ status: 400 });
  });

  it('refuses custom addresses unless the server allows them', async () => {
    const { accounts } = await signedIn();
    const custom = { provider: 'custom', model: 'm', key: KEY, baseUrl: 'https://llm.example.com/v1' };
    expect(await route(accounts, undefined, 'POST', custom, '/api/ai/test')).toMatchObject({ status: 400, body: { error: expect.stringContaining('not enabled') } });
    const calls: string[] = [];
    const allowed = { ...policy, customAllowed: true };
    const fetcher = (async (url: string) => { calls.push(url); return Response.json({ data: [{ id: 'm' }] }); }) as unknown as typeof fetch;
    expect(await route(accounts, undefined, 'POST', custom, '/api/ai/test', allowed, fetcher)).toMatchObject({ status: 200 });
    expect(calls).toEqual(['https://llm.example.com/v1/models']);
  });
});

function createHashHex(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

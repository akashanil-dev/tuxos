/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it } from 'vitest';
import { Accounts, type AccountReply } from './accounts.ts';

let accounts: Accounts;
afterEach(() => accounts?.close());

/** The cookie a browser would send back after this reply. */
const cookieFrom = (reply: AccountReply) => reply.cookie?.split(';')[0];

describe('accounts', () => {
  it('creates an account, signs in with its password and reports who is signed in', async () => {
    accounts = new Accounts(':memory:');
    const created = await accounts.handle('POST', '/api/auth/register', { username: 'ada', password: 'x' }, undefined);
    expect(created).toMatchObject({ status: 201, body: { username: 'ada' } });
    expect(created.cookie).toMatch(/^tuxos_session=[\w-]+; Path=\/api; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure$/);
    expect(await accounts.handle('GET', '/api/auth/me', null, cookieFrom(created)))
      .toEqual({ status: 200, body: { username: 'ada' } });

    const signedIn = await accounts.handle('POST', '/api/auth/login', { username: 'ada', password: 'x' }, undefined);
    expect(signedIn.status).toBe(200);
    expect(cookieFrom(signedIn)).not.toBe(cookieFrom(created));
  });

  it('refuses wrong passwords, unknown users, taken names and invalid usernames', async () => {
    accounts = new Accounts(':memory:');
    await accounts.handle('POST', '/api/auth/register', { username: 'ada', password: 'right' }, undefined);
    const wrong = await accounts.handle('POST', '/api/auth/login', { username: 'ada', password: 'wrong' }, undefined);
    const unknown = await accounts.handle('POST', '/api/auth/login', { username: 'bob', password: 'right' }, undefined);
    // The same answer either way, so nobody can find out which usernames exist.
    expect(wrong).toEqual({ status: 401, body: { error: 'Wrong username or password.' } });
    expect(unknown).toEqual(wrong);
    expect((await accounts.handle('POST', '/api/auth/register', { username: 'ada', password: 'y' }, undefined)).status).toBe(409);
    for (const username of ['Ada', 'root', '9lives', 'a b', '']) {
      expect((await accounts.handle('POST', '/api/auth/register', { username, password: 'y' }, undefined)).status).toBe(400);
    }
    expect((await accounts.handle('POST', '/api/auth/register', { username: 'eve', password: '' }, undefined)).status).toBe(400);
  });

  it('stores only a salted hash of the password', async () => {
    accounts = new Accounts(':memory:');
    await accounts.handle('POST', '/api/auth/register', { username: 'ada', password: 'hunter2' }, undefined);
    await accounts.handle('POST', '/api/auth/register', { username: 'bob', password: 'hunter2' }, undefined);
    const rows = (accounts as unknown as { db: { prepare(sql: string): { all(): { password_hash: string }[] } } })
      .db.prepare('SELECT password_hash FROM users').all();
    expect(rows.every((row) => row.password_hash.startsWith('scrypt$') && !row.password_hash.includes('hunter2'))).toBe(true);
    expect(rows[0]!.password_hash).not.toBe(rows[1]!.password_hash);
  });

  it('checks the signed-in account\'s password for sudo', async () => {
    accounts = new Accounts(':memory:');
    const cookie = cookieFrom(await accounts.handle('POST', '/api/auth/register', { username: 'ada', password: 'pw' }, undefined));
    expect((await accounts.handle('POST', '/api/auth/verify', { password: 'pw' }, cookie)).status).toBe(200);
    expect((await accounts.handle('POST', '/api/auth/verify', { password: 'nope' }, cookie)).status).toBe(403);
    expect((await accounts.handle('POST', '/api/auth/verify', { password: 'pw' }, undefined)).status).toBe(401);
  });

  it('saves progress with versions, so an older tab cannot overwrite newer progress', async () => {
    accounts = new Accounts(':memory:');
    const cookie = cookieFrom(await accounts.handle('POST', '/api/auth/register', { username: 'ada', password: 'pw' }, undefined));
    expect(await accounts.handle('GET', '/api/save', null, cookie)).toEqual({ status: 200, body: { data: null, version: 0 } });
    expect(await accounts.handle('PUT', '/api/save', { data: '{"a":1}', version: 0 }, cookie)).toEqual({ status: 200, body: { version: 1 } });
    expect(await accounts.handle('PUT', '/api/save', { data: '{"a":2}', version: 1 }, cookie)).toEqual({ status: 200, body: { version: 2 } });
    const stale = await accounts.handle('PUT', '/api/save', { data: '{"old":true}', version: 1 }, cookie);
    expect(stale).toMatchObject({ status: 409, body: { version: 2 } });
    expect(await accounts.handle('GET', '/api/save', null, cookie)).toEqual({ status: 200, body: { data: '{"a":2}', version: 2 } });
    expect((await accounts.handle('GET', '/api/save', null, undefined)).status).toBe(401);
  });

  it('signs out by ending the session', async () => {
    accounts = new Accounts(':memory:');
    const cookie = cookieFrom(await accounts.handle('POST', '/api/auth/register', { username: 'ada', password: 'pw' }, undefined));
    const out = await accounts.handle('POST', '/api/auth/logout', {}, cookie);
    expect(out.cookie).toContain('Max-Age=0');
    expect((await accounts.handle('GET', '/api/auth/me', null, cookie)).status).toBe(401);
  });

  it('rejects a snapshot downgrade even when the caller has the current save version', async () => {
    accounts = new Accounts(':memory:');
    const cookie = cookieFrom(await accounts.handle('POST', '/api/auth/register', { username: 'ada', password: 'pw' }, undefined));
    const data = JSON.stringify({ username: 'ada', snapshot: { version: 2, state: {} } });
    expect((await accounts.handle('PUT', '/api/save', { data, version: 0 }, cookie)).status).toBe(200);
    const old = JSON.stringify({ username: 'ada', snapshot: { version: 1, state: {} } });
    expect((await accounts.handle('PUT', '/api/save', { data: old, version: 1 }, cookie)).status).toBe(409);
    expect(await accounts.handle('GET', '/api/save', null, cookie)).toEqual({ status: 200, body: { data, version: 1 } });
  });

  it('expires sessions after 30 days', async () => {
    let now = 1_000;
    accounts = new Accounts(':memory:', true, () => now);
    const cookie = cookieFrom(await accounts.handle('POST', '/api/auth/register', { username: 'ada', password: 'pw' }, undefined));
    now += 31 * 24 * 60 * 60 * 1000;
    expect((await accounts.handle('GET', '/api/auth/me', null, cookie)).status).toBe(401);
  });
});

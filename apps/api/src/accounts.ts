// Accounts: a username and password, and the learner's saved TuxOS (the same snapshot the browser keeps for
// guests). Stored in SQLite with Node's built-in driver, so the API still has no dependencies.
//   POST /api/auth/register {username, password}  -> creates the account and signs in
//   POST /api/auth/login    {username, password}  -> signs in
//   POST /api/auth/logout                         -> signs out
//   GET  /api/auth/me                             -> {username} of the signed-in account
//   POST /api/auth/verify   {password}            -> checks the signed-in account's password (Vasi's sudo)
//   GET  /api/save                                -> {data, version}
//   PUT  /api/save          {data, version}       -> saves if version matches, else 409 (changed elsewhere)
// It also keeps each account's own AI settings (provider, model, key) and whether its AI is on (ai-keys.ts).
// Passwords are kept only as salted scrypt hashes; sessions are random tokens in an HttpOnly cookie, and
// only a hash of each token is stored. AI settings are sealed with the account's vault key, which is stored
// only wrapped by the password and by each session's token (see ai-keys.ts), so the server can't read it.

import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { KeyBox, passwordBox, sessionBox, unwrapVault, wrapVault, type KeyStore } from './ai-keys.ts';

export interface AccountReply {
  status: number;
  body: unknown;
  /** A Set-Cookie header value, when signing in or out. */
  cookie?: string;
}

/** The same rule the TuxOS kernel uses for Linux usernames, so the account name is the learner's login. */
const USERNAME = /^[a-z_][a-z0-9_-]{0,31}$/;
const MAX_PASSWORD = 1024;
/** A saved system is a JSON snapshot of the learner's files and progress. */
export const MAX_SAVE_BYTES = 4 * 1024 * 1024;
const SESSION_DAYS = 30;
const COOKIE = 'tuxos_session';
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password: string, salt = randomBytes(16)): Promise<string> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }, (error, key) => {
      if (error) reject(error);
      else resolve(`scrypt$${salt.toString('base64')}$${key.toString('base64')}`);
    });
  });
}

async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = (await hashPassword(password, Buffer.from(salt, 'base64'))).split('$')[2]!;
  const a = Buffer.from(candidate, 'base64');
  const b = Buffer.from(hash, 'base64');
  return a.length === b.length && timingSafeEqual(a, b);
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export class Accounts implements KeyStore {
  private readonly db: DatabaseSync;
  /** Spent on wrong usernames too, so a reply's timing doesn't reveal which usernames exist. */
  private readonly decoy: Promise<string>;
  private readonly secureCookie: boolean;
  private readonly now: () => number;

  // Plain fields, not constructor parameter properties: Node runs this file by stripping types, which
  // doesn't support them.
  constructor(path: string, secureCookie = true, now = () => Date.now()) {
    this.secureCookie = secureCookie;
    this.now = now;
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS saves (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        data TEXT NOT NULL,
        version INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    // Older saved keys were sealed with a server secret (readable by the server's operators), or were a bare
    // OpenAI key rather than full provider settings: delete them, and learners enter their settings once more.
    const columns = (table: string) => (this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    if (!columns('ai_keys').includes('format')) this.db.exec('DROP TABLE IF EXISTS ai_keys');
    if (!columns('sessions').includes('vault')) this.db.exec('ALTER TABLE sessions ADD COLUMN vault TEXT');
    if (!columns('users').includes('ai_enabled')) this.db.exec('ALTER TABLE users ADD COLUMN ai_enabled INTEGER NOT NULL DEFAULT 0');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vaults (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        salt TEXT NOT NULL,
        wrapped TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ai_keys (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        sealed TEXT NOT NULL,
        format INTEGER NOT NULL DEFAULT 2,
        updated_at INTEGER NOT NULL
      );
    `);
    this.decoy = hashPassword('decoy');
  }

  close(): void {
    this.db.close();
  }

  async handle(method: string, path: string, body: unknown, cookieHeader: string | undefined): Promise<AccountReply> {
    const user = this.sessionUser(cookieHeader);
    switch (`${method} ${path}`) {
      case 'POST /api/auth/register': return this.register(body);
      case 'POST /api/auth/login': return this.login(body);
      case 'POST /api/auth/logout': return this.logout(cookieHeader);
      case 'GET /api/auth/me':
        return user ? { status: 200, body: { username: user.username } } : notSignedIn();
      case 'POST /api/auth/verify': {
        if (!user) return notSignedIn();
        const password = (body as { password?: unknown } | null)?.password;
        const ok = typeof password === 'string' && await passwordMatches(password, user.password_hash);
        return ok ? { status: 200, body: { ok: true } } : { status: 403, body: { error: 'Sorry, try again.' } };
      }
      case 'GET /api/save': {
        if (!user) return notSignedIn();
        const save = this.db.prepare('SELECT data, version FROM saves WHERE user_id = ?').get(user.id) as
          { data: string; version: number } | undefined;
        return { status: 200, body: save ?? { data: null, version: 0 } };
      }
      case 'PUT /api/save': return user ? this.save(user.id, body) : notSignedIn();
      default: return { status: 404, body: { error: 'Not found.' } };
    }
  }

  private async register(body: unknown): Promise<AccountReply> {
    const { username, password } = credentials(body);
    if (!username || !USERNAME.test(username) || username === 'root') {
      return { status: 400, body: { error: 'Usernames are lowercase letters, digits, - and _, starting with a letter.' } };
    }
    if (!password) return { status: 400, body: { error: 'Choose a password.' } };
    if (password.length > MAX_PASSWORD) return { status: 400, body: { error: 'That password is too long.' } };
    const hash = await hashPassword(password);
    try {
      const created = this.db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
        .run(username, hash, this.now());
      return await this.signIn(Number(created.lastInsertRowid), username, password, 201);
    } catch (error) {
      if (String(error).includes('UNIQUE')) return { status: 409, body: { error: 'That username is taken.' } };
      throw error;
    }
  }

  private async login(body: unknown): Promise<AccountReply> {
    const { username, password } = credentials(body);
    const user = username
      ? this.db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username) as
        { id: number; username: string; password_hash: string } | undefined
      : undefined;
    const usable = password !== undefined && password.length <= MAX_PASSWORD;
    let ok = false;
    if (user && usable) ok = await passwordMatches(password, user.password_hash);
    else await passwordMatches(usable ? password : '', await this.decoy);
    if (!user || !ok) return { status: 401, body: { error: 'Wrong username or password.' } };
    return this.signIn(user.id, user.username, password!, 200);
  }

  private logout(cookieHeader: string | undefined): AccountReply {
    const token = readCookie(cookieHeader);
    if (token) this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
    return { status: 200, body: { ok: true }, cookie: this.cookie('', 0) };
  }

  private save(userId: number, body: unknown): AccountReply {
    const { data, version } = (body ?? {}) as { data?: unknown; version?: unknown };
    if (typeof data !== 'string' || typeof version !== 'number' || !Number.isInteger(version)) {
      return { status: 400, body: { error: 'Expected { data, version }.' } };
    }
    if (Buffer.byteLength(data) > MAX_SAVE_BYTES) return { status: 413, body: { error: 'This save is too large.' } };
    const current = (this.db.prepare('SELECT version FROM saves WHERE user_id = ?').get(userId) as
      { version: number } | undefined)?.version ?? 0;
    // Another tab or device saved since this one loaded: refuse rather than overwrite newer progress.
    if (version !== current) {
      return { status: 409, body: { error: 'Your progress was saved from somewhere else. Reload to continue.', version: current } };
    }
    const next = current + 1;
    this.db.prepare(`INSERT INTO saves (user_id, data, version, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, version = excluded.version, updated_at = excluded.updated_at`)
      .run(userId, data, next, this.now());
    return { status: 200, body: { version: next } };
  }

  /** The signed-in account, if the cookie belongs to a live session. */
  user(cookieHeader: string | undefined): { id: number; username: string } | undefined {
    const user = this.sessionUser(cookieHeader);
    return user && { id: user.id, username: user.username };
  }

  /** The signed-in account's AI settings, decrypted in memory for this request only. Never log them. */
  aiSecret(cookieHeader: string | undefined): string | undefined {
    const session = this.session(cookieHeader);
    if (!session?.vault) return undefined;
    const row = this.db.prepare('SELECT sealed FROM ai_keys WHERE user_id = ?').get(session.id) as { sealed: string } | undefined;
    return row ? new KeyBox(session.vault).open(row.sealed) : undefined;
  }

  setAiSecret(cookieHeader: string | undefined, secret: string): boolean {
    const session = this.session(cookieHeader);
    if (!session?.vault) return false;
    this.db.prepare(`INSERT INTO ai_keys (user_id, sealed, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET sealed = excluded.sealed, updated_at = excluded.updated_at`)
      .run(session.id, new KeyBox(session.vault).seal(secret), this.now());
    return true;
  }

  removeAiSecret(cookieHeader: string | undefined): void {
    const user = this.sessionUser(cookieHeader);
    if (user) this.db.prepare('DELETE FROM ai_keys WHERE user_id = ?').run(user.id);
  }

  hasAiSecret(cookieHeader: string | undefined): boolean {
    const user = this.sessionUser(cookieHeader);
    return !!user && !!this.db.prepare('SELECT 1 FROM ai_keys WHERE user_id = ?').get(user.id);
  }

  /** Whether this session holds the account's vault, so it can save and use AI settings. */
  canUnlock(cookieHeader: string | undefined): boolean {
    return !!this.session(cookieHeader)?.vault;
  }

  /** The account's AI switch (Settings → AI), off until the learner turns it on. Off: no AI call is made. */
  aiEnabled(cookieHeader: string | undefined): boolean {
    return this.sessionUser(cookieHeader)?.ai_enabled === 1;
  }

  setAiEnabled(cookieHeader: string | undefined, enabled: boolean): void {
    const user = this.sessionUser(cookieHeader);
    if (user) this.db.prepare('UPDATE users SET ai_enabled = ? WHERE id = ?').run(enabled ? 1 : 0, user.id);
  }

  /**
   * The account's vault key, from its password: made on the first sign-in. If it can't be opened (it was
   * wrapped with a password that no longer applies), a new vault replaces it and the unreadable key is dropped.
   */
  private async unlockVault(userId: number, password: string): Promise<Buffer> {
    const row = this.db.prepare('SELECT salt, wrapped FROM vaults WHERE user_id = ?').get(userId) as
      { salt: string; wrapped: string } | undefined;
    if (row) {
      const vault = unwrapVault(await passwordBox(password, Buffer.from(row.salt, 'base64')), row.wrapped);
      if (vault) return vault;
    }
    const vault = randomBytes(32);
    const salt = randomBytes(16);
    const wrapped = wrapVault(await passwordBox(password, salt), vault);
    this.db.prepare(`INSERT INTO vaults (user_id, salt, wrapped) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET salt = excluded.salt, wrapped = excluded.wrapped`).run(userId, salt.toString('base64'), wrapped);
    this.db.prepare('DELETE FROM ai_keys WHERE user_id = ?').run(userId);
    return vault;
  }

  private async signIn(userId: number, username: string, password: string, status: number): Promise<AccountReply> {
    const vault = await this.unlockVault(userId, password);
    const token = randomBytes(32).toString('base64url');
    const expires = this.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(this.now());
    this.db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, vault) VALUES (?, ?, ?, ?)')
      .run(tokenHash(token), userId, expires, wrapVault(sessionBox(token), vault));
    return { status, body: { username }, cookie: this.cookie(token, SESSION_DAYS * 24 * 60 * 60) };
  }

  /** The signed-in account and its vault key, opened with this request's session token. */
  private session(cookieHeader: string | undefined): { id: number; vault: Buffer | undefined } | undefined {
    const token = readCookie(cookieHeader);
    if (!token) return undefined;
    const row = this.db.prepare('SELECT user_id, vault FROM sessions WHERE token_hash = ? AND expires_at > ?')
      .get(tokenHash(token), this.now()) as { user_id: number; vault: string | null } | undefined;
    return row && { id: row.user_id, vault: unwrapVault(sessionBox(token), row.vault) };
  }

  private sessionUser(cookieHeader: string | undefined) {
    const token = readCookie(cookieHeader);
    if (!token) return undefined;
    return this.db.prepare(`SELECT users.id, users.username, users.password_hash, users.ai_enabled FROM sessions
      JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?`)
      .get(tokenHash(token), this.now()) as { id: number; username: string; password_hash: string; ai_enabled: number } | undefined;
  }

  private cookie(value: string, maxAge: number): string {
    return `${COOKIE}=${value}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${this.secureCookie ? '; Secure' : ''}`;
  }
}

function credentials(body: unknown): { username?: string; password?: string } {
  const value = (body ?? {}) as { username?: unknown; password?: unknown };
  return {
    username: typeof value.username === 'string' ? value.username : undefined,
    password: typeof value.password === 'string' ? value.password : undefined,
  };
}

function readCookie(header: string | undefined): string | undefined {
  return header?.split(';').map((part) => part.trim().split('='))
    .find(([name]) => name === COOKIE)?.slice(1).join('=') || undefined;
}

const notSignedIn = (): AccountReply => ({ status: 401, body: { error: 'Not signed in.' } });

import { afterEach, describe, expect, it, vi } from 'vitest';
import { webAiKeys } from './ai-key';

const KEY = 'gsk_abcdefghijklmnopqrstuvwxyz0123';
const GROQ = { provider: 'groq', model: 'llama-3.1-8b-instant' };
const offered = (available = true): [number, unknown] => [200, { available, custom: false, providers: [{ id: 'groq', name: 'Groq', keysUrl: 'https://console.groq.com/keys', free: true }] }];

/** A stand-in for the API: records requests and answers each path with the given body and status. */
function api(routes: Record<string, [number, unknown]>) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, path, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
    const [status, body] = routes[`${method} ${path}`] ?? [404, { error: 'Not found.' }];
    return Response.json(body, { status });
  }));
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('AI settings in the browser', () => {
  it('stays off, and refuses to turn on, while the server has AI switched off', async () => {
    const calls = api({ 'GET /api/ai/providers': offered(false) });
    const keys = webAiKeys();
    await keys.load(false);
    expect(keys.status()).toEqual({ available: false, enabled: false, on: false, source: null, signedIn: false });
    await expect(keys.setOn(true)).rejects.toThrow('being rebuilt');
    await expect(keys.save({ ...GROQ, key: KEY })).rejects.toThrow('being rebuilt');
    await expect(keys.models({ provider: 'groq', key: KEY })).rejects.toThrow('being rebuilt');
    expect(keys.headers()).toEqual({});
    expect(calls.map((call) => call.path)).toEqual(['/api/ai/providers']);
  });

  it('is off by default for a guest, even with settings, until they turn it on', async () => {
    api({ 'GET /api/ai/providers': offered(), 'POST /api/ai/test': [200, { ok: true }] });
    localStorage.setItem('tuxos.openai-key', 'sk-old-key-from-before-0000000');
    const keys = webAiKeys();
    await keys.load(false);
    expect(localStorage.getItem('tuxos.openai-key')).toBeNull();
    expect(keys.providers().providers.map((each) => each.id)).toEqual(['groq']);
    expect(await keys.save({ ...GROQ, key: `  ${KEY} ` })).toEqual({
      available: true, enabled: false, on: false, source: 'browser', provider: 'groq', model: GROQ.model, hint: 'gsk_…0123', signedIn: false,
    });
    expect(keys.headers()).toEqual({});
    expect((await keys.setOn(true)).enabled).toBe(true);
    expect(keys.headers()).toEqual({ 'x-ai-key': KEY, 'x-ai-provider': 'groq', 'x-ai-model': GROQ.model });
    // Remembered across reloads; off again means the key stays here.
    const reloaded = webAiKeys();
    await reloaded.load(false);
    expect(reloaded.status()).toMatchObject({ enabled: true, on: true });
    await reloaded.setOn(false);
    expect(reloaded.headers()).toEqual({});
    expect((await reloaded.remove()).source).toBeNull();
  });

  it('checks a guest\'s settings with the server before keeping them, and reuses the key for the same provider', async () => {
    const calls = api({ 'GET /api/ai/providers': offered(), 'POST /api/ai/test': [200, { ok: true }], 'POST /api/ai/models': [200, { models: [{ id: 'a', free: true }] }] });
    const keys = webAiKeys();
    await keys.load(false);
    await keys.save({ ...GROQ, key: KEY });
    expect(calls.at(-1)).toEqual({ method: 'POST', path: '/api/ai/test', body: { ...GROQ, key: KEY } });
    expect(await keys.models({ provider: 'groq' })).toEqual([{ id: 'a', free: true }]);
    expect(calls.at(-1)?.body).toEqual({ provider: 'groq', key: KEY });
    // A key is never sent to another provider.
    await expect(keys.save({ provider: 'mistral', model: 'x' })).rejects.toThrow('Enter your API key');
  });

  it('does not keep guest settings the server rejected', async () => {
    api({ 'GET /api/ai/providers': offered(), 'POST /api/ai/test': [400, { error: 'Groq did not accept this key.' }] });
    const keys = webAiKeys();
    await keys.load(false);
    await expect(keys.save({ ...GROQ, key: KEY })).rejects.toThrow('did not accept');
    expect(keys.status().source).toBeNull();
  });

  it("saves a signed-in learner's settings in the account, never in the browser", async () => {
    const calls = api({
      'GET /api/ai/providers': offered(),
      'GET /api/ai/key': [200, { saved: false, enabled: false }],
      'PUT /api/ai/key': [200, { saved: true, provider: 'groq', model: GROQ.model, hint: 'gsk_…0123' }],
      'POST /api/ai/models': [200, { models: [] }],
      'PUT /api/ai/settings': [200, { enabled: true }],
      'DELETE /api/ai/key': [200, { saved: false }],
    });
    const keys = webAiKeys();
    await keys.load(true);
    expect(await keys.save({ ...GROQ, key: KEY })).toMatchObject({ source: 'account', provider: 'groq', hint: 'gsk_…0123', enabled: false });
    expect(calls.at(-1)).toEqual({ method: 'PUT', path: '/api/ai/key', body: { ...GROQ, key: KEY } });
    expect(localStorage.getItem('tuxos.ai')).toBeNull();
    // Listing models again uses the saved key on the server: the browser doesn't have it.
    await keys.models({ provider: 'groq' });
    expect(calls.at(-1)?.body).toEqual({ useSaved: true });
    expect((await keys.setOn(true)).enabled).toBe(true);
    expect(calls.at(-1)).toEqual({ method: 'PUT', path: '/api/ai/settings', body: { enabled: true } });
    expect(keys.headers()).toEqual({});
    expect((await keys.remove()).enabled).toBe(false);
  });

  it('reports saved settings this session cannot unlock', async () => {
    api({ 'GET /api/ai/providers': offered(), 'GET /api/ai/key': [200, { saved: false, enabled: true, locked: true }] });
    const keys = webAiKeys();
    await keys.load(true);
    expect(keys.status()).toEqual({ available: true, enabled: false, on: true, source: null, signedIn: true, locked: true });
  });
});

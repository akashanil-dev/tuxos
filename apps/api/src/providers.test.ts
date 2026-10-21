/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { isPublicAddress } from './net-guard.ts';
import { checkKey, customBaseUrl, keyHint, redactKeys, resolveSettings, validKey } from './providers.ts';

const policy = { customAllowed: true, privateAllowed: false };

describe('providers', () => {
  it('accepts key-shaped strings from any provider and hints without revealing them', () => {
    for (const key of ['sk-proj-abcdefghijklmnop', 'gsk_abcdefghijklmnop', 'nvapi-abcdefghijklmnop', 'AIzaSyabcdefghijklmnop', 'sk-or-v1-abcdef0123456789']) {
      expect(validKey(key)).toBe(true);
    }
    for (const key of ['short', 'has space in it 000000', 'new\nline0000000000', 42]) expect(validKey(key)).toBe(false);
    expect(keyHint('gsk_abcdefghijklmnop0123')).toBe('gsk_…0123');
  });

  it('redacts keys of every provider, and the exact key in use', () => {
    const text = 'keys sk-proj-aaaaaaaaaaaa gsk_bbbbbbbbbbbb nvapi-cccccccccccc AIzaSyddddddddd and my-own-key-123456';
    const clean = redactKeys(text, 'my-own-key-123456');
    for (const secret of ['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'ddddddd', 'my-own-key']) expect(clean).not.toContain(secret);
  });

  it('only allows public https custom addresses on the standard port, without credentials', () => {
    expect(customBaseUrl('https://llm.example.com/v1/', policy)).toEqual({ url: 'https://llm.example.com/v1' });
    for (const bad of ['http://llm.example.com/v1', 'https://user:pw@llm.example.com', 'https://llm.example.com:8443/v1', 'https://x.com/v1?a=1', 'ftp://x', 'nonsense']) {
      expect(customBaseUrl(bad, policy)).toHaveProperty('error');
    }
    expect(customBaseUrl('https://llm.example.com', { customAllowed: false, privateAllowed: false })).toEqual({ error: expect.stringContaining('not enabled') });
    expect(customBaseUrl('http://localhost:11434/v1', { customAllowed: true, privateAllowed: true })).toEqual({ url: 'http://localhost:11434/v1' });
  });

  it('resolves presets to their own address and requires a model', () => {
    const groq = resolveSettings({ provider: 'groq', model: 'llama-3.3-70b-versatile', key: 'gsk_abcdefghijklmnop' }, policy);
    expect(groq).toMatchObject({ provider: { baseUrl: 'https://api.groq.com/openai/v1', custom: false } });
    // A learner can't point a preset somewhere else.
    expect(resolveSettings({ provider: 'groq', model: 'm', key: 'gsk_abcdefghijklmnop', baseUrl: 'https://evil.example' }, policy))
      .toMatchObject({ settings: { provider: 'groq' }, provider: { baseUrl: 'https://api.groq.com/openai/v1' } });
    expect(resolveSettings({ provider: 'groq', key: 'gsk_abcdefghijklmnop' }, policy)).toEqual({ error: 'Choose a model.' });
    expect(resolveSettings({ provider: 'groq', model: 'bad model name', key: 'gsk_abcdefghijklmnop' }, policy)).toEqual({ error: 'Choose a model.' });
  });

  it('checks keys the way each provider allows', async () => {
    const urls: string[] = [];
    const fetcher = (async (url: string) => { urls.push(url); return new Response('{}', { status: 403 }); }) as unknown as typeof fetch;
    const nvidia = resolveSettings({ provider: 'nvidia', model: 'nvidia/nemotron', key: 'nvapi-abcdefghijklmnop' }, policy);
    const openrouter = resolveSettings({ provider: 'openrouter', model: 'x/y:free', key: 'sk-or-v1-abcdefghijklmnop' }, policy);
    if ('error' in nvidia || 'error' in openrouter) throw new Error('unexpected');
    expect(await checkKey(nvidia.provider, 'nvapi-abcdefghijklmnop', 'nvidia/nemotron', fetcher)).toMatchObject({ ok: false, error: expect.stringContaining('did not accept') });
    expect(await checkKey(openrouter.provider, 'sk-or-v1-abcdefghijklmnop', '', fetcher)).toMatchObject({ ok: false });
    expect(urls).toEqual(['https://integrate.api.nvidia.com/v1/chat/completions', 'https://openrouter.ai/api/v1/key']);
  });
});

describe('network guard', () => {
  it('treats only public internet addresses as public', () => {
    for (const address of ['8.8.8.8', '104.18.0.1', '2606:4700::1111']) expect(isPublicAddress(address)).toBe(true);
    for (const address of ['127.0.0.1', '10.0.0.5', '172.17.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
      '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:8.8.8.8', '64:ff9b::a00:1', 'not-an-ip']) {
      expect(isPublicAddress(address)).toBe(false);
    }
  });
});

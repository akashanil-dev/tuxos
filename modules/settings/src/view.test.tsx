import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createLocalSystem, type AiKeyStore, type AiStatus, type KeyValueStorage, type SystemClient } from '@tuxos/system';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SettingsView from './view';

const memory = (): KeyValueStorage => {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  };
};

function store(status: AiStatus): AiKeyStore & { setOn: ReturnType<typeof vi.fn> } {
  return {
    status: () => status, onChange: () => () => undefined, headers: () => ({}),
    providers: () => ({ providers: [{ id: 'groq', name: 'Groq', keysUrl: 'https://console.groq.com/keys', free: true }], custom: false }),
    models: async () => [], save: async () => status, remove: async () => status,
    setOn: vi.fn(async () => status),
  };
}

async function boot(ai: AiKeyStore): Promise<SystemClient> {
  const system = createLocalSystem({ storage: memory(), ai, modules: [] });
  await system.boot('ada');
  return system;
}

afterEach(cleanup);

describe('Settings → AI', () => {
  it('greys out the AI switch while AI is being rebuilt, explains why, and keeps it off', async () => {
    const ai = store({ available: false, enabled: false, on: false, source: null, signedIn: false });
    render(<SettingsView system={await boot(ai)} windowId="w" />);
    const toggle = await screen.findByRole('switch', { name: 'AI features' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle.getAttribute('aria-disabled')).toBe('true');
    expect(toggle.closest('[data-tooltip]')?.getAttribute('data-tooltip')).toContain('being rebuilt for a better experience');
    expect(toggle.getAttribute('aria-describedby')).toBe('ai-rebuilding');
    fireEvent.click(toggle);
    expect(ai.setOn).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox').matches(':disabled')).toBe(true);
  });

  it('lets the learner turn AI on once it is available', async () => {
    const ai = store({ available: true, enabled: false, on: false, source: null, signedIn: false });
    render(<SettingsView system={await boot(ai)} windowId="w" />);
    const toggle = await screen.findByRole('switch', { name: 'AI features' });
    expect(toggle.getAttribute('aria-disabled')).toBe('false');
    expect(toggle.closest('[data-tooltip]')).toBeNull();
    fireEvent.click(toggle);
    expect(ai.setOn).toHaveBeenCalledWith(true);
  });
});

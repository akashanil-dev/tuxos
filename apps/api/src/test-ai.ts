// A learner's AI for tests: an OpenAI-style provider at a test address. Calls go to the fetcher a test passes.
import type { AiCall } from './tutor.ts';

export function testAi(model = 'test-model', overrides: Partial<AiCall['provider']> = {}): AiCall {
  return {
    settings: { provider: 'openai', model, key: 'test-key-0000' },
    provider: {
      id: 'openai', name: 'Test AI', baseUrl: 'https://ai.example/v1', check: 'models', openai: true, custom: false,
      fetch: (async () => { throw new Error('tests pass their own fetcher'); }) as unknown as typeof fetch,
      ...overrides,
    },
  };
}

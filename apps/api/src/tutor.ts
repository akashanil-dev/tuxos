// POST /api/tutor: validate the browser's request, add the tutor's instructions, call the learner's model
// once, and return its message. Stateless: the browser keeps the conversation, so the server scales out.
// Any provider works: a model that can't use tools still chats (Vasu just can't operate the computer), and
// a provider with a small limit gets the recent part of the conversation.

import { SYSTEM_PROMPT } from './prompt.ts';
import { chat, failureMessage, tooLarge, unsupported, type AiSettings, type ResolvedProvider } from './providers.ts';

/** The learner's AI for one request: their settings and where those send it. */
export interface AiCall {
  settings: AiSettings;
  provider: ResolvedProvider;
}

export interface Reply {
  status: number;
  body: unknown;
}

// An agent turn (look, click, type, look again…) adds several messages per step, so allow long conversations.
const LIMITS = { messages: 160, tools: 60, content: 20_000 };
const ROLES = new Set(['user', 'assistant', 'tool']);
/** What a too-large conversation is cut to on retry. */
const RECENT_MESSAGES = 24;

export async function handleTutor(body: unknown, ai: AiCall | undefined, fetcher?: typeof fetch): Promise<Reply> {
  if (!ai) return failure(503, 'Vasu needs your AI provider and API key. Add them in Settings → AI.');
  const problem = invalid(body);
  if (problem) return failure(400, problem);
  const { messages, tools } = body as { messages: unknown[]; tools: unknown[] };
  const { settings, provider } = ai;

  let useTools = tools.length > 0;
  let history = messages;
  let result: Awaited<ReturnType<typeof chat>> | undefined;
  // At most two retries: without tools if the model can't use them, with less history if it was too large.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = await chat(provider, settings.key, {
        model: settings.model,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
        ...(useTools ? { tools, tool_choice: 'auto' } : {}),
      }, 60_000, fetcher);
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      return failure(504, timedOut ? 'The tutor took too long to answer. Please try again.'
        : `The tutor could not reach ${provider.name}. Check the server's internet connection.`);
    }
    if (result.ok) break;
    if (useTools && unsupported(result.status, result.detail, 'tools')) { useTools = false; history = withoutTools(history); continue; }
    if (tooLarge(result.status, result.detail) && history.length > RECENT_MESSAGES) { history = recent(history); continue; }
    break;
  }
  if (!result!.ok) return failure(upstreamStatus(result!.status), failureMessage(provider, result!.status, result!.detail));

  const choices = result!.data?.choices as { message?: { content?: string | null; tool_calls?: unknown[] } }[] | undefined;
  const message = choices?.[0]?.message;
  if (!message) return failure(502, `${provider.name} sent an empty reply.`);
  return {
    status: 200,
    body: {
      message: {
        role: 'assistant',
        content: message.content ?? null,
        ...(useTools && message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}),
      },
      // Tells the browser this model can only chat, so it can say why Vasu isn't using the computer.
      ...(tools.length && !useTools ? { toolsUnsupported: true } : {}),
    },
  };
}

/**
 * The most recent part of a conversation, starting at a learner's message so that no tool result is left
 * without the assistant message that asked for it.
 */
export function recent(messages: unknown[]): unknown[] {
  const tail = messages.slice(-RECENT_MESSAGES);
  const start = tail.findIndex((message) => (message as { role?: unknown })?.role === 'user');
  return start >= 0 ? tail.slice(start) : messages.slice(-1);
}

/** A conversation with its tool calls and results taken out, for a model that has no tools. */
export function withoutTools(messages: unknown[]): unknown[] {
  return messages.flatMap((message) => {
    const { role, content, tool_calls: _calls, ...rest } = message as { role?: unknown; content?: unknown; tool_calls?: unknown };
    if (role === 'tool') return [];
    if (role === 'assistant' && (content === null || content === undefined || content === '')) return [];
    return [{ role, content, ...rest }];
  });
}

/** Why a request is unacceptable, or null if it is fine. Only shape and size: content is the model's job. */
export function invalid(body: unknown): string | null {
  const value = body as { messages?: unknown; tools?: unknown } | null;
  if (!value || !Array.isArray(value.messages) || !Array.isArray(value.tools)) return 'Expected { messages, tools }.';
  if (!value.messages.length || value.messages.length > LIMITS.messages) return 'Too many or too few messages.';
  if (value.tools.length > LIMITS.tools) return 'Too many tools.';
  for (const message of value.messages as { role?: unknown; content?: unknown }[]) {
    // The system message is added here; a browser may not send its own.
    if (!ROLES.has(message?.role as string)) return 'Messages must come from the user, the assistant or a tool.';
    if (typeof message.content === 'string' && message.content.length > LIMITS.content) return 'A message is too long.';
  }
  return null;
}

/** Pass "slow down" through to the browser; anything else from upstream is a bad gateway for us. */
function upstreamStatus(status: number): number {
  return status === 429 ? 429 : 502;
}

function failure(status: number, error: string): Reply {
  return { status, body: { error } };
}

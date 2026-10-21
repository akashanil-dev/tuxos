import { describe, expect, it } from 'vitest';
import { fixedTemperature, handleLearning, invalidLearning, parseJson } from './learning.ts';
import { testAi } from './test-ai.ts';

const config = testAi('linux-model');

function upstream(content: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] }, { status });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

describe('AI learning backend', () => {
  it('uses the server persona and requests structured syllabus JSON', async () => {
    const syllabus = { courseId: 'model-picked-wrong-id', title: 'Linux', summary: 'Lab', days: [
      { day: 1, title: 'Basics', recap: false, tasks: [{ id: 't', title: 'Task', task: 'x', scenario: 'y', objective: 'z', hints: ['h'], answer: 'pwd', explain: 'why', recap: false }] },
      { day: 2, title: 'Operations', recap: true, tasks: [
        { id: 'r', title: 'Recap', task: 'x', scenario: 'y', objective: 'z', hints: ['h'], answer: 'pwd', explain: 'why', recap: true },
        { id: 't2', title: 'Task', task: 'x', scenario: 'y', objective: 'z', hints: ['h'], answer: 'ls', explain: 'why', recap: false },
      ] },
    ] };
    const { fetcher, calls } = upstream(syllabus);
    const reply = await handleLearning({ operation: 'plan', module: 'learn-linux', fallback: {} }, config, fetcher);
    expect(reply).toEqual({ status: 200, body: { ...syllabus, courseId: 'learn-linux' } });
    const request = JSON.parse(calls[0]!.init.body as string);
    expect(request.response_format).toEqual({ type: 'json_object' });
    expect(request.model).toBe('linux-model');
    expect(request.messages[0].content).toContain('Linux Certification Trainer');
    expect(request.messages[0].content).not.toContain('trainer supplied by browser');
    expect(request.messages[1].content).toContain('tasks[0].recap=true');
    expect(request.messages[1].content).toContain('exactly ONE terminal command');
    expect(request.messages[1].content).toContain('A recap checks one previously learned skill');
  });

  it('leaves out temperature for models that only accept the default', async () => {
    const plan = { courseId: 'learn-linux', title: 'Linux', summary: 'Lab', days: [
      { day: 1, title: 'Basics', recap: false, tasks: [{ id: 't', title: 'Task', task: 'x', scenario: 'y', objective: 'z', hints: ['h'], answer: 'pwd', explain: 'why', recap: false }] },
    ] };
    const reasoning = upstream(plan);
    await handleLearning({ operation: 'plan', module: 'learn-linux' }, testAi('gpt-5.6-luna'), reasoning.fetcher);
    const sent = JSON.parse(reasoning.calls[0]!.init.body as string);
    expect(sent).not.toHaveProperty('temperature');
    expect(sent.reasoning_effort).toBe('low');
    const classic = upstream(plan);
    await handleLearning({ operation: 'plan', module: 'learn-linux' }, testAi('gpt-4.1-mini'), classic.fetcher);
    expect(JSON.parse(classic.calls[0]!.init.body as string)).toMatchObject({ temperature: 0.3 });
    expect(JSON.parse(classic.calls[0]!.init.body as string)).not.toHaveProperty('reasoning_effort');
    expect([fixedTemperature('gpt-5.6-luna'), fixedTemperature('o4-mini'), fixedTemperature('gpt-4.1-mini')]).toEqual([true, true, false]);
  });

  it('asks again without JSON mode when a model does not support it, and reads JSON out of its prose', async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetcher = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      bodies.push(body);
      return body.response_format
        ? Response.json({ error: { message: "'response_format' is not supported by this model" } }, { status: 400 })
        : Response.json({ choices: [{ message: { content: 'Sure! ```json\n{"text": "Try ls."}\n```' } }] });
    }) as unknown as typeof fetch;
    const reply = await handleLearning({ operation: 'hint', module: 'terminal', task: {} }, testAi('llama-3.1-8b', { openai: false }), fetcher);
    expect(reply).toEqual({ status: 200, body: { text: 'Try ls.' } });
    expect(bodies).toHaveLength(2);
    expect((bodies[1]!.messages as { content: string }[])[1]!.content).toContain('only the JSON object');
  });

  it('sends reasoning_effort only to OpenAI, and finds JSON in a reply', () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseJson('Here it is: {"a": {"b": 2}} hope that helps')).toEqual({ a: { b: 2 } });
    expect(parseJson('no json here')).toBeUndefined();
    expect(fixedTemperature('openai/gpt-5-mini')).toBe(true);
  });

  it('leaves OpenAI-only options out for other providers', async () => {
    const plan = { courseId: 'learn-linux', title: 'Linux', summary: 'Lab', days: [
      { day: 1, title: 'Basics', recap: false, tasks: [{ id: 't', title: 'Task', task: 'x', scenario: 'y', objective: 'z', hints: ['h'], answer: 'pwd', explain: 'why', recap: false }] },
    ] };
    const routed = upstream(plan);
    await handleLearning({ operation: 'plan', module: 'learn-linux' }, testAi('openai/gpt-5-mini', { openai: false }), routed.fetcher);
    const sent = JSON.parse(routed.calls[0]!.init.body as string);
    expect(sent).not.toHaveProperty('reasoning_effort');
    expect(sent).not.toHaveProperty('temperature');
  });

  it('does not send cached attempt history into syllabus generation', async () => {
    const syllabus = { courseId: 'linux', title: 'Linux', summary: 'Lab', days: [
      { day: 1, title: 'Basics', recap: false, tasks: [{ id: 't', title: 'Task', task: 'Print the username', scenario: 'An on-call handoff', objective: 'Show the current user', hints: ['Check the shell identity'], answer: 'whoami', explain: 'whoami prints the active user.', recap: false }] },
    ] };
    const { fetcher, calls } = upstream(syllabus);
    await handleLearning({ operation: 'plan', module: 'learn-linux', memory: { moduleId: 'learn-linux', entries: [{ id: 'old', kind: 'answer', summary: 'LONG PRIVATE OLD SESSION', at: 1 }] } }, config, fetcher);
    const request = JSON.parse(calls[0]!.init.body as string);
    expect(request.messages[1].content).not.toContain('LONG PRIVATE OLD SESSION');
    expect(request.messages[1].content).toContain('Do not include or depend on learner attempt history');
  });

  it('drops Linux tasks with chained commands but keeps the rest of the syllabus', async () => {
    const task = { title: 'Task', task: 'x', scenario: 'y', objective: 'z', hints: ['h'], explain: 'why', recap: false };
    const syllabus = { courseId: 'linux', title: 'Linux', summary: 'Lab', days: [
      { day: 1, title: 'Basics', recap: false, tasks: [
        { ...task, id: 'chain', answer: 'whoami && cd ~' },
        { ...task, id: 'find', answer: 'find /var/log -name "*.log" -exec ls -l {} \\;' },
        { ...task, id: 'awk', answer: "awk '{print $1; }' access.log" },
      ] },
      { day: 2, title: 'Only bad', recap: true, tasks: [{ ...task, id: 'seq', answer: 'cd /tmp; ls' }] },
    ] };
    const { fetcher } = upstream(syllabus);
    const reply = await handleLearning({ operation: 'plan', module: 'learn-linux' }, config, fetcher);
    const body = reply.body as { days: { day: number; tasks: { id: string }[] }[] };
    expect(reply.status).toBe(200);
    expect(body.days.map((day) => day.tasks.map((t) => t.id))).toEqual([['find', 'awk']]);
  });

  it('rejects a syllabus with no usable tasks', async () => {
    const syllabus = { courseId: 'linux', title: 'Linux', summary: 'Lab', days: [
      { day: 1, title: 'Basics', recap: false, tasks: [{ id: 't', title: 'Task', task: 'x', scenario: 'y', objective: 'z', hints: ['h'], answer: 'whoami && cd ~', explain: 'why', recap: false }] },
    ] };
    const { fetcher } = upstream(syllabus);
    const reply = await handleLearning({ operation: 'plan', module: 'learn-linux' }, config, fetcher);
    expect(reply.status).toBe(502);
  });

  it('sets day numbers and recap markers from position instead of rejecting a slip', async () => {
    const task = { title: 'Task', task: 'x', scenario: 'y', objective: 'z', hints: ['h'], answer: 'pwd', explain: 'why' };
    const syllabus = { courseId: 'linux', title: 'Linux', summary: 'Lab', days: [
      { day: 1, title: 'Basics', recap: true, tasks: [{ ...task, id: 'a', recap: true }] },
      { day: 3, title: 'Operations', tasks: [{ ...task, id: 'b', recap: false }, { ...task, id: 'c', recap: true }] },
    ] };
    const { fetcher } = upstream(syllabus);
    const reply = await handleLearning({ operation: 'plan', module: 'learn-linux' }, config, fetcher);
    const body = reply.body as { days: { day: number; recap: boolean; tasks: { recap: boolean }[] }[] };
    expect(reply.status).toBe(200);
    expect(body.days.map((day) => [day.day, day.recap, day.tasks.map((t) => t.recap)])).toEqual([[1, false, [false]], [2, true, [true, false]]]);
  });

  it('withholds the answer from early corrections and reveals it step by step after five misses', async () => {
    const task = { id: 't', task: 'Show the current directory', answer: 'pwd', hints: ['Print working directory: pwd', 'Which command names where you are?'] };
    const leak = upstream({ correct: false, feedback: 'Run exactly: pwd' });
    const early = await handleLearning({ operation: 'evaluate', module: 'learn-linux', task, command: { line: 'ls' }, failures: 0 }, config, leak.fetcher);
    expect(early.body).toMatchObject({ correct: false, feedback: 'Not quite. Which command names where you are?' });
    expect(JSON.parse(leak.calls[0]!.init.body as string).messages[1].content).toContain('Never write the command');

    const late = upstream({ correct: false, feedback: 'Use pwd: type it yourself.' });
    const reveal = await handleLearning({ operation: 'evaluate', module: 'learn-linux', task, command: { line: 'ls' }, failures: 4 }, config, late.fetcher);
    expect(reveal.body).toMatchObject({ feedback: 'Use pwd: type it yourself.' });
    expect(JSON.parse(late.calls[0]!.init.body as string).messages[1].content).toContain('name only the command');
  });

  it('rejects a malformed failure count', async () => {
    const { fetcher } = upstream({});
    const reply = await handleLearning({ operation: 'evaluate', module: 'learn-linux', failures: -1 }, config, fetcher);
    expect(reply.status).toBe(400);
  });

  it('pitches the syllabus at the learner\'s survey ratings and validates them', async () => {
    const syllabus = { courseId: 'linux', title: 'Linux', summary: 'Lab', days: [
      { day: 1, title: 'Basics', recap: false, tasks: [{ id: 't', title: 'Task', task: 'x', scenario: 'y', objective: 'z', hints: ['h'], answer: 'pwd', explain: 'why', recap: false }] },
    ] };
    const { fetcher, calls } = upstream(syllabus);
    const survey = [{ question: 'How comfortable are you typing commands in a terminal?', rating: 5 }];
    expect((await handleLearning({ operation: 'plan', module: 'learn-linux', survey }, config, fetcher)).status).toBe(200);
    const prompt = JSON.parse(calls[0]!.init.body as string).messages[1].content as string;
    expect(prompt).toContain('How comfortable are you typing commands in a terminal? 5/5');
    expect(prompt).not.toContain('Day 1 must start from beginner level');
    const bad = await handleLearning({ operation: 'plan', module: 'learn-linux', survey: [{ question: 'x', rating: 9 }] }, config, fetcher);
    expect(bad.status).toBe(400);
  });

  it('keeps continuity context module-scoped and validates its shape', async () => {
    const { fetcher, calls } = upstream({ text: 'Use ls -la.' });
    const reply = await handleLearning({ operation: 'hint', module: 'terminal', task: { id: 't' }, memory: { moduleId: 'terminal', entries: [{ id: '1', kind: 'attempt', summary: 'previous shell attempt', at: 1 }] } }, config, fetcher);
    expect(reply.status).toBe(200);
    const request = JSON.parse(calls[0]!.init.body as string);
    expect(request.messages[1].content).toContain('previous shell attempt');
    expect(invalidLearning({ operation: 'hint', module: 'terminal', task: {}, memory: { entries: 'not-an-array' } })).toContain('entries array');
    expect(invalidLearning({ operation: 'hint', module: 'terminal', task: {}, memory: { moduleId: 'learn-linux', entries: [] } })).toContain('requested module');
  });

  it('evaluates a terminal attempt and rejects unsupported requests before upstream', async () => {
    const { fetcher, calls } = upstream({ correct: true, feedback: 'Correct. '.repeat(30) + '\nThis second line should be removed.', next: 'Continue' });
    const reply = await handleLearning({
      operation: 'evaluate', module: 'learn-linux', task: { id: 't', task: 'list files', scenario: 'incident', hints: ['h'], answer: 'ls' },
      command: { line: 'docker run nginx', code: 0, stdout: 'ok', stderr: '', commands: ['docker'] },
      memory: { moduleId: 'learn-linux', entries: [{ id: 'previous', kind: 'attempt', taskId: 't', summary: 'previous shell attempt', at: 1 }] },
    }, config, fetcher);
    expect(reply).toMatchObject({ status: 200, body: { correct: true } });
    const feedback = (reply.body as { feedback: string }).feedback;
    expect(feedback.length).toBeLessThanOrEqual(110);
    expect(feedback).not.toContain('\n');
    expect(calls).toHaveLength(1);
    const request = JSON.parse(calls[0]!.init.body as string);
    expect(request.model).toBe('linux-model');
    expect(request.messages[1].content).toContain('maximum 110 characters');
    expect(request.messages[1].content).toContain('current single submitted command');
    expect(request.messages[1].content).toContain('Ignore all previous commands');
    expect(request.messages[1].content).not.toContain('previous shell attempt');
    expect(invalidLearning({ operation: 'plan', module: 'unknown' })).toContain('not supported');
  });

  it('keeps Linux /answer to one short terminal line', async () => {
    const { fetcher, calls } = upstream({ text: `Use whoami, then cd ~ to confirm your login and return home. ${'Detailed teaching section. '.repeat(20)}\n## Follow-up` });
    const reply = await handleLearning({ operation: 'answer', module: 'learn-linux', task: { id: 'recap', task: 'Confirm user and return home' } }, config, fetcher);
    expect(reply.status).toBe(200);
    const text = (reply.body as { text: string }).text;
    expect(text.length).toBeLessThanOrEqual(140);
    expect(text).not.toContain('\n');
    expect(text).not.toContain('##');
    const request = JSON.parse(calls[0]!.init.body as string);
    expect(request.model).toBe('linux-model');
    expect(request.messages[1].content).toContain('Maximum 140 characters');
  });

  it('does not call upstream without a key', async () => {
    const { fetcher, calls } = upstream({ text: 'hint' });
    const reply = await handleLearning({ operation: 'hint', module: 'terminal', task: {} }, undefined, fetcher);
    expect(reply.status).toBe(503);
    expect(calls).toHaveLength(0);
  });
});

import { createLocalSystem, type KeyValueStorage, type SystemClient } from '@tuxos/system';
import { describe, expect, it } from 'vitest';
import { course, learnLinux, survey } from '../../../modules/learn-linux/src/index';
import { terminal } from '../../../modules/terminal/src/index';
import type { LearningBackend } from '@tuxos/sdk';
import type { ChatMessage, CompletionRequest, ToolCall, Transport } from './protocol';
import { httpTransport } from './protocol';
import { TutorSession, type TutorEvent } from './session';
import type { PuppetUi } from './tools';

type Assistant = Extract<ChatMessage, { role: 'assistant' }>;

const memory = (): KeyValueStorage => {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  };
};

let callId = 0;

const aiLearning = (): LearningBackend => ({
  async request(path, body) {
    const request = body as { task?: { answer?: string }; command?: { line?: string } };
    if (path === '/plan') return {
      courseId: course.id, title: 'AI Linux Lab', summary: 'Generated test syllabus', trainer: {},
      days: course.lessons.map((lesson, day) => ({ day: day + 1, title: lesson.title, recap: day > 0, tasks: lesson.steps.map((step, index) => ({
        id: step.id, title: `AI task ${index + 1}`, scenario: lesson.story, task: step.task, objective: step.explain ?? lesson.title,
        hints: step.hints, answer: day === 0 && index === 0 ? 'whoami' : day === 0 && index === 1 ? 'pwd' : `echo task-${day + 1}-${index + 1}`, explain: step.explain ?? '', recap: day > 0 && index === 0,
      })) })),
    };
    if (path === '/evaluate') return { correct: request.command?.line?.trim() === request.task?.answer?.trim() || request.task?.answer?.startsWith('Open '), feedback: 'AI test assessment' };
    return path === '/hint' ? { text: 'AI test hint' } : { text: 'AI test answer' };
  },
});
const call = (name: string, args: Record<string, unknown> = {}): ToolCall => ({
  id: `call-${++callId}`, type: 'function', function: { name, arguments: JSON.stringify(args) },
});
const says = (content: string): Assistant => ({ role: 'assistant', content });
const uses = (...calls: ToolCall[]): Assistant => ({ role: 'assistant', content: null, tool_calls: calls });

/** A fake model that replies from a script and remembers every request it was sent. */
function scripted(...replies: Assistant[]): Transport & { requests: CompletionRequest[] } {
  const requests: CompletionRequest[] = [];
  return {
    requests,
    async complete(request) {
      requests.push(structuredClone(request));
      const reply = replies.shift();
      if (!reply) throw new Error('script ran out');
      return reply;
    },
  };
}

/** A pretend screen that records what Vasu did. Typing into a terminal runs the line in a tutor shell. */
function fakeScreen(system: SystemClient, sudoAnswer: boolean) {
  const did: string[] = [];
  const ui: PuppetUi = {
    pointAt: (target) => { did.push(`point ${target}`); },
    describeScreen: () => [{ id: 'e1', role: 'button', name: 'Files' }, { id: 'e2', role: 'textbox', name: 'Search' }],
    click: async (id, double) => { did.push(`${double ? 'double-click' : 'click'} ${id}`); },
    typeText: async (id, text, submit) => { did.push(`type ${id} ${text}${submit ? ' ⏎' : ''}`); },
    pressKeys: async (keys) => { did.push(`keys ${keys}`); },
    typeInTerminal: async (windowId, text) => {
      did.push(`terminal ${windowId} ${text.trim()}`);
      await (await system.tutor().createTerminal()).run(text.trim());
    },
    requestSudo: async (reason) => { did.push(`sudo? ${reason}`); return sudoAnswer; },
  };
  return { ui, did };
}

async function setup(transport: Transport, sudoAnswer = false) {
  const system: SystemClient = createLocalSystem({
    storage: memory(), learning: aiLearning(), modules: [
      { manifest: learnLinux.manifest, load: async () => learnLinux },
      { manifest: terminal.manifest, load: async () => terminal },
    ],
  });
  await system.boot('ada');
  // The learner has rated their experience, so the syllabus is designed.
  await system.dispatch('learn-linux.survey', { answers: Object.fromEntries(survey.map((question) => [question.id, 3])) });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const screen = fakeScreen(system, sudoAnswer);
  const tutor = new TutorSession({ access: system.tutor(), transport, ui: screen.ui });
  const events: TutorEvent[] = [];
  tutor.on((event) => events.push(event));
  return { system, tutor, events, did: screen.did };
}

const toolResults = (events: TutorEvent[]) => events.flatMap((event) => (event.type === 'tool' ? [event] : []));

describe('TutorSession', () => {
  it('lets the model look around with tools, then answers', async () => {
    const transport = scripted(uses(call('look_at_screen')), says('You have no windows open yet.'));
    const { tutor, events } = await setup(transport);
    await tutor.ask('What is on my screen?');
    expect(toolResults(events)[0]).toMatchObject({ name: 'look_at_screen', result: { windows: [] } });
    expect(events.at(-2)).toEqual({ type: 'message', role: 'assistant', text: 'You have no windows open yet.' });
    expect(events.at(-1)).toEqual({ type: 'busy', busy: false });
    const second = transport.requests[1]!.messages;
    expect(second.at(-1)).toMatchObject({ role: 'tool', content: expect.stringContaining('"windows":[]') });
  });

  it('sends a snapshot of the learner\'s recent commands with the latest question only', async () => {
    const transport = scripted(says('one'), says('two'));
    const { system, tutor } = await setup(transport);
    await (await system.createTerminal()).run('cat /etc/shadow');
    await tutor.ask('Why did that fail?');
    await tutor.ask('And now?');
    const [first, second] = transport.requests.map((request) => request.messages);
    const expected = '$ cat /etc/shadow  -> exit 1, error: cat: /etc/shadow: Permission denied';
    expect(first![0]).toMatchObject({ content: expect.stringContaining(expected) });
    expect(second![0]).toEqual({ role: 'user', content: 'Why did that fail?' });
    expect(second!.at(-1)).toMatchObject({ content: expect.stringContaining('<system_snapshot>') });
  });

  it('offers every tool, with no autonomy levels', async () => {
    const transport = scripted(says('ok'));
    const { tutor } = await setup(transport);
    await tutor.ask('what can you do?');
    const offered = transport.requests[0]!.tools.map((tool) => tool.function.name);
    for (const name of ['look_at_screen', 'click', 'type_text', 'press_keys', 'type_in_terminal', 'run_command',
      'request_sudo', 'write_file', 'manage_window', 'change_appearance', 'learn-linux__start']) {
      expect(offered).toContain(name);
    }
    expect(offered.length).toBeLessThanOrEqual(60);
  });

  it('sees the screen and uses it: clicks, types and presses keys', async () => {
    const transport = scripted(
      uses(call('look_at_screen')),
      uses(call('click', { element_id: 'e1', double_click: true }), call('type_text', {
        element_id: 'e2', text: 'notes', press_enter: true,
      }), call('press_keys', { keys: 'Alt+Q' })),
      says('Done. Now you try.'),
    );
    const { tutor, events, did } = await setup(transport);
    await tutor.ask('show me how to search');
    expect(toolResults(events)[0]?.result).toMatchObject({
      desktop: 'plasma', elements: [{ id: 'e1', name: 'Files' }, { id: 'e2', name: 'Search' }],
    });
    expect(did).toEqual(['double-click e1', 'type e2 notes ⏎', 'keys Alt+Q']);
  });

  it('types commands into its own visible terminal and reports the output', async () => {
    const transport = scripted(uses(call('type_in_terminal', { command: 'whoami' })), says('See? Your turn.'));
    const { system, tutor, events, did } = await setup(transport);
    await tutor.ask('show me whoami');
    const windows = (await system.session()).windows;
    expect(windows).toMatchObject([{ appId: 'terminal', args: { owner: 'vasu' } }]);
    expect(did).toEqual([`terminal ${windows[0]!.id} whoami`]);
    expect(toolResults(events)[0]?.result).toMatchObject({ exit_code: 0, stdout: 'ada\n' });
  });

  it('asks the learner for sudo, and takes no for an answer', async () => {
    const transport = scripted(
      uses(call('request_sudo', { reason: 'To show you /etc/shadow.' })),
      uses(call('run_command', { command: 'sudo cat /etc/shadow' })),
      says('Fair enough! A penguin can dream.'),
    );
    const { tutor, events, did } = await setup(transport, false);
    await tutor.ask('show me the shadow file');
    const [asked, tried] = toolResults(events);
    expect(did).toEqual(['sudo? To show you /etc/shadow.']);
    expect(asked?.result).toEqual({ granted: false, message: 'The learner said no to giving you sudo.' });
    expect(tried?.result).toMatchObject({ exit_code: 1 });
    expect(tutor.hasSudo).toBe(false);
  });

  it('uses sudo once the learner grants it, until they revoke it', async () => {
    const transport = scripted(
      uses(call('request_sudo', { reason: 'To show you /etc/shadow.' })),
      uses(call('run_command', { command: 'sudo cat /etc/shadow' })),
      says('There it is.'),
      uses(call('run_command', { command: 'sudo cat /etc/shadow' })),
      says('No longer allowed.'),
    );
    const { tutor, events } = await setup(transport, true);
    await tutor.ask('show me the shadow file');
    expect(toolResults(events)[1]?.result).toMatchObject({ exit_code: 0, stdout: expect.stringContaining('root:') });
    expect(transport.requests[1]!.messages[0]).toMatchObject({ content: expect.stringContaining('Sudo: granted') });
    tutor.revokeSudo();
    await tutor.ask('again?');
    expect(toolResults(events)[2]?.result).toMatchObject({ exit_code: 1 });
  });

  it('stops when the learner takes back control', async () => {
    const transport = scripted(
      uses(call('click', { element_id: 'e1' }), call('click', { element_id: 'e1' })),
      says('never sent'),
    );
    const { tutor, events, did } = await setup(transport);
    const ask = tutor.ask('do something');
    tutor.stop();
    await ask;
    expect(did).toEqual([]);
    expect(events).toContainEqual({ type: 'error', message: 'Stopped. You have control again.' });
    expect(transport.requests).toHaveLength(1);
  });

  it('demonstrates commands in its own shell without sudo, and without doing the learner\'s lesson', async () => {
    const transport = scripted(
      uses(call('learn-linux__start', { lesson: 'first-words' })),
      uses(call('run_command', { command: 'whoami' }), call('run_command', { command: 'sudo cat /etc/shadow' })),
      says('Now you try whoami.'),
    );
    const { system, tutor, events } = await setup(transport);
    await tutor.ask('start the first lesson and show me whoami');
    const [start, whoami, sudo] = toolResults(events);
    expect(start?.result).toMatchObject({ ok: true });
    expect(whoami?.result).toMatchObject({ exit_code: 0, stdout: 'ada\n' });
    expect(sudo?.result).toMatchObject({ exit_code: 1, stderr: 'cat: /etc/shadow: Operation not permitted\n' });
    const status = await system.dispatch<{ active: { step: { id: string } } }>('learn-linux.status', {});
    expect(status.ok && status.value.active.step.id).toBe('whoami');
  });

  it('opens apps and points at things on screen', async () => {
    const transport = scripted(
      uses(call('open_app', { app: 'learn-linux' }), call('point_at', { target: 'app:files' })),
      says('There.'),
    );
    const { system, tutor, did } = await setup(transport);
    await tutor.ask('where are my lessons?');
    expect((await system.session()).windows.map((window) => window.appId)).toEqual(['learn-linux']);
    expect(did).toEqual(['point app:files']);
  });

  it('cannot act as root through the kernel without sudo', async () => {
    const { system } = await setup(scripted());
    expect(await (await system.tutor().createTerminal()).run('sudo cat /etc/shadow')).toMatchObject({ code: 1 });
  });

  it('reports a failing model service and recovers for the next question', async () => {
    const transport: Transport = { complete: async () => { throw new Error('quota exceeded'); } };
    const { tutor, events } = await setup(transport);
    await tutor.ask('hello?');
    expect(events).toContainEqual({ type: 'error', message: 'quota exceeded' });
    expect(events.at(-1)).toEqual({ type: 'busy', busy: false });
  });

  it('stops a model that keeps calling tools', async () => {
    const replies = Array.from({ length: 16 }, () => uses(call('look_at_screen')));
    const { tutor, events } = await setup(scripted(...replies));
    await tutor.ask('loop forever');
    expect(events).toContainEqual(expect.objectContaining({
      type: 'error', message: expect.stringContaining('too many steps'),
    }));
  });

  it('never sends a tool result without the request that asked for it, even after trimming', async () => {
    const replies: Assistant[] = [];
    for (let index = 0; index < 12; index += 1) replies.push(uses(call('look_at_screen')), says(`answer ${index}`));
    const transport = scripted(...replies);
    const { tutor } = await setup(transport);
    for (let index = 0; index < 12; index += 1) await tutor.ask(`question ${index}`);
    for (const request of transport.requests) expect(request.messages[0]?.role).toBe('user');
  });

  it('keeps the question in view during a long hands-on answer', async () => {
    const replies = [...Array.from({ length: 15 }, () => uses(call('look_at_screen'))), says('done')];
    const transport = scripted(...replies);
    const { tutor } = await setup(transport);
    await tutor.ask('set up a whole exercise for me');
    expect(transport.requests.at(-1)!.messages[0]).toMatchObject({
      role: 'user', content: expect.stringContaining('set up a whole exercise for me'),
    });
  });
});

describe('httpTransport', () => {
  it('returns the assistant message and surfaces server errors in plain words', async () => {
    const reply = { message: { role: 'assistant', content: 'hi' } };
    const ok = httpTransport('/api/tutor', async () => Response.json(reply));
    expect(await ok.complete({ messages: [], tools: [] })).toEqual({ role: 'assistant', content: 'hi' });

    const failing = httpTransport('/api/tutor', async () => Response.json(
      { error: 'Tutor not configured' }, { status: 503 },
    ));
    await expect(failing.complete({ messages: [], tools: [] })).rejects.toThrow('Tutor not configured');

    const offline = httpTransport('/api/tutor', async () => { throw new TypeError('fetch failed'); });
    await expect(offline.complete({ messages: [], tools: [] })).rejects.toThrow('not reachable');
  });
});

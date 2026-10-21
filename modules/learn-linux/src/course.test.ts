// Lesson CI: every lesson's own solution must complete it in a fresh system. If a shell change or a
// content edit breaks a lesson, this fails instead of a learner getting stuck.

import { validateCourse, type LessonStatus } from '@tuxos/lessons';
import { createLocalSystem, type KeyValueStorage, type SystemClient } from '@tuxos/system';
import type { LearningBackend } from '@tuxos/sdk';
import { describe, expect, it } from 'vitest';
import { course, learnLinux, survey } from './index';
import { terminal } from '../../terminal/src/index';
import { learnDocker } from '../../learn-docker/src/index';
import { apt } from '../../apt/src/index';

const memory = (): KeyValueStorage => {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  };
};

/** Tests model the API response; production Linux never uses the reviewed JSON as a learner fallback. */
const aiLearning = (): LearningBackend => ({
  async request(path, body) {
    const request = body as { module?: string; task?: { answer?: string }; command?: { line?: string } };
    if (path === '/plan') return {
      courseId: request.module, title: request.module === 'learn-linux' ? 'AI Linux Lab' : 'AI Docker Lab', summary: 'Generated test syllabus', trainer: {},
      days: course.lessons.map((lesson, day) => ({ day: day + 1, title: lesson.title, recap: day > 0, tasks: lesson.steps.map((step, index) => ({
        id: step.id, title: `AI task ${index + 1}`, scenario: lesson.story, task: step.task, objective: step.explain ?? lesson.title,
        hints: step.hints, answer: request.module === 'learn-docker' ? 'docker --version' : day === 0 && index === 0 ? 'whoami' : day === 0 && index === 1 ? 'pwd' : `echo task-${day + 1}-${index + 1}`, explain: step.explain ?? '', recap: day > 0 && index === 0,
      })) })),
    };
    if (path === '/evaluate') return { correct: request.command?.line?.trim() === request.task?.answer?.trim() || request.task?.answer?.startsWith('Open '), feedback: 'AI test assessment' };
    if (path === '/hint') return { text: 'AI test hint' };
    return { text: `### Detailed Solution for ${request.module}\n\n**Exact command:**\n\n\`\`\`bash\nwhoami\n\`\`\`\n\n${'Long lesson section. '.repeat(30)}` };
  },
});

/** The learner rates their experience; the syllabus is designed only after that. */
async function rate(system: SystemClient, stars = 3): Promise<void> {
  const result = await system.dispatch('learn-linux.survey', { answers: Object.fromEntries(survey.map((question) => [question.id, stars])) });
  if (!result.ok) throw new Error(result.error.message);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function boot(withDocker = false, learning: LearningBackend = aiLearning()): Promise<SystemClient> {
  const system = createLocalSystem({
    storage: memory(),
    learning,
    modules: [
      { manifest: learnLinux.manifest, load: async () => learnLinux },
      { manifest: terminal.manifest, load: async () => terminal },
      ...(withDocker ? [{ manifest: learnDocker.manifest, load: async () => learnDocker }] : []),
    ],
  });
  await system.boot('ada');
  await rate(system);
  return system;
}

async function status(system: SystemClient): Promise<LessonStatus> {
  const result = await system.dispatch<LessonStatus>('learn-linux.status', {});
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('Learn Linux course', () => {
  it('is valid', () => {
    expect(validateCourse(course)).toEqual([]);
  });

  it('asks about the learner\'s experience first and designs the syllabus from their ratings', async () => {
    const plans: Record<string, unknown>[] = [];
    const fixture = aiLearning();
    const system = createLocalSystem({
      storage: memory(),
      learning: { request: async (path, body) => {
        if (path === '/plan') plans.push(body as Record<string, unknown>);
        return fixture.request(path, body);
      } },
      modules: [{ manifest: learnLinux.manifest, load: async () => learnLinux }],
    });
    await system.boot('ada');
    const waiting = await status(system);
    expect(waiting.survey?.questions).toHaveLength(survey.length);
    expect(plans).toHaveLength(0);
    expect(await system.dispatch('learn-linux.survey', { answers: { terminal: 6 } })).toMatchObject({ ok: false, error: { code: 'EINVAL' } });
    await rate(system, 5);
    expect(plans).toHaveLength(1);
    expect(plans[0]!.survey).toEqual(survey.map((question) => ({ question: question.question, rating: 5 })));
    const ready = await status(system);
    expect(ready.survey).toBeUndefined();
    expect(ready.course.title).toBe('AI Linux Lab');
  });

  it('lets the learner retake the survey: cancelling keeps the lab, new answers design a new one', async () => {
    const plans: Record<string, unknown>[] = [];
    const fixture = aiLearning();
    const system = await boot(false, { request: async (path, body) => {
      if (path === '/plan') plans.push(body as Record<string, unknown>);
      return fixture.request(path, body);
    } });
    await (await system.createTerminal({ learningModule: 'learn-linux' })).run('whoami');
    expect((await status(system)).active?.step.id).toBe('pwd');

    await system.dispatch('learn-linux.retakeSurvey', {});
    expect((await status(system)).survey).toMatchObject({ retake: true });
    await system.dispatch('learn-linux.cancelSurvey', {});
    expect((await status(system)).active?.step.id).toBe('pwd');
    expect(plans).toHaveLength(1);

    await system.dispatch('learn-linux.retakeSurvey', {});
    await rate(system, 1);
    expect(plans).toHaveLength(2);
    expect(plans[1]!.survey).toEqual(survey.map((question) => ({ question: question.question, rating: 1 })));
    const fresh = await status(system);
    expect(fresh.survey).toBeUndefined();
    expect(fresh.lessons[0]?.completed).toBe(0);
  });

  it('lets the learner log in while the AI is still planning the syllabus', async () => {
    let finish: () => void = () => undefined;
    const slow: LearningBackend = {
      async request(path, body) {
        if (path === '/plan') await new Promise<void>((resolve) => { finish = resolve; });
        return aiLearning().request(path, body);
      },
    };
    const system = await boot(false, slow);
    expect((await status(system)).lastExplain).toContain('generating your Learn Linux lab');
    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await status(system)).course.title).toBe('AI Linux Lab');
  });

  it('starts an AI-generated task and assesses terminal input', async () => {
    const system = await boot();
    const initial = await status(system);
    expect(initial.course.title).toBe('AI Linux Lab');
    expect(initial.active?.step.id).toBe('whoami');
    // Every task has a lesson to read first (here the syllabus has none, so its explanation is used).
    expect(initial.active?.step.teach).toBeTruthy();
    const terminal = await system.createTerminal({ learningModule: 'learn-linux' });
    // The trainer's verdict comes with the result, apart from the command's own output, so terminals can show it clearly.
    const wrong = await terminal.run('who');
    expect(wrong.feedback).toMatchObject({ correct: false });
    expect(wrong.feedback!.text.length).toBeLessThan(120);
    expect(wrong.stdout).not.toContain('Trainer');
    expect((await terminal.run('whoami')).feedback).toMatchObject({ correct: true });
    expect((await status(system)).active?.step.id).toBe('pwd');
  });

  it('keeps the syllabus request small by excluding cached memory', async () => {
    let planBody: Record<string, unknown> | undefined;
    const fixture = aiLearning();
    const system = await boot(false, { request: async (path, body) => {
      if (path === '/plan') planBody = body as Record<string, unknown>;
      return fixture.request(path, body);
    } });
    expect(await status(system)).toMatchObject({ course: { title: 'AI Linux Lab' } });
    expect(planBody).not.toHaveProperty('memory');
  });

  it('reports a rejected AI plan instead of leaving Linux in a pending state or showing local questions', async () => {
    const system = createLocalSystem({
      storage: memory(),
      learning: { request: async () => { throw new Error('Every day after day one must begin with exactly one task marked as a recap.'); } },
      modules: [{ manifest: learnLinux.manifest, load: async () => learnLinux }],
    });
    await system.boot('ada');
    await rate(system);
    const current = await status(system);
    expect(current.lessons).toHaveLength(0);
    expect(current.lastExplain).toContain('AI trainer unavailable: Every day after day one');
  });

  it('nudges instead of answering until the learner has missed five times, then reveals it to type', async () => {
    const system = await boot();
    const terminal = await system.createTerminal({ learningModule: 'learn-linux' });
    expect((await terminal.run('/hint')).stdout).toContain('AI test hint');
    const early = await terminal.run('/answer');
    expect(early.stdout).toContain('A nudge instead: AI test hint');
    expect(early.stdout).toContain('after 5 more tries');
    expect(early.stdout).not.toContain('whoami');
    for (let miss = 0; miss < 5; miss += 1) await terminal.run('ls');
    const answer = await terminal.run('/answer');
    expect(answer.stdout).toContain('whoami');
    expect(answer.stdout).toContain('Now type it yourself');
    expect(answer.stdout).not.toContain('Detailed Solution');
  });

  it('keeps Linux slash commands on the Linux trainer when Docker is active', async () => {
    const system = await boot(true);
    await system.dispatch('learn-docker.start', { lesson: 'day-1' });
    const linuxTerminal = await system.createTerminal({ learningModule: 'learn-linux' });
    for (let miss = 0; miss < 5; miss += 1) await linuxTerminal.run('ls');
    const answer = await linuxTerminal.run('/answer');
    expect(answer.stdout).toContain('whoami');
    expect(answer.stdout).not.toContain('docker --version');
  });

  it('keeps AI progress in the learner home and resumes it after a restart', async () => {
    const storage = memory();
    const make = () => createLocalSystem({
      storage, learning: aiLearning(), modules: [{ manifest: learnLinux.manifest, load: async () => learnLinux }],
    });
    const first = make();
    await first.boot('ada');
    await rate(first);
    await (await first.createTerminal()).run('whoami');
    const progressFile = '/home/ada/.local/share/tuxos/ai-learning/learn-linux-v2.json';
    const saved = await first.dispatch<string>('fs.read', { path: progressFile });
    expect(saved.ok && JSON.parse(saved.value)).toMatchObject({ completed: ['whoami'] });
    await first.flush();

    const second = make();
    await second.boot('ada');
    expect((await status(second)).lessons[0]?.completed).toBe(1);
    expect((await status(second)).active?.step.id).toBe('pwd');
  });

  it('teaches the built-in course with rule-based checks when there is no AI key, then offers the AI lab once a key is added', async () => {
    let hasKey = false;
    const plans: unknown[] = [];
    const fixture = aiLearning();
    const system = createLocalSystem({
      storage: memory(),
      learning: {
        available: () => hasKey,
        request: async (path, body) => {
          if (!hasKey) throw new Error('no key: nothing may reach the API');
          if (path === '/plan') plans.push(body);
          return fixture.request(path, body);
        },
      },
      modules: [
        { manifest: learnLinux.manifest, load: async () => learnLinux },
        { manifest: terminal.manifest, load: async () => terminal },
      ],
    });
    await system.boot('ada');
    const builtIn = await status(system);
    expect(builtIn.survey).toBeUndefined();
    expect(builtIn.builtIn).toEqual({ aiOff: true });
    expect(builtIn.course.title).toBe(course.title);
    // Nothing is judged until the learner picks a lesson.
    expect(builtIn.active).toBeNull();
    expect((await (await system.createTerminal()).run('ls')).feedback).toBeUndefined();
    await system.dispatch('learn-linux.start', { lesson: 'first-words' });
    expect((await status(system)).active?.step.id).toBe('whoami');

    const shell = await system.createTerminal({ learningModule: 'learn-linux' });
    expect((await shell.run('ls')).feedback).toMatchObject({ correct: false });
    expect((await shell.run('/hint')).stdout).toContain(course.lessons[0]!.steps[0]!.hints[0]!);
    // Checked by the lesson's rule, not by matching text: any successful whoami passes.
    expect((await shell.run('whoami   ')).feedback).toMatchObject({ correct: true });
    expect((await shell.run('pwd')).feedback).toMatchObject({ correct: true });
    expect((await shell.run('ls')).feedback).toMatchObject({ correct: true });
    // The learner picks the next lesson, which starts with its own files in place.
    expect((await status(system)).active).toBeNull();
    await system.dispatch('learn-linux.start', { lesson: 'moving-around' });
    expect((await status(system)).active?.step.id).toBe('cd-garden');
    expect((await system.dispatch('fs.stat', { path: '/home/ada/garden/shed' })).ok).toBe(true);
    expect(plans).toHaveLength(0);

    hasKey = true;
    expect((await status(system)).survey?.questions).toHaveLength(survey.length);
    await rate(system, 4);
    expect(plans).toHaveLength(1);
    const ai = await status(system);
    expect(ai.course.title).toBe('AI Linux Lab');
    expect(ai.builtIn).toBeUndefined();
  });

  it('refuses the survey without a key, and falls back to the built-in course if the key is removed before planning', async () => {
    let hasKey = true;
    const system = createLocalSystem({
      storage: memory(),
      learning: { available: () => hasKey, request: aiLearning().request },
      modules: [{ manifest: learnLinux.manifest, load: async () => learnLinux }],
    });
    await system.boot('ada');
    expect((await status(system)).survey).toBeDefined();
    hasKey = false;
    expect(await system.dispatch('learn-linux.survey', { answers: { terminal: 3 } })).toMatchObject({
      ok: false, error: { message: expect.stringContaining('Settings') },
    });
    expect(await status(system)).toMatchObject({ builtIn: { aiOff: true }, active: null, lessons: course.lessons.map((lesson) => ({ id: lesson.id })) });
  });

  it('pauses the AI lab when AI is switched off, teaches the built-in course offline, and resumes the lab when it is back on', async () => {
    let aiOn = true;
    const requests: string[] = [];
    const fixture = aiLearning();
    const system = createLocalSystem({
      storage: memory(),
      learning: {
        available: () => aiOn,
        request: async (path, body) => {
          if (!aiOn) throw new Error('AI is off: nothing may reach the API');
          requests.push(path);
          return fixture.request(path, body);
        },
      },
      modules: [
        { manifest: learnLinux.manifest, load: async () => learnLinux },
        { manifest: terminal.manifest, load: async () => terminal },
      ],
    });
    await system.boot('ada');
    await rate(system);
    const shell = await system.createTerminal({ learningModule: 'learn-linux' });
    expect((await shell.run('whoami')).feedback).toMatchObject({ correct: true });
    expect((await status(system)).active?.step.id).toBe('pwd');

    aiOn = false;
    const sent = requests.length;
    const offline = await status(system);
    expect(offline).toMatchObject({ builtIn: { aiOff: true }, active: null, course: { title: course.title } });
    await system.dispatch('learn-linux.start', { lesson: 'first-words' });
    expect((await shell.run('/hint')).stdout).toContain(course.lessons[0]!.steps[0]!.hints[0]!);
    expect((await shell.run('whoami')).feedback).toMatchObject({ correct: true });
    expect(requests).toHaveLength(sent);

    aiOn = true;
    const resumed = await status(system);
    expect(resumed.builtIn).toBeUndefined();
    expect(resumed.course.title).toBe('AI Linux Lab');
    expect(resumed.active?.step.id).toBe('pwd');
    expect(resumed.survey).toBeUndefined();

    // The built-in course kept its own progress too.
    aiOn = false;
    expect((await status(system)).active?.step.id).toBe('pwd');
  });

  // Lesson CI for the built-in course (used without an AI key): each lesson's solution must complete it.
  it.each(course.lessons.filter((lesson) => lesson.solution.every((step) => typeof step === 'string')).map((lesson) => [lesson.id]))(
    'built-in lesson %s is completed by its own solution',
    async (id) => {
      const system = createLocalSystem({
        storage: memory(),
        learning: { available: () => false, request: async () => { throw new Error('no AI'); } },
        modules: [
          { manifest: learnLinux.manifest, load: async () => learnLinux },
          { manifest: terminal.manifest, load: async () => terminal },
          { manifest: apt.manifest, load: async () => apt },
        ],
      });
      await system.boot('ada');
      await status(system);
      const lesson = course.lessons.find((each) => each.id === id)!;
      expect(await system.dispatch('learn-linux.start', { lesson: id })).toMatchObject({ ok: true });
      const shell = await system.createTerminal({ learningModule: 'learn-linux' });
      for (const step of lesson.solution) await shell.run(step as string);
      const done = await status(system);
      expect(done.active).toBeNull();
      expect(done.lessons.find((each) => each.id === id)?.completed).toBe(lesson.steps.length);
    },
  );

  it('rejects unknown lessons with a clear error', async () => {
    const system = await boot();
    expect(await system.dispatch('learn-linux.start', { lesson: 'nope' })).toMatchObject({
      ok: false, error: { code: 'ENOENT' },
    });
  });
});

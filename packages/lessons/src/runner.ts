// Follows a learner through a course: watches what happens in the system and moves to the next step
// as soon as the current one is done. It talks to the system only through the small LessonHost interface,
// so the same runner works inside a module and in tests.

import type { KernelEvent } from '@tuxos/sdk';
import { expand, satisfied, type Entry } from './conditions';
import type { Course, Lesson, Progress, Step } from './types';

export interface LessonHost {
  home: string;
  onEvent(listener: (event: KernelEvent) => void): () => void;
  read(path: string): Entry | undefined;
  mkdir(path: string): void;
  write(path: string, content: string): void;
  load(): Progress | undefined;
  save(progress: Progress): void;
}

export interface LessonStatus {
  course: { id: string; title: string; summary: string };
  lessons: { id: string; title: string; steps: number; completed: number; stage?: string; story?: string; outcomes?: string[]; duration?: number; labKind?: 'terminal' | 'sandbox' | 'workbook'; realLab?: string; references?: { title: string; url: string }[] }[];
  active: {
    lesson: { id: string; title: string; story: string };
    stepIndex: number;
    steps: { id: string; task: string; done: boolean }[];
    /** `teach` is the short lesson shown before the learner tries the task. */
    step: { id: string; task: string; hints: string[]; recap?: boolean; teach?: string };
  } | null;
  /** The explanation of the step that was just completed, if it has one. */
  lastExplain: string | null;
  /** Set while the course waits for the learner to rate their experience before it designs their syllabus. */
  survey?: { questions: SurveyQuestion[]; /** Retaking it: the current lab stays until new answers are sent. */ retake?: boolean };
  /** Set on an AI course that is running its reviewed built-in lessons; `aiOff` when that's for want of a key. */
  builtIn?: { aiOff: boolean };
}

/** One 1-to-5 star question about the learner's experience; `low` and `high` describe 1 and 5 stars. */
export interface SurveyQuestion {
  id: string;
  question: string;
  low: string;
  high: string;
}

export type LessonEvent =
  | { type: 'step-done'; lesson: string; step: string }
  | { type: 'lesson-done'; lesson: string };

export class LessonRunner {
  private progress: Progress;
  private events: KernelEvent[] = [];
  private lastExplain: string | null = null;
  private advancing = false;
  private readonly listeners = new Set<(event: LessonEvent) => void>();
  private readonly stop: () => void;

  constructor(private readonly course: Course, private readonly host: LessonHost) {
    this.progress = host.load() ?? { completed: {}, active: null };
    this.stop = host.onEvent((event) => this.observe(event));
  }

  dispose(): void {
    this.stop();
  }

  on(listener: (event: LessonEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(lessonId: string): void {
    const lesson = this.lesson(lessonId);
    for (const dir of lesson.setup?.dirs ?? []) this.host.mkdir(expand(dir, this.host.home));
    for (const [path, content] of Object.entries(lesson.setup?.files ?? {})) {
      this.host.write(expand(path, this.host.home), content);
    }
    this.progress.completed[lessonId] = [];
    this.progress.active = { lesson: lessonId, step: 0 };
    this.events = [];
    this.lastExplain = null;
    this.host.save(this.progress);
    this.advance();
  }

  /** Leave the current lesson without finishing it; completed steps are kept. */
  quit(): void {
    this.progress.active = null;
    this.host.save(this.progress);
  }

  reset(): void {
    this.progress = { completed: {}, active: null };
    this.lastExplain = null;
    this.host.save(this.progress);
  }

  status(): LessonStatus {
    const active = this.progress.active;
    const lesson = active ? this.lesson(active.lesson) : undefined;
    const done = new Set(lesson ? this.progress.completed[lesson.id] ?? [] : []);
    const step = lesson && active ? lesson.steps[active.step] : undefined;
    return {
      course: { id: this.course.id, title: this.course.title, summary: this.course.summary },
      lessons: this.course.lessons.map((each) => ({
        id: each.id,
        title: each.title,
        steps: each.steps.length,
        completed: (this.progress.completed[each.id] ?? []).length,
      })),
      active: lesson && step && active ? {
        lesson: { id: lesson.id, title: lesson.title, story: lesson.story },
        stepIndex: active.step,
        steps: lesson.steps.map((each) => ({ id: each.id, task: each.task, done: done.has(each.id) })),
        step: { id: step.id, task: step.task, hints: step.hints },
      } : null,
      lastExplain: this.lastExplain,
    };
  }

  private observe(event: KernelEvent): void {
    if (!this.progress.active) return;
    this.events.push(event);
    this.advance();
  }

  /** Complete as many steps as are already satisfied. Each new step only sees events after it began. */
  private advance(): void {
    // Saving progress writes a file, which is itself an event; that nested call only records the event.
    if (this.advancing) return;
    this.advancing = true;
    try {
      this.advanceSteps();
    } finally {
      this.advancing = false;
    }
  }

  private advanceSteps(): void {
    for (;;) {
      const active = this.progress.active;
      if (!active) return;
      const lesson = this.lesson(active.lesson);
      const step = lesson.steps[active.step];
      if (!step || !this.isDone(step)) return;
      this.complete(lesson, step, active.step);
    }
  }

  private isDone(step: Step): boolean {
    return satisfied(step.check, { events: this.events, home: this.host.home, read: (path) => this.host.read(path) });
  }

  private complete(lesson: Lesson, step: Step, index: number): void {
    const completed = (this.progress.completed[lesson.id] ??= []);
    if (!completed.includes(step.id)) completed.push(step.id);
    this.lastExplain = step.explain ?? null;
    this.events = [];
    const finished = index + 1 >= lesson.steps.length;
    this.progress.active = finished ? null : { lesson: lesson.id, step: index + 1 };
    this.host.save(this.progress);
    this.emit({ type: 'step-done', lesson: lesson.id, step: step.id });
    if (finished) this.emit({ type: 'lesson-done', lesson: lesson.id });
  }

  private emit(event: LessonEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private lesson(id: string): Lesson {
    const lesson = this.course.lessons.find((each) => each.id === id);
    if (!lesson) throw new Error(`no such lesson: ${id}`);
    return lesson;
  }
}

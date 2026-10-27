// Courses are plain data (JSON), so lessons can be written and reviewed without touching code.

export interface Course {
  id: string;
  title: string;
  summary: string;
  lessons: Lesson[];
}

export interface Lesson {
  id: string;
  title: string;
  /** Why this lesson matters, shown before the first step. */
  story: string;
  stage?: string;
  outcomes?: string[];
  duration?: number;
  labKind?: 'terminal' | 'sandbox' | 'workbook';
  /** Follow-through on a disposable Linux VM, outside the browser simulation. */
  realLab?: string;
  references?: { title: string; url: string }[];
  /** Files and folders created (as the learner, under their home) when the lesson starts. */
  setup?: Setup;
  steps: Step[];
  /** Commands (or app opens) that complete every step. Tests replay them so a broken lesson fails CI. */
  solution: SolutionStep[];
}

export interface Setup {
  dirs?: string[];
  files?: Record<string, string>;
}

export type SolutionStep = string | { open: string };

export interface Step {
  id: string;
  task: string;
  hints: string[];
  teach?: string;
  check: Condition;
  /** Shown once the step is done: what just happened and why it matters. */
  explain?: string;
}

/**
 * What must be true for a step to count as done.
 * `ran` and `opened` look at what happened since the step started; the others look at the system now.
 * Paths may start with `~` for the learner's home. Patterns are regular expressions.
 */
export type Condition =
  | { ran: RanCondition }
  | { opened: string }
  | { cwd: string }
  | { exists: string; kind?: 'file' | 'dir' }
  | { missing: string }
  | { contains: { path: string; pattern: string } }
  | { mode: { path: string; is: string } }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export interface RanCondition {
  /** A command name that must appear in the line, e.g. "grep". */
  command?: string;
  /** Pattern the whole typed line must match. */
  line?: string;
  code?: number;
  stdout?: string;
  stderr?: string;
}

export interface Progress {
  /** Step ids completed, per lesson id. */
  completed: Record<string, string[]>;
  active: { lesson: string; step: number } | null;
}

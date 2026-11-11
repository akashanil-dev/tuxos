// Courses are loaded from JSON, so their shape is checked here rather than trusted from the type system.

import type { Condition, Course } from './types';

const ID = /^[a-z0-9][a-z0-9-]*$/;

/** Every problem found in a course, as readable messages. An empty list means the course is valid. */
export function validateCourse(course: Course): string[] {
  const problems: string[] = [];
  const add = (where: string, message: string) => problems.push(`${where}: ${message}`);
  if (!ID.test(course.id ?? '')) add('course', `invalid id ${JSON.stringify(course.id)}`);
  if (!course.title) add(course.id, 'missing title');
  if (!Array.isArray(course.lessons) || !course.lessons.length) add(course.id, 'has no lessons');

  const lessonIds = new Set<string>();
  for (const lesson of course.lessons ?? []) {
    const where = `${course.id}/${lesson.id}`;
    if (!ID.test(lesson.id ?? '')) add(where, 'invalid lesson id');
    if (lessonIds.has(lesson.id)) add(where, 'duplicate lesson id');
    lessonIds.add(lesson.id);
    if (!lesson.title || !lesson.story) add(where, 'needs a title and a story');
    if (!lesson.steps?.length) add(where, 'has no steps');
    if (!lesson.solution?.length) add(where, 'has no solution to replay');

    const stepIds = new Set<string>();
    for (const step of lesson.steps ?? []) {
      const stepWhere = `${where}/${step.id}`;
      if (!ID.test(step.id ?? '')) add(stepWhere, 'invalid step id');
      if (stepIds.has(step.id)) add(stepWhere, 'duplicate step id');
      stepIds.add(step.id);
      if (!step.task) add(stepWhere, 'missing task');
      if (!Array.isArray(step.hints) || !step.hints.length) add(stepWhere, 'needs at least one hint');
      for (const message of conditionProblems(step.check)) add(stepWhere, message);
    }
  }
  return problems;
}

function conditionProblems(condition: Condition | undefined): string[] {
  if (!condition || typeof condition !== 'object') return ['missing check'];
  const keys = Object.keys(condition);
  if (keys.length < 1) return ['empty check'];
  if ('all' in condition || 'any' in condition) {
    const parts = 'all' in condition ? condition.all : condition.any;
    if (!Array.isArray(parts) || !parts.length) return ['all/any needs a non-empty list'];
    return parts.flatMap(conditionProblems);
  }
  if ('not' in condition) return conditionProblems(condition.not);
  if ('ran' in condition) {
    const patterns = [condition.ran.line, condition.ran.stdout, condition.ran.stderr];
    return patterns.filter((pattern) => pattern !== undefined).flatMap(patternProblems);
  }
  if ('fact' in condition) return /^[a-z0-9][a-z0-9:./_-]*$/i.test(condition.fact) ? [] : ['invalid fact name'];
  if ('contains' in condition) return patternProblems(condition.contains.pattern);
  if ('mode' in condition) return /^[0-7]{3}$/.test(condition.mode.is) ? [] : [`bad mode ${condition.mode.is}`];
  if ('opened' in condition || 'cwd' in condition || 'exists' in condition || 'missing' in condition) return [];
  return [`unknown check ${JSON.stringify(keys)}`];
}

function patternProblems(pattern: string | undefined): string[] {
  try {
    new RegExp(pattern ?? '');
    return [];
  } catch {
    return [`invalid pattern ${JSON.stringify(pattern)}`];
  }
}

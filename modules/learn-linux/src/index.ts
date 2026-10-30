import { activateAICourse, type Course, type SurveyQuestion } from '@tuxos/lessons';
import type { ModuleDefinition } from '@tuxos/sdk';
import courseData from './course.json';
import { manifest } from './manifest';
import { activateAdmin } from './admin';

export { manifest } from './manifest';

export const course = courseData as Course;

/** Asked before the trainer designs a syllabus, so beginners start from scratch and experienced users go deeper. */
export const survey: SurveyQuestion[] = [
  { id: 'terminal', question: 'How comfortable are you typing commands in a terminal?', low: 'Never used one', high: 'Every day' },
  { id: 'files', question: 'How well do you know files, folders and permissions (ls, cd, chmod)?', low: 'Not at all', high: 'Very well' },
  { id: 'text', question: 'How handy are you with searching and filtering text (grep, pipes, redirection)?', low: 'Not at all', high: 'Very handy' },
  { id: 'system', question: 'How confident are you with processes, services and logs (ps, systemctl, journalctl)?', low: 'Not at all', high: 'Very confident' },
  { id: 'admin', question: 'How much shell scripting or server administration have you done?', low: 'None', high: 'A lot' },
];

export const learnLinux: ModuleDefinition = {
  manifest,
  activate: (ctx) => {
    activateAdmin(ctx);
    return activateAICourse(ctx, course, {
    id: 'linux-certifier',
    title: 'Linux Certification Trainer',
    specialty: 'An industry Linux administrator and certification assessor who teaches safe operations, troubleshooting, shell fluency, permissions, networking, and production habits.',
    level: 'beginner to advanced',
    scenarioFocus: 'real incidents, on-call runbooks, server hardening, log investigation, and certification-style practical labs',
    }, { requireAI: true, survey, curriculumByDefault: true });
  },
};

export default learnLinux;

import { chat, failureMessage, redactKeys, unsupported } from './providers.ts';
import type { AiCall, Reply } from './tutor.ts';

export type LearningOperation = 'plan' | 'evaluate' | 'hint' | 'answer';

export interface TrainerProfile {
  id: string;
  title: string;
  specialty: string;
  level: string;
  scenarioFocus: string;
}

const PERSONAS: Record<string, TrainerProfile> = {
  'learn-linux': {
    id: 'linux-certifier', title: 'Linux Certification Trainer', level: 'beginner to advanced',
    specialty: 'an industry Linux administrator and Linux certification assessor',
    scenarioFocus: 'on-call incidents, production runbooks, hardening, logs, permissions, networking, and certification labs',
  },
  'learn-docker': {
    id: 'docker-platform-engineer', title: 'Docker Platform Engineering Trainer', level: 'beginner to advanced',
    specialty: 'a production platform engineer',
    scenarioFocus: 'deployment tickets, broken services, container debugging, networking, image security, and release hygiene',
  },
  terminal: {
    id: 'terminal-operations-coach', title: 'Terminal Operations Coach', level: 'beginner to advanced',
    specialty: 'a senior site reliability engineer who teaches shell fluency',
    scenarioFocus: 'realistic support tickets, automation, diagnosis, safe changes, and incident response',
  },
  'chmod-arcade': {
    id: 'security-permissions-trainer', title: 'Linux Security Trainer', level: 'beginner to advanced',
    specialty: 'a Linux security engineer',
    scenarioFocus: 'least privilege, deploy permissions, service accounts, and secure file handling',
  },
};

const MODULES = new Set(Object.keys(PERSONAS));

export async function handleLearning(body: unknown, ai: AiCall | undefined, fetcher?: typeof fetch): Promise<Reply> {
  const problem = invalidLearning(body);
  if (problem) return { status: 400, body: { error: problem } };
  if (!ai) return { status: 503, body: { error: 'The AI trainer needs your AI provider and API key. Add them in Settings → AI.' } };
  const request = body as Record<string, unknown>;
  const moduleId = request.module as string;
  const trainer = PERSONAS[moduleId]!;
  const operation = request.operation as LearningOperation;
  const prompt = promptFor(operation, { ...request, trainer });
  const { settings, provider } = ai;
  const model = settings.model;
  // Not every provider or model has JSON mode or takes a temperature: drop what one refuses and ask again.
  let jsonMode = true;
  let tuning = true;
  try {
    let call: Awaited<ReturnType<typeof chat>> | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      call = await chat(provider, settings.key, {
        model,
        messages: [
          { role: 'system', content: trainerPrompt(trainer) },
          { role: 'user', content: jsonMode ? prompt : `${prompt}\nReply with only the JSON object, no other text.` },
        ],
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        // Reasoning models think before answering; a syllabus needs little of that, and a full seven-day plan
        // at the default effort takes longer than Cloudflare lets a request run (100 seconds).
        ...(!tuning ? {} : fixedTemperature(model) ? (provider.openai ? { reasoning_effort: 'low' } : {}) : { temperature: 0.3 }),
      }, AI_TIMEOUT_MS, fetcher);
      if (call.ok) break;
      if (jsonMode && unsupported(call.status, call.detail, 'json')) { jsonMode = false; continue; }
      if (tuning && call.status === 400 && /temperature|reasoning/i.test(call.detail)) { tuning = false; continue; }
      break;
    }
    if (!call!.ok) {
      // Cloudflare replaces 502 bodies with its own page, so record why in the server log (journalctl).
      console.error(`learning ${operation} for ${moduleId} with ${provider.id} model ${model} failed: HTTP ${call!.status}: ${call!.detail}`);
      return { status: call!.status === 429 ? 429 : 502, body: { error: failureMessage(provider, call!.status, call!.detail) } };
    }
    const choices = call!.data?.choices as { message?: { content?: string | null } }[] | undefined;
    const content = choices?.[0]?.message?.content;
    if (!content) return { status: 502, body: { error: 'AI learning service returned an empty response.' } };
    let result: unknown = parseJson(content);
    if (result === undefined) return { status: 502, body: { error: 'The AI model did not return the structured answer the trainer needs. A larger model may do better.' } };
    if (operation === 'plan') result = normalizePlan(result, moduleId);
    const invalid = validateResult(operation, result);
    if (invalid) {
      console.error(`learning ${operation} for ${moduleId} with model ${model}: invalid result: ${invalid}`);
      return { status: 502, body: { error: invalid } };
    }
    if (operation === 'evaluate' && result && typeof result === 'object') {
      const evaluation = result as Record<string, unknown>;
      const feedback = moduleId === 'learn-linux' ? conciseFeedback(evaluation.feedback) : evaluation.feedback;
      result = { ...evaluation, feedback: evaluation.correct === true ? feedback : withheldAnswer(feedback, request.task, failuresOf(request)) };
    }
    if (operation === 'answer' && moduleId === 'learn-linux' && result && typeof result === 'object') {
      const answer = result as Record<string, unknown>;
      result = { ...answer, text: conciseLinuxAnswer(answer.text) };
    }
    return { status: 200, body: result };
  } catch (error) {
    const timeout = error instanceof Error && error.name === 'TimeoutError';
    console.error(`learning ${operation} for ${moduleId} with model ${model} failed: ${timeout ? 'timed out' : redactKeys(String(error), settings.key)}`);
    return { status: 504, body: { error: timeout ? 'AI learning took too long. Try again.' : 'AI learning service could not be reached.' } };
  }
}

/** Wrong attempts on one task before the trainer starts revealing its answer (matches the client). */
export const REVEAL_AFTER_FAILURES = 5;

function failuresOf(request: Record<string, unknown>): number {
  return typeof request.failures === 'number' ? request.failures : 0;
}

/**
 * How much a correction may give away, by how many times the learner has now missed (this attempt included):
 * only nudges at first, then the command name, then its shape, then the whole line to type themselves.
 */
function revealRule(failures: number): string {
  const misses = failures + 1;
  const rule = misses < REVEAL_AFTER_FAILURES
    ? 'give one guiding nudge toward the idea (what to look at, or a short question). Never write the command, its options, or the answer.'
    : misses === REVEAL_AFTER_FAILURES ? 'they have tried hard: name only the command they need (no options) and encourage them to type it.'
      : misses === REVEAL_AFTER_FAILURES + 1 ? 'name the command and describe the option they need, without writing the full line, and encourage them.'
        : 'give the exact command line, and warmly ask them to type it themselves to finish.';
  return `The learner has already missed this task ${failures} time(s). If this attempt is also wrong, ${rule}`;
}

/** A model can still slip the answer into an early correction; replace it with a hint that does not contain it. */
function withheldAnswer(feedback: unknown, task: unknown, failures: number): unknown {
  if (failures + 1 >= REVEAL_AFTER_FAILURES || typeof feedback !== 'string') return feedback;
  const { answer, hints } = (task ?? {}) as { answer?: unknown; hints?: unknown };
  if (typeof answer !== 'string' || !answer.trim()) return feedback;
  const normalize = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();
  const reveals = (text: string) => normalize(text).includes(normalize(answer));
  if (!reveals(feedback)) return feedback;
  const hint = Array.isArray(hints) ? hints.find((item): item is string => typeof item === 'string' && !reveals(item)) : undefined;
  return hint ? `Not quite. ${hint}` : 'Not quite. Re-read the lesson above and try again.';
}

/**
 * The JSON object in a model's reply. Without JSON mode, smaller models often wrap it in a code fence or a
 * sentence, so take the outermost {...} when the whole reply isn't JSON.
 */
export function parseJson(content: string): unknown {
  try { return JSON.parse(content); } catch { /* look inside */ }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(content)?.[1];
  const candidate = fenced ?? content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1);
  if (!candidate.trim().startsWith('{')) return undefined;
  try { return JSON.parse(candidate); } catch { return undefined; }
}

/** Just under Cloudflare's 100-second limit for a proxied request, so the learner sees our error, not its own. */
const AI_TIMEOUT_MS = 90_000;

/**
 * GPT-5 and o-series reasoning models accept only the default temperature and reject any other value
 * (HTTP 400), so the low temperature that keeps older models' syllabuses steady is left out for them.
 */
export function fixedTemperature(model: string): boolean {
  // Through a router the name has a vendor prefix (openai/gpt-5...).
  return /^(?:openai\/)?(gpt-5|o\d)/.test(model);
}

export function invalidLearning(body: unknown): string | null {
  const value = body as { operation?: unknown; module?: unknown } | null;
  if (!value || typeof value.operation !== 'string' || !['plan', 'evaluate', 'hint', 'answer'].includes(value.operation)) return 'operation must be plan, evaluate, hint, or answer.';
  if (typeof value.module !== 'string' || !MODULES.has(value.module)) return 'module is not supported.';
  const json = JSON.stringify(body);
  if (json.length > 100_000) return 'learning request is too large.';
  const memory = (body as { memory?: unknown })?.memory;
  const { failures, hintsGiven } = body as { failures?: unknown; hintsGiven?: unknown };
  if (failures !== undefined && !(Number.isInteger(failures) && (failures as number) >= 0)) return 'failures must be a non-negative integer.';
  if (hintsGiven !== undefined && !(Number.isInteger(hintsGiven) && (hintsGiven as number) >= 0)) return 'hintsGiven must be a non-negative integer.';
  const survey = (body as { survey?: unknown }).survey;
  if (survey !== undefined && (!Array.isArray(survey) || survey.length > 10 || !survey.every((item) => item && typeof item === 'object'
    && typeof item.question === 'string' && item.question.length <= 300 && Number.isInteger(item.rating) && item.rating >= 1 && item.rating <= 5))) {
    return 'survey must be a list of questions with 1-5 star ratings.';
  }
  if (memory !== undefined && (!memory || typeof memory !== 'object' || !Array.isArray((memory as { entries?: unknown }).entries))) return 'memory must contain an entries array.';
  if (memory !== undefined && (memory as { moduleId?: unknown }).moduleId !== value.module) return 'memory must belong to the requested module.';
  return null;
}

function trainerPrompt(trainer: TrainerProfile): string {
  return `You are ${trainer.title}, ${trainer.specialty}. Teach ${trainer.level} learners through ${trainer.scenarioFocus}. `
    + 'Use industry scenarios, safe commands, observable terminal outcomes, and explanations that build transferable judgment. '
    + 'Never invent that a command ran; evaluate only the evidence supplied. Return JSON only.';
}

function promptFor(operation: LearningOperation, request: Record<string, unknown>): string {
  const memory = JSON.stringify(request.memory ?? { entries: [] });
  if (operation === 'plan') return `Design a seven-day terminal-first syllabus for ${request.module}. `
    + levelBrief(request.survey) + ' Every day after day 1 must start with exactly one task that explicitly recaps a skill from an earlier day. '
    + 'Mark that first task with "recap": true; mark all other tasks, including every task on day 1, with "recap": false. '
    + 'Also set each day-level "recap" to false on day 1 and true on every later day. Do not omit either recap marker. '
    + 'Every task must be an industry scenario with one clear, measurable terminal objective, a safe expected answer, three progressive hints, and a teaching explanation. For Learn Linux, each task must ask for exactly ONE terminal command line and one observable result; never bundle independent commands, use command chains, or ask for a sequence. A single pipeline is allowed only when pipes are the specific learning objective. A recap checks one previously learned skill with one submission. '
    // Kept in step with modules/apt/src/catalog.ts: the API shares no code with the browser.
    + 'The sandbox installs software with apt like Ubuntu (sudo apt update, then sudo apt install -y PACKAGE); only these packages exist: tree, hello, cowsay, sl, neofetch, fortune-mod, jq. '
    + 'Do not ask learners to change real machines; this is a sandbox. Teach first, then test: every task has a "teach" lesson the learner reads BEFORE trying it, 2 to 4 short sentences in plain words for a beginner: what the concept is, which command (and which options) does it, and one example in backticks that shows the syntax but is not the exact answer to the task. '
    + 'Return exactly this shape: {courseId,title,summary,trainer,days:[{day,title,recap,tasks:[{id,title,scenario,teach,task,objective,hints,answer,explain,recap}]}]}. '
    + 'For example, day 2 begins with tasks[0].recap=true and tasks[1...].recap=false; its first task must actually review earlier skills, not introduce a new topic. '
    + `Use this reviewed fallback only as topic context: ${JSON.stringify(request.fallback ?? {})}. `
    + 'Do not include or depend on learner attempt history when designing the syllabus; use only the supplied module topic context.';
  if (operation === 'evaluate' && request.module === 'learn-linux') return `Assess only this Linux task and the current single submitted command plus its observable output. Return {correct,feedback,next}. Ignore all previous commands and module memory; this task must be completed by this one command, not by a sequence. If correct, confirm and let the runner advance to the next task. ${revealRule(failuresOf(request))} Feedback must be one short sentence, maximum 110 characters; do not repeat the task or explain the whole lesson. Task: ${JSON.stringify(request.task)} Current attempt: ${JSON.stringify(request.command)}`;
  if (operation === 'evaluate') return `Assess the learner's terminal attempt against this task. Return {correct,feedback,next} where correct is true only when the command and its observable output satisfy the objective. Be encouraging and teach the underlying concept. ${revealRule(failuresOf(request))} Task: ${JSON.stringify(request.task)} Attempt: ${JSON.stringify(request.command)} Local module memory: ${memory}`;
  if (operation === 'hint') return `Give one progressive hint for this terminal task. The learner has had ${Number(request.hintsGiven ?? 0)} hint(s) and ${failuresOf(request)} wrong attempt(s) on it: make this hint a step more specific than the earlier ones in memory, but never write the full command line; let the learner find it. One or two short sentences. Return {text}. Task: ${JSON.stringify(request.task)} Local module memory: ${memory}`;
  if (request.module === 'learn-linux') return `Give the direct solution for this Linux terminal task in one short line: the exact single command line, then a brief reason. The learner has tried several times; they will type it themselves. Maximum 140 characters. No headings, markdown, bullets, code fences, long explanations, safety section, or follow-up. Return {text}. Task: ${JSON.stringify(request.task)} Local module memory: ${memory}`;
  return `Teach the detailed solution for this terminal task. Include the exact command, explain each important token, expected output/evidence, safety considerations, and a small follow-up check. The learner has tried several times; end by asking them to type it themselves. Return {text}. Task: ${JSON.stringify(request.task)} Local module memory: ${memory}`;
}

/**
 * Where day 1 starts. Without a survey the course assumes a beginner; with one, it fits the learner's own star
 * ratings, so an experienced user is not walked through `pwd` and a newcomer is not thrown into systemd.
 */
function levelBrief(survey: unknown): string {
  if (!Array.isArray(survey) || !survey.length) return 'Day 1 must start from beginner level.';
  const ratings = (survey as { question: string; rating: number }[]).map((item) => `- ${item.question} ${item.rating}/5`).join('\n');
  return 'Before starting, the learner rated their experience from 1 star (none) to 5 stars (expert):\n'
    + `${ratings}\nPitch the whole syllabus at this learner. Day 1 starts where they are: from first principles if they rated `
    + 'themselves low, or with a quick refresher and then real depth if they rated themselves high. Spend more days on '
    + 'the areas they rated low, skip what they rated 5 except as brief recaps, and make later days genuinely challenging '
    + 'for an experienced learner (scripting, troubleshooting, services, security). Say in the summary which level the course is for.';
}

function validateResult(operation: LearningOperation, value: unknown): string | null {
  const object = value as Record<string, unknown> | null;
  if (!object || typeof object !== 'object') return 'AI result must be an object.';
  if (operation === 'plan') {
    if (typeof object.courseId !== 'string' || typeof object.title !== 'string' || typeof object.summary !== 'string' || !Array.isArray(object.days) || object.days.length < 1) return 'AI syllabus is incomplete: expected courseId, title, summary, and at least one day with usable tasks.';
    return null;
  }
  if (typeof object.text !== 'string' && operation !== 'evaluate') return 'AI teaching response is incomplete.';
  if (operation === 'evaluate' && typeof object.correct !== 'boolean') return 'AI evaluation is incomplete.';
  return null;
}

function isSingleLinuxCommand(answer: string): boolean {
  // `find … -exec cmd {} \;` and quoted text such as awk '{print $1; }' contain a ; that does not chain commands.
  const unquoted = answer.replace(/\\;/g, '').replace(/'[^']*'|"[^"]*"/g, '');
  return answer.trim().length > 0 && !/[\r\n;]|&&|\|\|/.test(unquoted);
}

function taskProblem(task: Record<string, unknown> | null, moduleId: string): string | null {
  if (!task || typeof task !== 'object' || typeof task.id !== 'string' || typeof task.title !== 'string' || typeof task.scenario !== 'string' || typeof task.task !== 'string' || typeof task.objective !== 'string' || !Array.isArray(task.hints) || !task.hints.every((hint) => typeof hint === 'string') || typeof task.answer !== 'string' || typeof task.explain !== 'string') return 'incomplete task';
  if (moduleId === 'learn-linux' && !isSingleLinuxCommand(task.answer)) return `more than one command: ${task.answer}`;
  return null;
}

/**
 * Repairs what code can repair, so one flawed task out of a whole week does not throw the syllabus away (the
 * learner would wait a minute for nothing): bad tasks are dropped, empty days removed, and day numbers and
 * recap markers set from position. The module ID is the stable local cache key; model-generated IDs are not.
 */
function normalizePlan(value: unknown, moduleId: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const plan = value as Record<string, unknown>;
  if (!Array.isArray(plan.days)) return { ...plan, courseId: moduleId };
  const dropped: string[] = [];
  const days = (plan.days as Record<string, unknown>[])
    .filter((day) => day && typeof day === 'object' && typeof day.title === 'string' && Array.isArray(day.tasks))
    .map((day) => ({
      ...day,
      tasks: (day.tasks as Record<string, unknown>[]).filter((task) => {
        const problem = taskProblem(task, moduleId);
        if (problem) dropped.push(problem);
        return !problem;
      }),
    }))
    .filter((day) => day.tasks.length > 0)
    .map((day, index) => ({
      ...day,
      day: index + 1,
      recap: index > 0,
      tasks: day.tasks.map((task, taskIndex) => ({ ...task, recap: index > 0 && taskIndex === 0 })),
    }));
  if (dropped.length) console.error(`learning plan for ${moduleId}: dropped ${dropped.length} task(s): ${dropped.join('; ')}`);
  return { ...plan, courseId: moduleId, days };
}

const MAX_EVALUATION_FEEDBACK = 110;
const MAX_LINUX_ANSWER = 140;

function conciseFeedback(value: unknown): string {
  if (typeof value !== 'string') return '';
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= MAX_EVALUATION_FEEDBACK) return compact;
  const prefix = compact.slice(0, MAX_EVALUATION_FEEDBACK - 1);
  const boundary = prefix.lastIndexOf(' ');
  return `${prefix.slice(0, boundary > 60 ? boundary : prefix.length).trimEnd()}…`;
}

function conciseLinuxAnswer(value: unknown): string {
  if (typeof value !== 'string') return '';
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= MAX_LINUX_ANSWER) return compact;
  const prefix = compact.slice(0, MAX_LINUX_ANSWER - 1);
  const boundary = prefix.lastIndexOf(' ');
  return `${prefix.slice(0, boundary > 80 ? boundary : prefix.length).trimEnd()}…`;
}

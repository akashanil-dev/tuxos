import type { LessonStatus, SurveyQuestion } from '@tuxos/lessons';
import { TerminalSurface } from '@tuxos/module-terminal/view';
import type { SystemClient, TerminalResult, TerminalSession } from '@tuxos/system';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type FormEvent } from 'react';
import './course.css';

/** The window for any course module: lesson list, the current step, hints, and progress as it happens. */
export function CourseView({ system, courseId }: { system: SystemClient; courseId: string }) {
  const { status, error, call } = useLessonStatus(system, courseId);
  const [chosen, setChosen] = useState<string | null>(null);
  const [hintsShown, setHintsShown] = useState(0);
  const stepId = status?.active?.step.id;

  useEffect(() => setHintsShown(0), [stepId]);

  if (!status) return <div className="learn-view learn-loading">{error || 'Loading lessons…'}</div>;
  const active = status.active;
  const selected = status.lessons.find((lesson) => lesson.id === (chosen ?? active?.lesson.id))
    ?? status.lessons.find((lesson) => lesson.completed < lesson.steps) ?? status.lessons[0];

  return <div className="learn-view">
    <nav className="learn-lessons" aria-label="Lessons">
      <h2>{status.course.title}</h2>
      <ol>
        {status.lessons.map((lesson) => <li key={lesson.id}>
          <button
            className={lesson.id === selected?.id ? 'current' : ''}
            aria-current={lesson.id === active?.lesson.id ? 'step' : undefined}
            onClick={() => setChosen(lesson.id)}
          >
            <span className="learn-check" aria-hidden="true">{lesson.completed === lesson.steps ? '✓' : ''}</span>
            <span>{lesson.title}</span>
            <small>{lesson.completed}/{lesson.steps}</small>
          </button>
        </li>)}
      </ol>
    </nav>
    <section className="learn-main">
      {error && <p className="learn-error" role="alert">{error}</p>}
      {status.lastExplain && <p className="learn-explain" role="status">✓ {status.lastExplain}</p>}
      {active && active.lesson.id === selected?.id
        ? <>
          <h1>{active.lesson.title}</h1>
          <p className="learn-story">{active.lesson.story}</p>
          <ol className="learn-steps">
            {active.steps.map((step, index) => <li
              key={step.id}
              className={step.done ? 'done' : index === active.stepIndex ? 'now' : ''}
            >{step.task}</li>)}
          </ol>
          <div className="learn-task">
            <strong>Your task</strong>
            <p>{active.step.task}</p>
            {active.step.hints.slice(0, hintsShown).map((hint) => <p className="learn-hint" key={hint}>💡 {hint}</p>)}
            <div className="learn-actions">
              {hintsShown < active.step.hints.length
                && <button onClick={() => setHintsShown(hintsShown + 1)}>Show a hint</button>}
              <button onClick={() => void system.openApp('terminal')}>Open Terminal</button>
              <button className="quiet" onClick={() => void call('quit')}>Leave lesson</button>
            </div>
          </div>
        </>
        : selected && <LessonIntro
          title={selected.title}
          done={selected.completed === selected.steps}
          onStart={() => void call('start', { lesson: selected.id })}
          summary={status.course.summary}
        />}
    </section>
  </div>;
}

export type LabVariant = 'linux' | 'docker' | 'chmod';

/** Terminal-first course window: the generated task is always visible above the learner's shell. */
export function LearningLabView({ system, courseId, variant }: {
  system: SystemClient;
  courseId: string;
  variant: LabVariant;
}) {
  if (variant === 'linux') return <LinuxTerminalLab system={system} courseId={courseId} />;
  const { status, error, call } = useLessonStatus(system, courseId);
  const [selected, setSelected] = useState<string | null>(null);
  const terminal = useRef<LabTerminalHandle>(null);
  const active = status?.active;
  const teaching = useTaught(courseId, active?.step.id);
  const lesson = status?.lessons.find((item) => item.id === (selected ?? active?.lesson.id))
    ?? status?.lessons.find((item) => item.completed < item.steps) ?? status?.lessons[0];

  if (!status) return <div className="learn-view learn-loading">{error || 'Loading AI lab…'}</div>;
  return <div className={`learning-lab learning-lab-${variant}`}>
    <header className="lab-header">
      <div>
        <span className="lab-eyebrow">AI TRAINER · {variant === 'docker' ? 'PLATFORM ENGINEERING' : variant === 'chmod' ? 'SECURITY OPERATIONS' : 'LINUX CERTIFICATION'}</span>
        <h1>{status.course.title}</h1>
        <p>{status.course.summary}</p>
      </div>
      <LabProgress lessons={status.lessons} />
    </header>
    <div className="lab-layout">
      <aside className="lab-syllabus" aria-label="AI-generated syllabus">
        <div className="lab-section-label">Syllabus</div>
        {status.lessons.map((item, index) => <button
          key={item.id}
          className={item.id === lesson?.id ? 'selected' : ''}
          onClick={() => setSelected(item.id)}
        >
          <span className="lab-day">{String(index + 1).padStart(2, '0')}</span>
          <span className="lab-lesson-title">{item.title}</span>
          <small>{item.completed}/{item.steps}</small>
        </button>)}
        <p className="lab-syllabus-note">Each day is generated for your progress. Day 02+ starts with a recap.</p>
      </aside>
      <main className="lab-main">
        {error && <p className="learn-error" role="alert">{error}</p>}
        {active && active.lesson.id === lesson?.id ? <>
          <section className="lab-task-card">
            <div className="lab-task-meta">
              <span>Day {active.lesson.id.replace(/\D/g, '') || '1'}</span>
              <span>Task {active.stepIndex + 1} of {active.steps.length}</span>
              {active.step.recap && <span className="lab-recap">Recap</span>}
            </div>
            <h2>{active.lesson.title}</h2>
            {active.lesson.story && <p className="lab-scenario">{active.lesson.story}</p>}
            {!teaching.taught && active.step.teach
              ? <>
                <div className="lab-lesson"><strong>Learn first</strong><p><LessonText text={active.step.teach} /></p></div>
                <div className="lab-task-actions">
                  <button className="primary" onClick={teaching.ready}>I&apos;m ready — let me try</button>
                  <button className="quiet" onClick={() => void call('quit')}>Pause lab</button>
                </div>
              </>
              : <>
                <div className="lab-task-prompt"><strong>Your task</strong><span>{active.step.task}</span></div>
                <div className="lab-task-actions">
                  <button onClick={() => void terminal.current?.run('/hint')}>Hint</button>
                  <button onClick={() => void terminal.current?.run('/answer')}>Show answer</button>
                  {active.step.teach && <button className="link" onClick={teaching.review}>Review the lesson</button>}
                  <button className="quiet" onClick={() => void call('quit')}>Pause lab</button>
                </div>
              </>}
          </section>
          <div className="lab-workspace">
            <LabTerminal ref={terminal} system={system} variant={variant} courseId={courseId} />
            {variant === 'docker' && <DockerVisualization system={system} />}
            {variant === 'chmod' && <PermissionVisualization task={active.step.task} />}
          </div>
        </> : <LessonIntro title={lesson?.title ?? 'Choose a lab day'} done={lesson?.completed === lesson?.steps}
          onStart={() => lesson && void call('start', { lesson: lesson.id })} summary={status.course.summary} />}
      </main>
    </div>
  </div>;
}

/** Lesson text with `code` in backticks shown as code. */
function LessonText({ text }: { text: string }) {
  return <>{text.split(/(`[^`]+`)/g).map((part, index) => part.startsWith('`') && part.endsWith('`') && part.length > 2
    ? <code key={index}>{part.slice(1, -1)}</code>
    : <span key={index}>{part}</span>)}</>;
}

/**
 * Teach first, then test: each task starts with its lesson, and the task appears once the learner says they're
 * ready. Which lessons they have read is remembered in this browser.
 */
function useTaught(courseId: string, stepId: string | undefined) {
  const key = `tuxos.taught.${courseId}`;
  const read = (): string[] => {
    try { return JSON.parse(localStorage.getItem(key) ?? '[]') as string[]; } catch { return []; }
  };
  const [taught, setTaught] = useState<string[]>(read);
  const done = stepId ? taught.includes(stepId) : true;
  const mark = (value: boolean) => {
    if (!stepId) return;
    const next = value ? [...new Set([...taught, stepId])] : taught.filter((id) => id !== stepId);
    setTaught(next);
    try { localStorage.setItem(key, JSON.stringify(next.slice(-200))); } catch { /* remembering is optional */ }
  };
  return { taught: done, ready: () => mark(true), review: () => mark(false) };
}

/** Tasks done across the whole course, as a number and a bar. */
function LabProgress({ lessons }: { lessons: { steps: number; completed: number }[] }) {
  const done = lessons.reduce((total, item) => total + item.completed, 0);
  const total = lessons.reduce((sum, item) => sum + item.steps, 0);
  return <div className="lab-progress" aria-label={`Course progress: ${done} of ${total} tasks`}>
    <span><strong>{done}</strong> / {total} tasks</span>
    <span className="lab-progress-bar"><i style={{ width: total ? `${(done / total) * 100}%` : 0 }} /></span>
  </div>;
}

function LinuxTerminalLab({ system, courseId }: { system: SystemClient; courseId: string }) {
  const { status, error, call } = useLessonStatus(system, courseId);
  const [retrying, setRetrying] = useState(false);
  const active = status?.active;
  const task = active?.step;
  if (!status) return <div className="linux-terminal-loading">{error || 'Connecting to Linux trainer…'}</div>;
  if (status.survey) return <ExperienceSurvey
    questions={status.survey.questions}
    retake={status.survey.retake === true}
    error={error}
    onSubmit={(answers) => call('survey', { answers })}
    onCancel={() => void call('cancelSurvey')}
  />;
  // While the first lab is being designed, say so: it is not an error, and the status polls until it is ready.
  if ((!status.lessons.length || !task) && status.lastExplain?.includes('generating')) {
    return <div className="linux-terminal-unavailable" role="status">
      <div className="linux-terminal-unavailable-bar">linux-trainer.service</div>
      <pre>{`# Starting the AI trainer…\n# ${status.lastExplain}`}<span className="linux-terminal-cursor" /></pre>
    </div>;
  }
  if (status.builtIn && !task) return <BuiltInLessons system={system} status={status} error={error} onStart={(lesson) => void call('start', { lesson })} onPersonalize={() => void call('personalize')} />;
  if (!status.lessons.length || !task) return <div className="linux-terminal-unavailable">
    <div className="linux-terminal-unavailable-bar">linux-trainer.service</div>
    <pre>{`# AI trainer unavailable\n# No local question is loaded.\n# ${status.lastExplain ?? error ?? 'Check the learning API and retry.'}`}</pre>
    <button onClick={() => void call('curriculum')}>Open full syllabus</button>
    <button disabled={retrying} onClick={() => {
      setRetrying(true);
      void call('retry').finally(() => setRetrying(false));
    }}>{retrying ? 'Waiting for AI trainer…' : 'Retry AI trainer'}</button>
  </div>;
  const terminalId = `${courseId}-lab`;
  const type = (command: string) => window.dispatchEvent(new CustomEvent('tuxos:terminal-type', {
    detail: { windowId: terminalId, data: `${command}\r`, accepted: false },
  }));
  return <div className="linux-terminal-lab">
    <header className="linux-mission" aria-label="Current Linux mission">
      <div className="linux-mission-top">
        <button type="button" className="linux-mission-retake" onClick={() => void call(status.builtIn ? 'quit' : 'curriculum')}>← Learning path</button>
        <span className="linux-mission-day">{active!.lesson.title}</span>
        <span className="linux-mission-count">Step {active!.stepIndex + 1} of {active!.steps.length}</span>
      </div>
      {error && <p className="learn-error" role="alert">{error}</p>}
      <div className="linux-mission-task" aria-live="polite" aria-atomic="true">
        <span className="linux-mission-label">Try this</span>
        <p><LessonText text={task.task} /></p>
      </div>
      <span className="linux-mission-help">Use the terminal below. Your progress saves automatically.</span>
      <details className="linux-task-help" key={`${active!.lesson.id}.${task.id}`}>
        <summary>Need help?</summary>
        {task.teach && <div className="linux-help-explanation"><LessonText text={task.teach} /></div>}
        <div className="linux-mission-actions">
          <button type="button" onClick={() => type('/hint')}>Give me a hint</button>
          <button type="button" className="quiet" onClick={() => type('/answer')}>Show answer</button>
        </div>
        {active!.lesson.story && <details className="linux-lesson-context">
          <summary>About this lesson</summary>
          <p><LessonText text={active!.lesson.story} /></p>
        </details>}
        {!status.builtIn && <button type="button" className="linux-mission-retake" onClick={() => void call('retakeSurvey')}>Adjust my practice level</button>}
      </details>
    </header>
    <TerminalSurface system={system} learningModule={courseId} inputId={terminalId} />
  </div>;
}

/** A single next step, with the complete syllabus available a stage at a time. */
function BuiltInLessons({ system, status, error, onStart, onPersonalize }: {
  system: SystemClient; status: LessonStatus; error: string;
  onStart(lesson: string): void; onPersonalize(): void;
}) {
  const [query, setQuery] = useState('');
  const stages = [...new Set(status.lessons.map((lesson) => lesson.stage ?? 'Lessons'))];
  const next = status.lessons.find((lesson) => lesson.completed > 0 && lesson.completed < lesson.steps)
    ?? status.lessons.find((lesson) => lesson.completed < lesson.steps);
  const finished = status.lessons.filter((lesson) => lesson.completed >= lesson.steps).length;
  const search = query.trim().toLowerCase();
  const visible = status.lessons.filter((lesson) =>
    `${lesson.title} ${lesson.stage ?? ''} ${lesson.story ?? ''} ${lesson.outcomes?.join(' ') ?? ''}`.toLowerCase().includes(search));
  const aiAvailable = system.ai()?.status().available !== false;
  return <div className="linux-builtin linux-curriculum">
    <header className="curriculum-welcome">
      <h3>Learn Linux, one step at a time.</h3>
      <p>From your first command to managing a Linux system.</p>
      <div className="curriculum-progress">
        <span>{finished} of {status.lessons.length} lessons complete</span>
        <progress value={finished} max={status.lessons.length || 1} aria-label="Lessons completed" />
      </div>
    </header>
    {error && <p className="learn-error" role="alert">{error}</p>}
    {next ? <section className="curriculum-next" aria-label="Your next lesson">
      <div>
        <span className="linux-mission-label">{next.completed ? 'Pick up where you left off' : finished ? 'Up next' : 'Start here'}</span>
        <h4>{next.title}</h4>
        <p>{next.duration ?? 20} min · {next.steps} small steps</p>
      </div>
      <button className="primary" onClick={() => onStart(next.id)}>{next.completed ? 'Continue lesson' : 'Let’s begin'} <span aria-hidden="true">→</span></button>
    </section> : <section className="curriculum-next" role="status">
      <div><h4>Learning path complete!</h4><p>Try the companion VM labs, or revisit any lesson below.</p></div>
    </section>}
    {status.lastExplain && <details className="curriculum-note">
      <summary>Last lesson feedback</summary><p>{status.lastExplain}</p>
    </details>}
    <section className="curriculum-browse" aria-label="Full syllabus">
      <div className="curriculum-browse-heading"><h4>Your learning path</h4><span>{stages.length} stages · explore at your pace</span></div>
      <label className="curriculum-search">Find a lesson
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a topic…" />
      </label>
      {search && <p className="curriculum-search-count" role="status">{visible.length} {visible.length === 1 ? 'lesson' : 'lessons'} found</p>}
      <div className="curriculum-stages">
        {stages.filter((name) => visible.some((lesson) => (lesson.stage ?? 'Lessons') === name)).map((name) => {
          const all = status.lessons.filter((lesson) => (lesson.stage ?? 'Lessons') === name);
          const done = all.filter((lesson) => lesson.completed >= lesson.steps).length;
          return <details className="curriculum-stage" key={`${name}.${search}`} open={search ? true : undefined}>
            <summary className="curriculum-stage-heading"><span>{name}</span><small>{done}/{all.length}</small></summary>
            <ol>
              {visible.filter((lesson) => (lesson.stage ?? 'Lessons') === name).map((lesson) => {
                const done = lesson.completed >= lesson.steps;
                return <li key={lesson.id} className={`${done ? 'done' : lesson === next ? 'next' : ''} curriculum-lesson`}>
                  <details>
                    <summary><span className="curriculum-number">{done ? '✓' : String(status.lessons.indexOf(lesson) + 1).padStart(2, '0')}</span>
                      <span className="curriculum-title">{lesson.title}<small>{lesson.duration ?? 20} min{done ? ' · Complete' : lesson.completed ? ' · In progress' : ''}</small></span>
                    </summary>
                    <div className="curriculum-details">
                      <p>{lesson.story}</p>
                      <p className="curriculum-lab-kind">{lesson.labKind === 'workbook' ? 'Guided workbook' : lesson.labKind === 'sandbox' ? 'Simulated server lab' : 'Terminal practice'} · {lesson.steps} steps</p>
                      {lesson.outcomes && <ul>{lesson.outcomes.map((outcome) => <li key={outcome}>{outcome}</li>)}</ul>}
                      {lesson.realLab && <div className="curriculum-vm"><strong>Try it on a real Linux VM</strong><p>{lesson.realLab}</p></div>}
                      {lesson.references && <div className="curriculum-references">Read more: {lesson.references.map((ref) => <a key={ref.url} href={ref.url} target="_blank" rel="noreferrer">{ref.title}</a>)}</div>}
                    </div>
                  </details>
                  <button type="button" aria-label={`${done ? 'Redo' : lesson.completed ? 'Continue' : 'Start'} ${lesson.title}`} className="quiet" onClick={() => onStart(lesson.id)}>
                    {done ? 'Redo' : lesson.completed ? 'Continue' : 'Start'}
                  </button>
                </li>;
              })}
            </ol>
          </details>;
        })}
      </div>
      {!visible.length && <div className="curriculum-empty"><p>No lessons found. Try “files” or “networking”.</p><button onClick={() => setQuery('')}>Clear search</button></div>}
    </section>
    <details className="curriculum-note">
      <summary>About this course &amp; extra practice</summary>
      <p>{status.course.summary}</p>
      <p>Practice here in TuxOS. Server labs are simulated; companion VM exercises let you try the same skills on real Linux. Course progress records practice, not a professional certification.</p>
      {aiAvailable && <button onClick={() => system.ai()?.status().enabled === false ? void system.openApp('settings') : onPersonalize()}>
        {system.ai()?.status().enabled === false ? 'Set up optional AI practice' : 'Optional AI practice lab'}
      </button>}
    </details>
  </div>;
}

/** A few 1-to-5 star questions before the first lab, so the trainer designs it at the learner's level. */
function ExperienceSurvey({ questions, retake, error, onSubmit, onCancel }: {
  questions: SurveyQuestion[];
  retake: boolean;
  error: string;
  onSubmit: (answers: Record<string, number>) => Promise<void>;
  onCancel: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [sending, setSending] = useState(false);
  const complete = questions.every((question) => answers[question.id]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!complete || sending) return;
    setSending(true);
    void onSubmit(answers).finally(() => setSending(false));
  };
  return <form className="linux-survey" onSubmit={submit}>
    <header>
      <span className="linux-mission-label">Before we start</span>
      <h2>How much Linux do you know?</h2>
      <p>Rate yourself from 1 to 5 stars. There are no wrong answers: your trainer uses them to design a lab at your
        level, from your very first command to real server work.</p>
      {retake && <p className="linux-survey-warning">Sending new answers replaces your current lab and its progress
        with a new one. Cancel to keep it.</p>}
    </header>
    {questions.map((question) => <fieldset key={question.id} className="linux-survey-question">
      <legend>{question.question}</legend>
      <div className="linux-survey-stars" role="radiogroup" aria-label={question.question}>
        {[1, 2, 3, 4, 5].map((stars) => <button
          key={stars}
          type="button"
          role="radio"
          aria-checked={answers[question.id] === stars}
          aria-label={`${stars} ${stars === 1 ? 'star' : 'stars'}`}
          className={stars <= (answers[question.id] ?? 0) ? 'lit' : ''}
          onClick={() => setAnswers((current) => ({ ...current, [question.id]: stars }))}
        >★</button>)}
      </div>
      <div className="linux-survey-scale"><span>{question.low}</span><span>{question.high}</span></div>
    </fieldset>)}
    {error && <p className="linux-survey-error" role="alert">{error}</p>}
    <div className="linux-mission-actions">
      <span className="linux-mission-help">{complete ? 'Ready when you are.' : 'Answer every question to continue.'}</span>
      {retake && <button type="button" className="quiet" onClick={onCancel}>Cancel</button>}
      <button type="submit" className="primary" disabled={!complete || sending}>{sending ? 'Sending…' : retake ? 'Design a new lab' : 'Design my lab'}</button>
    </div>
  </form>;
}

interface LabTerminalHandle { run(command: string): Promise<void>; }

export const LabTerminal = forwardRef<LabTerminalHandle, { system: SystemClient; variant: LabVariant; courseId: string }>(function LabTerminal({ system, variant, courseId }, ref) {
  const [session, setSession] = useState<TerminalSession>();
  const [prompt, setPrompt] = useState('$');
  const [line, setLine] = useState('');
  const [entries, setEntries] = useState<{ command?: string; result?: TerminalResult }[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let disposed = false;
    void system.createTerminal({ learningModule: courseId }).then(async (created) => {
      if (disposed) return;
      setSession(created);
      setPrompt(await created.prompt());
    });
    return () => { disposed = true; };
  }, [system, courseId]);

  const run = async (command: string) => {
    if (!session || !command.trim()) return;
    setLine('');
    const result = await session.run(command);
    setEntries((previous) => [...previous, { command, result }].slice(-80));
    setPrompt(await session.prompt());
    input.current?.focus();
  };
  useImperativeHandle(ref, () => ({ run: async (command) => {
    if (!session) return;
    const result = await session.run(command);
    setEntries((previous) => [...previous, { command, result }].slice(-80));
    setPrompt(await session.prompt());
    input.current?.focus();
  } }), [session]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!line.trim()) return;
    await run(line);
  }

  return <section className="lab-terminal" aria-label={`${variant} terminal`}>
    <div className="lab-terminal-bar"><span className="terminal-led" /> <strong>terminal</strong><span>ENTER to run · /hint · /answer</span></div>
    <div className="lab-terminal-output" onClick={() => input.current?.focus()}>
      <div className="lab-terminal-welcome">{variant === 'docker' ? 'Docker sandbox ready. Work the incident from the shell.' : variant === 'chmod' ? 'Permission sandbox ready. Verify every change with evidence.' : 'Linux sandbox ready. Complete the task with observable terminal evidence.'}</div>
      {entries.map((entry, index) => <div key={`${entry.command}-${index}`} className="lab-terminal-entry">
        <div><span className="lab-prompt">{prompt}</span> {entry.command}</div>
        {entry.result && <pre className={entry.result.code ? 'terminal-failure' : ''}>{entry.result.stdout}{entry.result.stderr}</pre>}
        {entry.result?.feedback && <div className={`lab-feedback ${entry.result.feedback.correct ? 'correct' : 'wrong'}`} role="status">
          <strong>{entry.result.feedback.correct ? '✓ Correct!' : '✗ Not quite'}</strong>
          <span>{entry.result.feedback.text}</span>
          <small>{entry.result.feedback.correct ? 'Your next task is ready above.' : 'Try again, or press Hint for a nudge.'}</small>
        </div>}
      </div>)}
      <form onSubmit={submit} className="lab-terminal-form">
        <span className="lab-prompt">{prompt}</span>
        <input ref={input} value={line} onChange={(event) => setLine(event.target.value)} disabled={!session} aria-label="Terminal command" autoComplete="off" spellCheck={false} />
      </form>
    </div>
  </section>;
});

function DockerVisualization({ system }: { system: SystemClient }) {
  const [state, setState] = useState<{ images: string[]; containers: { name: string; image: string; ports: { host: number; container: number }[]; stopped: number | null }[] }>({ images: [], containers: [] });
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      const result = await system.dispatch<typeof state>('learn-docker.snapshot', {});
      if (!disposed && result.ok) setState(result.value);
    };
    void refresh();
    return system.onChange(() => void refresh());
  }, [system]);
  return <aside className="lab-visual docker-visual" aria-label="Docker engine visualization">
    <div className="lab-section-label">Engine state</div>
    <div className="docker-daemon"><span className="docker-orb" /> docker daemon <span className="docker-live">LIVE</span></div>
    <div className="visual-group"><span>Images</span><strong>{state.images.length}</strong></div>
    {state.images.length ? <div className="visual-chips">{state.images.map((image) => <code key={image}>{image}:latest</code>)}</div> : <p className="visual-empty">No images pulled yet.</p>}
    <div className="visual-group"><span>Containers</span><strong>{state.containers.length}</strong></div>
    <div className="container-stack">{state.containers.map((container) => <div className="container-card" key={container.name}>
      <span className={`container-dot ${container.stopped === null ? 'running' : ''}`} />
      <div><strong>{container.name}</strong><small>{container.image}{container.ports.length ? ` · :${container.ports[0]!.host}` : ''}</small></div>
    </div>)}</div>
  </aside>;
}

function PermissionVisualization({ task }: { task: string }) {
  const bits = /\b([0-7]{3})\b/.exec(task)?.[1] ?? '---';
  const rows = ['owner', 'group', 'others'];
  return <aside className="lab-visual permission-visual" aria-label="Permission visualization">
    <div className="lab-section-label">Permission model</div>
    <p>Translate the task into evidence with <code>ls -l</code>.</p>
    <div className="permission-grid">{rows.map((row, index) => <div key={row}><span>{row}</span><strong>{bits[index] ?? '-'}</strong><small>{bits[index] === '7' ? 'rwx' : bits[index] === '6' ? 'rw-' : bits[index] === '5' ? 'r-x' : bits[index] === '4' ? 'r--' : '---'}</small></div>)}</div>
    <code className="permission-command">chmod {bits} file</code>
  </aside>;
}

function LessonIntro({ title, done, summary, onStart }: {
  title: string;
  done: boolean;
  summary: string;
  onStart(): void;
}) {
  return <div className="learn-intro">
    <h1>{title}</h1>
    <p>{summary}</p>
    <p>Each step checks your work automatically as you go: just do it in the terminal or the desktop.</p>
    <button className="primary" onClick={onStart}>{done ? 'Do it again' : 'Start lesson'}</button>
  </div>;
}

/** A course module's status, refreshed whenever the system changes (progress is saved to a file). */
export function useLessonStatus(system: SystemClient, courseId: string) {
  const [status, setStatus] = useState<LessonStatus | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const result = await system.dispatch<LessonStatus>(`${courseId}.status`, {});
    if (result.ok) {
      setStatus(result.value);
      setError('');
    }
    else setError(result.error.message);
  }, [system, courseId]);

  const call = useCallback(async (action: string, payload: unknown = {}) => {
    const result = await system.dispatch(`${courseId}.${action}`, payload);
    await refresh();
    if (!result.ok) setError(result.error.message);
  }, [system, courseId, refresh]);

  useEffect(() => {
    void refresh();
    const stopChanges = system.onChange(() => void refresh());
    // Adding or removing an AI key changes what the course offers (the survey, or the built-in lessons).
    const stopAi = system.ai()?.onChange(() => void refresh());
    return () => { stopChanges(); stopAi?.(); };
  }, [system, refresh]);

  // Syllabus generation completes outside the kernel event stream, so poll only while the
  // initial status is pending; otherwise a failed plan could leave the UI stuck on "generating".
  useEffect(() => {
    if (!status?.lastExplain?.includes('generating')) return;
    const timer = window.setInterval(() => void refresh(), 1_000);
    return () => window.clearInterval(timer);
  }, [status?.lastExplain, refresh]);

  return { status, error, call };
}

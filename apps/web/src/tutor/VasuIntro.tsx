import { useState } from 'react';

/** What learners can ask Vasu about himself. The answers are written here, so they work without the AI. */
const TOPICS: { id: string; question: string; answer: string[] }[] = [
  {
    id: 'teach',
    question: 'What can you teach me?',
    answer: [
      'Linux, from your first command to real admin work: moving around the file system, files and folders, '
        + 'permissions, pipes, processes, and containers with Docker.',
      'Learn Linux and Learn Docker are my courses: a fresh lab every day, checked as you type. Stuck? Type '
        + '/hint, or just ask me.',
    ],
  },
  {
    id: 'computer',
    question: 'Can you use the computer?',
    answer: [
      'Yes! I have my own pointer and keyboard. I can open apps, click buttons, arrange windows, switch desktops, '
        + 'and type commands into my own terminal so you can watch how it\'s done.',
      'But I\'m a teacher, not a helper who does your homework: I show you once, then hand the keyboard back.',
    ],
  },
  {
    id: 'watch',
    question: 'Do you watch what I do?',
    answer: [
      'I can look at your screen and your recent commands when you ask me something, so I can explain what really '
        + 'happened instead of guessing.',
      'If a command fails twice in a row, I offer to help. Nothing goes to the AI until you ask.',
    ],
  },
  {
    id: 'sudo',
    question: 'Can you become root?',
    answer: [
      'Only if you let me. When I need sudo, to show you an admin command or fix something, I ask you first and you '
        + 'type your password, just like on a real Linux system.',
      'You can take it back any time with the "Revoke" button in my chat.',
    ],
  },
  {
    id: 'stop',
    question: 'How do I stop you?',
    answer: [
      'While I\'m using the computer, a bar at the top says so. Press Stop, or the Esc key, and I let go at once.',
    ],
  },
];

/**
 * Vasu introduces himself the first time a learner meets him, in a speech bubble, then lets them ask about what
 * he can do, start learning, or chat with him.
 */
export function VasuIntro({ user, onChat, onLearn, onClose }: {
  user: string;
  onChat(): void;
  onLearn(): void;
  onClose(): void;
}) {
  const [topic, setTopic] = useState<string | null>(null);
  const [asked, setAsked] = useState<string[]>([]);
  const current = TOPICS.find((each) => each.id === topic);

  const ask = (id: string) => {
    setTopic(id);
    setAsked((list) => (list.includes(id) ? list : [...list, id]));
  };

  return <div className="vasu-bubble" role="dialog" aria-label="Vasu introduces himself">
    <button className="vasu-bubble-close" aria-label="Close" onClick={onClose}>×</button>
    {current
      ? <>
        <p className="vasu-bubble-question">{current.question}</p>
        {current.answer.map((line) => <p key={line}>{line}</p>)}
      </>
      : <>
        <p className="vasu-bubble-hello">Hi {user || 'there'}! I&apos;m Vasu 🐧</p>
        <p>
          I&apos;m your Linux teacher, and I live in this computer. I&apos;ll help you learn Linux by doing: I explain,
          I show you, and then you try.
        </p>
        <p>Ask me anything about myself:</p>
      </>}
    <div className="vasu-bubble-topics">
      {TOPICS.filter((each) => each.id !== topic).map((each) => <button
        key={each.id}
        className={asked.includes(each.id) ? 'asked' : ''}
        onClick={() => ask(each.id)}
      >{each.question}</button>)}
    </div>
    <div className="vasu-bubble-actions">
      <button className="primary" onClick={onLearn}>Let&apos;s start learning</button>
      <button onClick={onChat}>Ask me something</button>
    </div>
  </div>;
}

const MET_KEY = 'tuxos.vasu.met.';

/** Whether this learner has met Vasu in this browser (his introduction shows once per user). */
export function hasMetVasu(user: string): boolean {
  try {
    return localStorage.getItem(MET_KEY + user) === '1';
  } catch {
    return false;
  }
}

export function rememberMetVasu(user: string): void {
  try {
    localStorage.setItem(MET_KEY + user, '1');
  } catch {
    // Without storage he introduces himself again next time, which is harmless.
  }
}

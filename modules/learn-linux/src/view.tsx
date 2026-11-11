import { useEffect, useRef } from 'react';
import { LinuxLessonPanel } from '@tuxos/course-view';
import type { LessonStatus } from '@tuxos/lessons';
import type { AppViewProps } from '@tuxos/system';

export default function LearnLinuxView({ system, args, setCloseGuard }: AppViewProps) {
  const started = useRef(false);
  useEffect(() => {
    if (!args?.guided || started.current) return;
    started.current = true;
    void (async () => {
      const result = await system.dispatch<LessonStatus>('learn-linux.curriculum', {});
      if (!result.ok || result.value.active) return;
      const next = result.value.lessons.find(lesson => lesson.completed < lesson.steps);
      if (next) await system.dispatch('learn-linux.start', { lesson: next.id });
    })();
  }, [system, args?.guided]);
  return <div className="linux-learning-journal">
    <div className="learning-journal-actions"><button onClick={() => void system.openApp('learn-linux-terminal')}>Open Terminal</button><span>A dedicated terminal for your Linux lessons</span></div>
    <LinuxLessonPanel system={system} courseId="learn-linux" detached />
  </div>;
}

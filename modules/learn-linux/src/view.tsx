import { useEffect, useRef } from 'react';
import { LearningLabView } from '@tuxos/course-view';
import type { LessonStatus } from '@tuxos/lessons';
import type { AppViewProps } from '@tuxos/system';

export default function LearnLinuxView({ system, args }: AppViewProps) {
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
  return <div className="learning-entry">
    <nav aria-label="Learning activities"><button aria-current="page">Linux course</button><button onClick={() => void system.openApp('learn-docker')}>Docker</button><button onClick={() => void system.openApp('learn-filesystem')}>Filesystem guide</button></nav>
    <LearningLabView system={system} courseId="learn-linux" variant="linux" />
  </div>;
}

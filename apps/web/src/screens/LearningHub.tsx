import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import type { AppViewProps } from '@tuxos/system';
import { getLazyView } from '../views';
const Linux = lazy(() => import('@tuxos/module-learn-linux/view'));
const tabs = [
  ['learn-adventure', 'Tux’s Adventure'], ['play', 'Play'], ['learn-linux', 'Linux course'],
  ['learn-docker', 'Docker'], ['learn-filesystem', 'Filesystem guide'],
] as const;
export default function LearningHub(props: AppViewProps) {
  const [selected, setSelected] = useState('learn-linux');
  const guard = useRef<(() => boolean) | null>(null);
  const setGuard = useCallback((next: (() => boolean) | null) => {
    guard.current = next; props.setCloseGuard?.(next);
  }, [props.setCloseGuard]);
  const select = (id: string) => {
    if (id === selected || (guard.current && !guard.current())) return;
    setSelected(id);
  };
  const View = selected === 'learn-linux' ? Linux : getLazyView(selected);
  return <div className="learning-entry">
    <nav role="tablist" aria-label="Learning activities">{tabs.map(([id, label], index) => <button
      key={id} id={`learning-tab-${props.windowId}-${id}`} role="tab" aria-selected={id === selected}
      aria-controls={`learning-panel-${props.windowId}`} tabIndex={id === selected ? 0 : -1}
      onClick={() => select(id)} onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault(); select(tabs[next]![0]);
        (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();
      }}>{label}</button>)}</nav>
    <section className="learning-tab-content" role="tabpanel" id={`learning-panel-${props.windowId}`}
      aria-labelledby={`learning-tab-${props.windowId}-${selected}`}>
      <Suspense fallback={<p role="status">Opening activity…</p>}>
        {View && <View key={selected} {...props} args={selected === 'play' ? { page: 'play' } : props.args} setCloseGuard={setGuard} />}
      </Suspense>
    </section>
  </div>;
}

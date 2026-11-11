import type { AppViewProps } from '@tuxos/system';
import { TerminalSurface } from '@tuxos/module-terminal/view';
export default function LearningTerminal(props: AppViewProps) {
  return <div className="terminal-install-window">
    <section className="learning-terminal-note">Linux course practice · <code>/hint</code> for help · <code>/answer</code> for a walkthrough</section>
    <TerminalSurface {...props} learningModule="learn-linux" inputId={props.windowId} />
  </div>;
}

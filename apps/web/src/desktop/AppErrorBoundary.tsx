import { Component, type ReactNode } from 'react';

/** An unavailable chunk or damaged app state must not take away the rest of the desktop or recovery. */
export class AppErrorBoundary extends Component<{ children: ReactNode; title: string; retry(): void; close?(): void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="window-loading" role="alert"><h2>{this.props.title} could not open</h2><p>Your saved files remain available. Check your connection and retry. You can also use Export backup in the save controls to keep a copy before reloading.</p><button onClick={() => { this.props.retry(); this.setState({ failed: false }); }}>Retry opening app</button>{this.props.close && <button onClick={this.props.close}>Return to desktop</button>}</section>;
  }
}

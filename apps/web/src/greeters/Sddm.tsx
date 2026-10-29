import { Tux } from '../desktop/Tux';
import { timeText, useNow } from '../desktops/shared/Clock';
import { Icon } from '../desktops/shared/Icons';
import type { GreeterProps } from './types';
import { useLoginForm } from './useLogin';

/** KDE Plasma's login screen (SDDM with the Breeze theme): big clock, one user, actions along the bottom. */
export function Sddm(props: GreeterProps) {
  const { onPower } = props;
  const now = useNow();
  const form = useLoginForm(props);

  return <main className="greeter sddm">
    <div className="sddm-clock">
      <div className="sddm-time">{timeText(now)}</div>
      <div className="sddm-date">
        {now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
    </div>
    <form className="sddm-form" autoComplete="off" onSubmit={(event) => { event.preventDefault(); void form.submit(); }}>
      <div className="sddm-avatar"><Tux /></div>
      <div className="sddm-name">{form.title}</div>
      {form.needsUsername && <div className="sddm-row">
        <input
          aria-label="Username"
          placeholder="Username"
          spellCheck={false}
          autoFocus
          disabled={form.busy}
          value={form.username}
          onChange={(event) => form.setUsername(event.target.value)}
        />
        {!form.needsPassword && <GoButton busy={form.busy} label={form.mode === 'register' ? 'Create account' : 'Log in'} />}
      </div>}
      {form.needsPassword && <div className="sddm-row">
        <input
          type="password"
          aria-label="Password"
          placeholder="Password"
          autoFocus={form.mode === 'account'}
          disabled={form.busy}
          value={form.password}
          onChange={(event) => form.setPassword(event.target.value)}
        />
        <GoButton busy={form.busy} label={form.mode === 'register' ? 'Create account' : 'Log in'} />
      </div>}
      <p className={`sddm-msg ${form.error ? 'error' : ''}`} role={form.error ? 'alert' : 'status'}>
        {form.error || form.hint}
      </p>
      {form.others.length > 0 && <div className="sddm-links">
        {form.others.map((other) => <button key={other.mode} type="button" onClick={() => form.setMode(other.mode)}>
          {other.label}
        </button>)}
      </div>}
    </form>
    <div className="sddm-actions">
      <button type="button" onClick={() => onPower('restart')}>
        <span className="sddm-action-icon"><Icon name="restart" /></span><span>Restart</span>
      </button>
      <button type="button" onClick={() => onPower('shutdown')}>
        <span className="sddm-action-icon"><Icon name="power" /></span><span>Shut Down</span>
      </button>
    </div>
    <div className="sddm-bottom">
      <span className="sddm-session">Start in the terminal · Earn your desktop</span>
      <span className="sddm-kbd">Keyboard Layout: US</span>
    </div>
  </main>;
}

function GoButton({ busy, autoFocus, label }: { busy: boolean; autoFocus?: boolean; label: string }) {
  return <button className={`sddm-go ${busy ? 'busy' : ''}`} type="submit" aria-label={label} disabled={busy} autoFocus={autoFocus}>
    <Icon name="arrow" />
  </button>;
}

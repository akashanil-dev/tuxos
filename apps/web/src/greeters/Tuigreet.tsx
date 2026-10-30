import { DESKTOPS, desktopById } from '@tuxos/appearance';
import { useEffect, useState } from 'react';
import { useNow } from '../desktops/shared/Clock';
import { PopupMenu, type MenuItem } from '../desktops/shared/Menu';
import type { GreeterProps } from './types';
import { useLoginForm } from './useLogin';

/**
 * tuigreet, the text-mode greeter many Hyprland setups use: a box on a black screen, driven by the
 * keyboard. The key hints along the bottom are clickable too.
 */
export function Tuigreet(props: GreeterProps) {
  const { desktop, onDesktop, onPower } = props;
  const now = useNow(1000);
  const form = useLoginForm(props);
  const [menu, setMenu] = useState<MenuItem[] | null>(null);

  const accounts = () => setMenu(form.others.map((other) => ({ label: other.label, run: () => form.setMode(other.mode) })));
  const sessions = () => setMenu(DESKTOPS.map((each) => ({
    label: `${each.id === desktop ? '(*)' : '( )'} ${each.name}`,
    run: () => onDesktop(each.id),
  })));
  const power = () => setMenu([
    { label: 'Reboot', run: () => onPower('restart') },
    { label: 'Power off', run: () => onPower('shutdown') },
  ]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = { F2: form.others.length ? accounts : null, F3: sessions, F12: power }[event.key];
      if (action) { event.preventDefault(); action(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const greeting = { account: `Welcome back, ${form.shownName}`, signin: 'Sign in to TuxOS',
    register: 'Create a TuxOS account' }[form.mode];

  return <main className="greeter tuigreet">
    <div className="tui-time">
      {now.toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}{' '}
      {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </div>
    <form className="tui-box" autoComplete="off" onSubmit={(event) => { event.preventDefault(); void form.submit(); }}>
      <span className="tui-title"> Authenticate into tuxos </span>
      <p className="tui-greet">{greeting}</p>
      {form.needsUsername
        ? <label className="tui-line">
          <span className="tui-key">Username:</span>
          <input aria-label="Username" spellCheck={false} autoFocus disabled={form.busy} value={form.username}
            onChange={(event) => form.setUsername(event.target.value)} />
        </label>
        : <p className="tui-line"><span className="tui-key">Username:</span><span>{form.shownName}</span></p>}
      {form.needsPassword && <label className="tui-line">
        <span className="tui-key">Password:</span>
        <input type="password" aria-label="Password" autoFocus={form.mode === 'account'} disabled={form.busy} value={form.password}
          onChange={(event) => form.setPassword(event.target.value)} />
      </label>}
      <p className={`tui-msg ${form.error ? 'error' : ''}`} role={form.error ? 'alert' : 'status'}>
        {form.busy ? 'Authenticating...' : form.error || `${form.hint} Press Enter to log in.`}
      </p>
      <button type="submit" className="tui-submit" aria-label="Log in" disabled={form.busy} />
    </form>
    <div className="tui-bar">
      {form.others.length > 0 && <button type="button" className="tui-hint" onClick={accounts}><b>F2</b> Accounts</button>}
      <button type="button" className="tui-hint" onClick={sessions}><b>F3</b> Change session</button>
      <button type="button" className="tui-hint" onClick={power}><b>F12</b> Power</button>
      <span className="tui-session">Session: {desktopById(desktop).name}</span>
    </div>
    {menu && <PopupMenu
      className="greeter-menu menu-tui"
      x={14}
      y={globalThis.innerHeight - 60 - menu.length * 34}
      onClose={() => setMenu(null)}
      items={menu}
    />}
  </main>;
}

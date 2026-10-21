import type { SystemClient } from '@tuxos/system';
import { useEffect, useState } from 'react';
import { Penguin } from './Penguin';
import type { SudoRequest } from './useTutor';

/**
 * Vasi asking for root, like the authentication dialog a Linux desktop shows when a program needs admin
 * rights: first the reason with Allow or Deny, then the account's real password. Guests have no password,
 * so for them Allow is the whole answer.
 */
export function SudoDialog({ system, request, verify }: {
  system: SystemClient;
  request: SudoRequest;
  /** Checks the account's password; null for guests. */
  verify: ((password: string) => Promise<boolean>) | null;
}) {
  const [step, setStep] = useState<'ask' | 'password'>('ask');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => { void system.user().then(setUser).catch(() => setUser('')); }, [system]);

  async function authenticate() {
    if (!verify) return request.answer(true);
    if (!password) return setError('Type your password to allow this.');
    setChecking(true);
    setError('');
    try {
      if (await verify(password)) return request.answer(true);
      // What sudo itself says after a wrong password.
      setError('Sorry, try again.');
      setPassword('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setChecking(false);
    }
  }

  return <div className="sudo-backdrop">
    <form
      className="sudo-dialog"
      role="dialog"
      aria-label="Authentication required"
      onKeyDown={(event) => { if (event.key === 'Escape') request.answer(false); }}
      onSubmit={(event) => {
        event.preventDefault();
        if (step === 'ask' && verify) return setStep('password');
        void authenticate();
      }}
    >
      <div className="sudo-head">
        <span className="sudo-avatar"><Penguin /></span>
        <div>
          <h2>Authentication required</h2>
          <p>Vasi wants to run commands as the administrator (root) with <code>sudo</code>.</p>
        </div>
      </div>
      <blockquote className="sudo-reason">{request.reason}</blockquote>
      {step === 'ask'
        ? <p className="sudo-note">
          With sudo, Vasi can change anything on this system until you log out or revoke it.
          {!verify && ' You are a guest, so there is no password to ask for: create an account to protect sudo with one.'}
        </p>
        : <>
          <label className="sudo-field">
            Password for {user || 'your account'}
            <input
              type="password"
              aria-label="Password"
              autoFocus
              disabled={checking}
              value={password}
              onChange={(event) => { setPassword(event.target.value); setError(''); }}
            />
          </label>
          <p className={`sudo-note ${error ? 'error' : ''}`} role={error ? 'alert' : undefined}>
            {error || 'Your account password, as on a real Linux system.'}
          </p>
        </>}
      <div className="sudo-buttons">
        <button type="button" onClick={() => request.answer(false)}>{step === 'ask' ? 'Deny' : 'Cancel'}</button>
        <button type="submit" className="sudo-primary" disabled={checking} autoFocus={step === 'ask'}>
          {step === 'ask' ? 'Allow' : checking ? 'Checking…' : 'Authenticate'}
        </button>
      </div>
    </form>
  </div>;
}

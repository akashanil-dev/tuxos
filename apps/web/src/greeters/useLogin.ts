import { useState } from 'react';
import type { GreeterProps, LoginMode } from './types';

const LABELS: Record<LoginMode, string> = {
  account: 'Continue',
  signin: 'Sign in',
  register: 'Create account',
};

/**
 * The login steps every greeter shares: which mode it is in, the fields that mode needs, a hint, the other
 * modes to switch to, and submitting. Each greeter only decides how it looks.
 */
export function useLoginForm({ account, savedUser, accountsEnabled, login }: GreeterProps) {
  const initial: LoginMode = account ? 'account' : 'register';
  const [mode, setModeState] = useState<LoginMode>(initial);
  const [username, setUsername] = useState(initial === 'register' ? savedUser ?? '' : '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setMode = (next: LoginMode) => {
    setModeState(next);
    setError('');
    setPassword('');
    // A guest signing up keeps their name, so their saved progress moves into the new account.
    setUsername(next === 'register' ? savedUser ?? '' : '');
  };

  const needsUsername = mode !== 'account';
  // Unlocking or coming back after a restart still asks for the password, as a real login screen does.
  const needsPassword = true;
  const shownName = mode === 'account' ? account! : username;

  async function submit() {
    setError('');
    if (!accountsEnabled) return setError('The account service is unavailable. Please try again later.');
    const name = mode === 'account' ? account! : username.trim();
    if (!name) return setError('Please enter a user name.');
    if (needsPassword && !password) return setError(mode === 'register' ? 'Choose a password.' : 'Please enter your password.');
    setBusy(true);
    try {
      await login({ mode, username: name, password });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }

  const others: { mode: LoginMode; label: string }[] = (!accountsEnabled ? [] : [
    ...(account && mode !== 'account' ? [{ mode: 'account' as const, label: `Continue as ${account}` }] : []),
    ...(mode !== 'signin' ? [{ mode: 'signin' as const, label: mode === 'account' ? 'Use another account' : 'Sign in' }] : []),
    ...(mode !== 'register' ? [{ mode: 'register' as const, label: 'Create account' }] : []),
  ]);

  const hint = error ? '' : {
    account: 'Enter your password to unlock. Your progress is saved to your account.',
    signin: 'Sign in to continue where you left off, on any device.',
    register: savedUser && username === savedUser
      ? `Your progress in this browser moves into the new account.`
      : 'Choose a lowercase username and a password. Your progress is saved to your account.',
  }[mode];

  return {
    mode, setMode, title: mode === 'account' ? account! : LABELS[mode], submitLabel: LABELS[mode],
    username, setUsername: (value: string) => setUsername(cleanUsername(value)), shownName,
    password, setPassword, needsUsername, needsPassword, busy, error, hint, others, submit,
  };
}

/** Linux user names are lowercase with no spaces, so the field fixes them as you type. */
export const cleanUsername = (value: string) => value.toLowerCase().replace(/\s/g, '');

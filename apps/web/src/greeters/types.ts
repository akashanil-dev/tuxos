import type { SystemClient } from '@tuxos/system';

/**
 * How someone logs in: back into the account this browser is still signed in to, into another account,
 * creating an account, or as a guest whose progress stays in this browser only.
 */
export type LoginMode = 'account' | 'signin' | 'register';

export interface LoginRequest {
  mode: LoginMode;
  username: string;
  password: string;
}

export interface GreeterProps {
  system: SystemClient;
  /** The account this browser is signed in to (its session cookie), if any. */
  account: string | null;
  /** The guest whose progress is saved in this browser, if any. */
  savedUser: string | null;
  /** Whether the account service is configured. */
  accountsEnabled: boolean;
  /** The desktop session that will start, chosen on the login screen. */
  desktop: string;
  onDesktop(desktop: string): void;
  /** Sign in (or create the account) and boot. Rejects with a readable message, e.g. a wrong password. */
  login(request: LoginRequest): Promise<void>;
  onPower(action: 'restart' | 'shutdown'): void;
}

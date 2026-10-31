import { DEFAULT_DESKTOP } from '@tuxos/kernel';
import { JourneyScreen } from './journey/JourneyScreen';
import { desktopById, wallpaperById } from '@tuxos/appearance';
import { useWallpaper } from './hooks/useWallpaper';
import type { SystemClient } from '@tuxos/system';
import type { Transport } from '@tuxos/tutor';
import { useCallback, useEffect, useState } from 'react';
import { BootLog } from './boot/BootLog';
import { PhoneScreen } from './boot/PhoneScreen';
import { Grub } from './boot/Grub';
import { PowerOff } from './boot/PowerScreens';
import type { AccountsClient } from './accounts';
import type { PowerAction } from './desktops/types';
import { Dtlogin } from './greeters/Dtlogin';
import { Gdm } from './greeters/Gdm';
import { Sddm } from './greeters/Sddm';
import { Tuigreet } from './greeters/Tuigreet';
import type { LoginRequest } from './greeters/types';
import { preloadIconTheme } from './desktop/AppIcon';
import { lastAppearance } from './screens/appearance-memory';

export { Desktop } from './screens/Desktop';

type Screen = 'phone' | 'grub' | 'boot' | 'greeter' | 'desktop' | 'off';

/** Required account service and persistent account storage. */
export interface AccountsWiring {
  client: AccountsClient;
  /** Point storage and the AI key at the signed-in account. Local is retained for legacy adapters. */
  use(target: 'local' | 'account'): void | Promise<void>;
  /** This browser's guest save, read directly, to move it into a new account. */
  localSave(): Promise<string | null>;
}

const SAVE_KEY = 'tuxos.save';

/** Each desktop environment's display manager, as a real distribution pairs them. */
const GREETERS = { sddm: Sddm, gdm: Gdm, dtlogin: Dtlogin, tuigreet: Tuigreet };

/**
 * The whole machine, like a real PC: GRUB, the boot log, the login screen of the chosen desktop
 * environment, then the desktop. Power actions loop back to the right step.
 */
export function App({ system, tutor, accounts, start = 'greeter' }: {
  system: SystemClient;
  tutor?: Transport;
  /** Without an account service, show a connection error rather than an anonymous session. */
  accounts?: AccountsWiring;
  /** Tests can skip straight to the login screen. */
  start?: Screen;
}) {
  const [screen, setScreen] = useState<Screen>(start);
  const [recovery, setRecovery] = useState(false);
  // undefined while we still look for a saved guest and a signed-in account: the login screen waits for both.
  const [savedUser, setSavedUser] = useState<string | null | undefined>(undefined);
  const [account, setAccount] = useState<string | null | undefined>(undefined);
  /** The signed-in account, so unlocking keeps the same session. */
  const [booted, setBooted] = useState<string | null>(null);
  const [desktop, setDesktop] = useState(DEFAULT_DESKTOP);
  const [accountError, setAccountError] = useState('');
  const [retry, setRetry] = useState(0);
  const [powerError, setPowerError] = useState('');
  const wallpaper = useWallpaper('default').background;

  // Warm the cache for the desktop that will start, so its icons and wallpaper are ready at login.
  useEffect(() => {
    preloadIconTheme(desktop);
    if (typeof Image !== 'undefined') new Image().src = wallpaperById(lastAppearance().wallpaper ?? '').url;
  }, [desktop]);

  useEffect(() => {
    if (screen !== 'greeter') return;
    let active = true;
    setSavedUser(undefined);
    setAccount(undefined);
    // Read the guest save directly: a locked account session keeps running, and its storage must not change.
    const guestSave = accounts
      ? accounts.localSave().then((saved) => (saved ? (JSON.parse(saved) as { username?: string }).username ?? null : null))
      : system.hasSave();
    void guestSave.then(value => { if (active) setSavedUser(value); }).catch(() => { if (active) setSavedUser(null); });
    setAccountError('');
    if (accounts) void accounts.client.me().then(value => { if (active) setAccount(value); }).catch(cause => { if (active) setAccountError(String(cause)); });
    else setAccountError('The account service is required. Start the TuxOS API and try again.');
    return () => { active = false; };
  }, [system, screen, accounts, retry]);

  const login = useCallback(async ({ mode, username, password }: LoginRequest) => {
    if (!accounts) throw new Error('Accounts are not available here.');
    if (booted) await system.flush();
    if (mode === 'signin') await accounts!.client.login(username, password);
    // Unlocking, or returning to a still-signed-in account after a restart: check the password first.
    if (mode === 'account' && !(await accounts!.client.verify(password))) throw new Error('Wrong password. Try again.');
    if (mode === 'register') {
      // A guest who signs up with the same name brings their progress into the new account.
      const local = await accounts!.localSave();
      await accounts!.client.register(username, password);
      if (local && (JSON.parse(local) as { username?: string }).username === username) {
        const storage = accounts!.client.storage();
        await storage.get(SAVE_KEY);
        await storage.set(SAVE_KEY, local);
      }
    }
    await accounts!.use('account');
    const who = `account:${username}`;
    // Unlocking the running session keeps everything as it was; anyone else gets a fresh boot.
    if (booted !== who) await system.boot(username);
    setBooted(who);
    await system.flush();
    // Set together with the screen change: the greeter is keyed on the account, so setting it earlier remounted
    // the login form as the password-only unlock screen for as long as the system took to boot.
    setAccount(username);
    setScreen('desktop');
  }, [system, accounts, booted]);

  const verifySudo = accounts && booted?.startsWith('account:')
    ? (password: string) => accounts.client.verify(password)
    : null;

  const power = useCallback((action: PowerAction) => {
    if (!booted) { setScreen(action === 'restart' ? 'grub' : 'off'); return; }
    void (async () => {
      await system.flush();
      if (action === 'lock') { setScreen('greeter'); }
      else if (action === 'logout') {
        await accounts?.client.logout();
        setAccount(undefined); setSavedUser(undefined); setBooted(null); setScreen('greeter');
      } else { setBooted(null); setScreen(action === 'restart' ? 'grub' : 'off'); }
      setPowerError('');
    })().catch(cause => setPowerError(`Could not save and leave: ${String(cause)}. Try signing out again after reconnecting.`));
  }, [system, booted, accounts]);

  const onBoot = useCallback((mode: 'normal' | 'recovery') => {
    setRecovery(mode === 'recovery');
    setScreen('boot');
  }, []);
  const toGreeter = useCallback(() => setScreen('greeter'), []);
  const powerOn = useCallback(() => setScreen('grub'), []);

  switch (screen) {
    case 'phone': return <PhoneScreen onBoot={powerOn} />;
    case 'grub': return <Grub onBoot={onBoot} />;
    case 'boot': return <BootLog recovery={recovery} onDone={toGreeter} />;
    case 'off': return <PowerOff onPowerOn={powerOn} />;
    case 'desktop': return <>{powerError && <div className="journey-save-error" role="alert">{powerError}</div>}<JourneyScreen key={booted} system={system} tutor={tutor} onPower={power} verifySudo={verifySudo} /></>;
  }
  const greeter = desktopById(desktop).greeter;
  const Greeter = GREETERS[greeter];
  return <div
    className={`greeter-screen greeter-${greeter}`}
    style={{ '--greeter-wallpaper': wallpaper } as React.CSSProperties}
  >
    {accountError && <div className="journey-loading" role="alert"><p>{accountError}</p><button onClick={() => setRetry(n => n + 1)}>Retry connection</button></div>}
    {!accountError && savedUser !== undefined && account !== undefined && <Greeter
      // A different account or legacy save means a fresh form.
      key={`${account}|${savedUser}`}
      system={system}
      savedUser={savedUser}
      account={account}
      accountsEnabled={Boolean(accounts)}
      desktop={desktop}
      onDesktop={setDesktop}
      login={login}
      onPower={(action) => power(action)}
    />}
  </div>;
}

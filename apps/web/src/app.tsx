import { DEFAULT_DESKTOP } from '@tuxos/kernel';
import { JourneyScreen } from './journey/JourneyScreen';
import { desktopById, wallpaperById } from '@tuxos/appearance';
import { useWallpaper } from './hooks/useWallpaper';
import type { SystemClient } from '@tuxos/system';
import type { Transport } from '@tuxos/tutor';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
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

/** Optional accounts alongside browser-local exploration. */
export interface AccountsWiring {
  client: AccountsClient;
  /** Point storage and the AI key at the signed-in account. Local is retained for legacy adapters. */
  use(target: 'local' | 'account'): void | Promise<void>;
  /** This browser's guest save, read directly, to move it into a new account. */
  localSave(): Promise<string | null>;
  backup?(value: string, label: string): Promise<void>;
}

const SAVE_KEY = 'tuxos.save';
const ImportAndBackups = lazy(() => import('./migration/ImportAndBackups'));

/** Each desktop environment's display manager, as a real distribution pairs them. */
const GREETERS = { sddm: Sddm, gdm: Gdm, dtlogin: Dtlogin, tuigreet: Tuigreet };

/**
 * The whole machine, like a real PC: GRUB, the boot log, the login screen of the chosen desktop
 * environment, then the desktop. Power actions loop back to the right step.
 */
export function App({ system, tutor, accounts, start = 'greeter' }: {
  system: SystemClient;
  tutor?: Transport;
  /** Local exploration remains available without an account service. */
  accounts?: AccountsWiring;
  /** Tests can skip straight to the login screen. */
  start?: Screen;
}) {
  const [screen, setScreen] = useState<Screen>(start);
  const [recovery, setRecovery] = useState(false);
  const bootDiscoveries = useRef(new Set<'memtest' | 'recovery'>());
  // undefined while we still look for a saved guest and a signed-in account: the login screen waits for both.
  const [savedUser, setSavedUser] = useState<string | null | undefined>(undefined);
  const [account, setAccount] = useState<string | null | undefined>(undefined);
  /** The signed-in account, so unlocking keeps the same session. */
  const [booted, setBooted] = useState<string | null>(null);
  const [desktop, setDesktop] = useState(DEFAULT_DESKTOP);
  const [accountError, setAccountError] = useState('');
  const [retry, setRetry] = useState(0);
  const [powerError, setPowerError] = useState('');
  const [authOpen, setAuthOpen] = useState(false);
  const [guestBusy, setGuestBusy] = useState(false);
  const [saveToAccount, setSaveToAccount] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [transfer, setTransfer] = useState<{ existing: boolean; from?: string; to?: string; summary: string; choose(choice: 'guest' | 'account' | 'cancel'): void } | null>(null);
  const wallpaper = useWallpaper('default').background;
  useEffect(() => {
    if (!booted) return;
    const remember = () => void system.session().then(session => {
      try { localStorage.setItem('tuxos.fast-boot', session.preferences?.fastBoot === false ? '0' : '1'); } catch { /* Preference caching is optional; the save reports persistence failures. */ }
    });
    remember();
    return system.onChange(event => { if (event.action.type === 'session.setPreferences') remember(); });
  }, [system, booted]);

  useEffect(() => {
    if (!booted || screen !== 'desktop') return;
    const pending = [...bootDiscoveries.current]; bootDiscoveries.current.clear();
    for (const id of pending) void system.dispatch('exploration.discover', { id });
  }, [system, booted, screen]);

  // Warm the cache for the desktop that will start, so its icons and wallpaper are ready at login.
  useEffect(() => {
    preloadIconTheme(desktop);
    if (typeof Image !== 'undefined') new Image().src = wallpaperById(lastAppearance().wallpaper ?? '').url;
  }, [desktop]);

  useEffect(() => {
    if (screen !== 'greeter') return;
    let active = true;
    setSavedUser(undefined);
    setAccount(accounts ? undefined : null);
    // Read the guest save directly: a locked account session keeps running, and its storage must not change.
    const guestSave = accounts
      ? accounts.localSave().then((saved) => (saved ? (JSON.parse(saved) as { username?: string }).username ?? null : null))
      : system.hasSave();
    void guestSave.then(value => { if (active) setSavedUser(value); }).catch(() => { if (active) setSavedUser(null); });
    setAccountError('');
    if (accounts) void accounts.client.me().then(value => { if (active) setAccount(value); }).catch(cause => { if (active) { setAccount(null); setAccountError(String(cause)); } });
    return () => { active = false; };
  }, [system, screen, accounts, retry]);

  const login = useCallback(async ({ mode, username, password }: LoginRequest) => {
    if (!accounts) throw new Error('Accounts are not available here.');
    if (booted) await system.flush();
    if (mode === 'signin') await accounts!.client.login(username, password);
    // Unlocking, or returning to a still-signed-in account after a restart: check the password first.
    if (mode === 'account' && !(await accounts!.client.verify(password))) throw new Error('Wrong password. Try again.');
    if (mode === 'register') await accounts!.client.register(username, password);
    const local = await accounts.localSave();
    if (local && (mode === 'register' || saveToAccount)) {
      const guest = JSON.parse(local) as { username?: string };
      if (guest.username === username || saveToAccount || mode === 'register') {
        const target = accounts.client.storage();
        const existing = await target.get(SAVE_KEY);
        // Validate and map only structured identity/path fields before offering this concrete transfer.
        const { nativeSave, parseBounded, renameNative } = await import('@tuxos/migration');
        const mapped = renameNative(nativeSave(parseBounded(local)), username);
        const transferable = JSON.stringify({ username, snapshot: { ...mapped.snapshot, version: 2 } });
        const countFiles = (node: import('@tuxos/kernel').VNode): number => node.kind === 'file' ? 1 : Object.values(node.children).reduce((sum, child) => sum + countFiles(child), 0);
        const summary = `${countFiles(mapped.snapshot.state.fs)} virtual files, ${mapped.snapshot.state.session.journey?.lessons.length ?? 0} completed Linux lessons and ${Object.keys(mapped.snapshot.state.exploration?.adventure.done ?? {}).length} adventure quests. Game records and other saved course files travel with this system.`;
        const choice = await new Promise<'guest' | 'account' | 'cancel'>(resolve => setTransfer({ existing: Boolean(existing), from: guest.username, to: username, summary, choose: resolve }));
        setTransfer(null);
        if (choice === 'cancel') throw new Error('Transfer cancelled. Both saved systems are unchanged.');
        if (choice === 'guest') {
          if (booted?.startsWith('guest:') && system.exportSave?.() !== local) throw new Error('Browser progress changed during the preview. Try the transfer again to include the latest work.');
          if (existing) {
            if (!accounts.backup) throw new Error('A recoverable account backup is required before replacing its progress.');
            await accounts.backup(existing, `account-${username}`);
          }
          await target.set(SAVE_KEY, transferable);
        }
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
    setSaveToAccount(false); setAuthOpen(false);
    setScreen('desktop');
  }, [system, accounts, booted, saveToAccount]);

  const explore = async (mode?: 'desktop' | 'learn') => {
    setGuestBusy(true); setPowerError('');
    try {
      if (booted) await system.flush();
      await accounts?.use('local');
      const username = savedUser || 'explorer';
      await system.boot(username);
      if (mode) await system.dispatch('session.setPreferences', { resume: mode });
      setBooted(`guest:${username}`); setScreen('desktop'); setAuthOpen(false);
      try { await system.flush(); } catch (cause) { setPowerError(`This session has not been saved: ${String(cause)}. Download a backup before leaving.`); }
    } catch (cause) { setPowerError(String(cause)); }
    finally { setGuestBusy(false); }
  };
  const download = () => {
    try {
      const data = system.exportSave?.();
      if (!data) throw new Error('Export is unavailable in this session.');
      const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'tuxos-backup.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setPowerError(String(cause)); }
  };
  const openAccount = async () => {
    if (system.canLeave?.() === false) return;
    try { await system.flush(); setSavedUser(undefined); setAccount(undefined); setSaveToAccount(true); setAuthOpen(true); setScreen('greeter'); }
    catch (cause) { setPowerError(`Save to this browser first, or download a backup: ${String(cause)}`); }
  };

  const verifySudo = accounts && booted?.startsWith('account:')
    ? (password: string) => accounts.client.verify(password)
    : null;

  const power = useCallback((action: PowerAction) => {
    if (!booted) { setScreen(action === 'restart' ? 'grub' : 'off'); return; }
    if (system.canLeave?.() === false) return;
    void (async () => {
      await system.flush();
      if (action === 'lock') { setAuthOpen(booted.startsWith('account:')); setScreen('greeter'); }
      else if (action === 'logout') {
        if (booted.startsWith('account:')) await accounts?.client.logout();
        setAuthOpen(false);
        setAccount(undefined); setSavedUser(undefined); setBooted(null); setScreen('greeter');
      } else { const preferences = (await system.session()).preferences; setBooted(null); setScreen(action === 'restart' ? preferences?.fastBoot === false ? 'grub' : 'greeter' : 'off'); }
      setPowerError('');
    })().catch(cause => setPowerError(`Could not save and leave: ${String(cause)}. Try signing out again after reconnecting.`));
  }, [system, booted, accounts]);

  const onBoot = useCallback((mode: 'normal' | 'recovery') => {
    if (mode === 'recovery') bootDiscoveries.current.add('recovery');
    setRecovery(mode === 'recovery');
    setScreen('boot');
  }, []);
  const toGreeter = useCallback(() => setScreen('greeter'), []);
  const powerOn = useCallback(() => setScreen('grub'), []);

  switch (screen) {
    case 'phone': return <PhoneScreen onBoot={powerOn} />;
    case 'grub': return <Grub onBoot={onBoot} onMemoryTest={() => bootDiscoveries.current.add('memtest')} />;
    case 'boot': return <BootLog recovery={recovery} onDone={toGreeter} />;
    case 'off': return <PowerOff onPowerOn={powerOn} />;
    case 'desktop': return <>{powerError && <div className="journey-save-error" role="alert">{powerError}<button onClick={download}>Download backup</button></div>}<JourneyScreen active={!recoveryOpen} key={booted} system={system} tutor={tutor} onPower={power} verifySudo={verifySudo} />
      <aside className="session-save-status" aria-label="Save location"><span>{booted?.startsWith('guest:') ? 'Browser storage' : `Account: ${account}`}</span><button onClick={download}>Export backup</button><button onClick={() => setRecoveryOpen(true)}>Import & backups</button>{booted?.startsWith('guest:') && accounts && <button onClick={() => void openAccount()}>Save to an account</button>}</aside>
      {recoveryOpen && <Suspense fallback={<div className="journey-loading" role="status">Opening import and recovery…</div>}><ImportAndBackups system={system} close={() => setRecoveryOpen(false)} /></Suspense>}</>;
  }
  const greeter = desktopById(desktop).greeter;
  const Greeter = GREETERS[greeter];
  return <div
    className={`greeter-screen greeter-${greeter}`}
    style={{ '--greeter-wallpaper': wallpaper } as React.CSSProperties}
  >
    {!authOpen && <main className="explore-welcome"><div className="explore-card"><p className="explore-eyebrow">TuxOS · continuing Tuxplore</p><h1>Your Linux adventure starts here.</h1><p>Explore a desktop, try commands, and learn through play. Your progress stays with you in this browser.</p>
      <div className="explore-actions"><button className="primary" disabled={guestBusy || savedUser === undefined} onClick={() => void explore(savedUser ? undefined : 'desktop')}>{guestBusy ? 'Opening…' : savedUser ? 'Resume TuxOS' : 'Explore TuxOS'}</button><button disabled={guestBusy || savedUser === undefined} onClick={() => void explore('learn')}>Start guided learning</button></div>
      {accounts && <button className="explore-account" onClick={() => setAuthOpen(true)}>{account ? `Sign in as ${account}` : 'Sign in or create an account'}</button>}
      <p className="explore-note">No account needed to explore. An account lets you keep your progress across devices.</p>
      {powerError && <p role="alert">{powerError}</p>}
    </div></main>}
    {authOpen && <button className="explore-back" onClick={() => { setAuthOpen(false); setSaveToAccount(false); }}>← Back to exploration</button>}
    {authOpen && accountError && <div className="account-connection" role="status"><p>Account connection unavailable. You can still explore as a guest.</p><button onClick={() => setRetry(n => n + 1)}>Retry connection</button></div>}
    {authOpen && (savedUser === undefined || account === undefined) && <p className="account-connection" role="status">Checking saved account…</p>}
    {authOpen && savedUser !== undefined && account !== undefined && <Greeter
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
    {transfer && <div className="transfer-overlay"><section className="transfer-card" role="dialog" aria-modal="true" aria-label="Choose saved progress"><h2>Choose the progress to keep</h2><p>{transfer.existing ? 'This account already has a saved system. Replacing it will first keep a recoverable backup in this browser.' : 'Bring the system from this browser into your account, or start with the account’s own system.'} Your browser save stays unchanged.</p><p>{transfer.summary}</p>{transfer.from !== transfer.to && <p>The home folder and ownership will change from <strong>{transfer.from}</strong> to <strong>{transfer.to}</strong>. Personal file text and command history stay unchanged. Choosing browser progress replaces the whole account system; its courses and files are not merged.</p>}<button onClick={() => transfer.choose('guest')}>{transfer.existing ? 'Back up account and use browser progress' : 'Use browser progress'}</button><button onClick={() => transfer.choose('account')}>Use account progress</button><button onClick={() => transfer.choose('cancel')}>Cancel transfer</button></section></div>}
  </div>;
}

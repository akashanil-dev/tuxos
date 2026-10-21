import { DESKTOPS, WALLPAPERS, desktopById } from '@tuxos/appearance';
import type { AiKeyStore, AiModelInfo, AiStatus, AppViewProps } from '@tuxos/system';
import { useEffect, useState, type FormEvent } from 'react';
import './settings.css';

/** Settings: pick any desktop environment or wallpaper at any time, and see what this system is. */
export default function SettingsView({ system }: AppViewProps) {
  const [current, setCurrent] = useState({ desktop: '', wallpaper: '' });
  const [about, setAbout] = useState({ user: '', hostname: '' });

  useEffect(() => {
    const load = () => void system.session().then(({ desktop, wallpaper }) => setCurrent({ desktop, wallpaper }));
    load();
    void Promise.all([system.user(), system.hostname()]).then(([user, hostname]) => setAbout({ user, hostname }));
    return system.onChange((event) => { if (event.action.type.startsWith('session.set')) load(); });
  }, [system]);

  return <div className="settings">
    <h3>Desktop environment</h3>
    <p className="settings-intro">
      On Linux the desktop itself is a program you can swap. Each one arranges windows, panels and menus its own
      way, while your files and apps stay the same. Try them all, any time.
    </p>
    <div className="theme-grid">
      {DESKTOPS.map((desktop) => {
        const inUse = desktop.id === current.desktop;
        return <button
          key={desktop.id}
          className={`theme-card ${inUse ? 'active' : ''}`}
          aria-pressed={inUse}
          aria-label={inUse ? `${desktop.name}, in use` : `Switch to ${desktop.name}`}
          onClick={() => { if (!inUse) void system.dispatch('session.setDesktop', { desktop: desktop.id }); }}
        >
          <span className={`theme-preview tp-${desktop.id}`} aria-hidden="true"><i /><i /><i /><i /></span>
          <strong>{desktop.name}</strong>
          <small>{desktop.version}{inUse ? ' · in use' : ''}</small>
          <small>{desktop.summary}</small>
          <small className="theme-used">Used by: {desktop.usedBy}</small>
        </button>;
      })}
    </div>

    <h3>Wallpaper</h3>
    <div className="wall-grid" role="radiogroup" aria-label="Wallpaper">
      {WALLPAPERS.map((wallpaper) => <button
        key={wallpaper.id}
        role="radio"
        aria-checked={wallpaper.id === current.wallpaper}
        aria-label={`Wallpaper: ${wallpaper.name}`}
        className={`wall ${wallpaper.id === current.wallpaper ? 'active' : ''}`}
        style={{ background: wallpaper.thumbnail }}
        onClick={() => void system.dispatch('session.setWallpaper', { wallpaper: wallpaper.id })}
      >{wallpaper.name}</button>)}
    </div>

    {system.ai() && <AiKeySection store={system.ai()!} />}

    <h3>Plugins</h3>
    <p className="settings-intro">Add useful tools to your desktop and manage their permissions.</p>
    <button onClick={() => void system.openApp('plugins')}>Open Plugins</button>

    <h3>About this system</h3>
    <div className="about-system">
      <dl className="about-specs">
        <dt>Operating system</dt><dd>TuxOS 1.0</dd>
        <dt>Kernel</dt><dd>Linux 6.10.0-tuxos</dd>
        <dt>Desktop</dt><dd>{current.desktop && `${desktopById(current.desktop).name} (${desktopById(current.desktop).version})`}</dd>
        <dt>Hostname</dt><dd>{about.hostname}</dd>
        <dt>User</dt><dd>{about.user}</dd>
      </dl>
      <p className="about-blurb">TuxOS runs entirely in your browser. Nothing on your real computer is changed.</p>
    </div>
  </div>;
}

/** Shown while the server has AI switched off: on hover or focus of the switch, and under it. */
const REBUILDING = 'AI features are being rebuilt for a better experience. They will be back soon.';

/**
 * The AI switch and the learner's own AI provider, model and key, which together turn on Vasi and the AI
 * trainers. While the server doesn't offer AI, the whole section is greyed out and the switch stays off.
 */
function AiKeySection({ store }: { store: AiKeyStore }) {
  const [status, setStatus] = useState<AiStatus>(() => store.status());
  const { providers, custom } = store.providers();
  const [provider, setProvider] = useState(() => status.provider ?? providers[0]?.id ?? '');
  const [key, setKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(() => status.baseUrl ?? '');
  const [models, setModels] = useState<AiModelInfo[] | null>(null);
  const [model, setModel] = useState(() => status.model ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  useEffect(() => store.onChange(setStatus), [store]);

  const available = status.available;
  const own = status.source === 'account' || status.source === 'browser';
  // A saved key is reused only for the provider (and address) it was saved for.
  const hasKeyFor = own && status.provider === provider && (provider !== 'custom' || status.baseUrl === baseUrl.trim());
  const chosen = providers.find((each) => each.id === provider);
  const providerName = (id?: string) => providers.find((each) => each.id === id)?.name ?? (id === 'custom' ? 'your server' : id);

  const run = async (work: () => Promise<unknown>, done: string | null) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      if (done) setMessage({ error: false, text: done });
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };
  const pickProvider = (id: string) => {
    setProvider(id);
    setModels(null);
    setModel(id === status.provider ? status.model ?? '' : '');
    setMessage(null);
  };
  const loadModels = () => void run(async () => {
    const list = await store.models({ provider, key: key.trim() || undefined, baseUrl: provider === 'custom' ? baseUrl : undefined });
    setModels(list);
    if (!list.some((each) => each.id === model)) setModel(list[0]?.id ?? '');
  }, null);
  const save = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      setStatus(await store.save({ provider, model, key: key.trim() || undefined, baseUrl: provider === 'custom' ? baseUrl : undefined }));
      setKey('');
    }, status.on ? 'Checked and saved. Vasi and the AI trainers are on.' : 'Checked and saved. Turn AI on to use it.');
  };
  const toggle = () => {
    if (!available || busy) return;
    void run(async () => setStatus(await store.setOn(!status.on)), status.on
      ? 'AI is off. Vasi and the courses now work offline, without your key.'
      : own ? 'AI is on.' : 'AI is on. Choose a provider and add your key to start using it.');
  };

  return <>
    <h3>AI</h3>
    <p className="settings-intro">
      Vasi and the AI trainers use an AI provider you choose, with your own API key, so you only pay for what you
      use (several providers have free plans). With AI off, everything still works: the courses use their built-in
      lessons and Vasi answers from his offline guide.
    </p>
    <div className={`ai-key ${available ? '' : 'unavailable'}`}>
      <div className="ai-switch">
        <span id="ai-switch-label">AI features</span>
        <span className="ai-switch-control" data-tooltip={available ? undefined : REBUILDING}>
          <button
            type="button"
            role="switch"
            aria-checked={status.on}
            aria-labelledby="ai-switch-label"
            aria-disabled={!available || busy}
            aria-describedby={available ? undefined : 'ai-rebuilding'}
            className={status.on ? 'on' : ''}
            onClick={toggle}
          ><span aria-hidden="true" />{status.on ? 'On' : 'Off'}</button>
        </span>
      </div>
      {!available && <p id="ai-rebuilding" className="ai-key-state off" role="status">{REBUILDING}</p>}
      {available && <p className={`ai-key-state ${status.enabled ? 'on' : 'off'}`} role="status">
        {!status.on ? 'AI is off: no AI requests are made and your key is not used.'
          : own ? <>AI is on with {providerName(status.provider)}, model <code>{status.model}</code>, key <code>{status.hint}</code>
            {status.source === 'browser' ? ', kept in this browser.' : ', saved with your account.'}</>
            : status.locked ? 'Your saved AI settings are locked with your password. Sign out and sign in again to use them.'
              : 'AI is on, but needs a provider and your API key.'}
      </p>}
      <form onSubmit={save}>
        <fieldset disabled={!available || busy}>
          <label>
            <span>Provider</span>
            <select value={provider} onChange={(event) => pickProvider(event.target.value)}>
              {providers.map((each) => <option key={each.id} value={each.id}>{each.name}{each.free ? ' (free plan)' : ''}</option>)}
              {custom && <option value="custom">Custom (OpenAI-compatible)</option>}
            </select>
          </label>
          {provider === 'custom' && <label>
            <span>API address</span>
            <input type="url" placeholder="https://example.com/v1" value={baseUrl} spellCheck={false}
              onChange={(event) => { setBaseUrl(event.target.value); setModels(null); }} />
          </label>}
          <label>
            <span>API key</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={hasKeyFor ? `Saved key ${status.hint}: paste a new one to replace it` : 'Paste your API key'}
              value={key}
              onChange={(event) => { setKey(event.target.value); setModels(null); }}
            />
          </label>
          <label>
            <span>Model</span>
            <span className="ai-model">
              {models
                ? <select value={model} onChange={(event) => setModel(event.target.value)}>
                  {!models.length && <option value="">No chat models found</option>}
                  {models.map((each) => <option key={each.id} value={each.id}>{each.id}{each.free ? ' (free)' : ''}</option>)}
                </select>
                : <input readOnly value={model || 'Load the models to choose one'} aria-label="Chosen model" />}
              <button type="button" onClick={loadModels} disabled={!key.trim() && !hasKeyFor}>Load models</button>
            </span>
          </label>
          <div className="ai-key-actions">
            <button type="submit" disabled={!model || (!key.trim() && !hasKeyFor)}>{busy ? 'Checking…' : 'Save'}</button>
            {own && <button type="button" onClick={() => void run(async () => { setStatus(await store.remove()); setModel(''); setModels(null); }, 'AI settings removed.')}>Remove</button>}
          </div>
        </fieldset>
      </form>
      {message && <p className={`ai-key-message ${message.error ? 'error' : ''}`} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
      <p className="ai-key-help">
        {chosen && <>Create a key at <a href={chosen.keysUrl} target="_blank" rel="noreferrer">{new URL(chosen.keysUrl).host}</a>. </>}
        {status.signedIn
          ? 'It is encrypted with a key that only your password unlocks, so nobody running TuxOS can read it. It is used only for your own requests and never shown again.'
          : 'As a guest, it is kept only in this browser and sent with your own AI requests. Sign in to keep it with an account.'}
        {' '}Vasi works best with a model that supports tool calling; with one that doesn&apos;t, he can chat but not use the computer.
      </p>
    </div>
  </>;
}

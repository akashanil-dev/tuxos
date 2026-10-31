import { isPhone } from './boot/PhoneScreen';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { manifest as aboutManifest } from '@tuxos/module-about/manifest';
import { manifest as aptManifest } from '@tuxos/module-apt/manifest';
import { manifest as arcadeManifest } from '@tuxos/module-chmod-arcade/manifest';
import { manifest as editorManifest } from '@tuxos/module-editor/manifest';
import { manifest as filesManifest } from '@tuxos/module-files/manifest';
import { manifest as learnDockerManifest } from '@tuxos/module-learn-docker/manifest';
import { manifest as filesystemManifest } from '@tuxos/module-learn-filesystem/manifest';
import { manifest as learnLinuxManifest } from '@tuxos/module-learn-linux/manifest';
import { manifest as settingsManifest } from '@tuxos/module-settings/manifest';
import { manifest as terminalManifest } from '@tuxos/module-terminal/manifest';
import { createLocalSystem, type KeyValueStorage } from '@tuxos/system';
import { httpTransport } from '@tuxos/tutor';
import { httpAccounts, switchableStorage } from './accounts';
import { webAiKeys } from './ai-key';
import { App, type AccountsWiring } from './app';
import { registerView, unregisterView } from './views';
import { pluginManagerModule } from './plugins/module';
import './styles/base.css';
import './styles/boot.css';
import './styles/greeters.css';
import './styles/window.css';
import './styles/tutor.css';

const browserStorage: KeyValueStorage = {
  async get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  async set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      throw new Error(`save failed: ${String(error)}`);
    }
  },
  async remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      throw new Error(`reset failed: ${String(error)}`);
    }
  },
};

// All learners save to their account. Browser storage is read only for legacy save migration.
const accountsClient = httpAccounts();
const accountStorage = accountsClient.storage();
const { storage, use } = switchableStorage(accountStorage);
// AI uses the learner's own provider and key, saved in their account.
const ai = webAiKeys();
const accounts: AccountsWiring = {
  client: accountsClient,
  use: () => {
    use(accountStorage);
    return ai.load(true);
  },
  localSave: () => browserStorage.get('tuxos.save'),
};

// Only manifests load up front; each module's code is fetched the first time it is used.
const system = createLocalSystem({
  storage,
  journey: true,
  ai,
  modules: [
    // Apps appear on the desktop in this order: the Terminal first, then Plugins.
    { manifest: terminalManifest, load: () => import('@tuxos/module-terminal').then((module) => module.terminal) },
    { manifest: pluginManagerModule.manifest, load: async () => pluginManagerModule },
    { manifest: filesManifest, load: () => import('@tuxos/module-files').then((module) => module.files) },
    { manifest: editorManifest, load: () => import('@tuxos/module-editor').then((module) => module.editor) },
    {
      manifest: learnLinuxManifest,
      load: () => import('@tuxos/module-learn-linux').then((module) => module.learnLinux),
    },
    { manifest: filesystemManifest, load: () => import('@tuxos/module-learn-filesystem').then(module => module.learnFilesystem) },
    {
      manifest: learnDockerManifest,
      load: () => import('@tuxos/module-learn-docker').then((module) => module.learnDocker),
    },
    {
      manifest: arcadeManifest,
      load: () => import('@tuxos/module-chmod-arcade').then((module) => module.chmodArcade),
    },
    {
      manifest: settingsManifest,
      load: () => import('@tuxos/module-settings').then((module) => module.settings),
    },
    { manifest: aboutManifest, load: () => import('@tuxos/module-about').then((module) => module.about) },
    { manifest: aptManifest, load: () => import('@tuxos/module-apt').then((module) => module.apt) },
  ],
  plugins: {
    onUnregisterAppView: unregisterView,
    onRegisterAppView: (appId) => {
      registerView(appId, () => import('./desktop/PluginWindowFrame'));
    },
  },
});
// With AI switched off (or no key), Vasu's requests never leave the browser.
const tutor = httpTransport('/api/tutor', async (url, init) => {
  if (!ai.status().enabled) throw new Error('AI is turned off. Turn it on in Settings → AI.');
  return fetch(url, { ...init, headers: { ...init?.headers as Record<string, string>, ...ai.headers() } });
});
createRoot(document.getElementById('root')!).render(<StrictMode><App start={isPhone() ? 'phone' : 'grub'} system={system} tutor={tutor} accounts={accounts} /></StrictMode>);

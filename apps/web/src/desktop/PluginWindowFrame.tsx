import { useEffect, useRef, useState } from 'react';
import { PluginRPCGateway, type AppViewProps } from '@tuxos/system';
import { createPluginDocument } from './plugin-document';

export function PluginWindowFrame({ system, windowId, appId }: Pick<AppViewProps, 'system'> & { windowId?: string; appId?: string }) {
  const [content, setContent] = useState<{ id: string; title: string; channel: string; html: string; generation: number } | null>(null);
  const [error, setError] = useState('');
  const gateway = useRef<PluginRPCGateway | null>(null);
  const unbind = useRef<(() => void) | null>(null);

  useEffect(() => {
    let active = true;
    setContent(null);
    setError('');
    const bridge = new PluginRPCGateway(system);
    gateway.current = bridge;
    void (async () => {
      const session = await system.session();
      const app = appId ? (await system.apps()).find(app => app.id === appId) : session.windows.find((w) => w.id === windowId);
      if (!app) throw new Error('This plugin window has closed.');
      if (!system.plugins) throw new Error('Plugins are unavailable in this system.');
      const resolved = await system.plugins().app(appId ?? ('appId' in app ? app.appId : app.id));
      if (!active) return;
      const channel = crypto.randomUUID();
      setContent({ id: resolved.pluginId, title: app.title, channel, html: createPluginDocument(resolved.package.html, channel), generation: resolved.generation });
    })().catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { active = false; unbind.current?.(); unbind.current = null; bridge.destroy(); gateway.current = null; };
  }, [system, windowId, appId]);

  if (error) return <div className="plugin-runtime-message" role="alert"><strong>Couldn’t open this plugin</strong><p>{error}</p></div>;
  if (!content) return <div className="plugin-runtime-message" role="status">Loading plugin…</div>;
  return <iframe
    key={content.channel}
    title={`Plugin: ${content.title}`}
    srcDoc={content.html}
    sandbox="allow-scripts"
    referrerPolicy="no-referrer"
    allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; clipboard-read 'none'; clipboard-write 'none'; fullscreen 'none'"
    onLoad={(event) => {
      if (unbind.current) {
        unbind.current(); unbind.current = null;
        gateway.current?.destroy();
        setError('The plugin navigated away from its package. Close and reopen it to reconnect.');
        return;
      }
      const frame = event.currentTarget.contentWindow;
      if (frame && gateway.current) unbind.current = gateway.current.bindWindow(content.id, frame, content.channel, content.generation);
    }}
    style={{ width: '100%', height: '100%', border: 0, background: '#0f172a' }}
  />;
}

export default PluginWindowFrame;

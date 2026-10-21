import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createLocalSystem, type AiKeyStore, type AiStatus, type KeyValueStorage, type SystemClient } from '@tuxos/system';
import type { ChatMessage, CompletionRequest, Transport } from '@tuxos/tutor';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Desktop } from '../screens/Desktop';
import { manifest as terminalManifest } from '../../../../modules/terminal/src/manifest';

type Assistant = Extract<ChatMessage, { role: 'assistant' }>;

const memory = (): KeyValueStorage => {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  };
};

function scripted(...replies: Assistant[]): Transport & { requests: CompletionRequest[] } {
  const requests: CompletionRequest[] = [];
  return {
    requests,
    async complete(request) {
      requests.push(structuredClone(request));
      const reply = replies.shift();
      if (!reply) throw new Error('The tutor service is not reachable.');
      return reply;
    },
  };
}

const uses = (name: string, args: Record<string, unknown>): Assistant => ({
  role: 'assistant', content: null,
  tool_calls: [{ id: name, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
});

async function boot(): Promise<SystemClient> {
  const system = createLocalSystem({
    storage: memory(),
    modules: [{
      manifest: terminalManifest,
      load: () => import('../../../../modules/terminal/src/index').then((m) => m.terminal),
    }],
  });
  await system.boot('ada');
  return system;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('tutor panel', () => {
  it('while AI is being rebuilt, answers from the offline guide and sends nothing', async () => {
    const off: AiStatus = { available: false, enabled: false, on: false, source: null, signedIn: false };
    const ai: AiKeyStore = {
      status: () => off, onChange: () => () => undefined, headers: () => ({}), providers: () => ({ providers: [], custom: false }),
      models: async () => [], save: async () => off, remove: async () => off, setOn: async () => off,
    };
    const system = createLocalSystem({
      storage: memory(),
      ai,
      modules: [{ manifest: terminalManifest, load: () => import('../../../../modules/terminal/src/index').then((m) => m.terminal) }],
    });
    await system.boot('ada');
    const transport = scripted({ role: 'assistant', content: 'should not be asked' });
    render(<Desktop system={system} tutor={transport} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Vasi, your Linux tutor' }, { timeout: 4000 }));
    expect(screen.getByText(/being rebuilt/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open Settings' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Ask Vasi'), { target: { value: 'what does pwd do?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText(/Print the/i)).toBeTruthy();
    expect(transport.requests).toHaveLength(0);
  });

  it('without AI, stays quietly in his corner: no introduction, no stroll, no nudges', async () => {
    const off: AiStatus = { available: true, enabled: false, on: false, source: null, signedIn: false };
    const ai: AiKeyStore = {
      status: () => off, onChange: () => () => undefined, headers: () => ({}), providers: () => ({ providers: [], custom: false }),
      models: async () => [], save: async () => off, remove: async () => off, setOn: async () => off,
    };
    const system = createLocalSystem({
      storage: memory(),
      ai,
      modules: [{ manifest: terminalManifest, load: () => import('../../../../modules/terminal/src/index').then((m) => m.terminal) }],
    });
    await system.boot('ada');
    render(<Desktop system={system} tutor={scripted()} />);
    await screen.findByRole('button', { name: 'Ask Vasi, your Linux tutor' }, { timeout: 4000 });
    const shell = await system.createTerminal();
    await shell.run('nope');
    await shell.run('nope');
    // Past the introduction's delay (1.2 s) and his first stroll (2.5 s).
    await new Promise((resolve) => setTimeout(resolve, 3000));
    expect(screen.queryByRole('dialog', { name: 'Vasi introduces himself' })).toBeNull();
    expect(screen.queryByText(/didn't work either/)).toBeNull();
    expect(document.querySelector('.vasi-actor.walking')).toBeNull();
  }, 10_000);

  it('answers a question, showing what the tutor did on the way', async () => {
    const system = await boot();
    const transport = scripted(
      uses('run_command', { command: 'pwd' }),
      { role: 'assistant', content: 'Use `pwd` to see **where** you are.' },
    );
    render(<Desktop system={system} tutor={transport} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Vasi, your Linux tutor' }, { timeout: 4000 }));
    fireEvent.change(screen.getByLabelText('Ask Vasi'), { target: { value: 'where am I?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    expect(await screen.findByText('pwd', { selector: 'code' })).toBeTruthy();
    expect(screen.getByText(/Checked quietly/).parentElement?.textContent).toContain('$ pwd\n/home/ada');
    expect(screen.getByText('where am I?')).toBeTruthy();
    expect(screen.getByText('where', { selector: 'strong' })).toBeTruthy();
  });

  it('points at a desktop icon with a highlight', async () => {
    const system = await boot();
    const transport = scripted(
      uses('point_at', { target: 'app:terminal', note: 'Here!' }),
      { role: 'assistant', content: 'There.' },
    );
    render(<Desktop system={system} tutor={transport} />);
    await screen.findByText('Terminal', {}, { timeout: 4000 });
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Vasi, your Linux tutor' }, { timeout: 4000 }));
    fireEvent.change(screen.getByLabelText('Ask Vasi'), { target: { value: 'where is the terminal?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('Here!')).toBeTruthy();
    expect(document.querySelector('.tutor-pointer')).not.toBeNull();
    expect(screen.getByText('Terminal').closest('button')?.classList.contains('tutor-raised')).toBe(true);
  });

  it('asks the learner for sudo with their password, and lets them revoke it', async () => {
    const system = await boot();
    const transport = scripted(
      uses('request_sudo', { reason: 'To show you how /etc/shadow stores passwords.' }),
      { role: 'assistant', content: 'Thanks!' },
    );
    const verifySudo = async (password: string) => password === 'hunter2';
    render(<Desktop system={system} tutor={transport} verifySudo={verifySudo} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Vasi, your Linux tutor' }, { timeout: 4000 }));
    fireEvent.change(screen.getByLabelText('Ask Vasi'), { target: { value: 'show me shadow' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    const dialog = await screen.findByRole('dialog', { name: 'Authentication required' });
    expect(dialog.textContent).toContain('To show you how /etc/shadow stores passwords.');
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Authenticate' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Type your password');
    // Only the account's real password works, as with real sudo.
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'guess' } });
    fireEvent.click(screen.getByRole('button', { name: 'Authenticate' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Sorry, try again.');
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Authenticate' }));
    expect(await screen.findByText('Thanks!')).toBeTruthy();
    expect(screen.getByText(/Asked for sudo: you said yes/)).toBeTruthy();
    expect(system.tutor().can('user:switch')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Revoke/ }));
    expect(system.tutor().can('user:switch')).toBe(false);
  });

  it('lets a guest allow sudo without a password, since guests have none', async () => {
    const system = await boot();
    const transport = scripted(uses('request_sudo', { reason: 'To show you root.' }), { role: 'assistant', content: 'Thanks!' });
    render(<Desktop system={system} tutor={transport} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Vasi, your Linux tutor' }, { timeout: 4000 }));
    fireEvent.change(screen.getByLabelText('Ask Vasi'), { target: { value: 'root please' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect((await screen.findByRole('dialog', { name: 'Authentication required' })).textContent).toContain('You are a guest');
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    expect(await screen.findByText('Thanks!')).toBeTruthy();
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(system.tutor().can('user:switch')).toBe(true);
  });

  it('tells Vasi when the learner denies sudo', async () => {
    const system = await boot();
    const transport = scripted(
      uses('request_sudo', { reason: 'To fix your system.' }),
      { role: 'assistant', content: 'Fair enough, I am but a humble penguin.' },
    );
    render(<Desktop system={system} tutor={transport} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Vasi, your Linux tutor' }, { timeout: 4000 }));
    fireEvent.change(screen.getByLabelText('Ask Vasi'), { target: { value: 'fix it' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Deny' }));
    expect(await screen.findByText(/humble penguin/)).toBeTruthy();
    expect(transport.requests[1]!.messages.at(-1)).toMatchObject({
      role: 'tool', content: expect.stringContaining('said no'),
    });
    expect(system.tutor().can('user:switch')).toBe(false);
  });

  it('shows a Stop control while Vasi works, and stops when pressed', async () => {
    const system = await boot();
    let release: (reply: Assistant) => void = () => undefined;
    const transport: Transport = { complete: () => new Promise<Assistant>((resolve) => { release = resolve; }) };
    render(<Desktop system={system} tutor={transport} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Vasi, your Linux tutor' }, { timeout: 4000 }));
    fireEvent.change(screen.getByLabelText('Ask Vasi'), { target: { value: 'set up an exercise' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    fireEvent.click(await screen.findByRole('button', { name: /Stop/ }));
    await act(async () => { release(uses('look_at_screen', {})); });
    expect(await screen.findByText('Stopped. You have control again.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('button', { name: /Stop/ })).toBeNull());
  });

  it('introduces himself once to a new learner, and answers questions about what he can do', async () => {
    const system = await boot();
    const transport = scripted();
    render(<Desktop system={system} tutor={transport} />);
    const intro = await screen.findByRole('dialog', { name: 'Vasi introduces himself' }, { timeout: 5000 });
    expect(intro.textContent).toContain('your Linux teacher');
    fireEvent.click(within(intro).getByRole('button', { name: 'Can you become root?' }));
    expect(intro.textContent).toContain('Only if you let me');
    fireEvent.click(within(intro).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Vasi introduces himself' })).toBeNull();
    // He only introduces himself once; nothing was sent to the AI.
    expect(localStorage.getItem('tuxos.vasi.met.ada')).toBe('1');
    expect(transport.requests).toHaveLength(0);
  }, 15_000);

  it('opens Learn Linux from his introduction', async () => {
    const system = await boot();
    render(<Desktop system={system} tutor={scripted()} />);
    const intro = await screen.findByRole('dialog', { name: 'Vasi introduces himself' }, { timeout: 5000 });
    const open = vi.spyOn(system, 'openApp');
    fireEvent.click(within(intro).getByRole('button', { name: "Let's start learning" }));
    expect(open).toHaveBeenCalledWith('learn-linux');
  }, 15_000);

  it('shows the service error in plain words', async () => {
    const system = await boot();
    render(<Desktop system={system} tutor={scripted()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Vasi, your Linux tutor' }, { timeout: 4000 }));
    fireEvent.change(screen.getByLabelText('Ask Vasi'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect((await screen.findByRole('alert')).textContent).toBe('The tutor service is not reachable.');
  });

  it('offers help after two failed commands, without calling the AI until asked', async () => {
    const system = await boot();
    const transport = scripted({ role: 'assistant', content: 'You need sudo for that file.' });
    render(<Desktop system={system} tutor={transport} />);
    await screen.findByRole('button', { name: 'Ask Vasi, your Linux tutor' }, { timeout: 4000 });
    const terminal = await system.createTerminal();
    await act(async () => {
      await terminal.run('cat /etc/shadow');
      await terminal.run('cat /etc/shadow');
    });
    const nudge = await screen.findByRole('button', { name: /didn't work either/ }, { timeout: 8000 });
    expect(transport.requests).toHaveLength(0);
    fireEvent.click(nudge);
    expect(await screen.findByText('You need sudo for that file.')).toBeTruthy();
  }, 15_000); // Booting the desktop and running two commands can take a few seconds on a busy machine.
});

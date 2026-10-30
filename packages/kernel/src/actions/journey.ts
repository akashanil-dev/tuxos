import { JOURNEY_LESSONS, REWARDS, DESKTOP_PACKAGES, desktopReady, desktopsFromStatus, unlocked, desktopReward, type RewardId } from '@tuxos/sdk';
import { KernelError } from '../errors';
import type { ActionDefinition } from '../kernel';
import type { SessionState } from '../state';

export function demandReward(session: SessionState, reward: RewardId): void {
  if (!unlocked(session.journey, reward)) {
    const milestone = REWARDS.find(r => r.id === reward)!;
    throw new KernelError('EACCES', `Locked: complete the first ${milestone.at} Learn Linux lessons to unlock ${milestone.title}.`);
  }
}
export function demandDesktop(session: SessionState, desktop = 'plasma'): void {
  demandReward(session, desktopReward(desktop));
  if (!desktopReady(session.journey, desktop)) {
    const pkg = DESKTOP_PACKAGES.find(item => item.id === desktop);
    throw new KernelError('EACCES', `Install ${pkg?.name ?? desktop} first: sudo apt update, then sudo apt install ${pkg?.package ?? desktop}.`);
  }
}
export function reconcileJourney(session: SessionState): void {
  if (!session.journey) return;
  if (!desktopReady(session.journey, session.desktop)) session.desktop = 'plasma';
  if (!unlocked(session.journey, 'wallpaper') || (session.wallpaper === 'kde-30th' && !unlocked(session.journey, 'anniversary'))) session.wallpaper = 'default';
  if (!unlocked(session.journey, 'themes')) delete session.theme;
  if (!unlocked(session.journey, 'plugins')) session.widgets = [];
  // Old windows remain in the saved account but are hidden until the desktop is earned.
}
export const journeyActions: ActionDefinition[] = [
  { type: 'journey.terminal', capability: 'shell:exec', description: 'Remember the learning terminal for the current lesson.', mutates: true,
    run: ({ state, fs }, payload: { lesson?: unknown; cwd?: unknown; env?: unknown }) => {
      if (!state.session.journey) return;
      if (typeof payload?.lesson !== 'string' || !JOURNEY_LESSONS.includes(payload.lesson as typeof JOURNEY_LESSONS[number]) || typeof payload.cwd !== 'string' || !payload.cwd.startsWith('/') || !payload.env || typeof payload.env !== 'object' || Array.isArray(payload.env)) throw new KernelError('EINVAL', 'Invalid learning terminal.');
      if (fs.stat(payload.cwd).kind !== 'dir') throw new KernelError('ENOTDIR', 'Learning directory is unavailable.');
      const entries = Object.entries(payload.env);
      if (entries.length > 100 || entries.some(([key, value]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== 'string' || value.length > 4096)) throw new KernelError('EINVAL', 'Invalid terminal environment.');
      state.session.journey.terminal = { lesson: payload.lesson, cwd: payload.cwd, env: Object.fromEntries(entries) };
    } },
  { type: 'journey.status', capability: 'lessons:read', description: 'Read earned learning rewards.', mutates: false,
    run: ({ state }) => structuredClone(state.session.journey ?? null) },
  { type: 'journey.record', capability: 'journey:write', description: 'Record checked built-in Linux progress.', mutates: true,
    run: ({ state, actor }, payload: { lessons?: unknown; steps?: unknown }) => {
      if (actor.kind !== 'module' || actor.id !== 'learn-linux') throw new KernelError('EPERM', 'Only the Linux lesson runner can award progress.');
      if (!state.session.journey) return;
      if (!Array.isArray(payload?.lessons) || !Array.isArray(payload?.steps) || !payload.steps.every(id => typeof id === 'string' && id.length < 160)) throw new KernelError('EINVAL', 'Invalid learning progress.');
      const known = new Set<string>(JOURNEY_LESSONS);
      const progress = state.session.journey;
      progress.lessons = [...new Set([...progress.lessons, ...payload.lessons.filter((id): id is string => typeof id === 'string' && known.has(id))])];
      progress.steps = [...new Set([...progress.steps, ...payload.steps])].slice(0, 1000);
    } },
  { type: 'journey.ack', capability: 'lessons:write', description: 'Dismiss an earned reward announcement.', mutates: true,
    run: ({ state }, payload: { id?: string }) => {
      const reward = REWARDS.find(r => r.id === payload?.id);
      if (!reward || !state.session.journey || !unlocked(state.session.journey, reward.id)) throw new KernelError('EINVAL', 'Reward is not earned.');
      state.session.journey.acknowledged = [...new Set([...state.session.journey.acknowledged, ...REWARDS.filter(r => r.at <= reward.at).map(r => r.id)])];
    } },
  { type: 'journey.reconcile', capability: 'session:control', description: 'Apply the earned appearance choices.', mutates: true,
    run: ({ state, fs }) => {
      if (state.session.journey) {
        let status = '';
        try { status = fs.read('/var/lib/dpkg/status'); } catch (error) { if (!(error instanceof KernelError) || error.code !== 'ENOENT') throw error; }
        state.session.journey.installedDesktops = desktopsFromStatus(status);
      }
      reconcileJourney(state.session);
    } },
];

/** Portable learning-by-exploration history. Course mastery remains owned by each course. */
export interface ExplorationProgress {
  version: 1;
  learned: Record<string, number>;
  achievements: Record<string, number>;
  adventure: { done: Record<string, number>; progress: Record<string, boolean[]>; seen: Record<string, boolean>; started?: boolean; recovery?: { createdAt: number; files: Record<string, { content: string; owner: string; mode: number; mtime: number } | null> } };
  pipe: { solved: Record<string, number>; drafts?: Record<string, number[]>; current?: string };
  runner: { mode: 'Rapid' | 'Infinite'; rapidBest: number; infiniteHigh: number; sound: boolean; family?: string; legacyBest?: number };
  imports: { id: string; importedAt: number; source: string }[];
}

export interface SessionPreferences {
  fastBoot: boolean;
  resume: 'desktop' | 'learn';
  showVasu: boolean;
  richVasu: boolean;
}

export const defaultPreferences = (): SessionPreferences => ({ fastBoot: true, resume: 'desktop', showVasu: true, richVasu: false });
export const emptyExploration = (): ExplorationProgress => ({
  version: 1, learned: {}, achievements: {}, adventure: { done: {}, progress: {}, seen: {} },
  pipe: { solved: {} }, runner: { mode: 'Rapid', rapidBest: 0, infiniteHigh: 0, sound: true }, imports: [],
});

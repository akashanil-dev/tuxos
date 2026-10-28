import type { ModuleDefinition } from '@tuxos/sdk';
import { manifest } from './manifest';
export { manifest };
export const learnFilesystem: ModuleDefinition = { manifest, activate() {} };
export default learnFilesystem;

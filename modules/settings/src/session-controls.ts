import { createContext, type ReactNode } from 'react';

/** Host-owned storage actions, exposed only inside Settings. */
export const SessionControls = createContext<{
  displayControls?: ReactNode;
  location: string;
  download(): void;
  importBackups(): void;
  saveToAccount?: () => void;
} | null>(null);

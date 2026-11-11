import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary';
afterEach(cleanup);
it('contains a broken app and retries without removing unrelated recovery controls', () => {
  const logging = vi.spyOn(console, 'error').mockImplementation(() => {});
  let broken = true;
  function App() { if (broken) throw new Error('Unavailable chunk'); return <p>App recovered</p>; }
  render(<><button>Import & backups</button><AppErrorBoundary title="Pipe Dream" retry={() => { broken = false; }}><App /></AppErrorBoundary></>);
  expect(screen.getByRole('alert').textContent).toContain('Pipe Dream could not open');
  expect(screen.getByRole('button', { name: 'Import & backups' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry opening app' })); expect(screen.getByText('App recovered')).toBeTruthy();
  logging.mockRestore();
});

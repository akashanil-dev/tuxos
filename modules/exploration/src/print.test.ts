import { expect, it, vi } from 'vitest';
import { printReference } from './print';

it('prints all rows outside clipped windows, omits controls, and waits for asynchronous print completion', () => {
  const view = document.createElement('div'); view.className = 'command-reference';
  view.innerHTML = '<h1>Linux reference</h1><div class="reference-controls"><input></div><table><tbody></tbody></table>';
  for (let i = 0; i < 100; i++) { const row = document.createElement('tr'); const cell = document.createElement('td'); cell.textContent = `command-${i} <literal>`; row.append(cell); view.querySelector('tbody')!.append(row); }
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  printReference(view);
  const root = document.querySelector('#tuxos-print-document')!;
  expect(root.parentElement).toBe(document.body); expect(root.querySelectorAll('tr')).toHaveLength(100); expect(root.querySelector('input')).toBeNull();
  expect(root.textContent).toContain('command-99 <literal>'); expect(root.querySelector('literal')).toBeNull();
  expect(view.querySelector('input')).not.toBeNull(); expect(print).toHaveBeenCalledOnce();
  window.dispatchEvent(new Event('afterprint')); expect(document.querySelector('#tuxos-print-document')).toBeNull(); print.mockRestore();
});

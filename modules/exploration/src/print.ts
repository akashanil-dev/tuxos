/** Print in normal document flow, outside the desktop's positioned/clipped window ancestors. */
export function printReference(reference: HTMLElement): void {
  document.querySelector('#tuxos-print-document')?.remove();
  const root = document.createElement('section'); root.id = 'tuxos-print-document'; root.setAttribute('aria-hidden', 'true');
  const copy = reference.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.reference-controls').forEach(node => node.remove());
  root.append(copy); document.body.append(root);
  const cleanup = () => { root.remove(); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup, { once: true });
  try { window.print(); } catch (cause) { cleanup(); throw cause; }
  // Some browsers return from print() before their dialog closes. afterprint owns cleanup.
}

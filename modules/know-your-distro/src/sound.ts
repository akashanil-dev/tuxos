/** Audio exists only after a gesture, with an explicit off switch and complete cleanup. */
export class RunnerSound {
  private context: AudioContext | null = null;
  enabled = false;
  gesture(): void {
    if (!this.enabled) return;
    try { this.context ??= new AudioContext(); if (this.context.state === 'suspended') void this.context.resume().catch(() => {}); } catch { /* Silent play when audio is unavailable. */ }
  }
  tone(frequency: number, length: number, delay = 0, volume = .08): void {
    const ctx = this.context; if (!ctx || !this.enabled || ctx.state !== 'running') return;
    const oscillator = ctx.createOscillator(), gain = ctx.createGain(), start = ctx.currentTime + delay;
    oscillator.type = 'triangle'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(volume, start + .015); gain.gain.exponentialRampToValueAtTime(.0001, start + length);
    oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(start); oscillator.stop(start + length + .02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  good(): void { this.tone(523,.12); this.tone(659,.12,.1); this.tone(784,.14,.2); }
  bad(): void { this.tone(392,.12); this.tone(349,.18,.12); }
  jump(): void { this.tone(420,.08,0,.035); }
  suspend(): void { if (this.context?.state === 'running') void this.context.suspend().catch(() => {}); }
  dispose(): void { const ctx = this.context; this.context = null; if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {}); }
}

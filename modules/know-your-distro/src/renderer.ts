import { ICONS, TEAM_COLOR } from './data';
import { GROUND, HEIGHT, TILE, WIDTH, type GameState, type Tux } from './model';
const TAU = Math.PI * 2, TUX_SCALE = 1.2;
/** Cached landscape strips retain the original runner's depth without repainting every tree. */
export class RunnerRenderer {
  private logos = new Map<string, HTMLImageElement>();
  private landscape: HTMLCanvasElement | null = null;
  private bucket = -1;
  private last: GameState | null = null;
  private stopped = false;
  reducedMotion = false;
  constructor(private canvas: HTMLCanvasElement) {}
  dispose(): void { this.stopped = true; for (const image of this.logos.values()) image.onload = null; this.logos.clear(); this.landscape = null; }
  private logo(name: string): HTMLImageElement | undefined {
    const source = ICONS[name]; if (!source) return undefined;
    if (!this.logos.has(source)) {
      const image = new Image(); image.onload = () => { if (!this.stopped && this.last) this.draw(this.last); };
      image.src = `/distros/${source}.png`; this.logos.set(source, image);
    }
    const image = this.logos.get(source)!; return image.complete && image.naturalWidth ? image : undefined;
  }
  private scene(bucket: number): HTMLCanvasElement {
    if (this.landscape && bucket === this.bucket) return this.landscape;
    this.bucket = bucket;
    const surface = document.createElement('canvas'); surface.width = WIDTH * 2; surface.height = HEIGHT;
    const c = surface.getContext('2d')!;
    const night = (1 - Math.cos(bucket / 24 * TAU)) / 2;
    const sky = c.createLinearGradient(0,0,0,GROUND);
    sky.addColorStop(0, `hsl(${210 + night * 25} 50% ${70 - night * 61}%)`);
    sky.addColorStop(1, `hsl(${200 + night * 30} 52% ${88 - night * 64}%)`);
    c.fillStyle = sky; c.fillRect(0,0,surface.width,HEIGHT);
    if (night > .5) {
      c.fillStyle = '#fff'; for (let i=0; i<65; i++) { const x = (i * 139.3) % surface.width, y = (i * 47.7) % 200; c.globalAlpha = .4 + (i % 4) * .15; c.fillRect(x,y,1.5,1.5); } c.globalAlpha = 1;
    }
    c.fillStyle = night > .5 ? '#e9edff' : '#fff0b1'; c.beginPath(); c.arc(810,85,24,0,TAU); c.fill();
    for (let layer=0; layer<3; layer++) {
      c.fillStyle = `hsl(${208 - layer * 20} ${24 + layer * 7}% ${57 - layer * 10 - night * 28}%)`;
      c.beginPath(); c.moveTo(0,GROUND);
      for (let x=0; x<=surface.width; x+=8) {
        const y = 230 + layer*54 + Math.sin(x / (115 - layer*15) + layer) * (45-layer*8) + Math.sin(x / 43) * 15;
        c.lineTo(x,y);
      }
      c.lineTo(surface.width,GROUND); c.fill();
    }
    for (let i=0;i<70;i++) {
      const x = i*31 + Math.sin(i*7)*10, tall = 45 + (i*23)%70;
      c.fillStyle = `hsl(160 30% ${22 - night*12}%)`; c.beginPath(); c.moveTo(x,GROUND-tall); c.lineTo(x-16,GROUND); c.lineTo(x+16,GROUND); c.fill();
      c.fillStyle = '#283b32'; c.fillRect(x-2,GROUND-10,4,15);
    }
    c.fillStyle = `hsl(155 28% ${24-night*12}%)`; c.fillRect(0,GROUND,surface.width,HEIGHT-GROUND);
    c.fillStyle = `hsl(100 38% ${42-night*22}%)`; c.fillRect(0,GROUND,surface.width,4);
    for(let i=0;i<120;i++) { c.fillStyle='rgba(180,210,160,.18)'; c.fillRect((i*79)%surface.width,GROUND+14+(i*29)%50,4,2); }
    this.landscape = surface; return surface;
  }
  draw(state: GameState): void {
    if (this.stopped) return; this.last = state;
    const canvas = this.canvas, rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(rect.width*dpr), h = Math.round(rect.height*dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width=w; canvas.height=h; }
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const zoom = Math.min(w/WIDTH,h/HEIGHT), left=(w-WIDTH*zoom)/2, top=(h-HEIGHT*zoom)/2;
    ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle='#101a25'; ctx.fillRect(0,0,w,h);
    ctx.setTransform(zoom,0,0,zoom,left,top); ctx.save(); ctx.beginPath(); ctx.rect(0,0,WIDTH,HEIGHT); ctx.clip();
    const phase = this.reducedMotion ? 0 : Math.floor((state.distance%16000)/16000*24);
    const scene = this.scene(phase), offset = this.reducedMotion ? 0 : (state.distance*.12) % WIDTH;
    ctx.drawImage(scene,-offset,0);
    if (!this.reducedMotion) {
      for (let i=0;i<5;i++) { const x=((i*270-state.distance*.04)%1300+1300)%1300-150; ctx.fillStyle='rgba(255,255,255,.16)'; ctx.beginPath(); ctx.ellipse(x,70+i%3*30,65,13,0,0,TAU); ctx.fill(); }
    }
    if (state.weather !== 'Clear') { ctx.fillStyle=state.weather==='Snow'?'rgba(180,195,210,.17)':'rgba(30,45,65,.26)'; ctx.fillRect(0,0,WIDTH,GROUND); }
    for (const tile of state.tiles) {
      ctx.fillStyle='rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(tile.x+30,GROUND+3,25,4,0,0,TAU); ctx.fill();
      ctx.fillStyle='#141f2c'; ctx.strokeStyle='#728199'; ctx.lineWidth=1; ctx.beginPath(); ctx.roundRect(tile.x,tile.y,TILE,TILE,8); ctx.fill(); ctx.stroke();
      const logo = this.logo(tile.name); if (logo) ctx.drawImage(logo,tile.x+11,tile.y+4,38,38);
      else { ctx.fillStyle='#fff'; ctx.font='bold 22px system-ui'; ctx.textAlign='center'; ctx.fillText(tile.name.slice(0,2),tile.x+30,tile.y+30); }
      ctx.fillStyle='#fff'; ctx.font='bold 9px system-ui'; ctx.textAlign='center'; ctx.fillText(tile.name,tile.x+30,tile.y+54,56);
    }
    drawTux(ctx,this.reducedMotion?{...state.tux,step:0,squash:0,sparkle:0}:state.tux);
    if (state.weather === 'Snow' && !this.reducedMotion) {
      ctx.fillStyle='rgba(255,255,255,.8)'; for(let i=0;i<55;i++) { const x=((i*73-state.elapsed*22)%WIDTH+WIDTH)%WIDTH, y=(i*29+state.elapsed*(20+i%30))%GROUND; ctx.beginPath();ctx.arc(x,y,1+i%2*.6,0,TAU);ctx.fill(); }
    }
    if(state.team) { ctx.fillStyle=TEAM_COLOR[state.team];ctx.fillRect(state.tux.x-20,GROUND+17,40,4); }
    ctx.restore(); ctx.setTransform(1,0,0,1,0,0);
  }
}

// Tux drawing adapted from Tuxplore; license notice retained in docs/migration/licenses.
function drawTux(ctx: CanvasRenderingContext2D, t: Tux) {
  const walking = t.ground;
  const ph = t.step;
  const fA = walking ? Math.sin(ph) : 0;
  const fB = walking ? Math.sin(ph + Math.PI) : 0;
  const liftA = walking ? Math.max(0, Math.cos(ph)) * 4 : 0;
  const liftB = walking ? Math.max(0, Math.cos(ph + Math.PI)) * 4 : 0;
  const bob = walking ? -Math.abs(Math.sin(ph)) * 2.4 : 0;
  const waddle = walking ? Math.sin(ph) * 0.06 : 0;
  const X = t.x;

  const lift = Math.max(0, GROUND - t.y);
  ctx.fillStyle = `rgba(0,0,0,${0.25 * Math.max(0.25, 1 - lift / 140)})`;
  ctx.beginPath(); ctx.ellipse(X + 2, GROUND + 1, 17 * TUX_SCALE * Math.max(0.45, 1 - lift / 220), 3.5, 0, 0, TAU); ctx.fill();

  const frame = () => {
    ctx.translate(X, t.y);
    ctx.scale(TUX_SCALE * (1 + t.squash * 0.5), TUX_SCALE * (1 - t.squash));
    if (!t.ground) ctx.rotate(Math.max(-0.2, Math.min(0.25, t.vy / 2200)));
  };
  const foot = (dx: number, liftY: number, front: boolean) => {
    ctx.fillStyle = front ? '#ff9d1e' : '#d8770f';
    const fx = dx * 7 + 2;
    const fy = -liftY;
    ctx.beginPath(); ctx.roundRect(fx - 1.5, fy - 7, 3.2, 7, 1.5); ctx.fill();
    ctx.beginPath(); ctx.ellipse(fx + 3.5, fy - 1, 6.2, 2.6, 0, 0, TAU); ctx.fill();
  };
  const tucked = !t.ground;

  ctx.save();
  frame();
  foot(tucked ? -0.3 : fB, tucked ? 6 : liftB, false);
  ctx.translate(0, bob);
  ctx.rotate(0.08 + waddle);
  const bodyG = ctx.createRadialGradient(-6, -32, 4, 0, -20, 26);
  bodyG.addColorStop(0, '#3b3d4a');
  bodyG.addColorStop(1, '#0c0c12');
  ctx.fillStyle = bodyG;
  ctx.beginPath(); ctx.ellipse(0, -21, 15, 20, 0, 0, TAU); ctx.fill();
  const belly = ctx.createLinearGradient(0, -36, 0, -2);
  belly.addColorStop(0, '#ffffff');
  belly.addColorStop(1, '#d9dbe6');
  ctx.fillStyle = belly;
  ctx.beginPath(); ctx.ellipse(5.5, -18, 9, 15.5, 0.08, 0, TAU); ctx.fill();
  ctx.fillStyle = '#0c0c12';
  ctx.beginPath(); ctx.moveTo(-13, -8); ctx.lineTo(-19, -3); ctx.lineTo(-11, -3); ctx.fill();
  const headG = ctx.createRadialGradient(-2, -46, 2, 2, -40, 14);
  headG.addColorStop(0, '#3b3d4a');
  headG.addColorStop(1, '#0c0c12');
  ctx.fillStyle = headG;
  ctx.beginPath(); ctx.arc(3, -40, 11.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.ellipse(8.5, -41, 4.6, 5.6, 0.15, 0, TAU); ctx.fill();
  if (t.hurt > 0) {
    ctx.strokeStyle = '#111'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(7, -43.5); ctx.lineTo(11, -39.5); ctx.moveTo(11, -43.5); ctx.lineTo(7, -39.5); ctx.stroke();
  } else if (t.blink < 0) {
    ctx.strokeStyle = '#111'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(7, -41); ctx.lineTo(11.5, -41); ctx.stroke();
  } else {
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(10, -41.5, 2.3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(10.8, -42.4, 0.8, 0, TAU); ctx.fill();
  }
  const beak = ctx.createLinearGradient(12, -38, 22, -33);
  beak.addColorStop(0, '#ffb43b');
  beak.addColorStop(1, '#ff8a00');
  ctx.fillStyle = beak;
  ctx.beginPath(); ctx.moveTo(11, -38.5); ctx.quadraticCurveTo(19, -38, 23, -35); ctx.quadraticCurveTo(18, -33.5, 11, -33.5); ctx.fill();
  ctx.fillStyle = '#d96f00';
  ctx.beginPath(); ctx.moveTo(11, -35); ctx.quadraticCurveTo(17, -34.5, 21, -34.6); ctx.quadraticCurveTo(17, -32.5, 11, -32.5); ctx.fill();
  // flipper: swings while walking, flaps up in the air (bigger flaps, like the original)
  const swing = tucked ? -1.0 + Math.sin(ph * 2) * 0.4 : -fA * 0.45;
  ctx.save();
  ctx.translate(-3, -29);
  ctx.rotate(0.35 + swing);
  const fl = ctx.createLinearGradient(-4, 0, 4, 16);
  fl.addColorStop(0, '#1d1e27');
  fl.addColorStop(1, '#050508');
  ctx.fillStyle = fl;
  ctx.beginPath(); ctx.ellipse(0, 8, 4.2, 11, 0, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.restore();

  ctx.save();
  frame();
  foot(tucked ? 0.4 : fA, tucked ? 4 : liftA, true);
  ctx.restore();

  if (t.sparkle > 0) {
    ctx.fillStyle = '#ffffff';
    const r = (0.3 - t.sparkle) * 70;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU;
      ctx.fillRect(X + Math.cos(a) * r - 1, t.y - 20 + Math.sin(a) * r * 0.6 - 1, 2, 2);
    }
  }
}


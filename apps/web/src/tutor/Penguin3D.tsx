// Vasi in 3D: a small, round, cartoon penguin built from smooth shapes with three.js (no model file), so every
// part can move on its own. He breathes and blinks when idle, waddles with flapping flippers and stepping feet
// when he walks, tilts his head and talks while thinking, taps his flippers while he uses the computer, raises
// one to point, and waves when the pointer comes near. This file is loaded only when he is first shown, and
// only where WebGL works (Penguin.tsx falls back to the drawn SVG otherwise).

import { useEffect, useRef } from 'react';
import {
  AmbientLight, CapsuleGeometry, Color, ConeGeometry, CylinderGeometry, DataTexture, DirectionalLight, Group,
  HemisphereLight, Mesh, MeshToonMaterial, NearestFilter, PerspectiveCamera, RedFormat, Scene, SphereGeometry,
  SRGBColorSpace, TorusGeometry, WebGLRenderer, type BufferGeometry, type Material, type Object3D,
} from 'three';

export type PenguinMood = 'idle' | 'thinking' | 'acting' | 'pointing';

export interface PenguinPose {
  facing: 'left' | 'right' | 'front';
  walking: boolean;
  mood: PenguinMood;
}

const COLORS = {
  body: '#2d3250',
  belly: '#fff7ea',
  beak: '#ffb02e',
  feet: '#ff9f1c',
  cheek: '#ff8fa3',
  eye: '#17171f',
  cap: '#22253a',
  tassel: '#f5c542',
};

/** Three flat tones: the soft cartoon shading that keeps him cute rather than plasticky. */
function toonRamp(): DataTexture {
  const ramp = new DataTexture(new Uint8Array([90, 175, 255]), 3, 1, RedFormat);
  ramp.minFilter = NearestFilter;
  ramp.magFilter = NearestFilter;
  ramp.needsUpdate = true;
  return ramp;
}

interface Rig {
  root: Group;
  body: Group;
  head: Group;
  eyes: Group;
  jaw: Mesh;
  flipperLeft: Group;
  flipperRight: Group;
  footLeft: Mesh;
  footRight: Mesh;
}

function buildPenguin(ramp: DataTexture): Rig {
  const toon = (color: string) => new MeshToonMaterial({ color: new Color(color), gradientMap: ramp });
  const mesh = (geometry: BufferGeometry, material: Material, parent: Object3D, at: [number, number, number], scale: [number, number, number] = [1, 1, 1]) => {
    const part = new Mesh(geometry, material);
    part.position.set(...at);
    part.scale.set(...scale);
    parent.add(part);
    return part;
  };
  const sphere = new SphereGeometry(1, 40, 28);
  const dark = toon(COLORS.body);
  const cream = toon(COLORS.belly);
  const orange = toon(COLORS.beak);

  const root = new Group();
  const body = new Group();
  root.add(body);

  // A round, slightly pear-shaped body with a big cream belly.
  mesh(sphere, dark, body, [0, 0, 0], [0.9, 0.98, 0.82]);
  mesh(sphere, cream, body, [0, -0.1, 0.34], [0.68, 0.78, 0.55]);

  // A big head (cute proportions) on its own pivot so it can tilt and look around.
  const head = new Group();
  head.position.set(0, 0.92, 0.02);
  body.add(head);
  mesh(sphere, dark, head, [0, 0, 0], [0.74, 0.68, 0.68]);
  // The face: two overlapping cream patches, like a penguin's mask.
  mesh(sphere, cream, head, [-0.17, -0.06, 0.36], [0.36, 0.42, 0.34]);
  mesh(sphere, cream, head, [0.17, -0.06, 0.36], [0.36, 0.42, 0.34]);

  const eyes = new Group();
  // On the face's surface (the cream patches reach z = 0.70), or they'd be hidden inside it.
  eyes.position.set(0, 0.03, 0.68);
  head.add(eyes);
  const eyeMaterial = new MeshToonMaterial({ color: new Color(COLORS.eye), gradientMap: ramp });
  const shine = new MeshToonMaterial({ color: new Color('#ffffff'), gradientMap: ramp, emissive: new Color('#ffffff'), emissiveIntensity: 0.6 });
  for (const side of [-1, 1]) {
    mesh(sphere, eyeMaterial, eyes, [side * 0.16, 0, 0], [0.1, 0.13, 0.06]);
    mesh(sphere, shine, eyes, [side * 0.16 + 0.035, 0.045, 0.055], [0.034, 0.034, 0.02]);
  }
  // Rosy cheeks.
  const blush = new MeshToonMaterial({ color: new Color(COLORS.cheek), gradientMap: ramp, transparent: true, opacity: 0.75 });
  for (const side of [-1, 1]) mesh(sphere, blush, head, [side * 0.33, -0.15, 0.65], [0.085, 0.045, 0.03]);

  // A small beak: the top is fixed, the lower half opens when he talks.
  const beakTop = mesh(new ConeGeometry(0.11, 0.2, 20), orange, head, [0, -0.11, 0.72]);
  beakTop.rotation.x = Math.PI / 2;
  beakTop.scale.set(1.15, 1, 0.75);
  const jaw = mesh(new ConeGeometry(0.08, 0.13, 20), toon(COLORS.feet), head, [0, -0.17, 0.69]);
  jaw.rotation.x = Math.PI / 2;
  jaw.scale.set(1.1, 1, 0.6);

  // The teacher's cap, kept from the drawn Vasi: a flat board, a band and a gold tassel.
  const cap = new Group();
  cap.position.set(0, 0.62, -0.02);
  cap.rotation.set(-0.12, 0, 0.1);
  head.add(cap);
  const capMaterial = toon(COLORS.cap);
  mesh(new CylinderGeometry(0.3, 0.34, 0.16, 28), capMaterial, cap, [0, -0.06, 0]);
  const board = mesh(new CylinderGeometry(0.5, 0.5, 0.05, 4), capMaterial, cap, [0, 0.04, 0]);
  board.rotation.y = Math.PI / 4;
  const gold = toon(COLORS.tassel);
  mesh(new TorusGeometry(0.035, 0.012, 8, 16), gold, cap, [0, 0.075, 0]);
  mesh(new CapsuleGeometry(0.018, 0.22, 4, 8), gold, cap, [0.33, -0.06, 0.12]);

  // Flippers hang from shoulder pivots, so rotating a pivot swings the whole flipper.
  const flipper = (side: -1 | 1) => {
    const pivot = new Group();
    pivot.position.set(side * 0.78, 0.28, 0.02);
    body.add(pivot);
    const wing = mesh(sphere, dark, pivot, [side * 0.06, -0.36, 0], [0.13, 0.42, 0.26]);
    wing.rotation.z = side * 0.12;
    return pivot;
  };
  const flipperLeft = flipper(-1);
  const flipperRight = flipper(1);

  // Two orange feet, stepping in turn when he walks.
  const footGeometry = sphere;
  const footLeft = mesh(footGeometry, toon(COLORS.feet), root, [-0.3, -0.95, 0.22], [0.24, 0.09, 0.34]);
  const footRight = mesh(footGeometry, toon(COLORS.feet), root, [0.3, -0.95, 0.22], [0.24, 0.09, 0.34]);

  return { root, body, head, eyes, jaw, flipperLeft, flipperRight, footLeft, footRight };
}

const FACING = { front: 0, right: 0.95, left: -0.95 } as const;
/** Flippers rest slightly away from the body. */
const REST = 0.22;

/**
 * Moves every part for the time `t` (seconds) and the pose. Kept separate from rendering so it is one place to
 * read and tune. `wave` counts down the seconds left of a wave; `still` (reduced motion) keeps him calm.
 */
function animate(rig: Rig, pose: PenguinPose, t: number, wave: number, still: boolean, blink: boolean): void {
  const calm = still ? 0.25 : 1;
  const { body, head, jaw, flipperLeft, flipperRight, footLeft, footRight } = rig;
  // Turn smoothly towards where he faces.
  rig.root.rotation.y += (FACING[pose.facing] - rig.root.rotation.y) * 0.15;
  rig.eyes.scale.y = blink ? 0.12 : 1;

  let left = -REST;
  let right = REST;
  let headTilt = 0;
  let headTurn = Math.sin(t * 0.7) * 0.12 * calm;
  let headNod = 0;
  let jawOpen = 0;
  let roll = 0;
  let bob = Math.sin(t * 2.2) * 0.02 * calm;
  let stepLeft = 0;
  let stepRight = 0;

  if (pose.walking) {
    const stride = t * 12;
    roll = Math.sin(stride) * 0.13;
    bob = Math.abs(Math.sin(stride)) * 0.07;
    stepLeft = Math.max(0, Math.sin(stride));
    stepRight = Math.max(0, -Math.sin(stride));
    // Flippers flap out for balance as he waddles.
    left = -REST - 0.35 - Math.sin(stride) * 0.25;
    right = REST + 0.35 - Math.sin(stride) * 0.25;
    headTurn = 0;
  } else if (pose.mood === 'thinking') {
    headTilt = 0.2;
    headNod = Math.sin(t * 3) * 0.04;
    jawOpen = (Math.sin(t * 16) * 0.5 + 0.5) * 0.35 * calm;
    // One flipper to his chin, as if pondering.
    right = REST + 1.9;
    left = -REST - Math.sin(t * 2) * 0.05;
  } else if (pose.mood === 'acting') {
    // Busy at the keyboard: quick little taps.
    headNod = 0.12;
    left = -REST - 0.5 - Math.max(0, Math.sin(t * 22)) * 0.25 * calm;
    right = REST + 0.5 + Math.max(0, Math.sin(t * 22 + 1.6)) * 0.25 * calm;
  } else if (pose.mood === 'pointing') {
    right = REST + 2.5;
    headTurn = 0.25;
    headTilt = -0.08;
  } else {
    left = -REST - Math.sin(t * 2.2) * 0.04 * calm;
    right = REST + Math.sin(t * 2.2 + 0.4) * 0.04 * calm;
  }
  if (wave > 0) {
    // A friendly wave: the right flipper up, wiggling.
    right = REST + 2.3 + Math.sin(t * 14) * 0.35;
    headTilt = 0.12;
  }

  body.rotation.z = roll;
  body.position.y = bob;
  head.rotation.set(headNod, headTurn, headTilt);
  jaw.rotation.x = Math.PI / 2 + jawOpen;
  jaw.position.y = -0.17 - jawOpen * 0.06;
  flipperLeft.rotation.z = left;
  flipperRight.rotation.z = right;
  footLeft.position.y = -0.95 + stepLeft * 0.1;
  footLeft.position.z = 0.22 + stepLeft * 0.08;
  footRight.position.y = -0.95 + stepRight * 0.1;
  footRight.position.z = 0.22 + stepRight * 0.08;
}

/** Vasi in 3D. Calls `onFail` if WebGL can't start, so the caller can show the drawn penguin instead. */
export default function Penguin3D({ pose, onFail }: { pose: PenguinPose; onFail(): void }) {
  const holder = useRef<HTMLDivElement>(null);
  const current = useRef(pose);
  current.current = pose;

  useEffect(() => {
    const element = holder.current;
    if (!element) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      onFail();
      return;
    }
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    const width = element.clientWidth || 64;
    const height = element.clientHeight || 77;
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    element.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(30, width / height, 0.1, 50);
    // Follow the size of the space he is given.
    const resize = () => {
      const w = element.clientWidth;
      const h = element.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize);
    observer?.observe(element);
    camera.position.set(0, 0.35, 6.4);
    camera.lookAt(0, 0.12, 0);
    scene.add(new HemisphereLight('#ffffff', '#5a5f80', 1.6));
    scene.add(new AmbientLight('#ffffff', 0.35));
    const sun = new DirectionalLight('#ffffff', 2.2);
    sun.position.set(-2, 3, 4);
    scene.add(sun);

    const ramp = toonRamp();
    const rig = buildPenguin(ramp);
    scene.add(rig.root);

    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let wave = 0;
    let nextBlink = 2 + Math.random() * 3;
    let blinkUntil = 0;
    const onEnter = () => { if (!still) wave = 1.4; };
    element.addEventListener('pointerenter', onEnter);

    let frame = 0;
    let last = performance.now();
    const start = last;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      // Nothing to draw while the tab is hidden.
      if (document.hidden) { last = now; return; }
      const delta = Math.min(0.1, (now - last) / 1000);
      last = now;
      const t = (now - start) / 1000;
      wave = Math.max(0, wave - delta);
      if (t > nextBlink) { blinkUntil = t + 0.12; nextBlink = t + 2.5 + Math.random() * 4; }
      animate(rig, current.current, t, wave, still, t < blinkUntil);
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      element.removeEventListener('pointerenter', onEnter);
      scene.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose();
          (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.dispose());
        }
      });
      ramp.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [onFail]);

  return <div ref={holder} className="penguin-3d" aria-hidden="true" style={{ width: '100%', height: '100%' }} />;
}

import { useId } from 'react';

/**
 * Vasu, a penguin teacher, drawn with shading so he reads as a rounded, 3D figure: lit from the top left, with a
 * soft shadow under his feet and a graduation cap. His wings, feet and eyes are separate parts so CSS can make him
 * waddle, step, wave and blink (see tutor.css).
 */
export function Puppet({ facing = 'front' }: { facing?: 'left' | 'right' | 'front' }) {
  // Gradient ids must be unique on the page: Vasu can appear twice (his button and the sudo dialog).
  const id = useId().replace(/:/g, '');
  // Walking, he turns sideways and faces where he is going; resting, he faces the learner.
  if (facing !== 'front') return <SideView id={id} facing={facing} />;
  return <svg viewBox="0 0 80 96" aria-hidden="true" className="puppet-svg">
    <Shading id={id} />
    <ellipse className="puppet-shadow" cx="40" cy="90" rx="24" ry="5" fill={`url(#${id}-shadow)`} />
    <g className="puppet-feet">
      <path className="puppet-foot puppet-foot-left" d="M22 84c-4 0-7 3-5 5h14c2-2-3-5-9-5z" fill={`url(#${id}-foot)`} />
      <path className="puppet-foot puppet-foot-right" d="M58 84c4 0 7 3 5 5H49c-2-2 3-5 9-5z" fill={`url(#${id}-foot)`} />
    </g>
    <g className="puppet-body">
      <path className="puppet-wing puppet-wing-left" d="M17 42c-7 5-11 17-9 26 3 1 8-6 10-13z" fill="#15151c" />
      <path className="puppet-wing puppet-wing-right" d="M63 42c7 5 11 17 9 26-3 1-8-6-10-13z" fill="#15151c" />
      <path d="M40 14C25 14 16 27 16 46c0 22 10 40 24 40s24-18 24-40C64 27 55 14 40 14z" fill={`url(#${id}-body)`} />
      <path d="M40 34c-11 0-17 12-17 26 0 14 7 24 17 24s17-10 17-24c0-14-6-26-17-26z" fill={`url(#${id}-belly)`} />
      {/* A rim of light along his left side sells the roundness. */}
      <path d="M22 34c-3 7-4 15-3 23" fill="none" stroke="rgb(255 255 255 / 18%)" strokeWidth="2" strokeLinecap="round" />
      <g className="puppet-eyes">
        <ellipse cx="33" cy="30" rx="5" ry="6" fill={`url(#${id}-eye)`} />
        <ellipse cx="47" cy="30" rx="5" ry="6" fill={`url(#${id}-eye)`} />
        <circle cx="34" cy="31" r="2.6" fill="#141418" />
        <circle cx="46" cy="31" r="2.6" fill="#141418" />
        <circle cx="35" cy="29.8" r="0.9" fill="#fff" />
        <circle cx="47" cy="29.8" r="0.9" fill="#fff" />
      </g>
      <path d="M34 37q6-4 12 0-6 6-12 0z" fill={`url(#${id}-beak)`} />
      {/* The teacher's cap. */}
      <g className="puppet-cap">
        <path d="M27 17l13-6 13 6-13 6z" fill="#1b1b24" stroke="#33334a" strokeWidth="0.6" />
        <path d="M33 19v4c4 2 10 2 14 0v-4l-7 3z" fill="#22222d" />
        <path d="M53 17v7" stroke="#f5b82e" strokeWidth="1.2" />
        <circle cx="53" cy="25" r="1.4" fill="#f5b82e" />
      </g>
    </g>
  </svg>;
}

/** Vasu in profile, facing right (mirrored to face left), for walking. */
function SideView({ id, facing }: { id: string; facing: 'left' | 'right' }) {
  return <svg viewBox="0 0 80 96" aria-hidden="true" className="puppet-svg puppet-side">
    <Shading id={id} />
    <g transform={facing === 'left' ? 'translate(80 0) scale(-1 1)' : undefined}>
      <ellipse className="puppet-shadow" cx="40" cy="90" rx="20" ry="4.5" fill={`url(#${id}-shadow)`} />
      <g className="puppet-feet">
        <path className="puppet-foot puppet-foot-left" d="M36 84c-2 0-3 3-1 5h13c1-2-5-5-12-5z" fill={`url(#${id}-foot)`} />
        <path className="puppet-foot puppet-foot-right" d="M44 84c-2 0-3 3-1 5h13c1-2-5-5-12-5z" fill={`url(#${id}-foot)`} opacity="0.85" />
      </g>
      <g className="puppet-body">
        {/* Body in profile: rounder at the back, the belly showing on the side he faces. */}
        <path d="M38 14C26 15 19 28 19 46c0 23 9 40 21 40s21-15 21-36c0-20-9-36-23-36z" fill={`url(#${id}-body)`} />
        <path d="M46 32c8 4 12 14 12 26 0 14-6 25-15 27-6-6-8-18-7-30 1-11 4-20 10-23z" fill={`url(#${id}-belly)`} />
        <path className="puppet-wing puppet-wing-left" d="M30 44c-6 8-7 20-3 28 4-1 8-10 8-20z" fill="#15151c" />
        <path d="M24 34c-2 6-3 13-2 20" fill="none" stroke="rgb(255 255 255 / 16%)" strokeWidth="2" strokeLinecap="round" />
        <g className="puppet-eyes">
          <ellipse cx="49" cy="29" rx="4.5" ry="5.5" fill={`url(#${id}-eye)`} />
          <circle cx="51" cy="30" r="2.4" fill="#141418" />
          <circle cx="51.8" cy="28.9" r="0.85" fill="#fff" />
        </g>
        <path d="M55 34q9 1 11 4-8 2-12 1z" fill={`url(#${id}-beak)`} />
        <g className="puppet-cap">
          <path d="M26 17l13-6 13 6-13 6z" fill="#1b1b24" stroke="#33334a" strokeWidth="0.6" />
          <path d="M32 19v4c4 2 10 2 14 0v-4l-7 3z" fill="#22222d" />
          <path d="M27 17v7" stroke="#f5b82e" strokeWidth="1.2" />
          <circle cx="27" cy="25" r="1.4" fill="#f5b82e" />
        </g>
      </g>
    </g>
  </svg>;
}

/** The gradients that shade Vasu; shared by his front and side views. */
function Shading({ id }: { id: string }) {
  return <defs>
    <radialGradient id={`${id}-body`} cx="38%" cy="28%" r="78%">
      <stop offset="0%" stopColor="#4a4a5e" />
      <stop offset="45%" stopColor="#24242f" />
      <stop offset="100%" stopColor="#0c0c11" />
    </radialGradient>
    <radialGradient id={`${id}-belly`} cx="42%" cy="35%" r="70%">
      <stop offset="0%" stopColor="#ffffff" />
      <stop offset="70%" stopColor="#ece7dd" />
      <stop offset="100%" stopColor="#c9c1b2" />
    </radialGradient>
    <linearGradient id={`${id}-beak`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#ffc54d" />
      <stop offset="100%" stopColor="#e08a12" />
    </linearGradient>
    <linearGradient id={`${id}-foot`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#ffb53a" />
      <stop offset="100%" stopColor="#d47a0c" />
    </linearGradient>
    <radialGradient id={`${id}-eye`} cx="40%" cy="35%" r="65%">
      <stop offset="0%" stopColor="#ffffff" />
      <stop offset="100%" stopColor="#dcd8d0" />
    </radialGradient>
    <radialGradient id={`${id}-shadow`} cx="50%" cy="50%" r="50%">
      <stop offset="0%" stopColor="rgb(0 0 0 / 45%)" />
      <stop offset="100%" stopColor="rgb(0 0 0 / 0%)" />
    </radialGradient>
  </defs>;
}

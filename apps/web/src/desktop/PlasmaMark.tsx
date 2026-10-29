/** Shared Plasma mark for startup and the KDE reward reveal. */
export function PlasmaMark({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="27" cy="37" r="17" fill="none" stroke="currentColor" strokeWidth="5" />
    <circle cx="49" cy="15" r="7" fill="currentColor" />
    <circle cx="51" cy="40" r="4" fill="currentColor" />
    <circle cx="23" cy="9" r="3" fill="currentColor" />
  </svg>;
}

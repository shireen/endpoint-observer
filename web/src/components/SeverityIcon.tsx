import type { LatencySeverity } from '../lib/api';

/**
 * A shape cue for latency severity so the signal doesn't depend on color
 * alone (WCAG 1.4.1 — colorblind users read the shape): a warning triangle
 * for "elevated", an alert circle for "high". Inherits `currentColor` so it
 * matches the value's tone. Decorative here — the adjacent value carries an
 * sr-only severity word for screen readers.
 */
export function SeverityIcon({
  severity,
  className = '',
}: {
  severity: LatencySeverity;
  className?: string;
}) {
  if (severity === 'normal') return null;

  if (severity === 'elevated') {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.19-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  // high
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-11.25a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 1.5 0v-3.5ZM10 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

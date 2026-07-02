import type { ConnectionState } from '../hooks/useEventStream';

const STYLES: Record<ConnectionState, { dot: string; label: string }> = {
  connecting: { dot: 'bg-muted', label: 'Connecting…' },
  live: { dot: 'bg-success animate-pulse', label: 'Live' },
  reconnecting: { dot: 'bg-gold', label: 'Reconnecting…' },
};

export function ConnectionBadge({ state }: { state: ConnectionState }) {
  const { dot, label } = STYLES[state];
  return (
    <span className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 font-display text-xs font-medium uppercase tracking-wide text-ink/80">
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}

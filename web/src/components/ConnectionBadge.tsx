import type { ConnectionState } from '../hooks/useEventStream';

const STYLES: Record<ConnectionState, { dot: string; label: string }> = {
  connecting: { dot: 'bg-slate-400', label: 'Connecting…' },
  live: { dot: 'bg-emerald-400 animate-pulse', label: 'Live' },
  reconnecting: { dot: 'bg-amber-400', label: 'Reconnecting…' },
};

export function ConnectionBadge({ state }: { state: ConnectionState }) {
  const { dot, label } = STYLES[state];
  return (
    <span className="flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}

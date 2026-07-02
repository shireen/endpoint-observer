import type { Stats } from '../types';

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-gold/60">
      <p className="font-display text-[11px] font-medium uppercase tracking-widest text-muted">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl font-bold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function StatsCards({ stats, loading }: { stats: Stats | undefined; loading: boolean }) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl border border-line bg-surface" />
        ))}
      </div>
    );
  }

  const successRate =
    stats.count > 0 ? `${((stats.okCount / stats.count) * 100).toFixed(1)}%` : '—';
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Card label="Checks (24h)" value={String(stats.count)} hint={`${stats.failedCount} failed`} />
      <Card label="Success rate" value={successRate} />
      <Card
        label="Avg latency"
        value={stats.avgLatencyMs !== null ? `${Math.round(stats.avgLatencyMs)}ms` : '—'}
        hint={
          stats.minLatencyMs !== null
            ? `min ${stats.minLatencyMs}ms · max ${stats.maxLatencyMs}ms`
            : undefined
        }
      />
      <Card
        label="p95 latency"
        value={stats.p95LatencyMs !== null ? `${stats.p95LatencyMs}ms` : '—'}
      />
    </div>
  );
}

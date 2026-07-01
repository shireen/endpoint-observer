import type { Stats } from '../types';

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="text-xs uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function StatsCards({ stats, loading }: { stats: Stats | undefined; loading: boolean }) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl border border-slate-800 bg-slate-900/60"
          />
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

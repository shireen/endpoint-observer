import type { Stats } from '../types';
import {
  formatLatency,
  latencySeverity,
  severityToneClass,
  type LatencySeverity,
} from '../lib/api';
import { SeverityIcon } from './SeverityIcon';
import { InfoTip } from './InfoTip';

const SEVERITY_LABEL: Record<LatencySeverity, string> = {
  normal: '',
  elevated: 'Elevated latency: ',
  high: 'High latency: ',
};

function Card({
  label,
  value,
  hint,
  info,
  severity,
}: {
  label: string;
  value: string;
  hint?: string;
  info?: string;
  severity?: LatencySeverity;
}) {
  const tone = severity ? severityToneClass(severity) : 'text-ink';
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-gold/60">
      <div className="flex items-center gap-1.5">
        <p className="font-display text-[11px] font-medium uppercase tracking-widest text-muted">
          {label}
        </p>
        {info && <InfoTip label={label} text={info} />}
      </div>
      <p
        className={`mt-2 flex items-center gap-1.5 font-display text-3xl font-bold tabular-nums ${tone}`}
      >
        {severity && severity !== 'normal' && (
          <>
            <span className="sr-only">{SEVERITY_LABEL[severity]}</span>
            <SeverityIcon severity={severity} className="h-6 w-6 shrink-0" />
          </>
        )}
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const AVG_INFO =
  'The mean response time across all checks in the last 24 hours. A quick health gauge, but a few very slow or failed checks can skew it.';
const P95_INFO =
  '95% of responses were faster than this value (only the slowest 5% were slower). A better signal of worst-case user experience than the average, because it ignores a handful of outliers.';

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
        value={stats.avgLatencyMs !== null ? formatLatency(stats.avgLatencyMs) : '—'}
        severity={stats.avgLatencyMs !== null ? latencySeverity(stats.avgLatencyMs) : undefined}
        info={AVG_INFO}
        hint={
          // min being non-null means at least one row exists, so max does too.
          stats.minLatencyMs !== null
            ? `min ${formatLatency(stats.minLatencyMs)} · max ${formatLatency(stats.maxLatencyMs!)}`
            : undefined
        }
      />
      <Card
        label="p95 latency"
        value={stats.p95LatencyMs !== null ? formatLatency(stats.p95LatencyMs) : '—'}
        severity={stats.p95LatencyMs !== null ? latencySeverity(stats.p95LatencyMs) : undefined}
        info={P95_INFO}
      />
    </div>
  );
}

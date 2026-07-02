import { useQuery } from '@tanstack/react-query';
import { fetchLlmUsage } from '../lib/api';

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-display text-[11px] uppercase tracking-widest text-muted">{label}</p>
      <p className="mt-1 font-display tabular-nums text-ink">{value}</p>
    </div>
  );
}

/** Cost transparency for the LLM features (assignment: display cost estimation). */
export function CostPanel() {
  const { data } = useQuery({
    queryKey: ['llmUsage'],
    queryFn: fetchLlmUsage,
    refetchInterval: 60_000,
  });

  if (!data) return null;

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xs font-semibold uppercase tracking-widest text-muted">
          AI usage &amp; cost
        </h2>
        <span className="font-display text-xs text-gold-deep">
          {data.enabled ? `model: ${data.model}` : 'AI disabled (no API key) — fallback mode'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric
          label="Calls this hour"
          value={`${data.usage.callsLastHour} / ${data.callsPerHour}`}
        />
        <Metric label="Total calls" value={String(data.usage.totalCalls)} />
        <Metric
          label="Tokens (in / out)"
          value={`${data.usage.totalInputTokens.toLocaleString()} / ${data.usage.totalOutputTokens.toLocaleString()}`}
        />
        <Metric label="Estimated cost" value={`$${data.usage.totalEstimatedCostUsd.toFixed(4)}`} />
      </div>
    </section>
  );
}

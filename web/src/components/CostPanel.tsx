import { useQuery } from '@tanstack/react-query';
import { fetchLlmUsage } from '../lib/api';

/** Cost transparency for the LLM features (assignment: display cost estimation). */
export function CostPanel() {
  const { data } = useQuery({
    queryKey: ['llmUsage'],
    queryFn: fetchLlmUsage,
    refetchInterval: 60_000,
  });

  if (!data) return null;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          AI usage &amp; cost
        </h2>
        <span className="text-xs text-slate-500">
          {data.enabled ? `model: ${data.model}` : 'AI disabled (no API key) — fallback mode'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs text-slate-500">Calls this hour</p>
          <p className="tabular-nums">
            {data.usage.callsLastHour} / {data.callsPerHour}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Total calls</p>
          <p className="tabular-nums">{data.usage.totalCalls}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Tokens (in / out)</p>
          <p className="tabular-nums">
            {data.usage.totalInputTokens.toLocaleString()} /{' '}
            {data.usage.totalOutputTokens.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Estimated cost</p>
          <p className="tabular-nums">${data.usage.totalEstimatedCostUsd.toFixed(4)}</p>
        </div>
      </div>
    </section>
  );
}

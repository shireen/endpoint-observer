import { useState } from 'react';
import type { MonitorResponse } from '../types';
import { formatBytes, formatTime } from '../lib/api';
import { PayloadDrawer } from './PayloadDrawer';

function StatusBadge({ response }: { response: MonitorResponse }) {
  if (response.statusCode === null) {
    return (
      <span className="rounded-md bg-danger/10 px-2 py-0.5 font-display text-xs font-medium text-danger">
        error
      </span>
    );
  }
  const color = response.ok ? 'bg-success/12 text-success' : 'bg-danger/10 text-danger';
  return (
    <span
      className={`rounded-md px-2 py-0.5 font-display text-xs font-semibold tabular-nums ${color}`}
    >
      {response.statusCode}
    </span>
  );
}

interface Props {
  responses: MonitorResponse[] | undefined;
  loading: boolean;
  error?: string;
}

export function ResponsesTable({ responses, loading, error }: Props) {
  const [selected, setSelected] = useState<MonitorResponse | null>(null);

  if (loading) {
    return (
      <div className="space-y-2" data-testid="responses-loading">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-11 animate-pulse rounded-lg border border-line bg-surface" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
        Failed to load responses: {error}
      </div>
    );
  }

  if (!responses || responses.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-muted">
        No checks recorded yet — the first ping fires right after the server boots.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-surface font-display text-[11px] uppercase tracking-widest text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Latency</th>
              <th className="px-4 py-3 font-medium">Size</th>
              <th className="px-4 py-3 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {responses.map((r) => (
              <tr key={r.id} className="bg-paper transition-colors hover:bg-surface">
                <td className="whitespace-nowrap px-4 py-3 text-ink/80">
                  {formatTime(r.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge response={r} />
                </td>
                <td className="px-4 py-3 font-display tabular-nums text-ink">{r.latencyMs}ms</td>
                <td className="px-4 py-3 tabular-nums text-muted">
                  {formatBytes(r.responseSizeBytes)}
                </td>
                <td className="px-4 py-3">
                  {r.error ? (
                    <span className="text-xs text-danger">{r.error}</span>
                  ) : (
                    <button
                      onClick={() => setSelected(r)}
                      className="text-xs font-semibold text-gold-deep transition-colors hover:text-gold-soft"
                    >
                      View payload
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && <PayloadDrawer response={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

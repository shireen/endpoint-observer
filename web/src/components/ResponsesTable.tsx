import { useState } from 'react';
import type { MonitorResponse } from '../types';
import { formatBytes, formatTime } from '../lib/api';
import { PayloadDrawer } from './PayloadDrawer';

function StatusBadge({ response }: { response: MonitorResponse }) {
  if (response.statusCode === null) {
    return (
      <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400">
        error
      </span>
    );
  }
  const color = response.ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${color}`}>
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
          <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-900/60" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-300">
        Failed to load responses: {error}
      </div>
    );
  }

  if (!responses || responses.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
        No checks recorded yet — the first ping fires right after the server boots.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-slate-900 text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-2.5 font-medium">Time</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Latency</th>
              <th className="px-4 py-2.5 font-medium">Size</th>
              <th className="px-4 py-2.5 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {responses.map((r) => (
              <tr key={r.id} className="bg-slate-950/40 transition-colors hover:bg-slate-900/70">
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                  {formatTime(r.createdAt)}
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge response={r} />
                </td>
                <td className="px-4 py-2.5 tabular-nums text-slate-200">{r.latencyMs}ms</td>
                <td className="px-4 py-2.5 tabular-nums text-slate-400">
                  {formatBytes(r.responseSizeBytes)}
                </td>
                <td className="px-4 py-2.5">
                  {r.error ? (
                    <span className="text-xs text-red-400">{r.error}</span>
                  ) : (
                    <button
                      onClick={() => setSelected(r)}
                      className="text-xs font-medium text-sky-400 hover:text-sky-300"
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

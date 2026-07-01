import type { MonitorResponse } from '../types';
import { formatTime } from '../lib/api';

function prettyJson(raw: string | null): string {
  if (raw === null) return '—';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function PayloadDrawer({
  response,
  onClose,
}: {
  response: MonitorResponse;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-label="Response detail"
    >
      <div
        className="h-full w-full max-w-lg overflow-y-auto border-l border-slate-800 bg-slate-950 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="font-semibold">Check #{response.id}</h3>
            <p className="text-xs text-slate-400">
              {formatTime(response.createdAt)} · {response.latencyMs}ms · HTTP{' '}
              {response.statusCode ?? '—'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Request payload (sent)
        </h4>
        <pre className="mb-4 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-300">
          {prettyJson(response.requestPayload)}
        </pre>

        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Response body (received)
        </h4>
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-300">
          {prettyJson(response.responseBody)}
        </pre>
      </div>
    </div>
  );
}

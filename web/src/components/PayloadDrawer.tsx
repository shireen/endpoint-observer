import type { MonitorResponse } from '../types';
import { formatLatency, formatTime } from '../lib/api';

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
      className="fixed inset-0 z-50 flex justify-end bg-ink/40"
      onClick={onClose}
      role="dialog"
      aria-label="Response detail"
    >
      <div
        className="h-full w-full max-w-lg overflow-y-auto border-l border-line bg-paper p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h3 className="font-display text-base font-bold text-ink">Check #{response.id}</h3>
            <p className="mt-0.5 text-xs text-muted">
              {formatTime(response.createdAt)} · {formatLatency(response.latencyMs)} · HTTP{' '}
              {response.statusCode ?? '—'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-muted transition-colors hover:bg-surface hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <h4 className="mb-1.5 font-display text-[11px] font-semibold uppercase tracking-widest text-gold-deep">
          Request payload (sent)
        </h4>
        <pre className="mb-5 overflow-x-auto rounded-lg border border-line bg-surface-2 p-3 text-xs text-ink/80">
          {prettyJson(response.requestPayload)}
        </pre>

        <h4 className="mb-1.5 font-display text-[11px] font-semibold uppercase tracking-widest text-gold-deep">
          Response body (received)
        </h4>
        <pre className="overflow-x-auto rounded-lg border border-line bg-surface-2 p-3 text-xs text-ink/80">
          {prettyJson(response.responseBody)}
        </pre>
      </div>
    </div>
  );
}

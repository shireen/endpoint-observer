import { useEffect, useRef } from 'react';
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
  const panelRef = useRef<HTMLDivElement>(null);

  // Modal dialog contract: move focus in on open, trap Tab inside, close on
  // Escape, and restore focus to the trigger on close. aria-modal tells
  // assistive tech the rest of the page is inert while the drawer is open.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      );
    (focusables()[0] ?? panel).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Response detail"
    >
      <div
        ref={panelRef}
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
        {response.error ? (
          <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-xs leading-relaxed text-danger">
            No response was received — {response.error}. The payload above was sent; nothing came
            back within the request budget.
          </div>
        ) : (
          <pre className="overflow-x-auto rounded-lg border border-line bg-surface-2 p-3 text-xs text-ink/80">
            {prettyJson(response.responseBody)}
          </pre>
        )}
      </div>
    </div>
  );
}

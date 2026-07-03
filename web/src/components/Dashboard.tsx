import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchResponses, fetchStats } from '../lib/api';
import type { MonitorResponse } from '../types';
import { StatsCards } from './StatsCards';
import { ResponsesTable } from './ResponsesTable';
import { CostPanel } from './CostPanel';

const PAGE_SIZE = 50;
/** "Load more" walks back at most this far — 288 rows at the 5-min cadence. */
const HISTORY_HOURS = 24;

export function Dashboard() {
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => fetchStats(24) });
  const responses = useQuery({ queryKey: ['responses'], queryFn: () => fetchResponses(PAGE_SIZE) });

  // The live head (newest rows, updated via SSE) lives in the query cache;
  // older pages fetched on demand are appended here. Older data never
  // changes, so it survives head refetches (e.g. the SSE-reconnect refetch).
  const [older, setOlder] = useState<MonitorResponse[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  const head = responses.data?.items;
  const combined = useMemo(() => {
    if (!head) return undefined;
    const seen = new Set(head.map((r) => r.id));
    return [...head, ...older.filter((r) => !seen.has(r.id))];
  }, [head, older]);

  async function loadMore() {
    const last = combined?.[combined.length - 1];
    if (!last || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchResponses(PAGE_SIZE, { before: last.id, hours: HISTORY_HOURS });
      setOlder((prev) => [...prev, ...page.items]);
      if (page.items.length < PAGE_SIZE) setExhausted(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const showLoadMore = !!combined && combined.length >= PAGE_SIZE && !exhausted;

  return (
    <div className="space-y-7">
      <StatsCards stats={stats.data} loading={stats.isLoading} />
      <section>
        <h2 className="mb-3 font-display text-xs font-semibold uppercase tracking-widest text-muted">
          Recent checks
        </h2>
        <ResponsesTable
          responses={combined}
          loading={responses.isLoading}
          error={responses.error?.message}
        />
        {showLoadMore && (
          <div className="mt-3 text-center">
            <button
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="rounded-lg border border-line bg-surface px-4 py-2 font-display text-xs font-semibold uppercase tracking-wide text-ink transition-colors hover:border-gold/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Load older checks'}
            </button>
          </div>
        )}
        {exhausted && (
          <p className="mt-3 text-center text-xs text-muted">
            Full 24-hour history loaded — older checks are queryable via the API and Ask AI.
          </p>
        )}
      </section>
      <CostPanel />
    </div>
  );
}

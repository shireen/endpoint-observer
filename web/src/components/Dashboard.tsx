import { useQuery } from '@tanstack/react-query';
import { fetchResponses, fetchStats } from '../lib/api';
import { StatsCards } from './StatsCards';
import { ResponsesTable } from './ResponsesTable';
import { CostPanel } from './CostPanel';

export function Dashboard() {
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => fetchStats(24) });
  const responses = useQuery({ queryKey: ['responses'], queryFn: () => fetchResponses(50) });

  return (
    <div className="space-y-7">
      <StatsCards stats={stats.data} loading={stats.isLoading} />
      <section>
        <h2 className="mb-3 font-display text-xs font-semibold uppercase tracking-widest text-muted">
          Recent checks
        </h2>
        <ResponsesTable
          responses={responses.data?.items}
          loading={responses.isLoading}
          error={responses.error?.message}
        />
      </section>
      <CostPanel />
    </div>
  );
}

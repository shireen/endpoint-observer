import { useQuery } from '@tanstack/react-query';
import { fetchIncidents } from '../lib/api';
import { formatTime } from '../lib/api';
import type { Incident } from '../types';
import { Markdown } from './Markdown';

function SeverityBadge({ severity }: { severity: Incident['severity'] }) {
  const style = severity === 'critical' ? 'bg-danger/10 text-danger' : 'bg-gold/20 text-gold-deep';
  return (
    <span
      className={`rounded-md px-2 py-0.5 font-display text-xs font-semibold uppercase tracking-wide ${style}`}
    >
      {severity}
    </span>
  );
}

function AnalysisBlock({ incident }: { incident: Incident }) {
  if (incident.analysisSource === 'pending') {
    return <p className="text-xs italic text-muted">Analysis in progress…</p>;
  }
  return (
    <div>
      <div className="text-ink/80">
        <Markdown>{incident.analysis ?? ''}</Markdown>
      </div>
      <p className="mt-3 font-display text-[10px] uppercase tracking-widest text-muted">
        {incident.analysisSource === 'llm' ? 'AI-generated analysis' : 'Automatic analysis'}
      </p>
    </div>
  );
}

export function IncidentsPanel() {
  const { data, isLoading, error } = useQuery({ queryKey: ['incidents'], queryFn: fetchIncidents });

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-2xl border border-line bg-surface" />;
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
        Failed to load incidents: {error.message}
      </div>
    );
  }
  if (!data || data.items.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-12 text-center">
        <p className="text-3xl">✅</p>
        <p className="mt-3 font-display text-sm font-medium text-ink">No incidents detected</p>
        <p className="mt-1 text-xs text-muted">
          An incident is created when a response takes more than 2x the 24-hour rolling average.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.items.map((incident) => (
        <article
          key={incident.id}
          className="rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-gold/50"
        >
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <SeverityBadge severity={incident.severity} />
            <span className="text-xs text-muted">{formatTime(incident.createdAt)}</span>
            <span className="text-xs text-muted/80">· {incident.endpoint}</span>
          </div>
          <p className="mb-3 text-sm font-medium text-ink">{incident.summary}</p>
          <AnalysisBlock incident={incident} />
        </article>
      ))}
    </div>
  );
}

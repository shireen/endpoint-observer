import { useQuery } from '@tanstack/react-query';
import { fetchIncidents } from '../lib/api';
import { formatTime } from '../lib/api';
import type { Incident } from '../types';

function SeverityBadge({ severity }: { severity: Incident['severity'] }) {
  const style =
    severity === 'critical' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${style}`}>
      {severity}
    </span>
  );
}

function AnalysisBlock({ incident }: { incident: Incident }) {
  if (incident.analysisSource === 'pending') {
    return <p className="text-xs italic text-slate-500">Analysis in progress…</p>;
  }
  return (
    <div>
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-300">
        {incident.analysis}
      </pre>
      <p className="mt-2 text-[10px] uppercase tracking-wider text-slate-500">
        {incident.analysisSource === 'llm' ? 'AI-generated analysis' : 'Automatic analysis'}
      </p>
    </div>
  );
}

export function IncidentsPanel() {
  const { data, isLoading, error } = useQuery({ queryKey: ['incidents'], queryFn: fetchIncidents });

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-xl bg-slate-900/60" />;
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-300">
        Failed to load incidents: {error.message}
      </div>
    );
  }
  if (!data || data.items.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-10 text-center">
        <p className="text-2xl">✅</p>
        <p className="mt-2 text-sm text-slate-300">No incidents detected</p>
        <p className="mt-1 text-xs text-slate-500">
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
          className="rounded-xl border border-slate-800 bg-slate-900/40 p-5"
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <SeverityBadge severity={incident.severity} />
            <span className="text-xs text-slate-400">{formatTime(incident.createdAt)}</span>
            <span className="text-xs text-slate-500">· {incident.endpoint}</span>
          </div>
          <p className="mb-3 text-sm font-medium text-slate-200">{incident.summary}</p>
          <AnalysisBlock incident={incident} />
        </article>
      ))}
    </div>
  );
}

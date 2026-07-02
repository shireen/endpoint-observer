import type { ResponsesRepo } from '../db/responses.js';
import type { IncidentsRepo, IncidentRecord } from '../db/incidents.js';
import { formatLatency } from '../format.js';

/**
 * Deterministic (zero-cost) degradation paths for when the LLM is
 * unavailable: no API key configured, hourly quota exhausted, or an API
 * error. The dashboard stays useful either way.
 */

export function fallbackChatAnswer(
  responses: ResponsesRepo,
  incidents: IncidentsRepo,
  reason: { quotaExceeded?: boolean; error?: boolean } = {},
): string {
  const stats = responses.stats(24);
  const recentIncidents = incidents.list({ limit: 3, hours: 24 });

  const prefix = reason.error
    ? 'The AI assistant hit an error, so here is an automatic summary instead.'
    : reason.quotaExceeded
      ? 'The hourly AI budget is used up (it resets within the hour), so here is an automatic summary instead.'
      : 'No AI API key is configured, so here is an automatic summary instead.';

  const lines = [
    prefix,
    '',
    `**Last 24 hours:** ${stats.count} checks — ${stats.okCount} succeeded, ${stats.failedCount} failed.`,
  ];
  if (stats.avgLatencyMs !== null) {
    // avg being non-null means at least one row exists, so min/max/p95 do too.
    lines.push(
      `**Latency:** avg ${formatLatency(stats.avgLatencyMs)}, min ${formatLatency(stats.minLatencyMs!)}, max ${formatLatency(stats.maxLatencyMs!)}, p95 ${formatLatency(stats.p95LatencyMs!)}.`,
    );
  }
  lines.push(
    recentIncidents.length === 0
      ? '**Incidents:** none detected in the last 24 hours.'
      : `**Incidents:** ${recentIncidents.length} in the last 24 hours — latest: ${recentIncidents[0]!.summary}`,
  );
  return lines.join('\n');
}

export function fallbackIncidentAnalysis(incident: IncidentRecord): string {
  const ratio = (incident.latencyMs / incident.baselineMs).toFixed(1);
  // Mirrors the LLM report structure: evidence (facts only), hypotheses
  // (labeled as such), and investigation steps appropriate to a single
  // synthetic probe — no operational advice that assumes real traffic.
  return [
    '## Observed evidence',
    `- Response time ${incident.latencyMs}ms was ${ratio}x the 24h rolling average of ${Math.round(incident.baselineMs)}ms`,
    `- Endpoint: ${incident.endpoint} · severity: ${incident.severity}`,
    '',
    '## Hypotheses',
    '- The target service may have been transiently slow or degraded',
    '- A network path change between this monitor and the endpoint could have added latency',
    '',
    '## Recommended investigation',
    '- Watch the next few scheduled checks: an isolated spike usually self-resolves',
    "- If it repeats, compare timestamps against the target service's status page",
    '',
    '_Automatic report (AI analysis unavailable at detection time)._',
  ].join('\n');
}

/**
 * Formats a latency for human-facing text, adaptively scaling the unit
 * (ms stays the canonical stored/queried unit; this only affects display).
 * Mirrors the frontend helper in web/src/lib/api.ts so latency reads
 * consistently across the dashboard and the server-generated summaries.
 */
export function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
  return `${(ms / 60_000).toFixed(1)}min`;
}

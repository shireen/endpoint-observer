import type { ResponseRecord } from '../db/responses.js';

/**
 * Smart Response Analysis (Option B requirement block 3), rules-first:
 * deterministic extraction/categorization/pattern detection over stored
 * httpbin response bodies, exposed to the chat as a tool so the LLM's only
 * job is turning the aggregate into a natural-language summary. This keeps
 * the analysis free (no tokens spent computing it) and the tool output
 * compact and bounded (no raw bodies ever enter the prompt).
 *
 * httpbin echoes the JSON we POST back under the body's `json` field, so the
 * echoed payload is what gets extracted and categorized.
 */

export interface PayloadPatternReport {
  analyzed: number;
  succeeded: number;
  failed: number;
  unparseableBodies: number;
  /** Distribution of the synthetic marketplace event types we sent. */
  events: Record<string, number>;
  /** Listing attributes extracted from echoed payloads. */
  categories: Record<string, number>;
  regions: Record<string, number>;
  tags: Record<string, number>;
  /** Response size buckets: small <1KB, large >10KB, medium between. */
  sizeBuckets: { small: number; medium: number; large: number };
  /** Payload shape variants, keyed by sorted top-level keys ("actor+event+…"). */
  shapeVariants: Record<string, number>;
  /** A few row ids the model can cite or drill into. */
  exampleIds: { commonShape: number[]; failures: number[] };
}

function bump(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

/** Extracts the echoed payload from a stored httpbin response body, if any. */
function echoedPayload(body: string | null): Record<string, unknown> | null {
  if (body === null) return null;
  try {
    const parsed = JSON.parse(body) as { json?: unknown };
    return parsed.json !== null && typeof parsed.json === 'object'
      ? (parsed.json as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function analyzePayloadPatterns(rows: ResponseRecord[]): PayloadPatternReport {
  const report: PayloadPatternReport = {
    analyzed: rows.length,
    succeeded: 0,
    failed: 0,
    unparseableBodies: 0,
    events: {},
    categories: {},
    regions: {},
    tags: {},
    sizeBuckets: { small: 0, medium: 0, large: 0 },
    shapeVariants: {},
    exampleIds: { commonShape: [], failures: [] },
  };
  const idsByShape = new Map<string, number[]>();

  for (const row of rows) {
    if (!row.ok) {
      report.failed++;
      if (report.exampleIds.failures.length < 3) report.exampleIds.failures.push(row.id);
      continue;
    }
    report.succeeded++;

    if (row.responseSizeBytes !== null) {
      if (row.responseSizeBytes < 1024) report.sizeBuckets.small++;
      else if (row.responseSizeBytes > 10_240) report.sizeBuckets.large++;
      else report.sizeBuckets.medium++;
    }

    const payload = echoedPayload(row.responseBody);
    if (payload === null) {
      report.unparseableBodies++;
      continue;
    }

    const shape = Object.keys(payload).sort().join('+');
    bump(report.shapeVariants, shape);
    const ids = idsByShape.get(shape) ?? [];
    if (ids.length < 3) ids.push(row.id);
    idsByShape.set(shape, ids);

    if (typeof payload.event === 'string') bump(report.events, payload.event);
    const listing = payload.listing as { category?: unknown; region?: unknown } | undefined;
    if (listing && typeof listing === 'object') {
      if (typeof listing.category === 'string') bump(report.categories, listing.category);
      if (typeof listing.region === 'string') bump(report.regions, listing.region);
    }
    if (Array.isArray(payload.tags)) {
      for (const tag of payload.tags) if (typeof tag === 'string') bump(report.tags, tag);
    }
  }

  const commonShape = Object.entries(report.shapeVariants).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (commonShape) report.exampleIds.commonShape = idsByShape.get(commonShape) ?? [];

  return report;
}

import { describe, expect, it } from 'vitest';
import { analyzePayloadPatterns } from '../src/llm/payloadAnalysis.js';
import type { ResponseRecord } from '../src/db/responses.js';

let nextId = 1;

/** Builds a stored row whose body echoes `payload` the way httpbin does. */
function row(
  payload: Record<string, unknown> | null,
  overrides: Partial<ResponseRecord> = {},
): ResponseRecord {
  return {
    id: nextId++,
    createdAt: Date.now(),
    url: 'https://httpbin.org/anything',
    requestPayload: JSON.stringify(payload ?? {}),
    statusCode: 200,
    latencyMs: 150,
    responseBody: payload === null ? 'not json at all' : JSON.stringify({ json: payload }),
    responseSizeBytes: 500,
    ok: true,
    error: null,
    ...overrides,
  };
}

describe('analyzePayloadPatterns (Smart Response Analysis, rules-first)', () => {
  it('extracts and categorizes echoed payload fields', () => {
    const report = analyzePayloadPatterns([
      row({ event: 'search', actor: { id: 'u1' } }),
      row({ event: 'search', actor: { id: 'u2' } }),
      row({
        event: 'offer.made',
        actor: { id: 'u3' },
        listing: { category: 'laundromat', region: 'austin-tx' },
        tags: ['laundromat', 'hvac'],
      }),
    ]);

    expect(report.analyzed).toBe(3);
    expect(report.succeeded).toBe(3);
    expect(report.events).toEqual({ search: 2, 'offer.made': 1 });
    expect(report.categories).toEqual({ laundromat: 1 });
    expect(report.regions).toEqual({ 'austin-tx': 1 });
    expect(report.tags).toEqual({ laundromat: 1, hvac: 1 });
  });

  it('detects payload shape variants and cites example rows', () => {
    const report = analyzePayloadPatterns([
      row({ event: 'search', actor: {} }),
      row({ event: 'search', actor: {} }),
      row({ event: 'search', actor: {}, listing: {}, tags: [] }),
    ]);

    expect(report.shapeVariants).toEqual({ 'actor+event': 2, 'actor+event+listing+tags': 1 });
    expect(report.exampleIds.commonShape).toHaveLength(2);
  });

  it('buckets response sizes (small <1KB, large >10KB)', () => {
    const report = analyzePayloadPatterns([
      row({ event: 'a' }, { responseSizeBytes: 500 }),
      row({ event: 'b' }, { responseSizeBytes: 5_000 }),
      row({ event: 'c' }, { responseSizeBytes: 50_000 }),
    ]);

    expect(report.sizeBuckets).toEqual({ small: 1, medium: 1, large: 1 });
  });

  it('separates failures and tolerates unparseable bodies', () => {
    const report = analyzePayloadPatterns([
      row({ event: 'ok' }),
      row(null), // body isn't JSON
      row({ event: 'never-sent' }, { ok: false, statusCode: null, error: 'timeout' }),
    ]);

    expect(report.succeeded).toBe(2);
    expect(report.failed).toBe(1);
    expect(report.unparseableBodies).toBe(1);
    expect(report.exampleIds.failures).toHaveLength(1);
    expect(report.events).toEqual({ ok: 1 }); // failures/unparseable never counted
  });
});

import { describe, expect, it, beforeEach } from 'vitest';
import { createToolExecutor } from '../src/llm/tools.js';
import { repos, sampleResponse, testDb } from './helpers.js';

describe('chat tool executor', () => {
  let r: ReturnType<typeof repos>;
  let execute: ReturnType<typeof createToolExecutor>;

  beforeEach(() => {
    r = repos(testDb());
    execute = createToolExecutor(r.responses, r.incidents);
  });

  describe('get_responses_in_range', () => {
    const T0 = Date.parse('2026-07-02T14:00:00-05:00');

    function seedAround2pm() {
      // Central Time: 13:50 normal · 14:00 spike · 14:10 normal · 15:30 outside
      r.responses.insert(sampleResponse({ createdAt: T0 - 10 * 60_000, latencyMs: 150 }));
      r.responses.insert(sampleResponse({ createdAt: T0, latencyMs: 9_000 }));
      r.responses.insert(sampleResponse({ createdAt: T0 + 10 * 60_000, latencyMs: 160 }));
      r.responses.insert(sampleResponse({ createdAt: T0 + 90 * 60_000, latencyMs: 150 }));
    }

    it('returns the spike and its surroundings for a window around a timestamp', () => {
      seedAround2pm();
      const result = JSON.parse(
        execute('get_responses_in_range', {
          start: '2026-07-02T13:30:00-05:00',
          end: '2026-07-02T14:30:00-05:00',
        }),
      );

      expect(result.summary.count).toBe(3); // the 15:30 row is excluded
      expect(result.summary.max_latency_ms).toBe(9_000);
      expect(result.responses).toHaveLength(3);
      expect(result.range.start_central).toContain('1:30:00 PM CDT');
      expect(result.range.start_utc).toBe('2026-07-02T18:30:00.000Z');
      expect(result.slowest_responses[0].latency_ms).toBe(9_000);
      expect(result.slowest_responses[0].at_central).toContain('2:00:00 PM CDT');
      expect(result.slowest_responses[0].at_utc).toBe('2026-07-02T19:00:00.000Z');
    });

    it('rejects invalid or unordered timestamps with a readable error', () => {
      expect(
        JSON.parse(execute('get_responses_in_range', { start: 'lunchtime', end: 'now' })),
      ).toHaveProperty('error');
      expect(
        JSON.parse(
          execute('get_responses_in_range', {
            start: '2026-07-02T15:00:00Z',
            end: '2026-07-02T14:00:00Z',
          }),
        ).error,
      ).toContain('after start');
    });

    it('rejects ranges wider than 7 days', () => {
      const result = JSON.parse(
        execute('get_responses_in_range', {
          start: '2026-06-01T00:00:00Z',
          end: '2026-07-01T00:00:00Z',
        }),
      );
      expect(result.error).toContain('7 days');
    });

    it('rejects ambiguous timestamps without a timezone', () => {
      const result = JSON.parse(
        execute('get_responses_in_range', {
          start: '2026-07-02T13:30:00',
          end: '2026-07-02T14:30:00',
        }),
      );
      expect(result.error).toContain('explicit Z or UTC offset');
    });
  });

  it('analyze_payload_patterns aggregates stored payloads', () => {
    r.responses.insert(
      sampleResponse({
        responseBody: JSON.stringify({ json: { event: 'search', actor: {} } }),
      }),
    );
    const result = JSON.parse(execute('analyze_payload_patterns', {}));

    expect(result.analyzed).toBe(1);
    expect(result.events).toEqual({ search: 1 });
    expect(result.shapeVariants).toEqual({ 'actor+event': 1 });
  });
});

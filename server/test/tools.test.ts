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
    const T0 = Date.parse('2026-07-02T14:00:00Z');

    function seedAround2pm() {
      // 13:50 normal · 14:00 spike · 14:10 normal · 15:30 outside the window
      r.responses.insert(sampleResponse({ createdAt: T0 - 10 * 60_000, latencyMs: 150 }));
      r.responses.insert(sampleResponse({ createdAt: T0, latencyMs: 9_000 }));
      r.responses.insert(sampleResponse({ createdAt: T0 + 10 * 60_000, latencyMs: 160 }));
      r.responses.insert(sampleResponse({ createdAt: T0 + 90 * 60_000, latencyMs: 150 }));
    }

    it('returns the spike and its surroundings for a window around a timestamp', () => {
      seedAround2pm();
      const result = JSON.parse(
        execute('get_responses_in_range', {
          start: '2026-07-02T13:30:00Z',
          end: '2026-07-02T14:30:00Z',
        }),
      );

      expect(result.summary.count).toBe(3); // the 15:30 row is excluded
      expect(result.summary.max_latency_ms).toBe(9_000);
      expect(result.responses).toHaveLength(3);
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

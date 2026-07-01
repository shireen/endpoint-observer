import { describe, expect, it, beforeEach } from 'vitest';
import { runPing, detectIncident, MIN_BASELINE_SAMPLES } from '../src/monitor/service.js';
import { FakeHub, asHub, okFetch, repos, sampleResponse, silentLogger, testDb } from './helpers.js';

describe('monitor pipeline (core component)', () => {
  let db: ReturnType<typeof testDb>;
  let r: ReturnType<typeof repos>;
  let hub: FakeHub;

  beforeEach(() => {
    db = testDb();
    r = repos(db);
    hub = new FakeHub();
  });

  function deps(fetchFn: typeof fetch) {
    return {
      pingUrl: 'https://httpbin.org/anything',
      pingTimeoutMs: 1000,
      responses: r.responses,
      incidents: r.incidents,
      hub: asHub(hub),
      logger: silentLogger,
      fetchFn,
    };
  }

  it('stores the result and broadcasts it to connected clients', async () => {
    const record = await runPing(deps(okFetch()));

    expect(r.responses.getById(record.id)).toEqual(record);
    expect(hub.events).toEqual([{ event: 'response', data: record }]);
  });

  it('stores failures as data and still broadcasts', async () => {
    const failingFetch = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;

    const record = await runPing(deps(failingFetch));
    expect(record.ok).toBe(false);
    expect(r.responses.getById(record.id)?.error).toBe('fetch failed');
    expect(hub.events[0]?.event).toBe('response');
  });

  describe('incident detection (latency > 2x rolling average)', () => {
    function seedBaseline(count: number, latencyMs = 100) {
      for (let i = 0; i < count; i++) {
        r.responses.insert(sampleResponse({ latencyMs }));
      }
    }

    it('creates a warning incident when latency exceeds 2x the baseline', () => {
      seedBaseline(MIN_BASELINE_SAMPLES, 100);
      const slow = r.responses.insert(sampleResponse({ latencyMs: 250 }));

      const incident = detectIncident({ responses: r.responses, incidents: r.incidents }, slow);
      expect(incident).not.toBeNull();
      expect(incident?.severity).toBe('warning');
      expect(incident?.responseId).toBe(slow.id);
      expect(incident?.baselineMs).toBeCloseTo(100);
      expect(r.incidents.getById(incident!.id)?.analysisSource).toBe('pending');
    });

    it('escalates to critical above 4x the baseline', () => {
      seedBaseline(MIN_BASELINE_SAMPLES, 100);
      const verySlow = r.responses.insert(sampleResponse({ latencyMs: 450 }));

      const incident = detectIncident({ responses: r.responses, incidents: r.incidents }, verySlow);
      expect(incident?.severity).toBe('critical');
    });

    it('does not alert at or below the 2x threshold', () => {
      seedBaseline(MIN_BASELINE_SAMPLES, 100);
      const normal = r.responses.insert(sampleResponse({ latencyMs: 200 }));

      expect(detectIncident({ responses: r.responses, incidents: r.incidents }, normal)).toBeNull();
    });

    it('does not alert before a minimum baseline exists', () => {
      seedBaseline(MIN_BASELINE_SAMPLES - 2, 100);
      const slow = r.responses.insert(sampleResponse({ latencyMs: 10_000 }));

      expect(detectIncident({ responses: r.responses, incidents: r.incidents }, slow)).toBeNull();
    });

    it('does not alert on failed responses', () => {
      seedBaseline(MIN_BASELINE_SAMPLES, 100);
      const failure = r.responses.insert(
        sampleResponse({ ok: false, statusCode: null, latencyMs: 10_000, error: 'timeout' }),
      );

      expect(
        detectIncident({ responses: r.responses, incidents: r.incidents }, failure),
      ).toBeNull();
    });

    it('excludes failed pings from the baseline average', () => {
      seedBaseline(MIN_BASELINE_SAMPLES, 100);
      // A huge failed latency (e.g. timeout) must not inflate the baseline.
      r.responses.insert(sampleResponse({ ok: false, latencyMs: 60_000, error: 'timeout' }));
      const slow = r.responses.insert(sampleResponse({ latencyMs: 250 }));

      const incident = detectIncident({ responses: r.responses, incidents: r.incidents }, slow);
      expect(incident?.baselineMs).toBeCloseTo(100);
    });

    it('broadcasts the incident and invokes the onIncident hook via runPing', async () => {
      // Baseline of fast pings, then a ping whose fetch is artificially slow.
      seedBaseline(MIN_BASELINE_SAMPLES, 1);
      const slowFetch = (async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch;

      let hooked: unknown = null;
      await runPing({ ...deps(slowFetch), onIncident: (i) => (hooked = i) });

      const eventNames = hub.events.map((e) => e.event);
      expect(eventNames).toEqual(['response', 'incident']);
      expect(hooked).not.toBeNull();
    });
  });
});

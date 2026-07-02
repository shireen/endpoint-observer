import { describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { InsightsService } from '../src/llm/insights.js';
import { repos, sampleResponse, silentLogger, testDb } from './helpers.js';

function makeMessage(overrides: Partial<Anthropic.Message>): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-4-5',
    content: [],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 } as Anthropic.Usage,
    ...overrides,
  } as Anthropic.Message;
}

/** Fake Anthropic client returning a scripted sequence of messages. */
function fakeClient(script: Anthropic.Message[]) {
  let call = 0;
  const create = vi.fn(
    async (_params: Anthropic.MessageCreateParams) => script[Math.min(call++, script.length - 1)]!,
  );
  const stream = vi.fn((_params: Anthropic.MessageCreateParams) => {
    const message = script[Math.min(call++, script.length - 1)]!;
    return {
      on: vi.fn().mockReturnThis(),
      finalMessage: async () => message,
    };
  });
  const countTokens = vi.fn(async () => ({ input_tokens: 500 }));
  return {
    client: { messages: { create, stream, countTokens } } as unknown as Anthropic,
    create,
    stream,
    countTokens,
  };
}

const TEST_MONITOR = {
  url: 'https://httpbin.org/anything',
  cron: '*/5 * * * *',
  timeoutMs: 10_000,
};

function service(client: Anthropic | undefined, callsPerHour = 20) {
  const r = repos(testDb());
  const insights = new InsightsService({
    apiKey: client ? 'test-key' : undefined,
    callsPerHour,
    monitor: TEST_MONITOR,
    responses: r.responses,
    incidents: r.incidents,
    usage: r.llmUsage,
    logger: silentLogger,
    client,
  });
  return { insights, ...r };
}

describe('InsightsService.chat', () => {
  it('serves a deterministic fallback when no API key is configured', async () => {
    const { insights, responses } = service(undefined);
    responses.insert(sampleResponse({ latencyMs: 123 }));

    const result = await insights.chat({ message: 'how are things?' });
    expect(result.source).toBe('fallback');
    expect(result.text).toContain('1 checks');
  });

  it('runs the tool-use loop and returns the final text', async () => {
    const toolTurn = makeMessage({
      stop_reason: 'tool_use',
      content: [
        { type: 'tool_use', id: 'toolu_1', name: 'get_stats', input: { hours: 24 } },
      ] as Anthropic.ContentBlock[],
    });
    const finalTurn = makeMessage({
      content: [
        { type: 'text', text: 'All good: 5 checks passed.', citations: null },
      ] as Anthropic.ContentBlock[],
    });
    const { client, stream, countTokens } = fakeClient([toolTurn, finalTurn]);
    const { insights, llmUsage } = service(client);

    const result = await insights.chat({ message: 'summarize the last day' });

    expect(result.source).toBe('llm');
    expect(result.text).toBe('All good: 5 checks passed.');
    // Token counting runs before EVERY Messages request, not once per chat.
    expect(countTokens).toHaveBeenCalledTimes(2);
    expect(stream).toHaveBeenCalledTimes(2);
    // The tool result was fed back in the second request.
    const secondCall = stream.mock.calls[1]![0];
    const lastMessage = secondCall.messages[secondCall.messages.length - 1]!;
    expect(JSON.stringify(lastMessage.content)).toContain('tool_result');
    // Both API calls were recorded for cost tracking.
    expect(llmUsage.summary().totalCalls).toBe(2);
  });

  it('serves repeated questions from cache without an API call', async () => {
    const answer = makeMessage({
      content: [
        { type: 'text', text: 'cached answer', citations: null },
      ] as Anthropic.ContentBlock[],
    });
    const { client, stream } = fakeClient([answer]);
    const { insights } = service(client);

    const first = await insights.chat({ message: 'What is the p95?' });
    const second = await insights.chat({ message: '  what is the P95? ' });

    expect(first.source).toBe('llm');
    expect(second.source).toBe('cache');
    expect(second.text).toBe('cached answer');
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it('invalidates cached answers when new monitoring data arrives', async () => {
    const answer = makeMessage({
      content: [
        { type: 'text', text: 'stale-able answer', citations: null },
      ] as Anthropic.ContentBlock[],
    });
    const { client, stream } = fakeClient([answer]);
    const { insights, responses } = service(client);
    responses.insert(sampleResponse());

    await insights.chat({ message: 'how are things?' });
    responses.insert(sampleResponse()); // a new check lands — data changed

    const second = await insights.chat({ message: 'how are things?' });
    expect(second.source).toBe('llm'); // not served from cache
    expect(stream).toHaveBeenCalledTimes(2);
  });

  it('falls back gracefully once the hourly quota is exhausted', async () => {
    const answer = makeMessage({
      content: [{ type: 'text', text: 'llm answer', citations: null }] as Anthropic.ContentBlock[],
    });
    const { client } = fakeClient([answer]);
    const { insights } = service(client, 1);

    const first = await insights.chat({ message: 'question one' });
    const second = await insights.chat({ message: 'question two' });

    expect(first.source).toBe('llm');
    expect(second.source).toBe('fallback');
    expect(second.text).toContain('hourly AI budget');
  });

  it('enforces the cap under concurrent requests (reservation is atomic)', async () => {
    // 25 chats race a cap of 20. Before the reserve→settle fix, every request
    // passed canCall() before any usage was recorded, so all 25 would spend.
    const answer = makeMessage({
      content: [{ type: 'text', text: 'answer', citations: null }] as Anthropic.ContentBlock[],
    });
    let call = 0;
    const client = {
      messages: {
        countTokens: async () => ({ input_tokens: 100 }),
        create: async () => answer,
        stream: () => ({
          on: vi.fn().mockReturnThis(),
          finalMessage: () =>
            new Promise((resolve) => setTimeout(() => resolve({ ...answer, id: `msg_${call++}` }))),
        }),
      },
    } as unknown as Anthropic;
    const { insights, llmUsage } = service(client, 20);

    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) => insights.chat({ message: `question number ${i}` })),
    );

    expect(llmUsage.summary().totalCalls).toBe(20); // never overshoots the cap
    expect(results.filter((r) => r.source === 'llm')).toHaveLength(20);
    const fallbacks = results.filter((r) => r.source === 'fallback');
    expect(fallbacks).toHaveLength(5);
    expect(fallbacks[0]!.text).toContain('hourly AI budget');
  });

  it('falls back when the API errors instead of throwing', async () => {
    const client = {
      messages: {
        countTokens: async () => ({ input_tokens: 100 }),
        stream: () => {
          throw new Error('boom');
        },
        create: async () => {
          throw new Error('boom');
        },
      },
    } as unknown as Anthropic;
    const { insights } = service(client);

    const result = await insights.chat({ message: 'anything' });
    expect(result.source).toBe('fallback');
  });
});

describe('InsightsService.analyzeIncident', () => {
  function incidentFixture(r: ReturnType<typeof repos>) {
    const response = r.responses.insert(sampleResponse({ latencyMs: 900 }));
    return r.incidents.create({
      createdAt: Date.now(),
      responseId: response.id,
      severity: 'warning',
      endpoint: 'https://httpbin.org/anything',
      latencyMs: 900,
      baselineMs: 300,
      summary: 'Response time 900ms was 3.0x the 24h rolling average of 300ms',
    });
  }

  it('stores an LLM-generated analysis from a grounded, evidence-first prompt', async () => {
    const report = makeMessage({
      content: [
        { type: 'text', text: '## Observed evidence\n- x', citations: null },
      ] as Anthropic.ContentBlock[],
    });
    const { client, create, countTokens } = fakeClient([report]);
    const r = repos(testDb());
    const insights = new InsightsService({
      apiKey: 'test-key',
      callsPerHour: 20,
      monitor: TEST_MONITOR,
      responses: r.responses,
      incidents: r.incidents,
      usage: r.llmUsage,
      logger: silentLogger,
      client,
    });
    const incident = incidentFixture(r);

    await insights.analyzeIncident(incident);

    const updated = r.incidents.getById(incident.id)!;
    expect(updated.analysisSource).toBe('llm');
    expect(updated.analysis).toContain('Observed evidence');

    // Token counting runs before the incident call too.
    expect(countTokens).toHaveBeenCalledOnce();

    // Grounding guards: the prompt states what the system is (one synthetic
    // probe), demands evidence/hypothesis separation, forbids ops advice that
    // assumes production traffic, and supplies the real monitor config so the
    // model never guesses cadence or timeout.
    const params = create.mock.calls[0]![0];
    const system = String(params.system);
    expect(system).toContain('## Observed evidence');
    expect(system).toContain('## Hypotheses');
    expect(system).toContain('## Recommended investigation');
    expect(system).toContain('no circuit breakers, caching, retries, scaling');
    const evidence = JSON.parse(params.messages[0]!.content as string);
    expect(evidence.monitor.schedule_cron).toBe('*/5 * * * *');
    expect(evidence.monitor.request_timeout_ms).toBe(10_000);
    expect(evidence.checks_before_incident).toBeDefined();
  });

  it('stores a deterministic analysis when the LLM is unavailable', async () => {
    const { insights, ...r } = service(undefined);
    const incident = incidentFixture(r as unknown as ReturnType<typeof repos>);

    await insights.analyzeIncident(incident);

    const updated = r.incidents.getById(incident.id)!;
    expect(updated.analysisSource).toBe('fallback');
    expect(updated.analysis).toContain('3.0x the 24h rolling average');
    // The fallback follows the same grounded structure as the LLM report.
    expect(updated.analysis).toContain('## Observed evidence');
    expect(updated.analysis).toContain('## Hypotheses');
    expect(updated.analysis).toContain('## Recommended investigation');
  });
});

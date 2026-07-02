import { describe, expect, it, vi, afterEach } from 'vitest';
import { CostController, ResponseCache } from '../src/llm/costControl.js';
import { estimateCostUsd } from '../src/llm/pricing.js';
import { repos, testDb } from './helpers.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('CostController', () => {
  function controller(limit: number) {
    const { llmUsage } = repos(testDb());
    return { costs: new CostController(llmUsage, limit), llmUsage };
  }

  it('hands out reservations until the hourly limit, then refuses', () => {
    const { costs } = controller(3);
    expect(costs.canCall()).toBe(true);

    const ids = [1, 2, 3].map(() => costs.tryReserve('chat', 'claude-haiku-4-5'));
    expect(ids.every((id) => typeof id === 'number')).toBe(true);

    expect(costs.tryReserve('chat', 'claude-haiku-4-5')).toBeNull();
    expect(costs.canCall()).toBe(false);
    expect(costs.remainingCalls()).toBe(0);
  });

  it('counts unsettled reservations toward the budget (reserve happens before the API call)', () => {
    const { costs, llmUsage } = controller(2);
    costs.tryReserve('chat', 'claude-haiku-4-5'); // never settled — e.g. call in flight or failed
    expect(costs.remainingCalls()).toBe(1);
    expect(llmUsage.summary().totalCalls).toBe(1);
  });

  it('only counts calls within the rolling hour', () => {
    const { costs, llmUsage } = controller(2);
    // Two calls from >1 hour ago.
    llmUsage.record({
      createdAt: Date.now() - 2 * 3_600_000,
      kind: 'chat',
      model: 'claude-haiku-4-5',
      inputTokens: 1,
      outputTokens: 1,
      estimatedCostUsd: 0,
    });
    llmUsage.record({
      createdAt: Date.now() - 61 * 60_000,
      kind: 'incident',
      model: 'claude-haiku-4-5',
      inputTokens: 1,
      outputTokens: 1,
      estimatedCostUsd: 0,
    });

    expect(costs.remainingCalls()).toBe(2);
  });

  it('settles a reservation with real tokens and a cost estimate', () => {
    const { costs, llmUsage } = controller(5);
    const id = costs.tryReserve('chat', 'claude-haiku-4-5')!;
    expect(llmUsage.summary().totalEstimatedCostUsd).toBe(0); // placeholder until settled

    costs.settle(id, 'claude-haiku-4-5', 1_000_000, 1_000_000);

    const summary = llmUsage.summary();
    expect(summary.totalCalls).toBe(1);
    expect(summary.totalInputTokens).toBe(1_000_000);
    expect(summary.totalEstimatedCostUsd).toBeCloseTo(6.0); // $1 in + $5 out per MTok
  });
});

describe('estimateCostUsd', () => {
  it('prices haiku correctly', () => {
    expect(estimateCostUsd('claude-haiku-4-5', 2_000_000, 400_000)).toBeCloseTo(2 + 2);
  });

  it('assumes the most expensive tier for unknown models', () => {
    expect(estimateCostUsd('mystery-model', 1_000_000, 0)).toBeCloseTo(5.0);
  });
});

describe('ResponseCache', () => {
  it('normalizes whitespace and casing', () => {
    const cache = new ResponseCache();
    cache.set('What were the   SLOWEST responses today?', 'answer');
    expect(cache.get('what were the slowest responses today?')).toBe('answer');
  });

  it('expires entries after the TTL', () => {
    vi.useFakeTimers();
    const cache = new ResponseCache(60_000);
    cache.set('q', 'a');
    expect(cache.get('q')).toBe('a');
    vi.advanceTimersByTime(61_000);
    expect(cache.get('q')).toBeUndefined();
  });

  it('evicts the oldest entry when full', () => {
    const cache = new ResponseCache(60_000, 2);
    cache.set('one', '1');
    cache.set('two', '2');
    cache.set('three', '3');
    expect(cache.get('one')).toBeUndefined();
    expect(cache.get('two')).toBe('2');
    expect(cache.get('three')).toBe('3');
  });
});

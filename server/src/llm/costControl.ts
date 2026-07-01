import type { LlmUsageRepo } from '../db/llmUsage.js';
import { estimateCostUsd } from './pricing.js';

/**
 * Cost-control layer for all LLM usage (assignment: "Cost Optimization —
 * Critical!").
 *
 * - Rate limit: hard cap of N calls per rolling hour, backed by the llm_usage
 *   table so it survives restarts. One "call" = one Messages API request
 *   (token-counting requests are free and don't count).
 * - Cache: normalized-question response cache with TTL, so repeated questions
 *   cost zero.
 * - Usage tracking: every call records tokens + estimated cost for the
 *   dashboard cost panel.
 */
export class CostController {
  constructor(
    private usage: LlmUsageRepo,
    private callsPerHour: number,
  ) {}

  canCall(): boolean {
    return this.usage.callsSince(Date.now() - 3_600_000) < this.callsPerHour;
  }

  remainingCalls(): number {
    return Math.max(0, this.callsPerHour - this.usage.callsSince(Date.now() - 3_600_000));
  }

  record(
    kind: 'chat' | 'incident',
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): void {
    this.usage.record({
      createdAt: Date.now(),
      kind,
      model,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCostUsd(model, inputTokens, outputTokens),
    });
  }
}

interface CacheEntry {
  value: string;
  expiresAt: number;
}

/** Small in-memory TTL cache for chat answers, keyed by normalized question. */
export class ResponseCache {
  private entries = new Map<string, CacheEntry>();

  constructor(
    private ttlMs = 10 * 60_000,
    private maxEntries = 200,
  ) {}

  static normalize(question: string): string {
    return question.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  get(question: string): string | undefined {
    const key = ResponseCache.normalize(question);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(question: string, value: string): void {
    if (this.entries.size >= this.maxEntries) {
      // Evict the oldest entry (Map preserves insertion order).
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(ResponseCache.normalize(question), {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }
}

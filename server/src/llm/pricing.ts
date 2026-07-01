/**
 * Model pricing (USD per million tokens), current as of mid-2026.
 *
 * Default model is Claude Haiku 4.5: the chat + incident-report workload here
 * is simple tool-grounded summarization, and cost consciousness is an explicit
 * requirement — at $1/$5 per MTok it is ~10x cheaper than Opus-tier models
 * with more than enough capability for this task. Override with LLM_MODEL.
 */

export const DEFAULT_MODEL = 'claude-haiku-4-5';

interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

const PRICING: Record<string, ModelPricing> = {
  'claude-haiku-4-5': { inputPerMTok: 1.0, outputPerMTok: 5.0 },
  'claude-sonnet-5': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  'claude-opus-4-8': { inputPerMTok: 5.0, outputPerMTok: 25.0 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  // Unknown model: assume the most expensive tier so we over- rather than under-report.
  const pricing = PRICING[model] ?? PRICING['claude-opus-4-8']!;
  return (
    (inputTokens / 1_000_000) * pricing.inputPerMTok +
    (outputTokens / 1_000_000) * pricing.outputPerMTok
  );
}

export function pricingFor(model: string): ModelPricing | undefined {
  return PRICING[model];
}

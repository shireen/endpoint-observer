import type { Db } from './index.js';

export interface UsageRecord {
  id: number;
  createdAt: number;
  kind: 'chat' | 'incident';
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface UsageSummary {
  totalCalls: number;
  callsLastHour: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCostUsd: number;
}

export function createLlmUsageRepo(db: Db) {
  const insertStmt = db.prepare(`
    INSERT INTO llm_usage (created_at, kind, model, input_tokens, output_tokens, estimated_cost_usd)
    VALUES (@createdAt, @kind, @model, @inputTokens, @outputTokens, @estimatedCostUsd)
  `);

  return {
    record(data: Omit<UsageRecord, 'id'>): void {
      insertStmt.run(data);
    },

    callsSince(sinceMs: number): number {
      const row = db
        .prepare('SELECT COUNT(*) AS count FROM llm_usage WHERE created_at >= ?')
        .get(sinceMs) as { count: number };
      return row.count;
    },

    summary(): UsageSummary {
      const totals = db
        .prepare(
          `SELECT COUNT(*) AS calls,
                  COALESCE(SUM(input_tokens), 0) AS input_tokens,
                  COALESCE(SUM(output_tokens), 0) AS output_tokens,
                  COALESCE(SUM(estimated_cost_usd), 0) AS cost
           FROM llm_usage`,
        )
        .get() as { calls: number; input_tokens: number; output_tokens: number; cost: number };
      return {
        totalCalls: totals.calls,
        callsLastHour: this.callsSince(Date.now() - 3_600_000),
        totalInputTokens: totals.input_tokens,
        totalOutputTokens: totals.output_tokens,
        totalEstimatedCostUsd: totals.cost,
      };
    },
  };
}

export type LlmUsageRepo = ReturnType<typeof createLlmUsageRepo>;

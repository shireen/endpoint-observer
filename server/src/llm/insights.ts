import Anthropic from '@anthropic-ai/sdk';
import type { Logger } from '../logger.js';
import type { ResponsesRepo } from '../db/responses.js';
import type { IncidentsRepo, IncidentRecord } from '../db/incidents.js';
import type { LlmUsageRepo } from '../db/llmUsage.js';
import { CostController, ResponseCache } from './costControl.js';
import { CHAT_TOOLS, createToolExecutor, type ToolExecutor } from './tools.js';
import { DEFAULT_MODEL } from './pricing.js';
import { fallbackChatAnswer, fallbackIncidentAnalysis } from './fallback.js';

const CHAT_SYSTEM_PROMPT = `You are the monitoring assistant for an HTTP response monitor that pings httpbin.org/anything every 5 minutes and records status, latency, and payload data.

Answer questions about the monitoring data using the provided tools — never guess numbers; always fetch them. Be concise and conversational. Report latencies in milliseconds and times in a human-readable form. If the data is insufficient to answer, say so plainly.`;

const MAX_TOOL_ITERATIONS = 5;
const MAX_INPUT_TOKENS = 20_000; // guardrail: refuse absurdly large prompts before spending
const CHAT_MAX_TOKENS = 1024;
const INCIDENT_MAX_TOKENS = 700;

export interface ChatResult {
  text: string;
  source: 'llm' | 'cache' | 'fallback';
}

export interface ChatOptions {
  message: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  /** Called with incremental text as the model streams its answer. */
  onText?: (delta: string) => void;
}

export interface InsightsDeps {
  apiKey: string | undefined;
  model?: string;
  callsPerHour: number;
  responses: ResponsesRepo;
  incidents: IncidentsRepo;
  usage: LlmUsageRepo;
  logger: Logger;
  /** Injectable for tests. */
  client?: Anthropic;
}

export class InsightsService {
  readonly model: string;
  readonly costs: CostController;
  private cache = new ResponseCache();
  private client: Anthropic | undefined;
  private executeTool: ToolExecutor;

  constructor(private deps: InsightsDeps) {
    this.model = deps.model ?? DEFAULT_MODEL;
    this.costs = new CostController(deps.usage, deps.callsPerHour);
    this.executeTool = createToolExecutor(deps.responses, deps.incidents);
    this.client = deps.client ?? (deps.apiKey ? new Anthropic({ apiKey: deps.apiKey }) : undefined);
  }

  get llmEnabled(): boolean {
    return this.client !== undefined;
  }

  /**
   * Answer a question about the monitoring data.
   * Order of attack: cache → rate-limit check → tool-grounded agent loop →
   * deterministic fallback on any failure. Never throws.
   */
  async chat(options: ChatOptions): Promise<ChatResult> {
    const { message, history = [], onText } = options;

    // Cache only applies to fresh questions — history changes the meaning.
    if (history.length === 0) {
      const cached = this.cache.get(message);
      if (cached !== undefined) {
        onText?.(cached);
        return { text: cached, source: 'cache' };
      }
    }

    if (!this.client || !this.costs.canCall()) {
      const text = fallbackChatAnswer(this.deps.responses, this.deps.incidents, {
        quotaExceeded: this.client !== undefined,
      });
      onText?.(text);
      return { text, source: 'fallback' };
    }

    try {
      const text = await this.runAgentLoop(message, history, onText);
      if (history.length === 0) this.cache.set(message, text);
      return { text, source: 'llm' };
    } catch (err) {
      this.deps.logger.error({ err }, 'llm chat failed, serving fallback');
      const text = fallbackChatAnswer(this.deps.responses, this.deps.incidents, { error: true });
      onText?.(text);
      return { text, source: 'fallback' };
    }
  }

  private async runAgentLoop(
    message: string,
    history: { role: 'user' | 'assistant'; content: string }[],
    onText?: (delta: string) => void,
  ): Promise<string> {
    const client = this.client!;
    const messages: Anthropic.MessageParam[] = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: message },
    ];

    // Token counting before the call (free endpoint) — both a cost guardrail
    // and the basis for the pre-call estimate the assignment asks for.
    const count = await client.messages.countTokens({
      model: this.model,
      system: CHAT_SYSTEM_PROMPT,
      tools: CHAT_TOOLS,
      messages,
    });
    if (count.input_tokens > MAX_INPUT_TOKENS) {
      throw new Error(`Prompt too large (${count.input_tokens} tokens)`);
    }

    let finalText = '';
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      if (!this.costs.canCall()) break; // quota can run out mid-loop

      const stream = client.messages.stream({
        model: this.model,
        max_tokens: CHAT_MAX_TOKENS,
        system: CHAT_SYSTEM_PROMPT,
        tools: CHAT_TOOLS,
        messages,
      });
      if (onText) stream.on('text', onText);
      const response = await stream.finalMessage();

      this.costs.record(
        'chat',
        this.model,
        response.usage.input_tokens,
        response.usage.output_tokens,
      );

      finalText += response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

      if (response.stop_reason !== 'tool_use') return finalText;

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: toolUses.map((tool): Anthropic.ToolResultBlockParam => ({
          type: 'tool_result',
          tool_use_id: tool.id,
          content: this.executeTool(tool.name, tool.input as Record<string, unknown>),
        })),
      });
    }
    // Loop or quota exhausted mid-conversation — return whatever we have.
    return finalText || 'I ran out of analysis budget before finishing — please try again later.';
  }

  /**
   * Generate root-cause hypotheses + recommendations for a detected incident
   * and persist them. Falls back to a deterministic report when the LLM is
   * unavailable or over quota. Never throws.
   */
  async analyzeIncident(incident: IncidentRecord): Promise<void> {
    let analysis: string;
    let source: 'llm' | 'fallback' = 'fallback';

    if (this.client && this.costs.canCall()) {
      try {
        analysis = await this.generateIncidentReport(incident);
        source = 'llm';
      } catch (err) {
        this.deps.logger.error({ err, incidentId: incident.id }, 'llm incident analysis failed');
        analysis = fallbackIncidentAnalysis(incident);
      }
    } else {
      analysis = fallbackIncidentAnalysis(incident);
    }

    this.deps.incidents.setAnalysis(incident.id, analysis, source);
  }

  private async generateIncidentReport(incident: IncidentRecord): Promise<string> {
    const client = this.client!;
    const stats = this.deps.responses.stats(24);
    const recentFailures = this.deps.responses.list({ limit: 5, hours: 24, status: 'failed' });

    const response = await client.messages.create({
      model: this.model,
      max_tokens: INCIDENT_MAX_TOKENS,
      system:
        'You write terse incident reports for an HTTP monitoring system. Output markdown with exactly two sections: "## Potential root causes" (3-4 bullets, most likely first) and "## Recommendations" (2-3 actionable bullets). No preamble.',
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            incident: {
              at: new Date(incident.createdAt).toISOString(),
              endpoint: incident.endpoint,
              severity: incident.severity,
              latency_ms: incident.latencyMs,
              baseline_24h_avg_ms: Math.round(incident.baselineMs),
            },
            last_24h_stats: stats,
            recent_failures: recentFailures.map((r) => ({
              at: new Date(r.createdAt).toISOString(),
              status: r.statusCode,
              error: r.error,
            })),
          }),
        },
      ],
    });

    this.costs.record(
      'incident',
      this.model,
      response.usage.input_tokens,
      response.usage.output_tokens,
    );

    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
  }
}

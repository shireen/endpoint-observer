export interface Config {
  port: number;
  databasePath: string;
  pingCron: string;
  pingUrl: string;
  pingTimeoutMs: number;
  anthropicApiKey: string | undefined;
  llmCallsPerHour: number;
  nodeEnv: string;
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid value for ${name}: "${raw}" (expected a positive integer)`);
  }
  return parsed;
}

export function loadConfig(): Config {
  return {
    port: intFromEnv('PORT', 3001),
    databasePath: process.env.DATABASE_PATH || './data/monitor.sqlite',
    pingCron: process.env.PING_CRON || '*/5 * * * *',
    pingUrl: process.env.PING_URL || 'https://httpbin.org/anything',
    pingTimeoutMs: intFromEnv('PING_TIMEOUT_MS', 10_000),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
    llmCallsPerHour: intFromEnv('LLM_CALLS_PER_HOUR', 20),
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}

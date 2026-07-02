import type { Db } from './index.js';

export interface ResponseRecord {
  id: number;
  createdAt: number;
  url: string;
  requestPayload: string;
  statusCode: number | null;
  latencyMs: number;
  responseBody: string | null;
  responseSizeBytes: number | null;
  ok: boolean;
  error: string | null;
}

export interface NewResponse {
  createdAt: number;
  url: string;
  requestPayload: string;
  statusCode: number | null;
  latencyMs: number;
  responseBody: string | null;
  responseSizeBytes: number | null;
  ok: boolean;
  error: string | null;
}

export interface ListOptions {
  limit: number;
  /** Cursor: only return rows with id < before (newest-first pagination). */
  before?: number;
  /** Only rows from the last N hours. */
  hours?: number;
  /** Explicit time bounds (epoch ms, inclusive) — for "around 2pm" queries. */
  from?: number;
  to?: number;
  /** Filter by outcome. */
  status?: 'ok' | 'failed';
}

export interface Stats {
  count: number;
  okCount: number;
  failedCount: number;
  avgLatencyMs: number | null;
  minLatencyMs: number | null;
  maxLatencyMs: number | null;
  p95LatencyMs: number | null;
}

interface Row {
  id: number;
  created_at: number;
  url: string;
  request_payload: string;
  status_code: number | null;
  latency_ms: number;
  response_body: string | null;
  response_size_bytes: number | null;
  ok: number;
  error: string | null;
}

function toRecord(row: Row): ResponseRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    url: row.url,
    requestPayload: row.request_payload,
    statusCode: row.status_code,
    latencyMs: row.latency_ms,
    responseBody: row.response_body,
    responseSizeBytes: row.response_size_bytes,
    ok: row.ok === 1,
    error: row.error,
  };
}

export function createResponsesRepo(db: Db) {
  const insertStmt = db.prepare(`
    INSERT INTO responses
      (created_at, url, request_payload, status_code, latency_ms, response_body, response_size_bytes, ok, error)
    VALUES
      (@createdAt, @url, @requestPayload, @statusCode, @latencyMs, @responseBody, @responseSizeBytes, @ok, @error)
  `);
  const byIdStmt = db.prepare('SELECT * FROM responses WHERE id = ?');

  return {
    insert(data: NewResponse): ResponseRecord {
      const result = insertStmt.run({ ...data, ok: data.ok ? 1 : 0 });
      return this.getById(Number(result.lastInsertRowid))!;
    },

    getById(id: number): ResponseRecord | undefined {
      const row = byIdStmt.get(id) as Row | undefined;
      return row ? toRecord(row) : undefined;
    },

    list(options: ListOptions): ResponseRecord[] {
      const clauses: string[] = [];
      const params: Record<string, number | string> = { limit: options.limit };
      if (options.before !== undefined) {
        clauses.push('id < @before');
        params.before = options.before;
      }
      if (options.hours !== undefined) {
        clauses.push('created_at >= @since');
        params.since = Date.now() - options.hours * 3_600_000;
      }
      if (options.from !== undefined) {
        clauses.push('created_at >= @from');
        params.from = options.from;
      }
      if (options.to !== undefined) {
        clauses.push('created_at <= @to');
        params.to = options.to;
      }
      if (options.status) {
        clauses.push('ok = @ok');
        params.ok = options.status === 'ok' ? 1 : 0;
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = db
        .prepare(`SELECT * FROM responses ${where} ORDER BY id DESC LIMIT @limit`)
        .all(params) as Row[];
      return rows.map(toRecord);
    },

    /** Aggregate stats over the last N hours (all time if omitted). */
    stats(hours?: number): Stats {
      const since = hours !== undefined ? Date.now() - hours * 3_600_000 : 0;
      const agg = db
        .prepare(
          `SELECT COUNT(*) AS count,
                  SUM(ok) AS ok_count,
                  AVG(latency_ms) AS avg_latency,
                  MIN(latency_ms) AS min_latency,
                  MAX(latency_ms) AS max_latency
           FROM responses WHERE created_at >= ?`,
        )
        .get(since) as {
        count: number;
        ok_count: number | null;
        avg_latency: number | null;
        min_latency: number | null;
        max_latency: number | null;
      };
      // SQLite has no built-in percentile; OFFSET into the sorted set is fine at this scale.
      let p95: number | null = null;
      if (agg.count > 0) {
        const offset = Math.max(0, Math.ceil(agg.count * 0.95) - 1);
        const row = db
          .prepare(
            'SELECT latency_ms FROM responses WHERE created_at >= ? ORDER BY latency_ms LIMIT 1 OFFSET ?',
          )
          .get(since, offset) as { latency_ms: number } | undefined;
        p95 = row?.latency_ms ?? null;
      }
      return {
        count: agg.count,
        okCount: agg.ok_count ?? 0,
        failedCount: agg.count - (agg.ok_count ?? 0),
        avgLatencyMs: agg.avg_latency,
        minLatencyMs: agg.min_latency,
        maxLatencyMs: agg.max_latency,
        p95LatencyMs: p95,
      };
    },

    /**
     * Rolling average latency of *successful* pings over the trailing window,
     * excluding one row (the ping being evaluated for anomaly).
     */
    rollingAverage(windowMs: number, excludeId?: number): { avg: number | null; count: number } {
      const row = db
        .prepare(
          `SELECT AVG(latency_ms) AS avg, COUNT(*) AS count
           FROM responses
           WHERE created_at >= ? AND ok = 1 AND id != ?`,
        )
        .get(Date.now() - windowMs, excludeId ?? -1) as { avg: number | null; count: number };
      return { avg: row.avg, count: row.count };
    },

    slowest(limit: number, hours?: number): ResponseRecord[] {
      const since = hours !== undefined ? Date.now() - hours * 3_600_000 : 0;
      const rows = db
        .prepare('SELECT * FROM responses WHERE created_at >= ? ORDER BY latency_ms DESC LIMIT ?')
        .all(since, limit) as Row[];
      return rows.map(toRecord);
    },
  };
}

export type ResponsesRepo = ReturnType<typeof createResponsesRepo>;

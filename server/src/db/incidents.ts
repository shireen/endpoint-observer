import type { Db } from './index.js';

export interface IncidentRecord {
  id: number;
  createdAt: number;
  responseId: number | null;
  severity: 'warning' | 'critical';
  endpoint: string;
  latencyMs: number;
  baselineMs: number;
  summary: string;
  analysis: string | null;
  analysisSource: 'pending' | 'llm' | 'fallback';
  /** How many anomalies have been grouped into this incident. */
  occurrences: number;
  /** Timestamp of the most recent grouped occurrence. */
  lastSeenAt: number;
}

interface Row {
  id: number;
  created_at: number;
  response_id: number | null;
  severity: 'warning' | 'critical';
  endpoint: string;
  latency_ms: number;
  baseline_ms: number;
  summary: string;
  analysis: string | null;
  analysis_source: 'pending' | 'llm' | 'fallback';
  occurrences: number;
  last_seen_at: number | null;
}

function toRecord(row: Row): IncidentRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    responseId: row.response_id,
    severity: row.severity,
    endpoint: row.endpoint,
    latencyMs: row.latency_ms,
    baselineMs: row.baseline_ms,
    summary: row.summary,
    analysis: row.analysis,
    analysisSource: row.analysis_source,
    occurrences: row.occurrences,
    lastSeenAt: row.last_seen_at ?? row.created_at,
  };
}

export function createIncidentsRepo(db: Db) {
  const insertStmt = db.prepare(`
    INSERT INTO incidents
      (created_at, response_id, severity, endpoint, latency_ms, baseline_ms, summary, analysis_source, occurrences, last_seen_at)
    VALUES
      (@createdAt, @responseId, @severity, @endpoint, @latencyMs, @baselineMs, @summary, 'pending', 1, @createdAt)
  `);
  const byIdStmt = db.prepare('SELECT * FROM incidents WHERE id = ?');

  return {
    create(data: {
      createdAt: number;
      responseId: number | null;
      severity: 'warning' | 'critical';
      endpoint: string;
      latencyMs: number;
      baselineMs: number;
      summary: string;
    }): IncidentRecord {
      const result = insertStmt.run(data);
      return this.getById(Number(result.lastInsertRowid))!;
    },

    getById(id: number): IncidentRecord | undefined {
      const row = byIdStmt.get(id) as Row | undefined;
      return row ? toRecord(row) : undefined;
    },

    /** Folds a repeated anomaly into an existing incident instead of opening a new one. */
    recordRecurrence(
      id: number,
      seenAt: number,
      latencyMs: number,
      severity: 'warning' | 'critical',
    ): IncidentRecord {
      db.prepare(
        `UPDATE incidents
         SET occurrences = occurrences + 1,
             last_seen_at = @seenAt,
             latency_ms = MAX(latency_ms, @latencyMs),
             severity = CASE WHEN @severity = 'critical' THEN 'critical' ELSE severity END
         WHERE id = @id`,
      ).run({ id, seenAt, latencyMs, severity });
      return this.getById(id)!;
    },

    /** Most recent incident, if any (used to decide grouping). */
    latest(): IncidentRecord | undefined {
      const row = db.prepare('SELECT * FROM incidents ORDER BY id DESC LIMIT 1').get() as
        Row | undefined;
      return row ? toRecord(row) : undefined;
    },

    setAnalysis(id: number, analysis: string, source: 'llm' | 'fallback'): void {
      db.prepare('UPDATE incidents SET analysis = ?, analysis_source = ? WHERE id = ?').run(
        analysis,
        source,
        id,
      );
    },

    list(options: { limit: number; hours?: number }): IncidentRecord[] {
      const since = options.hours !== undefined ? Date.now() - options.hours * 3_600_000 : 0;
      const rows = db
        .prepare('SELECT * FROM incidents WHERE created_at >= ? ORDER BY id DESC LIMIT ?')
        .all(since, options.limit) as Row[];
      return rows.map(toRecord);
    },
  };
}

export type IncidentsRepo = ReturnType<typeof createIncidentsRepo>;

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,            -- unix epoch ms
  url TEXT NOT NULL,
  request_payload TEXT NOT NULL,          -- JSON payload we sent
  status_code INTEGER,                    -- NULL when the request never completed
  latency_ms INTEGER NOT NULL,
  response_body TEXT,                     -- raw response body
  response_size_bytes INTEGER,
  ok INTEGER NOT NULL,                    -- 1 = HTTP 2xx, 0 = anything else
  error TEXT                              -- network/timeout error message, if any
);
CREATE INDEX IF NOT EXISTS idx_responses_created_at ON responses(created_at);

CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  response_id INTEGER REFERENCES responses(id),
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  endpoint TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  baseline_ms REAL NOT NULL,              -- rolling average at detection time
  summary TEXT NOT NULL,
  analysis TEXT,                          -- root causes + recommendations (markdown)
  analysis_source TEXT NOT NULL DEFAULT 'pending'
    CHECK (analysis_source IN ('pending', 'llm', 'fallback'))
);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at);

CREATE TABLE IF NOT EXISTS llm_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('chat', 'incident')),
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  estimated_cost_usd REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_llm_usage_created_at ON llm_usage(created_at);
`;

/**
 * Opens (and creates/migrates if needed) the SQLite database.
 * Pass ':memory:' for an isolated throwaway database in tests.
 */
export function openDb(path: string): Db {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

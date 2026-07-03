# Endpoint Observer

Synthetic monitoring for an HTTP endpoint, built as the full-stack take-home for the BizScout engineering team: a service that pings `httpbin.org/anything` every 5 minutes with a randomized JSON payload, stores every outcome, and streams it live to a dashboard — plus the **Option B AI enhancement** (natural-language chat over the monitoring data and automatic LLM incident reports, wrapped in strict cost controls).

**Live demo:** https://server-production-073d.up.railway.app/ (running on Railway on the spec's 5-minute cadence — leave the dashboard open and a new row appears live, no refresh, when the next check fires)

## Quick start

Requirements: Node.js ^20.19, ^22.13, or ≥24 (developed on 24; the floor comes from Vite's engine constraints).

```bash
npm install
cp .env.example .env          # optional — everything has sensible defaults

npm run dev:server            # starts the API + monitor on :3001
npm run dev:web               # starts the dashboard on :5173 (proxies /api to :3001)
```

Open http://localhost:5173. The first ping fires the moment the server boots, so there's data immediately; after that it repeats on the cron schedule (default every 5 minutes — set `PING_CRON="* * * * *"` in `.env` to watch real-time updates without waiting).

The AI features need `ANTHROPIC_API_KEY` in `.env`. **Without a key the app still fully works** — chat and incident analysis degrade to deterministic summaries, clearly labeled in the UI.

Other useful commands:

```bash
npm test                      # all test suites (server + web)
npm run test:coverage         # with coverage reports
npm run lint                  # eslint + prettier
npm run typecheck             # tsc across both workspaces
npm run build && npm start    # production build; server also serves web/dist
```

## Architecture overview

Two npm workspaces, one long-running Node process in production (the server serves the built frontend, so there's a single deploy unit):

```
                    ┌──────────────────────── server (Express + TypeScript) ───────────────────────┐
                    │                                                                               │
 cron (5 min) ──▶ monitor pipeline: generate payload → POST httpbin → normalize result             │
                    │        │                                                                     │
                    │        ├─▶ SQLite (better-sqlite3)  ◀─── REST API (/api/responses, /stats…)  │
                    │        ├─▶ SSE hub ──▶ every connected dashboard (event: response)           │
                    │        └─▶ anomaly check (latency > 2× 24h avg)                              │
                    │                 └─▶ incident row ─▶ Claude analysis (async) ─▶ SSE update    │
                    │                                                                              │
                    │   chat endpoint: Claude + parameterized query tools, streamed via SSE        │
                    │   cost layer: 20 calls/hr rate limit · response cache · token counting       │
                    └──────────────────────────────────────────────────────────────────────────────┘
                                                    ▲
                       web (React + Vite): live table · incidents tab · chat tab · cost panel
```

The **monitor pipeline** (`server/src/monitor/`) is the core of the app: one cycle generates a random marketplace-flavored payload, sends it, and normalizes _every_ outcome — success, HTTP error, timeout, network failure — into a stored row. A failed ping is data, not an exception; the pipeline never throws.

### Key design decisions

| Decision                                         | Why                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SQLite** (better-sqlite3)                      | This app is a single node writing ~288 rows/day — a client/server database adds operational surface for zero benefit at this scale. SQLite gives zero-config local setup, synchronous queries that keep the code simple, and trivially isolated tests (`:memory:` per test). In production it sits on a Railway volume. If this ever needed multiple instances, the repos in `server/src/db/` are the seam where Postgres would slot in. |
| **SSE instead of WebSockets**                    | The realtime flow is strictly server→client broadcast, which is exactly SSE's shape. `EventSource` reconnects automatically for free, it's plain HTTP (no upgrade dance, proxy-friendly), and the same primitive is reused to stream chat responses. WebSockets would buy bidirectionality nobody uses.                                                                                                                                  |
| **Tool-use instead of text-to-SQL** for the chat | The model queries data only through six parameterized tools (`get_stats`, `get_responses_in_range`, `analyze_payload_patterns`, …). No LLM-generated SQL ever touches the database — that removes the prompt-injection-to-SQL class of bugs entirely, keeps every query bounded and index-friendly, and makes token usage predictable.                                                                                                   |
| **Claude Haiku 4.5 by default**                  | The workload is tool-grounded summarization — a frontier model is wasted on it. Haiku is ~10× cheaper than Opus-tier ($1/$5 vs $5/$25 per MTok) and more than capable here. `LLM_MODEL` overrides it.                                                                                                                                                                                                                                    |
| **Express 5 + repositories, no ORM**             | The schema is 3 tables. An ORM would be more dependency than the query surface justifies; thin repo factories (`createResponsesRepo(db)`) keep queries visible and testable.                                                                                                                                                                                                                                                             |
| **Cron in-process** (`node-cron`)                | The scheduler and the app share state (DB, SSE hub), so a separate worker/queue would only add moving parts. The deploy target is a long-running server precisely so this works.                                                                                                                                                                                                                                                         |
| **react-markdown for LLM output**                | Incident analyses and chat answers are model-generated markdown. react-markdown renders them without ever touching dangerouslySetInnerHTML, so LLM output cannot inject markup into the page.                                                                                                                                                                                                                                            |

## Database schema

Created idempotently on boot (`server/src/db/index.ts`); timestamps are unix epoch ms:

```sql
responses (
  id INTEGER PRIMARY KEY, created_at INTEGER, url TEXT,
  request_payload TEXT,          -- the random JSON we sent
  status_code INTEGER,           -- NULL when the request never completed
  latency_ms INTEGER, response_body TEXT, response_size_bytes INTEGER,
  ok INTEGER,                    -- 1 = HTTP 2xx
  error TEXT                     -- timeout / network error message
)
incidents (
  id, created_at, response_id → responses.id,
  severity CHECK (warning|critical), endpoint, latency_ms,
  baseline_ms,                   -- the rolling average at detection time
  summary, analysis,             -- LLM (or fallback) root causes + recommendations
  analysis_source CHECK (pending|llm|fallback)
)
llm_usage (
  id, created_at, kind CHECK (chat|incident), model,
  input_tokens, output_tokens, estimated_cost_usd
)
```

`llm_usage` doubles as the rate limiter's source of truth — counting rows in the last hour survives restarts, unlike an in-memory counter.

## Testing strategy

**Core components, as I see them:** (1) the monitor ingest pipeline (payload → ping → store → broadcast → anomaly check), (2) the REST API, (3) the LLM cost-control layer. The pipeline is the one component _everything_ downstream depends on — if it corrupts data or dies on a bad response, the dashboard, the chat, and the incidents are all garbage. So per the assignment's "comprehensive tests for ONE core component," that's where the depth went.

- **Monitor pipeline** (`server/test/payload|pinger|monitorService.test.ts`) — comprehensive: payload shape/uniqueness/variability; success, HTTP-error, timeout, and network-failure normalization (all four must store, never throw); broadcast emission; and every branch of incident detection — 2× threshold, 4× critical escalation, minimum-baseline guard, failures excluded both as triggers and from the baseline average.
- **REST API** (`server/test/api.test.ts`) — integration tests with supertest against a real in-memory SQLite: pagination cursors, filters, validation errors, 404s, and the chat endpoint's SSE framing.
- **Cost controls** (`server/test/costControl|insights.test.ts`) — rolling-hour rate limit, cache normalization/TTL/eviction, cost math, the tool-use agent loop against a scripted fake client, and every degradation path (no key, quota exhausted, API error → fallback, never a 500).
- **Frontend** (`web/src/**/*.test.{ts,tsx}`) — component tests (the "huge plus" item) for the responses table's loading/error/empty/data states and payload drawer, the metric info-tooltip's interaction and accessibility contract, and unit tests for the adaptive latency formatting and severity thresholds.

Deliberately _not_ tested: `httpbin.org` itself (mocked everywhere — tests must pass offline and in CI), and pixel-level UI.

CI (GitHub Actions) runs lint → typecheck → both test suites with coverage (surfaced in the job summary + uploaded as artifacts) → production build, on every push and PR.

## AI enhancement: Option B (LLM-powered insights)

- **Chat ("Ask AI" tab):** ask things like _"What were the slowest response times today?"_ or _"Why did response time spike at 2pm?"_ — Claude picks from six safe query tools (including a time-range tool that fetches a spike **and** its surroundings for questions about a specific moment), reads the results, and streams a conversational answer. Every tab and AI response uses DST-aware Central Time (`America/Chicago`) with an explicit CDT/CST label, so calendar phrases and visible rows refer to the same window. Answers are labeled by provenance: `AI`, `AI · cached (free)`, or `automatic summary`.
- **Automatic incident reports:** when a successful check's latency exceeds 2× the 24-hour rolling average (with ≥5 baseline samples so early noise can't alert), an incident is created and broadcast immediately; Claude then asynchronously writes a **grounded** report — the prompt states what the system actually is (one synthetic probe, its real cadence and timeout) and requires separate _observed evidence_ / _hypotheses_ / _recommended investigation_ sections, with ops advice that assumes production traffic explicitly forbidden. Repeated anomalies within 30 minutes **group into one evolving incident** (occurrence count, worst latency, escalating severity) instead of spamming near-duplicates — and grouped recurrences don't spend additional LLM calls. Detection never waits on the LLM.
- **Smart response analysis (rules-first):** payload analysis is deterministic code, not LLM calls — `analyzePayloadPatterns` parses the stored httpbin response bodies, extracts and categorizes the echoed payloads (event types, listing categories/regions, tags), buckets response sizes (small <1KB / medium / large >10KB), and identifies payload shape variants. The chat exposes it as a tool, so the LLM's only job is turning the aggregate into a natural-language summary — the analysis itself costs zero tokens.

How the Option B requirement blocks map to the implementation:

| Requirement block               | Where                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Natural-language query       | `server/src/llm/insights.ts` (tool-use agent loop) + `tools.ts` (six parameterized query tools, incl. time-range) + SSE-streamed chat UI         |
| 2. Automatic incident reporting | `server/src/monitor/service.ts` (>2× detection) → `insights.analyzeIncident` (LLM root causes/recommendations) → Incidents tab, stored in DB     |
| 3. Smart response analysis      | `server/src/llm/payloadAnalysis.ts` (deterministic extraction/categorization/pattern detection) surfaced via the `analyze_payload_patterns` tool |
| 4. Cost optimization            | `server/src/llm/costControl.ts` + per-request token counting + cache + fallbacks + cost panel (details below)                                    |

### Cost analysis (the "Critical!" part)

Controls, in the order they're applied:

1. **Cache first.** Fresh questions are normalized (case/whitespace) and cached for 10 minutes, with the newest check's id baked into the cache key — so repeated questions cost $0, but a cached answer can never outlive the data it described (the next ping naturally invalidates it).
2. **Hard rate limit — race-proof.** Max **20 Messages API calls per rolling hour** (`LLM_CALLS_PER_HOUR`), enforced against the `llm_usage` table so it survives restarts. Each request **atomically reserves a budget slot before the API call is made** (a synchronous SQLite insert — Node's single thread means no interleaving between check and claim), then settles the slot with real token counts afterward. Concurrent requests therefore cannot overshoot the cap; a regression test races 25 chats against a cap of 20 to prove it. Each API request counts, including individual turns inside a tool-use loop. The public `/api/chat` endpoint additionally has a per-IP throttle (10 req/min) in front of the LLM budget.
3. **Token counting before every Messages API request** — each chat loop turn (the prompt grows as tool results are appended) and each incident report — via the free `count_tokens` endpoint; prompts over 20k tokens are refused before any money is spent. Chat history is also truncated server-side to the last 10 turns regardless of what the client sends, and tool results are capped (compact rows only; raw response bodies never enter the prompt).
4. **Bounded output.** `max_tokens` 1024 (chat) / 700 (incident); the agent loop is capped at 5 tool iterations.
5. **Graceful degradation.** No key, quota exhausted, or API error → deterministic summaries built from the same repositories. The user always gets an answer; the UI says which kind.
6. **Full transparency.** Every call's tokens and estimated cost are recorded and shown in the dashboard's cost panel (calls this hour, totals, estimated spend).

**What it actually costs** (Claude Haiku 4.5, $1.00 input / $5.00 output per MTok):

| Operation                        | Typical tokens (in / out) | Est. cost |
| -------------------------------- | ------------------------- | --------- |
| Chat question (2-turn tool loop) | ~2,500 / ~300             | ~$0.004   |
| Incident report                  | ~700 / ~300               | ~$0.002   |
| Cached or fallback answer        | 0                         | $0        |

Worst-case ceiling with the rate limit saturated 24/7 (20 calls/hr at generous per-call sizes): **≈ $0.15/hour ≈ $3.50/day**. Realistic usage — a handful of questions a day plus occasional incidents — lands around **$0.02–0.05/day**. Running the same workload on an Opus-tier model would be ~10× that, which is the concrete reason Haiku is the default.

## Assumptions made

- _"Response time > 2x average"_ (Option B's trigger) is interpreted as: successful checks only, against a 24h rolling average of successful checks, requiring ≥5 baseline samples. Failures are already loud in the dashboard; alerting latency math on top of them adds noise, not signal. >4× escalates severity to `critical`.
- The ping interval is env-configurable (`PING_CRON`) with the required 5-minute default — reviewers shouldn't have to wait 5 minutes to see the realtime path work.
- One LLM "call" = one Messages API request. Free `count_tokens` requests don't count against the budget.
- `httpbin.org` is flaky by nature; timeouts (10s default) and failures are recorded as first-class data rather than retried — for a monitoring tool, the failure _is_ the observation. (This was proven within minutes of the first production deploy: httpbin.org had a real global 503 outage, which the monitor recorded faithfully (but lost when data was lost fixing a bug). `PING_URL` exists as an operational lever to point at the API-compatible mirror `https://httpbingo.org/anything` if the outage recurs during review.)
- Payload contents just need to be "random JSON," so they're randomized in shape (varying keys/nesting/array lengths), not only values, and themed as BizScout-ish marketplace events for fun.
- Stored/API timestamps remain timezone-neutral Unix epoch milliseconds; every human-facing timestamp and AI calendar interpretation uses `America/Chicago`, which automatically switches between CDT and CST.
- No auth: the assignment doesn't call for users. Noted under future improvements.

## Deployment

Target: **Railway** (long-running process + persistent volume, which this design wants).

1. Create a Railway project from the GitHub repo. Build: `npm install && npm run build`, custom start command: `node server/dist/index.js` — node runs **directly** (not via `npm start`) so SIGTERM reaches the process on redeploys; npm's signal forwarding is unreliable, and a missed SIGTERM gets the container SIGKILLed and reported as a crash.
2. Attach a **volume** mounted at `/data` and set `DATABASE_PATH=/data/monitor.sqlite` (SQLite must outlive deploys).
3. Set env vars: `ANTHROPIC_API_KEY`, optionally `PING_CRON`, `LLM_CALLS_PER_HOUR`. `PORT` is injected by Railway and respected automatically.
4. The server serves the built dashboard itself, so one service is the whole app.

Why not the others? **Vercel/Netlify** are serverless — a 5-minute in-process scheduler and open SSE connections don't fit their execution model (it would require an external cron + a rearchitected real-time path). **Render's free tier** spins the service down after 15 idle minutes, which silently kills the scheduler — fine for a demo if you accept gaps, wrong for a monitor; it works on Render's paid always-on tier with a disk attached.

## Future improvements

- Time-series latency chart with anomaly markers on the dashboard (the API already exposes everything needed).
- Request phase timings (DNS lookup → TCP connect → TLS handshake → time-to-first-byte), the way dedicated synthetic monitors break a check down. Today a timeout can only say "no response within budget"; phase timings would distinguish "their server accepted the connection and stalled" from "never reachable at all." Requires a lower-level HTTP client than `fetch` (undici interceptors or Node diagnostics channels), which is why it's future work rather than in this build.
- Retention/rollup job — at 288 rows/day nothing is needed for months, but aggregating old rows to hourly stats is the obvious next step.
- Postgres migration if this ever needs >1 instance (repos are the seam), which would also enable SSE fan-out via LISTEN/NOTIFY or Redis pub/sub.
- Prompt caching on the Anthropic side (`cache_control` on the system prompt + tool definitions) — at current volume the fixed prefix is below Haiku's cacheable minimum for meaningful savings, but it's the first lever if chat volume grows.
- Auth + multi-tenancy, alerting integrations (email/Slack webhook on incident), configurable multiple endpoints to monitor.
- Notifications to alert API owner(s) to address errors or timeouts.
- Ask AI: persistent chat history — conversations currently vanish on tab switch or refresh; saving threads would let an operator leave and return to an investigation.
- Link incidents to their checks (and back): an incident stores the offending check's id, but the UI doesn't connect them — closing that loop (incident card → payload drawer, flagged rows → incident) would remove the eyeball-matching of timestamps across tabs.

## Product framing

- **Target user:** a small engineering team (or solo operator) that depends on an HTTP endpoint — theirs or a third party's — and can't afford to babysit a dashboard.
- **Job to be done:** "Tell me when my endpoint is degrading, and give me a trustworthy first read on why, before my users tell me."
- **Success metric:** time-to-detection and alert precision (incidents worth attention ÷ incidents raised). Alert fatigue is the failure mode that kills monitoring tools — hence, repeated anomalies are grouped into a single evolving incident rather than a page of duplicates.
- **Prioritization logic:** trust before breadth. The AI effort went into grounding — evidence-first incident reports fed the monitor's real configuration, parameterized tools rather than text-to-SQL, hard cost caps, honest severity signaling — rather than adding more AI surface area. A monitoring assistant that invents root causes erodes the exact trust the product exists to build; one wrong recommendation costs more than ten missing features.

## Process note

Built by @shireen with Claude Code (Haiku, Opus, and Fable depending on the complexity and use case of the task). Code review by Codex 5.5.

A short decision journal:

- **Scope choices:** Option B over A/C (best fit for showing AI product judgment plus cost discipline); infrastructure sized to the workload — SQLite, SSE, Haiku — with the seams to grow noted in the decision table.
- **AI's role vs. mine:** Claude Code wrote most of the implementation and tests; the product decisions were mine — what to build, the trust-over-breadth prioritization above, unit/severity presentation on the dashboard, accessibility requirements, and when findings from review were worth fixing.
- **Bugs found and fixed along the way:** unclean SSE disconnects crashing the server (caught via crash alerts, fixed, then verified by killing 36 live connections against production); a missing volume wiping the database every deploy (which also cost us the recorded httpbin outage history); a cron misconfiguration (`5 * * * *` is hourly, not every-5-minutes); a rate-limit race under concurrent requests, caught by an independent AI code review (Codex) and fixed with atomic reservations plus a concurrency regression test.
- **Trade-offs:** rules-first payload analysis instead of another LLM flow (deterministic, free, testable); prompt-contract tests rather than LLM-judge output evals (CI has no API key — noted below as future work); cost estimates use standard list pricing (not introductory pricing) so they never under-report.

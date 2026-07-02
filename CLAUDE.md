# Endpoint Observer — project context

Synthetic HTTP monitor built as the BizScout full-stack take-home. Pings `httpbin.org/anything` every 5 minutes with a random JSON payload, stores every outcome in SQLite, broadcasts live over SSE, detects latency anomalies, and adds Claude-powered chat + incident reports with strict cost controls. Read `README.md` first — it carries the architecture and every design decision; this file is operational context that doesn't belong there.

- **Repo:** https://github.com/shireen/endpoint-observer (public; CI on every push)
- **Live:** https://server-production-073d.up.railway.app/ (Railway auto-deploys `main`)

## Commands (run from repo root)

```bash
npm run dev:server   # API + monitor on :3001 (tsx watch, reads root .env)
npm run dev:web      # dashboard on :5173, proxies /api → :3001
npm test             # all suites (server 51 + web 20, vitest)
npm run lint         # eslint + prettier check (both enforced in CI)
npm run typecheck    # tsc across both workspaces
npm run build        # server → server/dist, web → web/dist
npm start            # runs node directly (see Railway section: SIGTERM handling)
```

npm workspaces monorepo: `server/` (Express 5 + TS + better-sqlite3 + node-cron + SSE + `@anthropic-ai/sdk`), `web/` (React 19 + Vite + Tailwind 4 + TanStack Query). In production the server serves `web/dist` — one deploy unit.

## Railway deployment (the config that took debugging)

- **One service, root directory `/`** — Railway's monorepo detection once auto-split server/web into two services; the web one was deleted. Build command `npm run build`, from the repo root, so both workspaces build.
- **Custom start command: `node server/dist/index.js`** — NOT `npm start`. npm swallows SIGTERM, so redeploys got SIGKILLed and emailed "deployment crashed". The app exits 0 in <1s on SIGTERM (handler in `server/src/index.ts`).
- **Volume mounted at `/data`** + env `DATABASE_PATH=/data/monitor.sqlite`. Without the volume the DB is wiped every deploy (this happened; incidents vanished). Volumes attach via right-click on the service canvas, not Settings.
- Other env vars: `ANTHROPIC_API_KEY` (without it, chat/incidents degrade to labeled fallbacks), `PING_CRON=*/5 * * * *`, `PORT=8080` (matches the domain target port). Variable changes require a redeploy to take effect.
- **Empty commits do not trigger Railway deploys** — push a real file change to force one.

## Gotchas learned the hard way

- **Cron:** `*/5 * * * *` is every 5 minutes; `5 * * * *` is once an hour at :05. Six fields means _seconds_ to node-cron — count the stars. The app validates the expression on boot but can't catch valid-but-unintended ones.
- **httpbin.org is genuinely flaky** (it had a real global 503 outage during first deploy — visible in the stored history, kept deliberately). API-compatible mirror: set `PING_URL=https://httpbingo.org/anything`. Failures are recorded as data, never retried or thrown.
- **SSE crash class:** every `res` stream needs an `'error'` listener and guarded writes (`server/src/realtime/sse.ts`) or an unclean client disconnect kills the process. Regression-tested in `server/test/sse.test.ts`.
- **Git pushes must use the noreply email** (`1154014+shireen@users.noreply.github.com`) — the GitHub account blocks pushes exposing the real address. Already set in this repo's local git config; a fresh clone on a new machine needs `git config user.email` set again.
- Incident summaries are generated _at detection time_ and stored — old rows keep old formatting after copy changes.

## Conventions

- Prettier + ESLint from the root config; run `npx prettier --write .` before committing (CI fails on formatting).
- Every behavior change gets a test; tests live in `server/test/` and colocated `web/src/**/*.test.tsx`. Tests assert invariants, not implementation.
- Latency: ms is the canonical stored unit everywhere; display formatting (ms→s→min) lives in `web/src/lib/api.ts` and `server/src/format.ts` (intentionally duplicated twins). Severity thresholds (1s gold / 3s red) are named constants next to them.
- LLM defaults: `claude-haiku-4-5`, 20 calls/hr DB-backed rate limit, response cache, token counting before calls, deterministic fallbacks — all in `server/src/llm/`. Model override: `LLM_MODEL` env var.

## Status

Feature-complete, deployed, stable (crash root causes fixed + stress-tested), submitted-pending. Anything left is human process, not code.

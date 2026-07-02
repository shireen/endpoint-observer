# Agent context

Project context for coding agents lives in [CLAUDE.md](CLAUDE.md) — read that file first. It covers commands, architecture pointers, deployment specifics (Railway), conventions, and known gotchas. `README.md` carries the architecture and design decisions.

Notes for any agent working here:

- Run checks from the repo root: `npm run lint && npm run typecheck && npm test` (CI enforces all three plus Prettier formatting and the build).
- ms is the canonical latency unit; formatting/severity helpers live in `web/src/lib/api.ts` and `server/src/format.ts`.
- Don't weaken the LLM cost controls (`server/src/llm/costControl.ts`) or replace the parameterized chat tools with text-to-SQL — both are deliberate, documented decisions.
- Pushes require the repo's configured noreply git email (the GitHub account blocks exposed addresses).

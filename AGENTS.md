# Rules for every agent working on SIC Live

Read this, then `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DB_CONTRACT.md` and `docs/DESIGN.md` before writing code.

## Which chunk

Work on one chunk at a time. If your prompt names a chunk, do that one. Otherwise take **the next chunk**: the lowest-numbered file in `docs/chunks` that is not ticked in `docs/PROGRESS.md`, is not listed in `docs/BLOCKERS.md`, and whose "Depends on" chunks are all ticked. How many chunks to do in one session is decided by the prompt (`OVERNIGHT_PROMPT.md` runs them all; `scripts/run-overnight.*` runs one per agent).

## Working method

1. Read the chunk file in full. Do every task in it. Do not start another chunk's work.
2. Write the tests the chunk asks for first or alongside the code. A chunk is done only when every acceptance check in it passes.
3. Run `pnpm check` (typecheck, lint, unit tests, e2e) before you finish. Fix what fails. Do not skip or delete tests to make them pass.
4. If a check still fails after three honest attempts, stop that chunk. Write in `docs/BLOCKERS.md`: the chunk number, the check, the error, what you tried, and what a person needs to decide. Commit. The prompt decides whether to carry on with another chunk.
5. When done: tick the chunk in `docs/PROGRESS.md` (`- [x] NN Title (date, tests passing, anything left out)`) and commit with `chunk NN: <title>`.

## Fixed decisions (do not revisit)

- Node 20, pnpm 9 workspaces, TypeScript strict everywhere, ES modules. Run TypeScript scripts with `tsx` (Node 20 does not run `.ts` directly).
- Web: React 18, Vite 5, React Router 6, TanStack Query 5, MSAL React for sign-in, zod for validation, plain CSS with the design tokens in `docs/DESIGN.md`. No Tailwind, no component library.
- API and worker: Azure Functions v4 Node programming model, TypeScript. Handlers are plain functions that a thin Functions adapter and a local Node dev server both call, so tests never need Azure Functions Core Tools.
- Data: `mssql` against Azure SQL with Entra tokens from `@azure/identity`. Every SQL batch the API sends starts with `EXEC sp_set_session_context` for `UserId` and `DeviceSiteKey` (see `docs/DB_CONTRACT.md`). Never build SQL from strings: parameters only.
- Two data modes behind one `Repository` interface: `fake` (in-memory, loaded from `fixtures/`, with a settable clock) and `sql`. Everything overnight runs in `fake`. `SIC_DATA_MODE` picks the mode.
- Two auth modes: `dev` (an `x-dev-user` header naming a fixture user) and `entra` (JWT validation, tenant allow-list). Dev auth, and the `/api/__test/*` routes, work only when `SIC_AUTH_MODE=dev` **and** the socket's remote address is `127.0.0.1`, `::1` or `::ffff:127.0.0.1` (never trust the Host header).
- The database is the authority for permissions. The API also checks roles so it can answer 403 early, but it never relies on the UI to hide things.
- **End-to-end tests share one dev server, so isolate them:** every Playwright spec calls `POST /api/__test/reset` in `beforeEach` (reloads fixtures, clock back to `2026-11-02T12:00:00Z`, one escalation-engine run), and Playwright runs with `workers: 1`.

## Network

Allowed: package registries (npm), and the Playwright browser download (`pnpm exec playwright install --with-deps chromium`). Nothing else.

## Never

- Never connect to Azure, the live database, Microsoft Graph, Teams or any Hilton or DMC system during the overnight run.
- Never put secrets, webhook URLs, tokens or connection strings in code, fixtures, tests or logs. Settings come from environment variables; secrets from Key Vault references.
- Never change a file in `db/migrations` that `db/README.md` lists as applied. New SQL goes in a new numbered file, noted in `docs/DECISIONS.md`.
- Never show a person's name or email on a floor TV screen.
- Never let one site's data reach a user or device without a role at that site. Every new endpoint gets a test with the DEMO site proving it.

## Style

- Plain English in the interface: short labels, sentence case, numbers with units, no jargon. Dates as `Mon 2 Nov`, times as `06:00`, packs with thousands separators.
- RAG is never colour alone: always the shape too (circle green, triangle amber, square red, bar not rated).
- Accessible: keyboard reachable, visible focus, labels on every control, WCAG 2.2 AA contrast in both themes.
- Small, readable modules. A function that does not fit on a screen is split.

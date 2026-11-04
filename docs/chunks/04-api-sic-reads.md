# Chunk 04: API read endpoints for the SIC

**Depends on:** 03.
**Goal:** everything the SIC screens and floor screens read, fast and site-safe, with an OpenAPI description.

## Read first
`docs/SPEC.md` (Screens), `docs/DB_CONTRACT.md` (Reads).

## Endpoints
| Method and path | Returns | Notes |
| --- | --- | --- |
| `GET /api/me` | `Me`: user, roles, sites the person can see with names and time zones | First call after sign-in |
| `GET /api/sites` | Sites the caller can see | |
| `GET /api/sites/:site/config` | areas, lines, reason codes, RAG limits, comment deadline, notifications live | 403 without a role at the site |
| `GET /api/sites/:site/days?limit=14` | production days with data, newest first | |
| `GET /api/sites/:site/sic/version` | `SicVersion` (`version`, `changeKey`, `refreshedUtc`, `pending`, `latestDay`) from `app.usp_GetSicVersion` | Polled every 30 s; `Cache-Control: no-store`. Screens refetch when `changeKey` changes (it moves on a SIC refresh and on any comment, action update or escalation change at the site) |
| `GET /api/sites/:site/sic?day=YYYY-MM-DD&line=N` | `SicHour[]` for the day (one line when `line` is given), ordered by line then hour; plus `summary` (totals per site, area and line: actual, target, plan, attainment, red hours, red hours needing a comment, giveaway, rejects) | Default day = `latestDay` |
| `GET /api/sites/:site/hours/:line/:hourStart/comments` | comments for that hour, newest first, with author names | |
| `GET /api/tv/:key/sic?day=` | as `/sic` for the device's site, filtered to its area or line, **with every person's name removed** (`note.by`, `actionOwners` null) | Device auth only |
| `GET /api/tv/:key/sic/version` | as above | Device auth only |

## Tasks
1. Implement the handlers on the `Repository`. Summaries are computed in `packages/shared/src/summary.ts` (pure, tested), not in SQL, so fake and SQL modes agree.
2. ETag on `/sic` built from site, day, line and `changeKey`; answer 304 when `If-None-Match` matches.
3. `apps/api/openapi.yaml` generated from the zod schemas (`@asteasolutions/zod-to-openapi`) by `pnpm --filter api openapi`, checked into the repo; a test fails when it is out of date.
4. Request logging: method, route template (not the raw path), status, duration and correlation ID only.

## Out of scope
Writes (chunk 05).

## Acceptance checks
- `GET /api/sites/HFI/sic?day=2026-11-02` as Lena returns 216 hours and a summary with 135,048 actual, 175,904 target and 88 red hours; `?line=7` returns 14 hours.
- The same call as Dev Demo (DEMO only) gets 403; `GET /api/sites` as Dev Demo returns only DEMO; as Greta (group admin) returns HFI, HFUK and DEMO.
- The TV endpoint for an HFI key scoped to area `fresh` returns only fresh lines, and no hour in the response has a name in it (test by scanning the JSON for every fixture user's display name).
- A second `/sic` call with the ETag gets 304; after a comment is added at the site (fake), the same ETag gets 200 with the new `noteCount`.
- `pnpm check` passes, including the OpenAPI freshness test.

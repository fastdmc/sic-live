# Chunk 13: floor TV mode, and the loader migration for site config

**Depends on:** 04, 07.
**Goal:** a big, glanceable, name-free screen for the factory floor that scales to any TV, plus the reviewed SQL that lets a new site's feed load without code changes.

## Read first
`docs/SPEC.md` (Floor screen), `docs/DESIGN.md` (Floor screen), the mockup routes `#/line/7/floor` and `&tv=1`, `db/README.md`.

## Tasks
1. `/tv/:key` (no sign-in): dark kiosk layout; the frame sets `--u = width / 240` so everything scales on a 16:9 screen; refresh from `/api/tv/:key/sic/version` every 30 s and refetch on change; full refresh at the start of each hour.
   - Line key: the current hour big (actual v target, RAG shape and colour, attainment), the shift so far (cumulative bar against target and plan), the hour strip, the current product and SAP code, and "needs comment" count.
   - Area key: one tile per line with the hour strip and attainment, worst first.
   - Site key: rotate areas every 30 s with a progress indicator; a site summary band.
   - Never show a person's name, note author or action owner.
   - Stale data: data age as in chunk 06 (server age at the last successful poll plus time since); an amber banner "Data is 25 minutes old" from 20 minutes, red from 60; keep the last data on network failure.
2. Cursor hidden after 3 s idle; no focusable controls; wake-lock where supported.
3. `db/migrations/0019_loader_site_config.sql` and its README are **already written and anchor-checked against live; do not apply them**. Review them, and add a unit test in `db` that the script is idempotent by text (it THROWs when already applied, THROWs when its anchor is missing, keeps the `usp_RequestSICRefresh` hook) by running its REPLACE logic in TypeScript over a sample definition string that contains the two anchor strings quoted in the script.
4. Add `db/migrations/0019_*` to the "Not applied" table in `db/README.md` if it is missing, and make `db/scripts/migrate.ts` refuse to apply any migration listed there unless `--include-unapplied` is passed.

## Acceptance checks
- Playwright with an HFI line-7 key at 1920x1080 and 3840x2160: the layout fills the screen without scrollbars and the text scales (measure a heading's font size ratio about 2).
- The TV page's DOM contains none of the fixture users' names.
- With the API stopped (Playwright route abort), the page keeps the last data and shows the stale banner once the browser clock (Playwright `page.clock`) has moved 20 minutes past the last successful poll.
- The 0019 text test passes, and `pnpm --filter db exec tsx scripts/migrate.ts --offline --dry-run` lists 0019 as "held: not applied, needs --include-unapplied".
- `pnpm check` passes.

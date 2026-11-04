# Chunk 07: SIC screens: site, area, line and the printable sheet

**Depends on:** 04, 06.
**Goal:** the screens people look at all shift, as good as the mockup, driven by the API, refetching only when the data version changes.

## Read first
`docs/SPEC.md` (Screens, Behaviour 1, 7, 8, 10), `docs/DESIGN.md` (Line SIC grid), the mockup routes `#/site`, `#/area/fresh`, `#/line/7`, `#/line/7/sheet`.

## Tasks
1. Data hooks: `useSicVersion(site)` polling every 30 s; `useSic(site, day, line?)` keyed on `changeKey` so it refetches only on change, and invalidated after the person's own writes; `useConfig(site)`.
2. **Site overview** `/sites/:site`: six KPI cards (actual v target packs with a progress bar, attainment %, red hours with "N need a comment", giveaway kg, rejects, open escalations); area tiles (RAG, attainment, red hours); line table sorted worst attainment first with a 24-cell RAG strip per line. Click-through to area and line.
3. **Area** `/sites/:site/areas/:area`: line cards with hour RAG strip, attainment, top loss, current product (SAP code and name), "needs comment" count.
4. **Line SIC** `/sites/:site/lines/:line`: the hour grid as in DESIGN (rows: plan, target, actual, cumulative target, cumulative actual, attainment, RAG, giveaway kg, rejects, stop minutes, top loss, product and SAP, issue, containment, owner, by when, help called, help arrived), current hour outlined, red-without-comment flags, hover or focus on target shows the target basis when `targetBasis` is present (it is null in the fixtures, so hide the hint then). Keyboard: arrow keys move between hours, Enter opens the hour (drawer in chunk 08, a stub here). Products and plan panel under the grid (scheduled runs from plan packs; show "not mapped" for missing SAP codes).
5. **SIC sheet** `/sites/:site/lines/:line/sheet`: printable A4 landscape in the SIC Version 2 order, with a print stylesheet; header with site, line, date, crew.
6. Empty states: a day with no data ("No production recorded on Tue 3 Nov for line 7"), HFUK with no lines yet ("No lines set up for this site yet. A site admin can add them.").

## Acceptance checks
- Playwright as Lena on 2026-11-02: site overview shows 135,048 actual and 175,904 target; the red-hours card shows 88; area Fresh lists lines 1, 2, 4, 5, 6, 7, 9 and 10 (line 3 has no data that day); line 7 shows 14 hour columns and a totals column whose actual equals the sum of its hours.
- `POST /api/__test/bump-version { site: 'HFI' }` makes the screen refetch within one poll; an unchanged `changeKey` does not refetch (assert the request count).
- Unit tests for the grid's row builders: cumulative values, attainment, and "needs comment" for complete red hours with `noteCount = 0`.
- Axe: no serious or critical violations on site, area and line screens.
- `pnpm check` passes.

# Chunk 08: hour drawer, red-hour comments and quick actions

**Depends on:** 05, 07.
**Goal:** a line leader can explain a red hour and raise an action in under 30 seconds on a tablet.

## Read first
`docs/SPEC.md` (Hour drawer, Behaviour 2 and 3), `docs/DB_CONTRACT.md` (`usp_AddHourComment`).

## Tasks
1. Hour drawer from the line grid (and from "needs comment" links anywhere): the hour's figures (actual v target and plan, attainment, RAG, giveaway, rejects, stops by reason, products), earlier notes newest first with author, time and the RAG at the time, and open actions from the hour.
2. Comment form (LineLeader+ for the line's area; read-only with an explanation otherwise): reason picker from the site's reason codes (large touch targets, grouped by loss category), issue (required, 1000 chars, counter), containment, help called and help arrived (time pickers defaulting to the hour), and an optional "Raise an action" section (title, type, owner picker from `/api/people`, or a free-text name, due date defaulting to tomorrow).
3. Save with an optimistic update of the grid cell (note icon, flag cleared), rolled back with the server's message on error.
4. "Next red hour" button after saving, to work through a shift's red hours quickly.
5. A "Needs comment" list on the area and site screens (red complete hours with no note, oldest first) that opens the drawer.

## Acceptance checks
- Playwright as Lena: open line 1 06:00 on 2026-11-02, save reason Packaging, an issue, a containment and an action owned by Aidan due 2026-11-03; the cell loses its flag, the drawer shows the note with "Lena Leader", and `GET /api/actions?site=HFI` returns the new action (the board screen comes in chunk 09).
- As Lena on line 11 (cured) the form is read-only with "Commenting needs the line leader role or above for this line".
- Empty issue: the form blocks save with a message and no request is sent.
- Keyboard only: open, fill and save the form without a mouse.
- `pnpm check` passes.

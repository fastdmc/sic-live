# Chunk 09: actions board, action detail and my actions

**Depends on:** 05, 06.
**Goal:** every corrective action is visible, owned, dated and verified, across the sites a person can see.

## Read first
`docs/SPEC.md` (Actions board, Action, My actions, Behaviour 4).

## Tasks
1. `/actions`: table and card views; filters for site, area, line, owner, status, type, overdue (chips, remembered in the URL); counts per status; overdue rows marked with the shape and the text "Overdue by 3 days". Export the filtered list to CSV.
2. `/actions/:id`: title, type, priority, status stepper (Open, In progress, Done, Verified), owner, due date, detail, the source hour (link to the hour drawer), the escalation it came from, and the history (who changed what, when, with notes). Edit fields according to role: owner or LineLeader+ can move to Done; AreaManager+ can verify; anyone with access can add a note.
3. `/my-actions`: what I own, overdue first, then by due date; quick "Mark done" with an optional note.
4. "Raise an action" button on the board (not tied to an hour): site, line, title, type, owner, due date. Line is required for people whose roles at the site are all area-scoped (their rank comes from the line's area); optional for people with a site-wide role.

## Acceptance checks
- Playwright: Lena raises an action on line 4 from the board, Aidan sees it in his filtered view and moves its due date, Lena marks it done, Aidan verifies it; history shows four entries in order (Created, DueDate, Status to Done, Status to Verified).
- Lena does not see a Verify button; calling verify directly returns 403 and the UI shows the message.
- Filters survive a reload (URL state); CSV export contains the filtered rows only.
- Dev Demo sees no HFI actions on the board.
- `pnpm check` passes.

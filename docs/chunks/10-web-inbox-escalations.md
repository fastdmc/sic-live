# Chunk 10: manager inbox and escalations

**Depends on:** 05, 06.
**Goal:** a manager opens one screen and sees everything that needs them, acknowledges it, and gets to the hour or action in one click.

## Read first
`docs/SPEC.md` (Inbox, Escalations, Behaviour 5 and 6), `docs/DB_CONTRACT.md` (Escalation rules).

## Tasks
1. `/inbox`: notifications newest first, unread in bold, grouped by day; each shows the escalation title, site and line, level badge, age, and buttons Open and Acknowledge (AreaManager+); Mark all read. The bell count updates as items are read.
2. `/escalations`: open and acknowledged escalations for my sites; filters (site, area, type, level, status); sorted by level then age; a level badge (L1, L2, L3) with colour and text; "Acknowledge" with an optional note.
3. `/escalations/:id`: what triggered it in plain words ("Line 7 was red at 09:00 and nobody commented within 30 minutes"), the subject (hour drawer link, action link), the timeline (raised, notified, acknowledged, resolved), and the notifications with channel and status, showing Suppressed ones as "Would have sent to Teams (notifications are off for this site)". No addresses or URLs are shown.
4. Desktop notifications (optional, off by default): ask permission from the inbox page; show one for new L2 and above while the app is open.

## Acceptance checks
- After `POST /api/__test/reset` (clock 2026-11-02T12:00:00Z, engine run): Aidan's inbox shows only escalations for fresh-area lines (rules naming AreaManager or LineLeader); Siobhan, whose SiteManager role has no area, receives RedNoComment L2, ConsecutiveRed L2 and ShiftBelowTarget for lines in every HFI area, and none of the L1-only notices.
- Acknowledge, as Aidan, the ConsecutiveRed L1 for subject `1|2026-11-02T06:00` (line 1, fresh); set the clock to 2026-11-02T13:05:00Z with `POST /api/__test/clock`; run the engine; assert there is no ConsecutiveRed L2 for that subject. Do the same without acknowledging on another fresh line's L1 and assert its L2 appears.
- The escalation detail for a ConsecutiveRed L2 shows Teams and email as "Would have sent" while HFI notifications are off.
- Lena cannot acknowledge (no button; direct call returns 403).
- `pnpm check` passes.

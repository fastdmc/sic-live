# Chunk 11: site admin

**Depends on:** 05, 06.
**Goal:** a site admin can run their site without DMC: people, settings, lines, reasons, rules, notification targets, floor screens and product mapping.

## Read first
`docs/SPEC.md` (Admin), `docs/DB_CONTRACT.md` (admin procedures 0017).

## Tasks
Tabs under `/admin/:site` (SiteAdmin or group admin only):
1. **People and roles:** list (name, email, roles, last seen); add a person by email with a role and optional area; remove a role. Explain each role in one line.
2. **Site settings:** RAG green and amber limits (with a live preview of how many of the latest day's hours would change colour), minimum available minutes, comment deadline, go-live time, and **Notifications live** as a switch with a confirmation that says what will start being sent ("Teams and email will be sent for HFI from now. In the last 7 days this would have been N Teams posts and M emails", from `GET /api/admin/:site/notification-preview?days=7`).
3. **Areas and lines:** areas with order; lines with name, area, cell, order, active; lines found in the SIC data but not in `ctl.Line` shown as "Not set up" with an Add button.
4. **Reason codes:** list, add, edit, deactivate, reorder.
5. **Escalation rules:** one card per rule type and level showing the rule in a sentence ("If a line is red for 2 hours in a row, tell the area manager in the app and in Teams; if not acknowledged within 60 minutes, escalate to level 2"); edit thresholds, delays, roles, channels, active.
6. **Teams and email:** targets per site or area; Teams address is a Key Vault secret name (validated, with help text on how to create the Workflows webhook in the channel and store its URL in Key Vault); minimum level; active; a "Send test" button (`POST /api/admin/:site/targets/:id/test`, only for active targets) that queues a test notification for the worker to send.
7. **Floor screens:** create a key for the site, an area or a line (shown once with a copy button and the full TV URL, then never again); list with last seen; revoke.
8. **Product mapping:** article keys with no SAP code ranked by packs (from `usp_GetArticleKeyGaps`); enter SAP code and name to fix; the count updates.

## Acceptance checks
- Playwright as Sam: grant Lena AreaManager on cured, change amber to 80% and see the preview count, add reason "Allergen clean", edit ConsecutiveRed L1 threshold to 3, create a TV key and call `GET /api/tv/:key/sic` with it (HFI data, no names in the JSON; the TV screen itself is chunk 13), map one article key and see the gap count drop by one.
- Turning Notifications live on requires the confirmation and is audited; turning it off needs no confirmation.
- Lena and Aidan get no Admin nav and a 403 page on `/admin/HFI`.
- `pnpm check` passes.

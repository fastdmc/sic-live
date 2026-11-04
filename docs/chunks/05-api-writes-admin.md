# Chunk 05: API writes: comments, actions, escalations, inbox and admin

**Depends on:** 04.
**Goal:** every write the app makes, each one a thin call to the repository (and so to one procedure), with the database's role checks surfaced as clear 403s.

## Read first
`docs/DB_CONTRACT.md` (Procedures for the API), `docs/SPEC.md` (Behaviour that must hold).

## Endpoints
| Method and path | Procedure | Body |
| --- | --- | --- |
| `POST /api/sites/:site/hours/:line/:hourStart/comments` | `usp_AddHourComment` | `reasonCode?, issue, containmentAction?, helpCalledAt?, helpArrivedAt?, action?: { title, type?, ownerUserId?, ownerName?, dueDate? }` |
| `GET /api/actions?site=&area=&line=&owner=&status=&overdue=&type=&page=` | view on `app.Action` | Paged, 50 a page, sorted overdue first then due date |
| `POST /api/actions` | `usp_SaveAction` (new) | `site, title, line?, commentId?, escalationId?, type?, detail?, ownerUserId?, ownerName?, dueDate?, priority?, note?` |
| `GET /api/actions/:id` | `app.Action` + `app.ActionUpdate` | Action with history and source hour |
| `PATCH /api/actions/:id` | `usp_SaveAction` (update) | any of `title, detail, type, ownerUserId, ownerName, dueDate, status, priority, note` |
| `GET /api/me/actions` | | Actions I own, open first |
| `GET /api/escalations?site=&area=&type=&level=&status=open` | `app.Escalation` | Paged |
| `GET /api/escalations/:id` | `app.Escalation` + its notifications (channel, status, sent time; no addresses) | |
| `POST /api/escalations/:id/ack` | `usp_AckEscalation` | `note?` |
| `GET /api/inbox?unread=` | `app.Notification` where InApp and mine | With unread count |
| `POST /api/inbox/read` | `usp_MarkNotificationsRead` | `notificationId?` |
| `GET /api/people?site=&q=` | `app.usp_GetSitePeople` | For owner pickers: id and name only; any role at the site; refused for floor screens |
| `GET /api/admin/:site/users` | `usp_GetSiteUsers` | |
| `POST /api/admin/:site/roles` | `usp_SaveUserSiteRole` | `email, displayName?, areaKey?, role, remove?` |
| `PATCH /api/admin/:site/settings` | `usp_SaveSiteSettings` | RAG limits, comment deadline, `notificationsLive`, `liveFromUtc` |
| `PUT /api/admin/:site/areas/:area` | `usp_SaveArea` | |
| `PUT /api/admin/:site/lines/:line` | `usp_SaveLine` | |
| `PUT /api/admin/:site/reasons/:code` | `usp_SaveReasonCode` | |
| `GET`, `POST`, `PUT /api/admin/:site/rules[/:id]` | `ctl.EscalationRule`, `usp_SaveEscalationRule` | |
| `GET`, `POST`, `PUT /api/admin/:site/targets[/:id]` | `ctl.NotificationTarget`, `usp_SaveNotificationTarget` | Teams address must be a Key Vault secret name |
| `GET /api/admin/:site/devices`, `POST /api/admin/:site/devices`, `POST /api/admin/:site/devices/:id/revoke` | `usp_SaveDeviceKey` | Create returns the plain key and TV URL **once**; only the SHA-256 hash is stored |
| `GET /api/admin/:site/article-gaps?days=14`, `PUT /api/admin/:site/article-map/:articleKey` | `usp_GetArticleKeyGaps`, `usp_SaveArticleKeyMap` | |
| `POST /api/admin/:site/targets/:id/test` | `app.usp_QueueTestNotification` | Queues a test notice; target must be active |
| `GET /api/admin/:site/notification-preview?days=7` | `app.usp_GetNotificationPreview` | Counts by channel and status for the notifications-live confirmation |

## Tasks
1. Implement the handlers; device keys from `crypto.randomBytes(32)` as base64url.
2. Every write returns the saved record so the UI can update without refetching.
3. Rate limit writes per user (60 a minute) in memory; 429 with a friendly message.
4. Update `openapi.yaml`.

## Acceptance checks
- Lena comments line 1 06:00 on 2026-11-02 with an action; the hour then shows `noteCount 1`, `openActions 1`, and the RedNoComment escalations for that hour are Resolved.
- Lena commenting line 11 (cured) gets 403 with the database's message. An empty issue gets 400 with "Say what the issue was".
- Lena cannot set an action to Verified (403); Aidan can.
- Dev Demo gets 403 on every HFI write and every HFI admin endpoint; Sam (HFI site admin) gets 403 on DEMO admin.
- Creating a device key returns a key once; listing devices never returns a key or hash; the TV URL works until revoked.
- A Teams target with an `https://` address is refused with 400.
- `pnpm check` passes.

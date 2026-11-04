# Decisions

| Date | Decision | Why |
| --- | --- | --- |
| 2026-11-04 | One multi-tenant app registration in the DMC tenant, consented by Hilton IT; API accepts only the Hilton and DMC tenant IDs. Guests in the DMC tenant are the fallback. | Hilton staff use their own accounts and leaver process; no guest lifecycle in DMC's tenant; works from day one via guests if consent is late. |
| 2026-11-04 | Permissions live in the database (roles per site and area, row-level security by site); the API checks too, the UI only hides. | One place to enforce multi-site isolation, tested at the database. |
| 2026-11-04 | Escalations are raised only by `app.usp_EvaluateEscalations` (after each load and every minute). | One engine; idempotent; testable on replayed days. |
| 2026-11-04 | Teams through Workflows webhooks per channel, URLs in Key Vault; email through Graph from one shared mailbox. | Graph only allows app posting to channels during migrations; connector webhooks are retired. |
| 2026-11-04 | Teams gets level 2 and above only; red hours with no comment stay in-app. | 2 Nov replay: 97 escalations in a morning, 78 Teams posts before tuning, about 4 after. |
| 2026-11-04 | Notifications are off per site (`NotificationsLive = 0`) until the site signs off; Suppressed notices show what would have been sent. | Safe go-live, measurable noise before switching on. |
| 2026-11-04 | Overnight build runs on fixtures only; the SQL repository is tested in the morning against a copy of HiltonMoa. | No Azure or database access from the agent's machine. |

# SIC Live: what the app does

SIC Live replaces the paper short interval control (SIC) sheet at every Hilton Foods site. Each line's hours fill in from the Omega feeds. Line leaders explain red hours and raise corrective actions. Managers see what needs them in one inbox, and the app escalates by rule to the app, Teams and email. One app serves every site; a person sees only the sites they hold a role at.

## People and roles

Roles are per site, and optionally per area of a site (`app.UserSiteRole`). A person can hold several.

| Role | Rank | Can |
| --- | --- | --- |
| Viewer | 1 | See the SIC, actions and escalations for the site or area |
| LineLeader | 2 | Comment on hours, raise actions, update actions they own or at their lines |
| AreaManager | 3 | Acknowledge escalations, verify actions, for their area (or the whole site when the role has no area) |
| SiteManager | 4 | As area manager for the whole site; receives site-level escalations |
| SiteAdmin | 5 | Manage roles, site settings, areas and lines, reason codes, escalation rules, Teams and email targets, floor-screen keys, product mapping |
| Group admin | 5 everywhere | A flag on the person (`IsGroupAdmin`): all of the above at every site |

Floor TV screens use a device key, not a person: read-only, one site (optionally one area or line), never showing names or emails.

## Screens

Routes are relative to the app root. `:site` is a site key such as `HFI`.

| Route | Screen | Who | What it shows and does |
| --- | --- | --- | --- |
| `/` | Home | All | Last site used, or a site picker if the person has more than one. |
| `/sites/:site` | Site overview | Viewer+ | Six KPI cards (actual v target packs, attainment %, red hours, giveaway kg, rejects, open escalations); area tiles with RAG and attainment; line list sorted worst first. Date picker (default: latest production day). |
| `/sites/:site/areas/:area` | Area | Viewer+ | Lines in the area with hour-by-hour RAG strip, attainment, top loss, red hours waiting for a comment. |
| `/sites/:site/lines/:line` | Line SIC | Viewer+ | The SIC grid as in the mockup: one column per hour; rows for plan, target, actual, cumulative target and actual, RAG, giveaway, rejects, stop minutes, top loss, product and SAP code, issue, containment, owner, by when. Red hours with no comment are marked. Clicking an hour opens the hour drawer. |
| (drawer) | Hour drawer | Viewer+ to read, LineLeader+ to write | The hour's figures, stops, products and plan; earlier notes; the comment form (reason, issue, containment, help called, help arrived); "raise an action" (title, type, owner, due date). |
| `/sites/:site/lines/:line/sheet` | SIC sheet | Viewer+ | Printable A4 landscape version of the shift, in the SIC Version 2 column order. |
| `/actions` | Actions board | Viewer+ | Actions for every site the person can see. Filters: site, area, line, owner, status, overdue, type. |
| `/actions/:id` | Action | Viewer+ to read | Detail, history, the hour it came from; change status, owner, due date; add a note; verify (AreaManager+). |
| `/my-actions` | My actions | All | Actions the person owns, by due date. |
| `/inbox` | Manager inbox | All | In-app notifications for the person, newest first, unread count in the top bar bell. Mark read, mark all read. |
| `/escalations` | Escalations | Viewer+ | Open and acknowledged escalations for the person's sites, by level and age. Filters: site, area, rule type, level, status. |
| `/escalations/:id` | Escalation | Viewer+ to read, AreaManager+ to acknowledge | What triggered it, the hour or action, the notifications sent and suppressed, acknowledge with a note. |
| `/admin/:site/...` | Admin | SiteAdmin | Tabs: People and roles, Site settings (RAG limits, comment deadline, notifications live switch with confirmation), Areas and lines, Reason codes, Escalation rules, Teams and email targets, Floor screens (create key, shown once; revoke), Product mapping (article keys with no SAP code, ranked by packs). |
| `/tv/:key` | Floor screen | Device | Full-screen kiosk for the key's site, area or line. Auto-scales to any 16:9 screen, refreshes every 60 s, dark theme, no names. Rotates areas every 30 s when the key covers a whole site. |

## Behaviour that must hold

1. **RAG** uses the site's own limits from `ctl.Site` (`SiteRAG` in the view): green at or above `RagGreenPct` of target, amber at or above `RagAmberPct`, red below; not rated when the target is 0 or available minutes are under `RagMinAvailMins`.
2. **Red hours need a comment.** A complete red hour with no comment shows a marker. The escalation engine raises "red hour, no comment" after `CommentDueMins`. Adding a comment resolves it immediately.
3. **Comments never rewrite history.** Each comment keeps the RAG, actual and target at the moment it was made. Comments are added, not edited in place; a correction is a new comment.
4. **Actions** move Open, InProgress, Done, Verified, or Cancelled. Done needs the owner or LineLeader+; Verified needs AreaManager+. Every change of status, owner or due date is kept with who and when.
5. **Escalations** come only from the database engine (`app.usp_EvaluateEscalations`). The app shows them, acknowledges them and links to their subject. It never raises them itself.
6. **Notifications:** in-app always. Email to people in the rule's roles goes out when the site's `NotificationsLive` is on. Teams, and email to a distribution-list target, go out when the site is live and that target is active. Everything else is stored as Suppressed and shown as "would have sent" in the escalation detail.
7. **Freshness:** screens poll `GET /api/sites/:site/sic/version` every 30 s and refetch only when `changeKey` changes (a SIC refresh, or anyone's comment, action change or escalation change at the site). The top bar shows "Updated 06:42" from `refreshedUtc`, turning amber after 20 minutes without a refresh and red after 60.
8. **Times** on screen are site local time. The feeds already carry local time; anything stored in UTC (comments, escalations) is shown in the site's time zone.
9. **Multi-site:** every list, count and screen is for the selected site or the person's sites. A person with roles at HFI and HFUK can switch sites in the top bar. A person with no role at a site gets 403, never an empty page pretending to be data.
10. **Targets** are frozen per production day from earlier days (they do not move mid-shift). Show the target basis on hover: "best shift, this standard", "best shift, line + product" or "best shift, line".

## Non-functional

- Performance: API p95 under 300 ms for SIC reads (the table read is about 10 ms); first screen under 2 s on a site wifi tablet.
- Availability: the floor screen keeps showing the last data with a "data is N minutes old" banner if the API is unreachable.
- Browsers: current Edge and Chrome on Windows, iPad Safari, Android Chrome; TVs run Edge in kiosk mode.
- Accessibility: WCAG 2.2 AA; RAG shape plus colour; keyboard reachable; screen-reader labels on grid cells ("Line 7, 09:00, actual 812 of 940, red").
- Audit: every write goes through a procedure that writes `app.AuditLog`.
- Privacy: names and emails appear only to signed-in users with a role at the site; never on TV screens; no personal data in logs.

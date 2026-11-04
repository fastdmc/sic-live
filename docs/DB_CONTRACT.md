# SIC Live: database contract

Everything here exists in HiltonMoa (migrations 0001 to 0018 and 0020, applied 4 Nov 2026; 0019 is written but held). The app may use only what is listed. The `FakeRepository` must behave the same way, including role checks, error codes and site filtering.

## Session context (set at the start of every batch)

| Key | Type | Set by | Meaning |
| --- | --- | --- | --- |
| `UserId` | int | API, from `app.usp_UpsertUser` | The signed-in person. Procedures read it with `app.fnCurrentUserId()`; they never take the caller as a parameter. |
| `DeviceSiteKey` | varchar(10) | API, from `app.usp_ResolveDeviceKey` | A floor screen's site. Grants read access to that site only. |

Set both on every batch (one to NULL), in the same batch as the query:

```sql
EXEC sp_set_session_context @key = N'UserId', @value = @__userId;
EXEC sp_set_session_context @key = N'DeviceSiteKey', @value = @__deviceSiteKey;
SELECT ... ;  -- or EXEC app.usp_...
```

Row-level security (policy `app.SiteFilter`) filters `curated.SIC_Hourly`, `app.HourComment`, `app.Action`, `app.ActionUpdate`, `app.Escalation`, `app.Notification` and `app.AuditLog` for members of `sic_app_role` to sites where the user holds any role (any area), or the device's site, or every site for a group admin. Inserts and updates to comments and actions at other sites are blocked.

## Roles in the database

`app.fnRoleRank(@UserId, @SiteKey, @AreaKey)` returns the highest rank the person holds for that site and area (site-wide roles count for every area): 0 none, 1 Viewer, 2 LineLeader, 3 AreaManager, 4 SiteManager, 5 SiteAdmin or group admin. Procedures check it and throw the errors below.

## Reads (SELECT granted to `sic_app_role`)

### `curated.vSIC_HourlyApp`: one row per site, production day, line and clock hour

Key: `SiteKey, ProductionDate, LineNo, HourStart`. Always filter by `SiteKey` and `ProductionDate` (the clustered key), optionally `LineNo`.

| Column | Type | Notes |
| --- | --- | --- |
| `SiteKey`, `SiteName` | varchar(10), nvarchar(100) | |
| `ProductionDate` | date | Calendar date of the first run of the day (see `ctl.Site.DayStartHour`) |
| `LineNo`, `LineName`, `AreaKey`, `AreaName`, `CellName` | | Area and cell from `ctl.Line`; can be NULL for a line not yet mapped |
| `HourNo`, `Hour` | int, varchar | 1-based hour of the day; label such as `06-07` |
| `HourStart`, `HourEnd` | datetime2(3) | Site local time |
| `HourStatus` | varchar | `Complete` or `In progress` |
| `ShiftCrew`, `CrewPlanned`, `CrewActual` | | Crew letter; crew sizes are NULL until a feed carries them |
| `FirstCratePlanned`, `FirstCrateActual`, `TimePlanIssued` | time | Planned values from the F12 schedule |
| `Product`, `ProductSAP`, `ProductName`, `Products`, `ProductCount`, `RunOrderNo` | | Main product's Omega article key, SAP code and name; all products in the hour; `ProductSAP` NULL when the article key is not mapped |
| `PlanPacks` | int | From the F12 schedule for the clock hour |
| `TargetPacks`, `TargetBasis` | int, varchar | Frozen best-shift target and how it was set |
| `StdTargetPacks`, `StdSpeedPerMin`, `StdTrayTargetKg`, `TrayTargetKg`, `TrayDeclaredKg` | | The standard the main product ran to |
| `StandardChanged`, `StandardChange`, `MasterDataChanges`, `MasterDataChangeSeen` | | Standard or master-data changes in the hour |
| `ActualPacks`, `CumTargetPacks`, `CumActualPacks`, `AttainmentPct` | | |
| `RAG` | char(1) | At fixed 95/85 limits. **Do not use: use `SiteRAG`.** |
| `SiteRAG` | char(1) | `G`, `A`, `R` or NULL (not rated) at the site's own limits |
| `GiveawayKg`, `GiveawayPct`, `RejectedPacks` | | |
| `LostMins`, `StopMins`, `UnexplainedMins`, `PlannedStopMins`, `UnscheduledMins`, `AvailableMins`, `RunMins` | decimal | |
| `TopLossType`, `IssueSuggested`, `PlannedStops`, `OperatorNotes` | nvarchar | From F3 downtime |
| `Issue`, `ContainmentAction`, `Owner`, `ByWhen`, `HelpCalled`, `HelpArrived` | | **Always NULL (feed placeholders). Use the Note columns.** |
| `ShiftTargetPacks`, `ShiftActualPacks`, `ShiftAttainmentPct`, `ShiftLostMins`, `ShiftGiveawayKg`, `ShiftGiveawayPct` | | Day totals for the line |
| `LastLoadId`, `RefreshedUtc` | bigint, datetime2 | |
| `NoteId`, `NoteReason`, `NoteReasonName`, `NoteIssue`, `NoteContainment`, `NoteHelpCalled`, `NoteHelpArrived`, `NoteBy`, `NoteUtc` | | The latest comment on the hour |
| `NoteCount`, `OpenActions`, `NextActionDue`, `ActionOwners` | | Comments on the hour; open actions raised from it |

### Configuration and records

| Object | Columns the app uses |
| --- | --- |
| `ctl.Site` | `SiteKey, SiteName, Country, TimeZoneId` (Windows zone ID, e.g. `GMT Standard Time`), `DayStartHour, RagGreenPct, RagAmberPct, RagMinAvailMins, CommentDueMins, NotificationsLive, LiveFromUtc, IsActive` |
| `ctl.Area` | `SiteKey, AreaKey, AreaName, DisplayOrder` |
| `ctl.Line` | `SiteKey, LineNo, LineName, AreaKey, CellName, DisplayOrder, IsActive` |
| `ctl.ReasonCode` | `SiteKey, ReasonCode, ReasonName, LossCategory, DisplayOrder, IsActive` |
| `ctl.EscalationRule` | `RuleId, SiteKey, AreaKey, RuleType` (`RedNoComment`, `ConsecutiveRed`, `ShiftBelowTarget`, `ActionOverdue`), `Lvl, Threshold, DelayMins, NotifyRoles` (comma list), `ToTeams, ToEmail, EscalateAfterMins, IsActive, Description` |
| `ctl.NotificationTarget` | `TargetId, SiteKey, AreaKey, Channel` (`Teams`, `Email`), `Address` (Key Vault secret name for Teams; address for email), `MinLvl, IsActive, Description` |
| `ctl.DeviceKey` | `DeviceKeyId, SiteKey, AreaKey, LineNo, DeviceName, CreatedUtc, ExpiresUtc, RevokedUtc, LastSeenUtc` (never `KeyHash`) |
| `app.HourComment` | `CommentId, SiteKey, ProductionDate, LineNo, HourStart, ReasonCode, Issue, ContainmentAction, HelpCalledAt, HelpArrivedAt, RagAtEntry, ActualAtEntry, TargetAtEntry, CreatedBy, CreatedUtc, IsDeleted` |
| `app.Action` | `ActionId, SiteKey, LineNo, AreaKey, CommentId, EscalationId, ProductionDate, HourStart, ActionType, Title, Detail, OwnerUserId, OwnerName, DueDate, Status, Priority, CreatedBy, CreatedUtc, ModifiedBy, ModifiedUtc, DoneUtc, VerifiedBy, VerifiedUtc` |
| `app.ActionUpdate` | `UpdateId, ActionId, SiteKey, UpdateType` (`Created`, `Status`, `Owner`, `DueDate`, `Comment`), `OldValue, NewValue, Note, ByUserId, AtUtc` |
| `app.Escalation` | `EscalationId, RuleId, SiteKey, AreaKey, LineNo, ProductionDate, HourStart, ActionId, RuleType, Lvl, SubjectKey, Title, Detail, Status` (`Open`, `Acknowledged`, `Resolved`, `Cancelled`), `RaisedUtc, AckBy, AckUtc, AckNote, ResolvedUtc, ResolvedBy, ResolvedReason` |
| `app.Notification` | `NotificationId, SiteKey, EscalationId, ActionId, Channel` (`InApp`, `Teams`, `Email`), `RecipientUserId, Subject, Body, DeepLink, Status` (`Pending`, `Sending`, `Sent`, `Failed`, `Suppressed`), `CreatedUtc, SentUtc, ReadUtc, LastError`. The inbox is `Channel = 'InApp' AND RecipientUserId = <me>`. |
| `app.AppUser` | `UserId, Email, DisplayName, JobTitle, IsActive` (column grant; for owner pickers and names) |

## Procedures for the API (EXECUTE granted to `sic_app_role`)

Errors thrown with numbers 50600 to 50699 carry a message fit to show the user. Map them to HTTP status like this: 403 for 50602, 50612, 50614, 50615, 50622, 50631, 50641, 50651, 50652; 404 for 50613, 50621, 50661; 400 for every other 506xx. Anything else is 500 with a correlation ID and no detail.

| Procedure | Parameters | Returns | Errors |
| --- | --- | --- | --- |
| `app.usp_UpsertUser` | `@TenantId uniqueidentifier, @ObjectId uniqueidentifier, @Email nvarchar(256), @DisplayName nvarchar(200), @Upn = NULL, @IsGuest bit = 0, @JobTitle = NULL` | 1: `UserId, Email, DisplayName, IsActive, IsGroupAdmin`. 2: `SiteKey, AreaKey, Role` rows | none |
| `app.usp_GetSicVersion` | `@SiteKey` | `SiteKey, Version, RefreshedUtc, Pending, LastFrom, LastTo, LatestDay, ChangeKey` (`ChangeKey` moves on a refresh and on any comment, action update or escalation change at the site) | 50651 no access (403) |
| `app.usp_GetSitePeople` | `@SiteKey, @Query nvarchar(100) = NULL` | `UserId, DisplayName` of active people with any role at the site, up to 50 | 50651 no access, 50652 floor screen (403) |
| `curated.usp_GetSICHourly` | `@SiteKey, @From date = NULL, @To date = NULL, @LineNo int = NULL` | 1: SIC_Hourly rows. 2: freshness. Refreshes first if pending. Prefer the view plus `usp_GetSicVersion`; keep this for exports. | none |
| `app.usp_AddHourComment` | `@SiteKey, @LineNo int, @HourStart datetime2(3), @Issue nvarchar(1000), @ReasonCode = NULL, @ContainmentAction = NULL, @HelpCalledAt datetime2(0) = NULL, @HelpArrivedAt = NULL, @ActionTitle nvarchar(200) = NULL, @ActionType = 'Corrective', @ActionOwnerUserId int = NULL, @ActionOwnerName nvarchar(100) = NULL, @ActionDueDate date = NULL` | `CommentId, ActionId` (ActionId NULL when no action) | 50601 no such hour, 50602 role (403), 50603 issue empty, 50604 unknown reason |
| `app.usp_SaveAction` | New: `@SiteKey, @Title, @LineNo = NULL, @CommentId = NULL, @EscalationId = NULL, @ActionType = NULL, @Detail = NULL, @OwnerUserId = NULL, @OwnerName = NULL, @DueDate = NULL, @Priority = NULL, @Note = NULL`. Update: `@ActionId` plus any of `@Title, @Detail, @ActionType, @OwnerUserId, @OwnerName, @DueDate, @Status, @Priority, @Note` (NULL = unchanged) | `ActionId, Status, OwnerUserId, DueDate` | 50611 missing site or title, 50612 role (403), 50613 not found (404), 50614 not owner or line leader (403), 50615 verify needs area manager (403) |
| `app.usp_AckEscalation` | `@EscalationId bigint, @Note nvarchar(500) = NULL` | none | 50621 not found or not open (404), 50622 role (403) |
| `app.usp_MarkNotificationsRead` | `@NotificationId bigint = NULL` (NULL = all mine) | `MarkedRead` | none |
| `app.usp_SaveUserSiteRole` | `@Email, @DisplayName = NULL, @SiteKey, @AreaKey = '', @Role, @Remove bit = 0` | the person's roles | 50631 needs site admin (403) |
| `app.usp_ResolveDeviceKey` | `@KeyHash varbinary(32)` | `DeviceKeyId, SiteKey, AreaKey, LineNo, DeviceName`, or no row | none |
| `app.usp_GetSiteUsers` | `@SiteKey` | `UserId, Email, DisplayName, JobTitle, IsActive, LastSeenUtc, AreaKey, Role, GrantedUtc` | 50641 needs site admin (403) |
| `app.usp_SaveSiteSettings` | `@SiteKey, @RagGreenPct, @RagAmberPct, @RagMinAvailMins, @CommentDueMins, @NotificationsLive bit, @LiveFromUtc` (NULL = unchanged) | the site row | 50641, 50644 amber above green |
| `app.usp_SaveArea` | `@SiteKey, @AreaKey, @AreaName, @DisplayOrder = 0` | the site's areas | 50641 |
| `app.usp_SaveLine` | `@SiteKey, @LineNo, @LineName, @AreaKey = NULL, @CellName = NULL, @DisplayOrder = NULL, @IsActive = 1` | the line | 50641, 50643 unknown area |
| `app.usp_SaveReasonCode` | `@SiteKey, @ReasonCode, @ReasonName, @LossCategory, @DisplayOrder = 0, @IsActive = 1` | the site's reasons | 50641 |
| `app.usp_SaveEscalationRule` | `@RuleId = NULL, @SiteKey, @AreaKey = '', @RuleType, @Lvl, @Threshold = NULL, @DelayMins = 0, @NotifyRoles, @ToTeams = 0, @ToEmail = 0, @EscalateAfterMins = NULL, @IsActive = 1, @Description = NULL` | the rule | 50641, 50645 unknown role |
| `app.usp_SaveNotificationTarget` | `@TargetId = NULL, @SiteKey, @AreaKey = '', @Channel, @Address, @MinLvl = 2, @IsActive = 0, @Description = NULL` | the target | 50641, 50646 a URL given for Teams |
| `app.usp_SaveDeviceKey` | New: `@SiteKey, @AreaKey = NULL, @LineNo = NULL, @DeviceName, @KeyHash varbinary(32), @ExpiresUtc = NULL`. Revoke: `@DeviceKeyId, @SiteKey, @Revoke = 1` | the site's keys (no hashes) | 50641, 50647 hash not 32 bytes |
| `app.usp_GetArticleKeyGaps` | `@SiteKey, @Days = 14` | `ArticleKey, Hours, Packs, FirstSeen, LastSeen, ExampleLine`, most packs first | 50641 |
| `app.usp_SaveArticleKeyMap` | `@SiteKey, @ArticleKey, @SAPNumber, @ArticleName = NULL` | `HoursUpdated` | 50641 |
| `app.usp_QueueTestNotification` | `@TargetId int` | `NotificationId` (a Pending notice to that target) | 50641, 50661 not found (404), 50662 target not active (400) |
| `app.usp_GetNotificationPreview` | `@SiteKey, @Days int = 7` | `Channel, Status, Notices, Escalations, TeamsPostsOrEmails` for the last N days | 50641 |

## Procedures for the worker (EXECUTE granted to `sic_worker_role`)

| Procedure | Parameters | Returns |
| --- | --- | --- |
| `ctl.usp_RefreshSIC` | `@SiteKey = NULL, @Days = NULL, @Force = 0` | none; writes `ctl.SIC_RefreshLog` |
| `app.usp_EvaluateEscalations` | `@SiteKey = NULL, @AsOfUtc datetime2(3) = NULL` | `SiteKey, RuleType, Lvl, Raised` for what it raised this run |
| `app.usp_ClaimNotifications` | `@Batch int = 20, @LeaseSecs int = 120` | `NotificationId, SiteKey, Channel, Address, Subject, Body, DeepLink, EscalationId, Attempts` |
| `app.usp_CompleteNotification` | `@NotificationId bigint, @Ok bit, @Error nvarchar(1000) = NULL` | `Updated` |

## Escalation rules (what the FakeRepository must reproduce)

For each active site, with `now` in site local time (`TimeZoneId`), considering only complete hours that ended in the last 12 hours and after `LiveFromUtc`:

- **RedNoComment** (per rule level): a red hour with no comment, `DelayMins` after the hour ended. Subject `"{LineNo}|{HourStart:yyyy-MM-ddTHH:mm}"`.
- **ConsecutiveRed:** a run of `Threshold` or more red hours in a row on a line, same production day. Subject `"{LineNo}|{first red HourStart}"`.
- **ShiftBelowTarget:** the line's latest complete hour has cumulative actual under `Threshold`% of cumulative target, after at least 3 complete hours. Subject `"{LineNo}|{ProductionDate}"`.
- **ActionOverdue:** an Open or InProgress action whose `DueDate` is before today (site time). Subject `"A{ActionId}"`.
- **Next level:** an Open escalation not acknowledged within its rule's `EscalateAfterMins` raises the next level for the same subject.
- One escalation per site, rule type, subject and level. A level is skipped once a lower level for the same subject is acknowledged or resolved. When an area-specific rule and a site-wide rule both match, the area rule wins.
- Notifications, exactly as `0015` writes them:
  - in-app (status Sent) to everyone holding a role in `NotifyRoles` for the site and area, plus the owner for an overdue action;
  - when `ToEmail`, email to those same people: `Pending` if the site's `NotificationsLive` is on, else `Suppressed`;
  - one row per matching `ctl.NotificationTarget` (site-wide or the escalation's area, `MinLvl <= Lvl`, Channel `Teams` when `ToTeams`, Channel `Email` when `ToEmail`), **including inactive targets**: `Pending` only if the site is live and the target is active, else `Suppressed`.
- A comment on an hour resolves its RedNoComment escalations; closing an action (Done, Verified, Cancelled) resolves its ActionOverdue escalation.

Measured on live on 2 Nov 2026 with 12:00 as now: RedNoComment L1 38, L2 38, ConsecutiveRed L1 9, L2 4, ShiftBelowTarget 8; re-run raised 0.

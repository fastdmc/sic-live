-- SIC app, step 15: the escalation engine and the notification outbox. Each block is its own batch.

-- 15a. Raise escalations from ctl.EscalationRule and queue their notifications. The worker runs it every minute, and each feed load runs it after the SIC refresh.
CREATE OR ALTER PROCEDURE app.usp_EvaluateEscalations @SiteKey varchar(10) = NULL, @AsOfUtc datetime2(3) = NULL
AS
BEGIN
-- Only hours that ended in the last 12 hours, and after the site went live (ctl.Site.LiveFromUtc), can raise anything, so a backfill never floods managers.
-- Each subject (an hour, a run of red hours, a line-day, an action) escalates once per level. A level is skipped once a lower one is acknowledged or resolved.
-- In-app notices go straight to the people in the rule's roles. Teams and email are queued Pending only when the site's NotificationsLive is on, else Suppressed.
SET NOCOUNT, XACT_ABORT ON;
DECLARE @rc int, @now datetime2(3) = ISNULL(@AsOfUtc, SYSUTCDATETIME());
DECLARE @new TABLE (EscalationId bigint PRIMARY KEY, RuleId int NOT NULL);
DECLARE @st TABLE (SiteKey varchar(10) PRIMARY KEY, NowLocal datetime2(3), LiveLocal datetime2(3), Live bit);
EXEC @rc = sp_getapplock @Resource = N'SIC_Escalate', @LockMode = 'Exclusive', @LockOwner = 'Session', @LockTimeout = 0;
IF @rc < 0 RETURN;
BEGIN TRY
INSERT @st SELECT SiteKey, CAST((@now AT TIME ZONE 'UTC') AT TIME ZONE TimeZoneId AS datetime2(3)),
CAST((ISNULL(LiveFromUtc, CAST('2000-01-01' AS datetime2(0))) AT TIME ZONE 'UTC') AT TIME ZONE TimeZoneId AS datetime2(3)), NotificationsLive
FROM ctl.Site WHERE IsActive = 1 AND (@SiteKey IS NULL OR SiteKey = @SiteKey);
SELECT h.SiteKey, h.[LineNo], h.ProductionDate, h.HourStart, h.HourEnd, h.AreaKey, ISNULL(h.LineName, CONCAT(N'Line ', h.[LineNo])) AS LineName, h.SiteRAG, h.NoteCount,
h.CumActualPacks, h.CumTargetPacks, s.NowLocal, CASE WHEN h.HourEnd >= DATEADD(hour, -12, s.NowLocal) THEN 1 ELSE 0 END AS Recent
INTO #h FROM curated.vSIC_HourlyApp h JOIN @st s ON s.SiteKey = h.SiteKey
WHERE h.ProductionDate >= DATEADD(day, -2, CAST(s.NowLocal AS date)) AND h.HourStatus = 'Complete' AND h.HourEnd >= DATEADD(hour, -26, s.NowLocal) AND h.HourEnd <= s.NowLocal AND h.HourEnd >= s.LiveLocal;

-- red hour with no comment
WITH c AS (SELECT r.RuleId, r.RuleType, r.Lvl, r.Description, h.SiteKey, h.AreaKey, h.[LineNo], h.ProductionDate, h.HourStart, h.LineName,
CONCAT(h.[LineNo], '|', CONVERT(varchar(16), h.HourStart, 126)) AS Subj,
ROW_NUMBER() OVER (PARTITION BY h.SiteKey, h.[LineNo], h.HourStart, r.Lvl ORDER BY CASE WHEN r.AreaKey = '' THEN 1 ELSE 0 END) AS rn
FROM #h h JOIN ctl.EscalationRule r ON r.SiteKey = h.SiteKey AND r.RuleType = 'RedNoComment' AND r.IsActive = 1 AND (r.AreaKey = '' OR r.AreaKey = h.AreaKey)
WHERE h.Recent = 1 AND h.SiteRAG = 'R' AND h.NoteCount = 0 AND DATEADD(minute, r.DelayMins, h.HourEnd) <= h.NowLocal)
INSERT app.Escalation (RuleId, SiteKey, AreaKey, [LineNo], ProductionDate, HourStart, RuleType, Lvl, SubjectKey, Title, Detail, RaisedUtc)
OUTPUT inserted.EscalationId, inserted.RuleId INTO @new
SELECT RuleId, SiteKey, AreaKey, [LineNo], ProductionDate, HourStart, RuleType, Lvl, Subj, CONCAT(LineName, N' red at ', CONVERT(varchar(5), HourStart, 108), N' with no comment'),
CONCAT(N'Level ', Lvl, N'. ', Description), @now
FROM c WHERE rn = 1
AND NOT EXISTS (SELECT 1 FROM app.Escalation e WHERE e.SiteKey = c.SiteKey AND e.RuleType = c.RuleType AND e.SubjectKey = c.Subj AND (e.Lvl = c.Lvl OR (e.Lvl < c.Lvl AND e.Status IN ('Acknowledged', 'Resolved'))));

-- red hours in a row
WITH g AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY SiteKey, [LineNo], ProductionDate ORDER BY HourStart)
- ROW_NUMBER() OVER (PARTITION BY SiteKey, [LineNo], ProductionDate, CASE WHEN SiteRAG = 'R' THEN 1 ELSE 0 END ORDER BY HourStart) AS grp FROM #h),
isl AS (SELECT SiteKey, [LineNo], ProductionDate, MAX(AreaKey) AS AreaKey, MAX(LineName) AS LineName, MIN(HourStart) AS FirstRed, COUNT(*) AS n, MAX(Recent) AS Recent
FROM g WHERE SiteRAG = 'R' GROUP BY SiteKey, [LineNo], ProductionDate, grp),
c AS (SELECT r.RuleId, r.RuleType, r.Lvl, r.Description, i.SiteKey, i.AreaKey, i.[LineNo], i.ProductionDate, i.FirstRed, i.LineName, i.n,
CONCAT(i.[LineNo], '|', CONVERT(varchar(16), i.FirstRed, 126)) AS Subj,
ROW_NUMBER() OVER (PARTITION BY i.SiteKey, i.[LineNo], i.FirstRed, r.Lvl ORDER BY CASE WHEN r.AreaKey = '' THEN 1 ELSE 0 END) AS rn
FROM isl i JOIN ctl.EscalationRule r ON r.SiteKey = i.SiteKey AND r.RuleType = 'ConsecutiveRed' AND r.IsActive = 1 AND (r.AreaKey = '' OR r.AreaKey = i.AreaKey)
WHERE i.Recent = 1 AND i.n >= r.Threshold)
INSERT app.Escalation (RuleId, SiteKey, AreaKey, [LineNo], ProductionDate, HourStart, RuleType, Lvl, SubjectKey, Title, Detail, RaisedUtc)
OUTPUT inserted.EscalationId, inserted.RuleId INTO @new
SELECT RuleId, SiteKey, AreaKey, [LineNo], ProductionDate, FirstRed, RuleType, Lvl, Subj, CONCAT(LineName, N': ', n, N' red hours in a row from ', CONVERT(varchar(5), FirstRed, 108)),
CONCAT(N'Level ', Lvl, N'. ', Description), @now
FROM c WHERE rn = 1
AND NOT EXISTS (SELECT 1 FROM app.Escalation e WHERE e.SiteKey = c.SiteKey AND e.RuleType = c.RuleType AND e.SubjectKey = c.Subj AND (e.Lvl = c.Lvl OR (e.Lvl < c.Lvl AND e.Status IN ('Acknowledged', 'Resolved'))));

-- line below target for the day so far
WITH l AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY SiteKey, [LineNo], ProductionDate ORDER BY HourStart DESC) AS rk, COUNT(*) OVER (PARTITION BY SiteKey, [LineNo], ProductionDate) AS nh FROM #h),
c AS (SELECT r.RuleId, r.RuleType, r.Lvl, r.Description, l.SiteKey, l.AreaKey, l.[LineNo], l.ProductionDate, l.LineName, l.nh,
CAST(100.0 * l.CumActualPacks / NULLIF(l.CumTargetPacks, 0) AS decimal(6,1)) AS Pct, CONCAT(l.[LineNo], '|', CONVERT(varchar(10), l.ProductionDate, 23)) AS Subj,
ROW_NUMBER() OVER (PARTITION BY l.SiteKey, l.[LineNo], l.ProductionDate, r.Lvl ORDER BY CASE WHEN r.AreaKey = '' THEN 1 ELSE 0 END) AS rn
FROM l JOIN ctl.EscalationRule r ON r.SiteKey = l.SiteKey AND r.RuleType = 'ShiftBelowTarget' AND r.IsActive = 1 AND (r.AreaKey = '' OR r.AreaKey = l.AreaKey)
WHERE l.rk = 1 AND l.nh >= 3 AND l.Recent = 1 AND l.CumTargetPacks > 0 AND 100.0 * l.CumActualPacks / l.CumTargetPacks < r.Threshold)
INSERT app.Escalation (RuleId, SiteKey, AreaKey, [LineNo], ProductionDate, RuleType, Lvl, SubjectKey, Title, Detail, RaisedUtc)
OUTPUT inserted.EscalationId, inserted.RuleId INTO @new
SELECT RuleId, SiteKey, AreaKey, [LineNo], ProductionDate, RuleType, Lvl, Subj, CONCAT(LineName, N' at ', Pct, N'% of target after ', nh, N' hours'),
CONCAT(N'Level ', Lvl, N'. ', Description), @now
FROM c WHERE rn = 1
AND NOT EXISTS (SELECT 1 FROM app.Escalation e WHERE e.SiteKey = c.SiteKey AND e.RuleType = c.RuleType AND e.SubjectKey = c.Subj AND (e.Lvl = c.Lvl OR (e.Lvl < c.Lvl AND e.Status IN ('Acknowledged', 'Resolved'))));

-- overdue corrective actions
WITH c AS (SELECT r.RuleId, r.RuleType, r.Lvl, a.SiteKey, a.AreaKey, a.[LineNo], a.ProductionDate, a.HourStart, a.ActionId, a.Title, a.DueDate, CONCAT('A', a.ActionId) AS Subj,
ROW_NUMBER() OVER (PARTITION BY a.ActionId, r.Lvl ORDER BY CASE WHEN r.AreaKey = '' THEN 1 ELSE 0 END) AS rn
FROM app.Action a JOIN @st s ON s.SiteKey = a.SiteKey
JOIN ctl.EscalationRule r ON r.SiteKey = a.SiteKey AND r.RuleType = 'ActionOverdue' AND r.IsActive = 1 AND (r.AreaKey = '' OR r.AreaKey = ISNULL(a.AreaKey, ''))
WHERE a.Status IN ('Open', 'InProgress') AND a.DueDate < CAST(s.NowLocal AS date))
INSERT app.Escalation (RuleId, SiteKey, AreaKey, [LineNo], ProductionDate, HourStart, ActionId, RuleType, Lvl, SubjectKey, Title, Detail, RaisedUtc)
OUTPUT inserted.EscalationId, inserted.RuleId INTO @new
SELECT RuleId, SiteKey, AreaKey, [LineNo], ProductionDate, HourStart, ActionId, RuleType, Lvl, Subj, CONCAT(N'Action overdue: ', LEFT(Title, 200)), CONCAT(N'Was due ', CONVERT(varchar(10), DueDate, 23)), @now
FROM c WHERE rn = 1
AND NOT EXISTS (SELECT 1 FROM app.Escalation e WHERE e.SiteKey = c.SiteKey AND e.RuleType = c.RuleType AND e.SubjectKey = c.Subj AND (e.Lvl = c.Lvl OR (e.Lvl < c.Lvl AND e.Status IN ('Acknowledged', 'Resolved'))));

-- not acknowledged in time: raise the next level for the same subject
INSERT app.Escalation (RuleId, SiteKey, AreaKey, [LineNo], ProductionDate, HourStart, ActionId, RuleType, Lvl, SubjectKey, Title, Detail, RaisedUtc)
OUTPUT inserted.EscalationId, inserted.RuleId INTO @new
SELECT nx.RuleId, e.SiteKey, e.AreaKey, e.[LineNo], e.ProductionDate, e.HourStart, e.ActionId, e.RuleType, nx.Lvl, e.SubjectKey, e.Title,
CONCAT(N'Level ', nx.Lvl, N'. Not acknowledged within ', r.EscalateAfterMins, N' minutes'), @now
FROM app.Escalation e JOIN @st s ON s.SiteKey = e.SiteKey JOIN ctl.EscalationRule r ON r.RuleId = e.RuleId
CROSS APPLY (SELECT TOP 1 x.RuleId, x.Lvl FROM ctl.EscalationRule x WHERE x.SiteKey = e.SiteKey AND x.RuleType = e.RuleType AND x.Lvl = e.Lvl + 1 AND x.IsActive = 1
AND (x.AreaKey = '' OR x.AreaKey = ISNULL(e.AreaKey, '')) ORDER BY CASE WHEN x.AreaKey = '' THEN 1 ELSE 0 END) nx
WHERE e.Status = 'Open' AND r.EscalateAfterMins IS NOT NULL AND DATEADD(minute, r.EscalateAfterMins, e.RaisedUtc) <= @now
AND NOT EXISTS (SELECT 1 FROM app.Escalation y WHERE y.SiteKey = e.SiteKey AND y.RuleType = e.RuleType AND y.SubjectKey = e.SubjectKey AND y.Lvl >= nx.Lvl);

-- in-app and email to the people in the rule's roles, and to the owner of an overdue action
WITH n AS (SELECT e.EscalationId, e.SiteKey, e.AreaKey, e.ActionId, e.Title, e.Detail, r.NotifyRoles, r.ToEmail FROM @new w JOIN app.Escalation e ON e.EscalationId = w.EscalationId JOIN ctl.EscalationRule r ON r.RuleId = w.RuleId),
p AS (SELECT n.EscalationId, u.UserId, u.Email FROM n JOIN app.UserSiteRole ur ON ur.SiteKey = n.SiteKey AND (ur.AreaKey = '' OR ur.AreaKey = ISNULL(n.AreaKey, ''))
AND ur.Role IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(n.NotifyRoles, ',')) JOIN app.AppUser u ON u.UserId = ur.UserId AND u.IsActive = 1
UNION SELECT n.EscalationId, u.UserId, u.Email FROM n JOIN app.Action a ON a.ActionId = n.ActionId JOIN app.AppUser u ON u.UserId = a.OwnerUserId AND u.IsActive = 1)
INSERT app.Notification (SiteKey, EscalationId, ActionId, Channel, RecipientUserId, Address, Subject, Body, DeepLink, Status, CreatedUtc, NotBeforeUtc, SentUtc)
SELECT n.SiteKey, n.EscalationId, n.ActionId, ch.Channel, p.UserId, CASE WHEN ch.Channel = 'Email' THEN p.Email END, n.Title, n.Detail, CONCAT('/escalations/', n.EscalationId),
CASE WHEN ch.Channel = 'InApp' THEN 'Sent' WHEN s.Live = 1 THEN 'Pending' ELSE 'Suppressed' END, @now, @now, CASE WHEN ch.Channel = 'InApp' THEN @now END
FROM n JOIN p ON p.EscalationId = n.EscalationId JOIN @st s ON s.SiteKey = n.SiteKey
CROSS APPLY (SELECT 'InApp' AS Channel UNION ALL SELECT 'Email' WHERE n.ToEmail = 1) ch;

-- Teams channels and email lists set up for the site or area
INSERT app.Notification (SiteKey, EscalationId, ActionId, Channel, Address, Subject, Body, DeepLink, Status, CreatedUtc, NotBeforeUtc)
SELECT e.SiteKey, e.EscalationId, e.ActionId, t.Channel, t.Address, e.Title, e.Detail, CONCAT('/escalations/', e.EscalationId),
CASE WHEN s.Live = 1 AND t.IsActive = 1 THEN 'Pending' ELSE 'Suppressed' END, @now, @now
FROM @new w JOIN app.Escalation e ON e.EscalationId = w.EscalationId JOIN ctl.EscalationRule r ON r.RuleId = w.RuleId JOIN @st s ON s.SiteKey = e.SiteKey
JOIN ctl.NotificationTarget t ON t.SiteKey = e.SiteKey AND (t.AreaKey = '' OR t.AreaKey = ISNULL(e.AreaKey, '')) AND t.MinLvl <= e.Lvl
AND ((t.Channel = 'Teams' AND r.ToTeams = 1) OR (t.Channel = 'Email' AND r.ToEmail = 1));

DROP TABLE #h;
EXEC sp_releaseapplock @Resource = N'SIC_Escalate', @LockOwner = 'Session';
SELECT e.SiteKey, e.RuleType, e.Lvl, COUNT(*) AS Raised FROM @new w JOIN app.Escalation e ON e.EscalationId = w.EscalationId GROUP BY e.SiteKey, e.RuleType, e.Lvl;
END TRY
BEGIN CATCH
IF OBJECT_ID(N'tempdb..#h') IS NOT NULL DROP TABLE #h;
EXEC sp_releaseapplock @Resource = N'SIC_Escalate', @LockOwner = 'Session';
THROW;
END CATCH
END;

-- 15b. The worker takes up to @Batch Teams and email notices to send, with a lease so two workers never send the same one.
CREATE OR ALTER PROCEDURE app.usp_ClaimNotifications @Batch int = 20, @LeaseSecs int = 120
AS
BEGIN
SET NOCOUNT ON;
DECLARE @now datetime2(3) = SYSUTCDATETIME();
UPDATE TOP (@Batch) n SET Status = 'Sending', Attempts = Attempts + 1, LeaseUntilUtc = DATEADD(second, @LeaseSecs, @now)
OUTPUT inserted.NotificationId, inserted.SiteKey, inserted.Channel, inserted.Address, inserted.Subject, inserted.Body, inserted.DeepLink, inserted.EscalationId, inserted.Attempts
FROM app.Notification n WITH (READPAST, UPDLOCK, ROWLOCK)
WHERE n.Channel IN ('Teams', 'Email') AND n.NotBeforeUtc <= @now AND n.Attempts < 5 AND (n.Status = 'Pending' OR (n.Status = 'Sending' AND n.LeaseUntilUtc < @now));
END;

-- 15c. The worker reports back. A failure retries after 2, 4, 8 and 16 minutes, then stays Failed.
CREATE OR ALTER PROCEDURE app.usp_CompleteNotification @NotificationId bigint, @Ok bit, @Error nvarchar(1000) = NULL
AS
BEGIN
SET NOCOUNT ON;
UPDATE app.Notification SET Status = CASE WHEN @Ok = 1 THEN 'Sent' WHEN Attempts >= 5 THEN 'Failed' ELSE 'Pending' END,
SentUtc = CASE WHEN @Ok = 1 THEN SYSUTCDATETIME() END, LeaseUntilUtc = NULL,
NotBeforeUtc = CASE WHEN @Ok = 1 THEN NotBeforeUtc ELSE DATEADD(minute, POWER(2, Attempts), SYSUTCDATETIME()) END,
LastError = CASE WHEN @Ok = 1 THEN NULL ELSE LEFT(@Error, 1000) END
WHERE NotificationId = @NotificationId AND Status = 'Sending';
SELECT @@ROWCOUNT AS Updated;
END;

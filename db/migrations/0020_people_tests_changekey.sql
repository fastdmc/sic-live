-- SIC app, step 20: owner picker, admin test notices and preview, and a change key so screens refetch after anyone's comment or action. Each block is its own batch.

-- 20a. People at a site, for owner pickers. Any role at the site; floor screens cannot call it.
CREATE OR ALTER PROCEDURE app.usp_GetSitePeople @SiteKey varchar(10), @Query nvarchar(100) = NULL
AS
BEGIN
SET NOCOUNT ON;
IF IS_MEMBER(N'sic_app_role') = 1 AND NOT EXISTS (SELECT 1 FROM app.fnSiteAccess(@SiteKey)) THROW 50651, N'No access to this site', 1;
IF app.fnCurrentUserId() IS NULL AND SESSION_CONTEXT(N'DeviceSiteKey') IS NOT NULL THROW 50652, N'Floor screens cannot list people', 1;
SELECT TOP 50 u.UserId, u.DisplayName
FROM app.AppUser u
WHERE u.IsActive = 1 AND EXISTS (SELECT 1 FROM app.UserSiteRole r WHERE r.UserId = u.UserId AND r.SiteKey = @SiteKey)
AND (@Query IS NULL OR u.DisplayName LIKE N'%' + @Query + N'%' OR u.Email LIKE N'%' + @Query + N'%')
ORDER BY u.DisplayName;
END;

-- 20b. Queue a test notice to one Teams or email target (site admin; the target must be active). The worker sends it like any other.
CREATE OR ALTER PROCEDURE app.usp_QueueTestNotification @TargetId int
AS
BEGIN
SET NOCOUNT, XACT_ABORT ON;
DECLARE @me int = app.fnCurrentUserId(), @s varchar(10), @ch varchar(10), @addr nvarchar(400), @active bit, @id bigint;
SELECT @s = SiteKey, @ch = Channel, @addr = Address, @active = IsActive FROM ctl.NotificationTarget WHERE TargetId = @TargetId;
IF @s IS NULL THROW 50661, N'Notification target not found', 1;
IF app.fnRoleRank(@me, @s, '') < 5 THROW 50641, N'Managing a site needs the site admin role', 1;
IF @active = 0 THROW 50662, N'Switch the target on before sending a test', 1;
INSERT app.Notification (SiteKey, Channel, Address, Subject, Body, DeepLink, Status)
VALUES (@s, @ch, @addr, CONCAT(N'Test from SIC Live for ', @s), N'Sent from the SIC Live admin screen to check this channel. No action needed.', N'/', 'Pending');
SET @id = SCOPE_IDENTITY();
INSERT app.AuditLog (UserId, SiteKey, Entity, EntityId, Verb, Detail) VALUES (@me, @s, 'NotificationTarget', CAST(@TargetId AS nvarchar(60)), 'Test', @ch);
SELECT @id AS NotificationId;
END;

-- 20c. What the site's notifications did (or would have done) over the last N days, for the notifications-live confirmation.
CREATE OR ALTER PROCEDURE app.usp_GetNotificationPreview @SiteKey varchar(10), @Days int = 7
AS
BEGIN
SET NOCOUNT ON;
IF app.fnRoleRank(app.fnCurrentUserId(), @SiteKey, '') < 5 THROW 50641, N'Managing a site needs the site admin role', 1;
SELECT Channel, Status, COUNT(*) AS Notices, COUNT(DISTINCT EscalationId) AS Escalations, COUNT(DISTINCT CONCAT(Address, '|', CONVERT(varchar(16), CreatedUtc, 126))) AS TeamsPostsOrEmails
FROM app.Notification WHERE SiteKey = @SiteKey AND CreatedUtc >= DATEADD(day, -@Days, SYSUTCDATETIME())
GROUP BY Channel, Status ORDER BY Channel, Status;
END;

-- 20d. Freshness with a change key: moves on every SIC refresh AND on any comment, action change or escalation change at the site.
CREATE OR ALTER PROCEDURE app.usp_GetSicVersion @SiteKey varchar(10)
AS
BEGIN
-- Cheap freshness check the screens poll every 30 s. Version moves on each SIC refresh; ChangeKey also moves on any comment, action update or escalation change.
SET NOCOUNT ON;
IF IS_MEMBER(N'sic_app_role') = 1 AND NOT EXISTS (SELECT 1 FROM app.fnSiteAccess(@SiteKey)) THROW 50651, N'No access to this site', 1;
SELECT s.SiteKey, ISNULL(r.Version, 0) AS Version, r.LastEndUtc AS RefreshedUtc, CAST(ISNULL(r.Pending, 0) AS bit) AS Pending, r.LastFrom, r.LastTo,
(SELECT MAX(h.ProductionDate) FROM curated.SIC_Hourly h WHERE h.SiteKey = s.SiteKey) AS LatestDay,
CONCAT(ISNULL(r.Version, 0), '.', (SELECT ISNULL(MAX(c.CommentId), 0) FROM app.HourComment c WHERE c.SiteKey = s.SiteKey),
'.', (SELECT ISNULL(MAX(u.UpdateId), 0) FROM app.ActionUpdate u WHERE u.SiteKey = s.SiteKey),
'.', (SELECT ISNULL(MAX(e.EscalationId), 0) FROM app.Escalation e WHERE e.SiteKey = s.SiteKey),
'.', (SELECT ISNULL(CONVERT(varchar(23), MAX(CASE WHEN e.ResolvedUtc > ISNULL(e.AckUtc, '19000101') THEN e.ResolvedUtc ELSE e.AckUtc END), 126), '0') FROM app.Escalation e WHERE e.SiteKey = s.SiteKey)) AS ChangeKey
FROM ctl.Site s LEFT JOIN ctl.SIC_RefreshState r ON r.SiteKey = s.SiteKey WHERE s.SiteKey = @SiteKey;
END;

-- 20e. Grants and record.
GRANT EXECUTE ON app.usp_GetSitePeople TO sic_app_role;
GRANT EXECUTE ON app.usp_QueueTestNotification TO sic_app_role;
GRANT EXECUTE ON app.usp_GetNotificationPreview TO sic_app_role;
INSERT ctl.SchemaMigration (MigrationId, Notes) SELECT '0020_people_tests_changekey', N'SIC app 20' WHERE NOT EXISTS (SELECT 1 FROM ctl.SchemaMigration WHERE MigrationId = '0020_people_tests_changekey');
EXEC app.usp_GetSicVersion @SiteKey = 'HFI';

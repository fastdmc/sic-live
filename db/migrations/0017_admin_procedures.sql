-- SIC app, step 17: what the admin screens call. Each block is its own batch. All need the site admin role at that site (or group admin).

-- 17a. Users and roles at a site.
CREATE OR ALTER PROCEDURE app.usp_GetSiteUsers @SiteKey varchar(10)
AS
BEGIN
SET NOCOUNT ON;
IF app.fnRoleRank(app.fnCurrentUserId(), @SiteKey, '') < 5 THROW 50641, N'Managing a site needs the site admin role', 1;
SELECT u.UserId, u.Email, u.DisplayName, u.JobTitle, u.IsActive, u.LastSeenUtc, r.AreaKey, r.Role, r.GrantedUtc
FROM app.UserSiteRole r JOIN app.AppUser u ON u.UserId = r.UserId WHERE r.SiteKey = @SiteKey ORDER BY u.DisplayName, r.AreaKey, r.Role;
END;

-- 17b. Site settings: RAG limits, comment deadline, and the switch that lets Teams and email leave the database.
CREATE OR ALTER PROCEDURE app.usp_SaveSiteSettings @SiteKey varchar(10), @RagGreenPct decimal(5,2) = NULL, @RagAmberPct decimal(5,2) = NULL, @RagMinAvailMins int = NULL,
@CommentDueMins int = NULL, @NotificationsLive bit = NULL, @LiveFromUtc datetime2(0) = NULL
AS
BEGIN
SET NOCOUNT, XACT_ABORT ON;
DECLARE @me int = app.fnCurrentUserId();
IF app.fnRoleRank(@me, @SiteKey, '') < 5 THROW 50641, N'Managing a site needs the site admin role', 1;
IF ISNULL(@RagAmberPct, 0) > ISNULL(@RagGreenPct, 100) THROW 50644, N'Amber limit must be below the green limit', 1;
UPDATE ctl.Site SET RagGreenPct = ISNULL(@RagGreenPct, RagGreenPct), RagAmberPct = ISNULL(@RagAmberPct, RagAmberPct), RagMinAvailMins = ISNULL(@RagMinAvailMins, RagMinAvailMins),
CommentDueMins = ISNULL(@CommentDueMins, CommentDueMins), NotificationsLive = ISNULL(@NotificationsLive, NotificationsLive), LiveFromUtc = ISNULL(@LiveFromUtc, LiveFromUtc), ModifiedUtc = SYSUTCDATETIME()
WHERE SiteKey = @SiteKey;
INSERT app.AuditLog (UserId, SiteKey, Entity, EntityId, Verb, Detail) VALUES (@me, @SiteKey, 'Site', @SiteKey, 'Update', CONCAT(N'live ', @NotificationsLive, N' green ', @RagGreenPct, N' amber ', @RagAmberPct));
SELECT * FROM ctl.Site WHERE SiteKey = @SiteKey;
END;

-- 17c. Areas and lines.
CREATE OR ALTER PROCEDURE app.usp_SaveArea @SiteKey varchar(10), @AreaKey varchar(20), @AreaName nvarchar(50), @DisplayOrder int = 0
AS
BEGIN
SET NOCOUNT, XACT_ABORT ON;
DECLARE @me int = app.fnCurrentUserId();
IF app.fnRoleRank(@me, @SiteKey, '') < 5 THROW 50641, N'Managing a site needs the site admin role', 1;
MERGE ctl.Area AS t USING (SELECT @SiteKey AS s, @AreaKey AS a) AS x ON t.SiteKey = x.s AND t.AreaKey = x.a
WHEN MATCHED THEN UPDATE SET AreaName = @AreaName, DisplayOrder = @DisplayOrder
WHEN NOT MATCHED THEN INSERT (SiteKey, AreaKey, AreaName, DisplayOrder) VALUES (@SiteKey, @AreaKey, @AreaName, @DisplayOrder);
INSERT app.AuditLog (UserId, SiteKey, Entity, EntityId, Verb, Detail) VALUES (@me, @SiteKey, 'Area', @AreaKey, 'Save', @AreaName);
SELECT * FROM ctl.Area WHERE SiteKey = @SiteKey ORDER BY DisplayOrder, AreaKey;
END;

CREATE OR ALTER PROCEDURE app.usp_SaveLine @SiteKey varchar(10), @LineNo int, @LineName nvarchar(50), @AreaKey varchar(20) = NULL, @CellName nvarchar(50) = NULL, @DisplayOrder int = NULL, @IsActive bit = 1
AS
BEGIN
SET NOCOUNT, XACT_ABORT ON;
DECLARE @me int = app.fnCurrentUserId();
IF app.fnRoleRank(@me, @SiteKey, '') < 5 THROW 50641, N'Managing a site needs the site admin role', 1;
IF @AreaKey IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ctl.Area WHERE SiteKey = @SiteKey AND AreaKey = @AreaKey) THROW 50643, N'Unknown area for this site', 1;
MERGE ctl.Line AS t USING (SELECT @SiteKey AS s, @LineNo AS n) AS x ON t.SiteKey = x.s AND t.[LineNo] = x.n
WHEN MATCHED THEN UPDATE SET LineName = @LineName, AreaKey = @AreaKey, CellName = @CellName, DisplayOrder = ISNULL(@DisplayOrder, t.DisplayOrder), IsActive = @IsActive
WHEN NOT MATCHED THEN INSERT (SiteKey, [LineNo], LineName, AreaKey, CellName, DisplayOrder, IsActive) VALUES (@SiteKey, @LineNo, @LineName, @AreaKey, @CellName, ISNULL(@DisplayOrder, @LineNo), @IsActive);
INSERT app.AuditLog (UserId, SiteKey, Entity, EntityId, Verb, Detail) VALUES (@me, @SiteKey, 'Line', CAST(@LineNo AS nvarchar(60)), 'Save', CONCAT(@LineName, N' ', @AreaKey, N' ', @CellName));
SELECT * FROM ctl.Line WHERE SiteKey = @SiteKey AND [LineNo] = @LineNo;
END;

-- 17d. Reason codes for red-hour comments.
CREATE OR ALTER PROCEDURE app.usp_SaveReasonCode @SiteKey varchar(10), @ReasonCode varchar(20), @ReasonName nvarchar(80), @LossCategory varchar(20), @DisplayOrder int = 0, @IsActive bit = 1
AS
BEGIN
SET NOCOUNT, XACT_ABORT ON;
DECLARE @me int = app.fnCurrentUserId();
IF app.fnRoleRank(@me, @SiteKey, '') < 5 THROW 50641, N'Managing a site needs the site admin role', 1;
MERGE ctl.ReasonCode AS t USING (SELECT @SiteKey AS s, UPPER(@ReasonCode) AS c) AS x ON t.SiteKey = x.s AND t.ReasonCode = x.c
WHEN MATCHED THEN UPDATE SET ReasonName = @ReasonName, LossCategory = @LossCategory, DisplayOrder = @DisplayOrder, IsActive = @IsActive
WHEN NOT MATCHED THEN INSERT (SiteKey, ReasonCode, ReasonName, LossCategory, DisplayOrder, IsActive) VALUES (@SiteKey, UPPER(@ReasonCode), @ReasonName, @LossCategory, @DisplayOrder, @IsActive);
INSERT app.AuditLog (UserId, SiteKey, Entity, EntityId, Verb, Detail) VALUES (@me, @SiteKey, 'ReasonCode', UPPER(@ReasonCode), 'Save', @ReasonName);
SELECT * FROM ctl.ReasonCode WHERE SiteKey = @SiteKey ORDER BY DisplayOrder, ReasonCode;
END;

-- 17e. Escalation rules and notification targets.
CREATE OR ALTER PROCEDURE app.usp_SaveEscalationRule @RuleId int = NULL, @SiteKey varchar(10), @AreaKey varchar(20) = '', @RuleType varchar(30), @Lvl tinyint, @Threshold decimal(9,2) = NULL,
@DelayMins int = 0, @NotifyRoles varchar(100), @ToTeams bit = 0, @ToEmail bit = 0, @EscalateAfterMins int = NULL, @IsActive bit = 1, @Description nvarchar(300) = NULL
AS
BEGIN
SET NOCOUNT, XACT_ABORT ON;
DECLARE @me int = app.fnCurrentUserId();
IF app.fnRoleRank(@me, @SiteKey, '') < 5 THROW 50641, N'Managing a site needs the site admin role', 1;
IF EXISTS (SELECT 1 FROM STRING_SPLIT(@NotifyRoles, ',') WHERE LTRIM(RTRIM(value)) NOT IN ('Viewer', 'LineLeader', 'AreaManager', 'SiteManager', 'SiteAdmin')) THROW 50645, N'Unknown role in NotifyRoles', 1;
IF @RuleId IS NULL
BEGIN
INSERT ctl.EscalationRule (SiteKey, AreaKey, RuleType, Lvl, Threshold, DelayMins, NotifyRoles, ToTeams, ToEmail, EscalateAfterMins, IsActive, Description)
VALUES (@SiteKey, ISNULL(@AreaKey, ''), @RuleType, @Lvl, @Threshold, @DelayMins, @NotifyRoles, @ToTeams, @ToEmail, @EscalateAfterMins, @IsActive, @Description);
SET @RuleId = SCOPE_IDENTITY();
END
ELSE
UPDATE ctl.EscalationRule SET AreaKey = ISNULL(@AreaKey, ''), RuleType = @RuleType, Lvl = @Lvl, Threshold = @Threshold, DelayMins = @DelayMins, NotifyRoles = @NotifyRoles,
ToTeams = @ToTeams, ToEmail = @ToEmail, EscalateAfterMins = @EscalateAfterMins, IsActive = @IsActive, Description = @Description
WHERE RuleId = @RuleId AND SiteKey = @SiteKey;
INSERT app.AuditLog (UserId, SiteKey, Entity, EntityId, Verb, Detail) VALUES (@me, @SiteKey, 'EscalationRule', CAST(@RuleId AS nvarchar(60)), 'Save', CONCAT(@RuleType, N' L', @Lvl));
SELECT * FROM ctl.EscalationRule WHERE RuleId = @RuleId;
END;

CREATE OR ALTER PROCEDURE app.usp_SaveNotificationTarget @TargetId int = NULL, @SiteKey varchar(10), @AreaKey varchar(20) = '', @Channel varchar(10), @Address nvarchar(400),
@MinLvl tinyint = 2, @IsActive bit = 0, @Description nvarchar(200) = NULL
AS
BEGIN
-- For Teams, Address is the Key Vault secret name that holds the Workflows webhook URL. A URL here is refused so it never sits in the database.
SET NOCOUNT, XACT_ABORT ON;
DECLARE @me int = app.fnCurrentUserId();
IF app.fnRoleRank(@me, @SiteKey, '') < 5 THROW 50641, N'Managing a site needs the site admin role', 1;
IF @Channel = 'Teams' AND (@Address LIKE N'http%' OR @Address LIKE N'%/%') THROW 50646, N'For Teams, give the Key Vault secret name, not the webhook URL', 1;
IF @TargetId IS NULL
BEGIN
INSERT ctl.NotificationTarget (SiteKey, AreaKey, Channel, Address, MinLvl, IsActive, Description) VALUES (@SiteKey, ISNULL(@AreaKey, ''), @Channel, @Address, @MinLvl, @IsActive, @Description);
SET @TargetId = SCOPE_IDENTITY();
END
ELSE
UPDATE ctl.NotificationTarget SET AreaKey = ISNULL(@AreaKey, ''), Channel = @Channel, Address = @Address, MinLvl = @MinLvl, IsActive = @IsActive, Description = @Description
WHERE TargetId = @TargetId AND SiteKey = @SiteKey;
INSERT app.AuditLog (UserId, SiteKey, Entity, EntityId, Verb, Detail) VALUES (@me, @SiteKey, 'NotificationTarget', CAST(@TargetId AS nvarchar(60)), 'Save', CONCAT(@Channel, N' active ', @IsActive));
SELECT * FROM ctl.NotificationTarget WHERE TargetId = @TargetId;
END;

-- 17f. Floor TV keys. The API makes a random key, shows it once, and stores only its SHA-256 hash here.
CREATE OR ALTER PROCEDURE app.usp_SaveDeviceKey @DeviceKeyId int = NULL, @SiteKey varchar(10), @AreaKey varchar(20) = NULL, @LineNo int = NULL, @DeviceName nvarchar(100) = NULL,
@KeyHash varbinary(32) = NULL, @ExpiresUtc datetime2(0) = NULL, @Revoke bit = 0
AS
BEGIN
SET NOCOUNT, XACT_ABORT ON;
DECLARE @me int = app.fnCurrentUserId();
IF app.fnRoleRank(@me, @SiteKey, '') < 5 THROW 50641, N'Managing a site needs the site admin role', 1;
IF @DeviceKeyId IS NULL
BEGIN
IF @KeyHash IS NULL OR DATALENGTH(@KeyHash) <> 32 THROW 50647, N'A new device key needs a 32-byte SHA-256 hash', 1;
INSERT ctl.DeviceKey (SiteKey, AreaKey, [LineNo], DeviceName, KeyHash, ExpiresUtc) VALUES (@SiteKey, @AreaKey, @LineNo, ISNULL(@DeviceName, N'Floor screen'), @KeyHash, @ExpiresUtc);
SET @DeviceKeyId = SCOPE_IDENTITY();
END
ELSE IF @Revoke = 1 UPDATE ctl.DeviceKey SET RevokedUtc = SYSUTCDATETIME() WHERE DeviceKeyId = @DeviceKeyId AND SiteKey = @SiteKey;
ELSE UPDATE ctl.DeviceKey SET DeviceName = ISNULL(@DeviceName, DeviceName), AreaKey = @AreaKey, [LineNo] = @LineNo, ExpiresUtc = @ExpiresUtc WHERE DeviceKeyId = @DeviceKeyId AND SiteKey = @SiteKey;
INSERT app.AuditLog (UserId, SiteKey, Entity, EntityId, Verb, Detail) VALUES (@me, @SiteKey, 'DeviceKey', CAST(@DeviceKeyId AS nvarchar(60)), CASE WHEN @Revoke = 1 THEN 'Revoke' ELSE 'Save' END, @DeviceName);
SELECT DeviceKeyId, SiteKey, AreaKey, [LineNo], DeviceName, CreatedUtc, ExpiresUtc, RevokedUtc, LastSeenUtc FROM ctl.DeviceKey WHERE SiteKey = @SiteKey ORDER BY DeviceKeyId;
END;

-- 17g. Products the SIC cannot name: Omega article keys with no SAP code, and the fix.
CREATE OR ALTER PROCEDURE app.usp_GetArticleKeyGaps @SiteKey varchar(10), @Days int = 14
AS
BEGIN
SET NOCOUNT ON;
IF app.fnRoleRank(app.fnCurrentUserId(), @SiteKey, '') < 5 THROW 50641, N'Managing a site needs the site admin role', 1;
SELECT h.Product AS ArticleKey, COUNT(*) AS Hours, SUM(h.ActualPacks) AS Packs, MIN(h.ProductionDate) AS FirstSeen, MAX(h.ProductionDate) AS LastSeen, MIN(h.[LineNo]) AS ExampleLine
FROM curated.SIC_Hourly h
WHERE h.SiteKey = @SiteKey AND h.ProductionDate >= DATEADD(day, -@Days, CAST(SYSUTCDATETIME() AS date)) AND h.Product IS NOT NULL AND h.ProductSAP IS NULL
GROUP BY h.Product ORDER BY SUM(h.ActualPacks) DESC;
END;

CREATE OR ALTER PROCEDURE app.usp_SaveArticleKeyMap @SiteKey varchar(10), @ArticleKey nvarchar(50), @SAPNumber nvarchar(100), @ArticleName nvarchar(400) = NULL
AS
BEGIN
-- Also fills the SAP code on hours already in curated.SIC_Hourly, so the fix shows straight away.
SET NOCOUNT, XACT_ABORT ON;
DECLARE @me int = app.fnCurrentUserId(), @n int;
IF app.fnRoleRank(@me, @SiteKey, '') < 5 THROW 50641, N'Managing a site needs the site admin role', 1;
BEGIN TRAN;
MERGE ctl.ArticleKeyMap AS t USING (SELECT @SiteKey AS s, @ArticleKey AS k) AS x ON t.SiteKey = x.s AND t.ArticleKey = x.k
WHEN MATCHED THEN UPDATE SET SAPNumber = @SAPNumber, ArticleName = ISNULL(@ArticleName, t.ArticleName), Source = N'SIC admin', UpdatedUtc = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (SiteKey, ArticleKey, SAPNumber, ArticleName, Source) VALUES (@SiteKey, @ArticleKey, @SAPNumber, @ArticleName, N'SIC admin');
UPDATE curated.SIC_Hourly SET ProductSAP = @SAPNumber, ProductName = ISNULL(@ArticleName, ProductName) WHERE SiteKey = @SiteKey AND Product = @ArticleKey;
SET @n = @@ROWCOUNT;
INSERT app.AuditLog (UserId, SiteKey, Entity, EntityId, Verb, Detail) VALUES (@me, @SiteKey, 'ArticleKeyMap', @ArticleKey, 'Save', CONCAT(@SAPNumber, N', hours updated ', @n));
COMMIT;
SELECT @n AS HoursUpdated;
END;

-- 17h. Grants for the admin screens.
GRANT EXECUTE ON app.usp_GetSiteUsers TO sic_app_role;
GRANT EXECUTE ON app.usp_SaveSiteSettings TO sic_app_role;
GRANT EXECUTE ON app.usp_SaveArea TO sic_app_role;
GRANT EXECUTE ON app.usp_SaveLine TO sic_app_role;
GRANT EXECUTE ON app.usp_SaveReasonCode TO sic_app_role;
GRANT EXECUTE ON app.usp_SaveEscalationRule TO sic_app_role;
GRANT EXECUTE ON app.usp_SaveNotificationTarget TO sic_app_role;
GRANT EXECUTE ON app.usp_SaveDeviceKey TO sic_app_role;
GRANT EXECUTE ON app.usp_GetArticleKeyGaps TO sic_app_role;
GRANT EXECUTE ON app.usp_SaveArticleKeyMap TO sic_app_role;
GRANT SELECT ON ctl.NotificationTarget TO sic_app_role;
GRANT SELECT (DeviceKeyId, SiteKey, AreaKey, [LineNo], DeviceName, CreatedUtc, ExpiresUtc, RevokedUtc, LastSeenUtc) ON ctl.DeviceKey TO sic_app_role;
INSERT ctl.SchemaMigration (MigrationId, Notes) SELECT '0017_admin_procedures', N'SIC app 17' WHERE NOT EXISTS (SELECT 1 FROM ctl.SchemaMigration WHERE MigrationId = '0017_admin_procedures');
SELECT COUNT(*) AS AdminProcs FROM sys.procedures WHERE SCHEMA_NAME(schema_id) = 'app' AND name IN ('usp_GetSiteUsers', 'usp_SaveSiteSettings', 'usp_SaveArea', 'usp_SaveLine', 'usp_SaveReasonCode', 'usp_SaveEscalationRule', 'usp_SaveNotificationTarget', 'usp_SaveDeviceKey', 'usp_GetArticleKeyGaps', 'usp_SaveArticleKeyMap');

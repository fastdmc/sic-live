-- SIC app, step 14: the only way the app writes. Each block is its own batch.
-- Every procedure takes the caller from SESSION_CONTEXT (app.fnCurrentUserId), never from a parameter, so the API cannot act as someone else.

-- 14a. Sign-in: find or create the person, link this identity, return the user and their roles. Called once per sign-in.
CREATE OR ALTER PROCEDURE app.usp_UpsertUser @TenantId uniqueidentifier, @ObjectId uniqueidentifier, @Email nvarchar(256), @DisplayName nvarchar(200), @Upn nvarchar(256) = NULL, @IsGuest bit = 0, @JobTitle nvarchar(200) = NULL
AS
BEGIN
SET NOCOUNT, XACT_ABORT ON;
DECLARE @UserId int, @e nvarchar(256) = LOWER(LTRIM(RTRIM(@Email)));
SELECT @UserId = UserId FROM app.UserIdentity WHERE TenantId = @TenantId AND ObjectId = @ObjectId;
IF @UserId IS NULL SELECT @UserId = UserId FROM app.AppUser WHERE Email = @e;
BEGIN TRAN;
IF @UserId IS NULL
BEGIN
INSERT app.AppUser (Email, DisplayName, JobTitle) VALUES (@e, @DisplayName, @JobTitle);
SET @UserId = SCOPE_IDENTITY();
END
IF NOT EXISTS (SELECT 1 FROM app.UserIdentity WHERE TenantId = @TenantId AND ObjectId = @ObjectId)
INSERT app.UserIdentity (TenantId, ObjectId, UserId, Upn, IsGuest) VALUES (@TenantId, @ObjectId, @UserId, @Upn, @IsGuest);
UPDATE app.UserIdentity SET LastSeenUtc = SYSUTCDATETIME(), Upn = ISNULL(@Upn, Upn) WHERE TenantId = @TenantId AND ObjectId = @ObjectId;
UPDATE app.AppUser SET LastSeenUtc = SYSUTCDATETIME(), DisplayName = @DisplayName, JobTitle = ISNULL(@JobTitle, JobTitle) WHERE UserId = @UserId;
COMMIT;
SELECT UserId, Email, DisplayName, IsActive, IsGroupAdmin FROM app.AppUser WHERE UserId = @UserId;
SELECT SiteKey, AreaKey, Role FROM app.UserSiteRole WHERE UserId = @UserId ORDER BY SiteKey, AreaKey, Role;
END;

-- 14b. Comment on an hour, optionally raising a corrective action in the same step. Line leader or above at that site and area.
CREATE OR ALTER PROCEDURE app.usp_AddHourComment @SiteKey varchar(10), @LineNo int, @HourStart datetime2(3), @Issue nvarchar(1000), @ReasonCode varchar(20) = NULL,
@ContainmentAction nvarchar(1000) = NULL, @HelpCalledAt datetime2(0) = NULL, @HelpArrivedAt datetime2(0) = NULL,
@ActionTitle nvarchar(200) = NULL, @ActionType varchar(20) = 'Corrective', @ActionOwnerUserId int = NULL, @ActionOwnerName nvarchar(100) = NULL, @ActionDueDate date = NULL
AS
BEGIN
SET NOCOUNT, XACT_ABORT ON;
DECLARE @me int = app.fnCurrentUserId(), @pd date, @rag char(1), @a int, @t int, @area varchar(20), @cid bigint, @aid bigint;
SELECT @pd = ProductionDate, @rag = SiteRAG, @a = ActualPacks, @t = TargetPacks, @area = AreaKey FROM curated.vSIC_HourlyApp WHERE SiteKey = @SiteKey AND [LineNo] = @LineNo AND HourStart = @HourStart;
IF @pd IS NULL THROW 50601, N'No SIC hour for that site, line and hour', 1;
IF app.fnRoleRank(@me, @SiteKey, @area) < 2 THROW 50602, N'Commenting needs the line leader role or above for this line', 1;
IF LEN(LTRIM(RTRIM(ISNULL(@Issue, N'')))) = 0 THROW 50603, N'Say what the issue was', 1;
IF @ReasonCode IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ctl.ReasonCode WHERE SiteKey = @SiteKey AND ReasonCode = @ReasonCode AND IsActive = 1) THROW 50604, N'Unknown reason code for this site', 1;
BEGIN TRAN;
INSERT app.HourComment (SiteKey, ProductionDate, [LineNo], HourStart, ReasonCode, Issue, ContainmentAction, HelpCalledAt, HelpArrivedAt, RagAtEntry, ActualAtEntry, TargetAtEntry, CreatedBy)
VALUES (@SiteKey, @pd, @LineNo, @HourStart, @ReasonCode, LTRIM(RTRIM(@Issue)), @ContainmentAction, @HelpCalledAt, @HelpArrivedAt, @rag, @a, @t, @me);
SET @cid = SCOPE_IDENTITY();
IF LEN(LTRIM(RTRIM(ISNULL(@ActionTitle, N'')))) > 0
BEGIN
INSERT app.Action (SiteKey, [LineNo], AreaKey, CommentId, ProductionDate, HourStart, ActionType, Title, OwnerUserId, OwnerName, DueDate, CreatedBy)
VALUES (@SiteKey, @LineNo, @area, @cid, @pd, @HourStart, @ActionType, LTRIM(RTRIM(@ActionTitle)), @ActionOwnerUserId, @ActionOwnerName, @ActionDueDate, @me);
SET @aid = SCOPE_IDENTITY();
INSERT app.ActionUpdate (ActionId, SiteKey, UpdateType, NewValue, ByUserId) VALUES (@aid, @SiteKey, 'Created', N'Open', @me);
END
UPDATE app.Escalation SET Status = 'Resolved', ResolvedUtc = SYSUTCDATETIME(), ResolvedBy = @me, ResolvedReason = N'Comment added'
WHERE SiteKey = @SiteKey AND RuleType = 'RedNoComment' AND [LineNo] = @LineNo AND HourStart = @HourStart AND Status IN ('Open', 'Acknowledged');
INSERT app.AuditLog (UserId, SiteKey, Entity, EntityId, Verb, Detail) VALUES (@me, @SiteKey, 'HourComment', CAST(@cid AS nvarchar(60)), 'Create', CONCAT(N'Line ', @LineNo, N' ', CONVERT(nvarchar(16), @HourStart, 120)));
COMMIT;
SELECT @cid AS CommentId, @aid AS ActionId;
END;

-- 14c. Create or update a corrective action. Every change of status, owner or due date is kept in app.ActionUpdate.
-- Verified needs area manager or above. Done can be set by the owner or a line leader. Closing an action resolves its overdue escalation.
CREATE OR ALTER PROCEDURE app.usp_SaveAction @ActionId bigint = NULL, @SiteKey varchar(10) = NULL, @LineNo int = NULL, @CommentId bigint = NULL, @EscalationId bigint = NULL,
@ActionType varchar(20) = NULL, @Title nvarchar(200) = NULL, @Detail nvarchar(2000) = NULL, @OwnerUserId int = NULL, @OwnerName nvarchar(100) = NULL,
@DueDate date = NULL, @Status varchar(20) = NULL, @Priority tinyint = NULL, @Note nvarchar(1000) = NULL
AS
BEGIN
SET NOCOUNT, XACT_ABORT ON;
DECLARE @me int = app.fnCurrentUserId(), @area varchar(20), @old varchar(20), @oldOwner int, @oldDue date, @rank int, @hs datetime2(3), @pd date;
IF @ActionId IS NULL
BEGIN
IF @SiteKey IS NULL OR LEN(LTRIM(RTRIM(ISNULL(@Title, N'')))) = 0 THROW 50611, N'A new action needs a site and a title', 1;
SELECT @hs = HourStart, @pd = ProductionDate, @LineNo = ISNULL(@LineNo, [LineNo]) FROM app.HourComment WHERE CommentId = @CommentId AND SiteKey = @SiteKey;
SELECT @area = AreaKey FROM ctl.Line WHERE SiteKey = @SiteKey AND [LineNo] = @LineNo;
IF app.fnRoleRank(@me, @SiteKey, @area) < 2 THROW 50612, N'Raising an action needs the line leader role or above', 1;
BEGIN TRAN;
INSERT app.Action (SiteKey, [LineNo], AreaKey, CommentId, EscalationId, ProductionDate, HourStart, ActionType, Title, Detail, OwnerUserId, OwnerName, DueDate, Priority, CreatedBy)
VALUES (@SiteKey, @LineNo, @area, @CommentId, @EscalationId, @pd, @hs, ISNULL(@ActionType, 'Corrective'), LTRIM(RTRIM(@Title)), @Detail, @OwnerUserId, @OwnerName, @DueDate, ISNULL(@Priority, 2), @me);
SET @ActionId = SCOPE_IDENTITY();
INSERT app.ActionUpdate (ActionId, SiteKey, UpdateType, NewValue, Note, ByUserId) VALUES (@ActionId, @SiteKey, 'Created', N'Open', @Note, @me);
INSERT app.AuditLog (UserId, SiteKey, Entity, EntityId, Verb) VALUES (@me, @SiteKey, 'Action', CAST(@ActionId AS nvarchar(60)), 'Create');
COMMIT;
END
ELSE
BEGIN
SELECT @SiteKey = SiteKey, @area = AreaKey, @old = Status, @oldOwner = OwnerUserId, @oldDue = DueDate FROM app.Action WHERE ActionId = @ActionId;
IF @old IS NULL THROW 50613, N'Action not found', 1;
SET @rank = app.fnRoleRank(@me, @SiteKey, @area);
IF @rank < 2 AND ISNULL(@oldOwner, -1) <> @me THROW 50614, N'Only the owner or a line leader and above can change this action', 1;
IF @Status = 'Verified' AND @rank < 3 THROW 50615, N'Verifying an action needs the area manager role or above', 1;
BEGIN TRAN;
UPDATE app.Action SET ActionType = ISNULL(@ActionType, ActionType), Title = ISNULL(@Title, Title), Detail = ISNULL(@Detail, Detail),
OwnerUserId = ISNULL(@OwnerUserId, OwnerUserId), OwnerName = ISNULL(@OwnerName, OwnerName), DueDate = ISNULL(@DueDate, DueDate), Priority = ISNULL(@Priority, Priority),
Status = ISNULL(@Status, Status), ModifiedBy = @me, ModifiedUtc = SYSUTCDATETIME(),
DoneUtc = CASE WHEN @Status IN ('Done', 'Verified') AND DoneUtc IS NULL THEN SYSUTCDATETIME() ELSE DoneUtc END,
VerifiedBy = CASE WHEN @Status = 'Verified' THEN @me ELSE VerifiedBy END, VerifiedUtc = CASE WHEN @Status = 'Verified' THEN SYSUTCDATETIME() ELSE VerifiedUtc END
WHERE ActionId = @ActionId;
IF @Status IS NOT NULL AND @Status <> @old INSERT app.ActionUpdate (ActionId, SiteKey, UpdateType, OldValue, NewValue, Note, ByUserId) VALUES (@ActionId, @SiteKey, 'Status', @old, @Status, @Note, @me);
IF @OwnerUserId IS NOT NULL AND ISNULL(@oldOwner, -1) <> @OwnerUserId INSERT app.ActionUpdate (ActionId, SiteKey, UpdateType, OldValue, NewValue, Note, ByUserId) VALUES (@ActionId, @SiteKey, 'Owner', CAST(@oldOwner AS nvarchar(20)), CAST(@OwnerUserId AS nvarchar(20)), @Note, @me);
IF @DueDate IS NOT NULL AND ISNULL(@oldDue, '19000101') <> @DueDate INSERT app.ActionUpdate (ActionId, SiteKey, UpdateType, OldValue, NewValue, Note, ByUserId) VALUES (@ActionId, @SiteKey, 'DueDate', CONVERT(nvarchar(10), @oldDue, 23), CONVERT(nvarchar(10), @DueDate, 23), @Note, @me);
IF @Status IS NULL AND @Note IS NOT NULL INSERT app.ActionUpdate (ActionId, SiteKey, UpdateType, Note, ByUserId) VALUES (@ActionId, @SiteKey, 'Comment', @Note, @me);
IF @Status IN ('Done', 'Verified', 'Cancelled') UPDATE app.Escalation SET Status = 'Resolved', ResolvedUtc = SYSUTCDATETIME(), ResolvedBy = @me, ResolvedReason = CONCAT(N'Action ', @Status)
WHERE ActionId = @ActionId AND Status IN ('Open', 'Acknowledged');
INSERT app.AuditLog (UserId, SiteKey, Entity, EntityId, Verb, Detail) VALUES (@me, @SiteKey, 'Action', CAST(@ActionId AS nvarchar(60)), 'Update', @Status);
COMMIT;
END
SELECT ActionId, Status, OwnerUserId, DueDate FROM app.Action WHERE ActionId = @ActionId;
END;

-- 14d. Acknowledge an escalation: area manager or above. Stops it moving up a level.
CREATE OR ALTER PROCEDURE app.usp_AckEscalation @EscalationId bigint, @Note nvarchar(500) = NULL
AS
BEGIN
SET NOCOUNT, XACT_ABORT ON;
DECLARE @me int = app.fnCurrentUserId(), @s varchar(10), @area varchar(20);
SELECT @s = SiteKey, @area = AreaKey FROM app.Escalation WHERE EscalationId = @EscalationId AND Status = 'Open';
IF @s IS NULL THROW 50621, N'Escalation not found or no longer open', 1;
IF app.fnRoleRank(@me, @s, @area) < 3 THROW 50622, N'Acknowledging needs the area manager role or above', 1;
UPDATE app.Escalation SET Status = 'Acknowledged', AckBy = @me, AckUtc = SYSUTCDATETIME(), AckNote = @Note WHERE EscalationId = @EscalationId;
UPDATE app.Notification SET ReadUtc = SYSUTCDATETIME() WHERE EscalationId = @EscalationId AND Channel = 'InApp' AND RecipientUserId = @me AND ReadUtc IS NULL;
INSERT app.AuditLog (UserId, SiteKey, Entity, EntityId, Verb, Detail) VALUES (@me, @s, 'Escalation', CAST(@EscalationId AS nvarchar(60)), 'Acknowledge', @Note);
END;

-- 14e. Mark in-app notifications read: one, or all of mine.
CREATE OR ALTER PROCEDURE app.usp_MarkNotificationsRead @NotificationId bigint = NULL
AS
BEGIN
SET NOCOUNT ON;
UPDATE app.Notification SET ReadUtc = SYSUTCDATETIME() WHERE Channel = 'InApp' AND RecipientUserId = app.fnCurrentUserId() AND ReadUtc IS NULL AND (@NotificationId IS NULL OR NotificationId = @NotificationId);
SELECT @@ROWCOUNT AS MarkedRead;
END;

-- 14f. Grant or remove a role. Site admin at that site, or group admin. Creates the person by email if they have not signed in yet.
CREATE OR ALTER PROCEDURE app.usp_SaveUserSiteRole @Email nvarchar(256), @DisplayName nvarchar(200) = NULL, @SiteKey varchar(10), @AreaKey varchar(20) = '', @Role varchar(20), @Remove bit = 0
AS
BEGIN
SET NOCOUNT, XACT_ABORT ON;
DECLARE @me int = app.fnCurrentUserId(), @u int, @e nvarchar(256) = LOWER(LTRIM(RTRIM(@Email)));
IF app.fnRoleRank(@me, @SiteKey, '') < 5 THROW 50631, N'Managing roles needs the site admin role', 1;
SELECT @u = UserId FROM app.AppUser WHERE Email = @e;
IF @u IS NULL AND @Remove = 0
BEGIN
INSERT app.AppUser (Email, DisplayName) VALUES (@e, ISNULL(@DisplayName, @e));
SET @u = SCOPE_IDENTITY();
END
IF @Remove = 1 DELETE app.UserSiteRole WHERE UserId = @u AND SiteKey = @SiteKey AND AreaKey = ISNULL(@AreaKey, '') AND Role = @Role;
ELSE IF NOT EXISTS (SELECT 1 FROM app.UserSiteRole WHERE UserId = @u AND SiteKey = @SiteKey AND AreaKey = ISNULL(@AreaKey, '') AND Role = @Role)
INSERT app.UserSiteRole (UserId, SiteKey, AreaKey, Role, GrantedBy) VALUES (@u, @SiteKey, ISNULL(@AreaKey, ''), @Role, @me);
INSERT app.AuditLog (UserId, SiteKey, Entity, EntityId, Verb, Detail) VALUES (@me, @SiteKey, 'UserSiteRole', @e, CASE WHEN @Remove = 1 THEN 'Remove' ELSE 'Grant' END, CONCAT(@Role, N' ', @AreaKey));
SELECT UserId, SiteKey, AreaKey, Role FROM app.UserSiteRole WHERE UserId = @u;
END;

-- 14g. Floor TVs: the API hashes the key from the screen URL and asks which site, area or line it may show.
CREATE OR ALTER PROCEDURE app.usp_ResolveDeviceKey @KeyHash varbinary(32)
AS
BEGIN
SET NOCOUNT ON;
UPDATE ctl.DeviceKey SET LastSeenUtc = SYSUTCDATETIME() WHERE KeyHash = @KeyHash AND RevokedUtc IS NULL AND (ExpiresUtc IS NULL OR ExpiresUtc > SYSUTCDATETIME());
SELECT DeviceKeyId, SiteKey, AreaKey, [LineNo], DeviceName FROM ctl.DeviceKey WHERE KeyHash = @KeyHash AND RevokedUtc IS NULL AND (ExpiresUtc IS NULL OR ExpiresUtc > SYSUTCDATETIME());
END;

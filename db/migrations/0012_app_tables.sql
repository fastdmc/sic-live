-- SIC app, step 12: people, roles, comments, actions, escalations and the notification outbox.
-- Every row that belongs to a site carries SiteKey, so row-level security (step 15) can limit each user to their sites.
-- A person is one app.AppUser; each sign-in identity (tenant + object id) points at it, so a guest who later signs in from Hilton keeps their history.
IF OBJECT_ID(N'app.AppUser') IS NULL
CREATE TABLE app.AppUser (UserId int IDENTITY(1,1) NOT NULL CONSTRAINT PK_AppUser PRIMARY KEY, Email nvarchar(256) NOT NULL CONSTRAINT UQ_AppUser_Email UNIQUE,
DisplayName nvarchar(200) NOT NULL, JobTitle nvarchar(200) NULL, IsActive bit NOT NULL CONSTRAINT DF_User_Active DEFAULT 1,
IsGroupAdmin bit NOT NULL CONSTRAINT DF_User_GroupAdmin DEFAULT 0, CreatedUtc datetime2(0) NOT NULL CONSTRAINT DF_User_Created DEFAULT SYSUTCDATETIME(), LastSeenUtc datetime2(0) NULL);
IF OBJECT_ID(N'app.UserIdentity') IS NULL
CREATE TABLE app.UserIdentity (TenantId uniqueidentifier NOT NULL, ObjectId uniqueidentifier NOT NULL, UserId int NOT NULL CONSTRAINT FK_Identity_User REFERENCES app.AppUser (UserId),
Upn nvarchar(256) NULL, IsGuest bit NOT NULL CONSTRAINT DF_Identity_Guest DEFAULT 0, FirstSeenUtc datetime2(0) NOT NULL CONSTRAINT DF_Identity_First DEFAULT SYSUTCDATETIME(),
LastSeenUtc datetime2(0) NULL, CONSTRAINT PK_UserIdentity PRIMARY KEY (TenantId, ObjectId));
IF OBJECT_ID(N'app.UserSiteRole') IS NULL
CREATE TABLE app.UserSiteRole (UserId int NOT NULL CONSTRAINT FK_Role_User REFERENCES app.AppUser (UserId), SiteKey varchar(10) NOT NULL CONSTRAINT FK_Role_Site REFERENCES ctl.Site (SiteKey),
AreaKey varchar(20) NOT NULL CONSTRAINT DF_Role_Area DEFAULT '', Role varchar(20) NOT NULL CONSTRAINT CK_Role CHECK (Role IN ('Viewer', 'LineLeader', 'AreaManager', 'SiteManager', 'SiteAdmin')),
GrantedBy int NULL, GrantedUtc datetime2(0) NOT NULL CONSTRAINT DF_Role_Granted DEFAULT SYSUTCDATETIME(), CONSTRAINT PK_UserSiteRole PRIMARY KEY (UserId, SiteKey, AreaKey, Role));
IF OBJECT_ID(N'app.HourComment') IS NULL
CREATE TABLE app.HourComment (CommentId bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_HourComment PRIMARY KEY, SiteKey varchar(10) NOT NULL CONSTRAINT FK_Comment_Site REFERENCES ctl.Site (SiteKey),
ProductionDate date NOT NULL, [LineNo] int NOT NULL, HourStart datetime2(3) NOT NULL, ReasonCode varchar(20) NULL, Issue nvarchar(1000) NOT NULL, ContainmentAction nvarchar(1000) NULL,
HelpCalledAt datetime2(0) NULL, HelpArrivedAt datetime2(0) NULL, RagAtEntry char(1) NULL, ActualAtEntry int NULL, TargetAtEntry int NULL,
CreatedBy int NOT NULL CONSTRAINT FK_Comment_User REFERENCES app.AppUser (UserId), CreatedUtc datetime2(3) NOT NULL CONSTRAINT DF_Comment_Created DEFAULT SYSUTCDATETIME(),
ModifiedBy int NULL, ModifiedUtc datetime2(3) NULL, IsDeleted bit NOT NULL CONSTRAINT DF_Comment_Deleted DEFAULT 0, RowVer rowversion NOT NULL);
IF INDEXPROPERTY(OBJECT_ID(N'app.HourComment'), N'IX_HourComment_Hour', 'IndexId') IS NULL
CREATE INDEX IX_HourComment_Hour ON app.HourComment (SiteKey, ProductionDate, [LineNo], HourStart) INCLUDE (IsDeleted, CreatedUtc);
IF OBJECT_ID(N'app.Action') IS NULL
CREATE TABLE app.Action (ActionId bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_Action PRIMARY KEY, SiteKey varchar(10) NOT NULL CONSTRAINT FK_Action_Site REFERENCES ctl.Site (SiteKey),
[LineNo] int NULL, AreaKey varchar(20) NULL, CommentId bigint NULL CONSTRAINT FK_Action_Comment REFERENCES app.HourComment (CommentId), EscalationId bigint NULL,
ProductionDate date NULL, HourStart datetime2(3) NULL,
ActionType varchar(20) NOT NULL CONSTRAINT DF_Action_Type DEFAULT 'Corrective' CONSTRAINT CK_Action_Type CHECK (ActionType IN ('Containment', 'Corrective', 'Preventive')),
Title nvarchar(200) NOT NULL, Detail nvarchar(2000) NULL, OwnerUserId int NULL CONSTRAINT FK_Action_Owner REFERENCES app.AppUser (UserId), OwnerName nvarchar(100) NULL, DueDate date NULL,
Status varchar(20) NOT NULL CONSTRAINT DF_Action_Status DEFAULT 'Open' CONSTRAINT CK_Action_Status CHECK (Status IN ('Open', 'InProgress', 'Done', 'Verified', 'Cancelled')),
Priority tinyint NOT NULL CONSTRAINT DF_Action_Priority DEFAULT 2 CONSTRAINT CK_Action_Priority CHECK (Priority BETWEEN 1 AND 3),
CreatedBy int NOT NULL CONSTRAINT FK_Action_Creator REFERENCES app.AppUser (UserId), CreatedUtc datetime2(3) NOT NULL CONSTRAINT DF_Action_Created DEFAULT SYSUTCDATETIME(),
ModifiedBy int NULL, ModifiedUtc datetime2(3) NULL, DoneUtc datetime2(3) NULL, VerifiedBy int NULL, VerifiedUtc datetime2(3) NULL, RowVer rowversion NOT NULL);
IF INDEXPROPERTY(OBJECT_ID(N'app.Action'), N'IX_Action_Open', 'IndexId') IS NULL
CREATE INDEX IX_Action_Open ON app.Action (SiteKey, Status, DueDate) INCLUDE ([LineNo], HourStart, OwnerUserId);
IF OBJECT_ID(N'app.ActionUpdate') IS NULL
CREATE TABLE app.ActionUpdate (UpdateId bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_ActionUpdate PRIMARY KEY, ActionId bigint NOT NULL CONSTRAINT FK_Update_Action REFERENCES app.Action (ActionId),
SiteKey varchar(10) NOT NULL, UpdateType varchar(20) NOT NULL, OldValue nvarchar(400) NULL, NewValue nvarchar(400) NULL, Note nvarchar(1000) NULL,
ByUserId int NOT NULL, AtUtc datetime2(3) NOT NULL CONSTRAINT DF_Update_At DEFAULT SYSUTCDATETIME());
IF OBJECT_ID(N'ctl.EscalationRule') IS NULL
CREATE TABLE ctl.EscalationRule (RuleId int IDENTITY(1,1) NOT NULL CONSTRAINT PK_EscalationRule PRIMARY KEY, SiteKey varchar(10) NOT NULL CONSTRAINT FK_Rule_Site REFERENCES ctl.Site (SiteKey),
AreaKey varchar(20) NOT NULL CONSTRAINT DF_Rule_Area DEFAULT '',
RuleType varchar(30) NOT NULL CONSTRAINT CK_Rule_Type CHECK (RuleType IN ('RedNoComment', 'ConsecutiveRed', 'ShiftBelowTarget', 'ActionOverdue')),
Lvl tinyint NOT NULL CONSTRAINT DF_Rule_Lvl DEFAULT 1 CONSTRAINT CK_Rule_Lvl CHECK (Lvl BETWEEN 1 AND 3), Threshold decimal(9,2) NULL, DelayMins int NOT NULL CONSTRAINT DF_Rule_Delay DEFAULT 0,
NotifyRoles varchar(100) NOT NULL, ToTeams bit NOT NULL CONSTRAINT DF_Rule_Teams DEFAULT 0, ToEmail bit NOT NULL CONSTRAINT DF_Rule_Email DEFAULT 0,
EscalateAfterMins int NULL, IsActive bit NOT NULL CONSTRAINT DF_Rule_Active DEFAULT 1, Description nvarchar(300) NULL);
IF OBJECT_ID(N'app.Escalation') IS NULL
CREATE TABLE app.Escalation (EscalationId bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_Escalation PRIMARY KEY, RuleId int NOT NULL CONSTRAINT FK_Esc_Rule REFERENCES ctl.EscalationRule (RuleId),
SiteKey varchar(10) NOT NULL, AreaKey varchar(20) NULL, [LineNo] int NULL, ProductionDate date NULL, HourStart datetime2(3) NULL, ActionId bigint NULL,
RuleType varchar(30) NOT NULL, Lvl tinyint NOT NULL, SubjectKey nvarchar(200) NOT NULL, Title nvarchar(300) NOT NULL, Detail nvarchar(1000) NULL,
Status varchar(20) NOT NULL CONSTRAINT DF_Esc_Status DEFAULT 'Open' CONSTRAINT CK_Esc_Status CHECK (Status IN ('Open', 'Acknowledged', 'Resolved', 'Cancelled')),
RaisedUtc datetime2(3) NOT NULL CONSTRAINT DF_Esc_Raised DEFAULT SYSUTCDATETIME(), AckBy int NULL, AckUtc datetime2(3) NULL, AckNote nvarchar(500) NULL,
ResolvedUtc datetime2(3) NULL, ResolvedBy int NULL, ResolvedReason nvarchar(200) NULL, CONSTRAINT UQ_Escalation_Subject UNIQUE (SiteKey, RuleType, SubjectKey, Lvl));
IF INDEXPROPERTY(OBJECT_ID(N'app.Escalation'), N'IX_Escalation_Open', 'IndexId') IS NULL
CREATE INDEX IX_Escalation_Open ON app.Escalation (SiteKey, Status, RaisedUtc);
IF OBJECT_ID(N'ctl.NotificationTarget') IS NULL
CREATE TABLE ctl.NotificationTarget (TargetId int IDENTITY(1,1) NOT NULL CONSTRAINT PK_NotificationTarget PRIMARY KEY, SiteKey varchar(10) NOT NULL CONSTRAINT FK_Target_Site REFERENCES ctl.Site (SiteKey),
AreaKey varchar(20) NOT NULL CONSTRAINT DF_Target_Area DEFAULT '', Channel varchar(10) NOT NULL CONSTRAINT CK_Target_Channel CHECK (Channel IN ('Teams', 'Email')),
Address nvarchar(400) NOT NULL, MinLvl tinyint NOT NULL CONSTRAINT DF_Target_MinLvl DEFAULT 1, IsActive bit NOT NULL CONSTRAINT DF_Target_Active DEFAULT 0, Description nvarchar(200) NULL);
IF OBJECT_ID(N'app.Notification') IS NULL
CREATE TABLE app.Notification (NotificationId bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_Notification PRIMARY KEY, SiteKey varchar(10) NOT NULL,
EscalationId bigint NULL CONSTRAINT FK_Notif_Esc REFERENCES app.Escalation (EscalationId), ActionId bigint NULL,
Channel varchar(10) NOT NULL CONSTRAINT CK_Notif_Channel CHECK (Channel IN ('InApp', 'Teams', 'Email')), RecipientUserId int NULL, Address nvarchar(400) NULL,
Subject nvarchar(300) NOT NULL, Body nvarchar(2000) NULL, DeepLink nvarchar(400) NULL,
Status varchar(12) NOT NULL CONSTRAINT DF_Notif_Status DEFAULT 'Pending' CONSTRAINT CK_Notif_Status CHECK (Status IN ('Pending', 'Sending', 'Sent', 'Failed', 'Suppressed')),
Attempts tinyint NOT NULL CONSTRAINT DF_Notif_Attempts DEFAULT 0, CreatedUtc datetime2(3) NOT NULL CONSTRAINT DF_Notif_Created DEFAULT SYSUTCDATETIME(),
NotBeforeUtc datetime2(3) NOT NULL CONSTRAINT DF_Notif_NotBefore DEFAULT SYSUTCDATETIME(), LeaseUntilUtc datetime2(3) NULL, SentUtc datetime2(3) NULL, ReadUtc datetime2(3) NULL, LastError nvarchar(1000) NULL);
IF INDEXPROPERTY(OBJECT_ID(N'app.Notification'), N'IX_Notification_Queue', 'IndexId') IS NULL
CREATE INDEX IX_Notification_Queue ON app.Notification (Status, NotBeforeUtc) INCLUDE (Channel, Attempts, LeaseUntilUtc);
IF INDEXPROPERTY(OBJECT_ID(N'app.Notification'), N'IX_Notification_Inbox', 'IndexId') IS NULL
CREATE INDEX IX_Notification_Inbox ON app.Notification (RecipientUserId, ReadUtc) INCLUDE (Channel, CreatedUtc);
IF OBJECT_ID(N'app.AuditLog') IS NULL
CREATE TABLE app.AuditLog (AuditId bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_AuditLog PRIMARY KEY, AtUtc datetime2(3) NOT NULL CONSTRAINT DF_Audit_At DEFAULT SYSUTCDATETIME(),
UserId int NULL, SiteKey varchar(10) NULL, Entity varchar(40) NOT NULL, EntityId nvarchar(60) NULL, Verb varchar(20) NOT NULL, Detail nvarchar(2000) NULL);

-- Default escalation rules for every site. Teams and email only leave the database once ctl.Site.NotificationsLive = 1 and a target is active.
-- Tuned on 2 Nov HFI data: a morning raised 97 escalations, so Teams gets level 2 only (about 4 posts a morning) and red hours with no comment stay in-app.
INSERT ctl.EscalationRule (SiteKey, RuleType, Lvl, Threshold, DelayMins, NotifyRoles, ToTeams, ToEmail, EscalateAfterMins, Description)
SELECT st.SiteKey, r.RuleType, r.Lvl, r.Threshold, r.DelayMins, r.NotifyRoles, r.ToTeams, r.ToEmail, r.EscalateAfterMins, r.Description
FROM ctl.Site st CROSS JOIN (VALUES
('RedNoComment', 1, NULL, 30, 'LineLeader,AreaManager', 0, 0, 30, N'Red hour with no comment 30 minutes after it ended'),
('RedNoComment', 2, NULL, 60, 'AreaManager,SiteManager', 0, 0, NULL, N'Still no comment 60 minutes after a red hour: in-app to the area and site manager'),
('ConsecutiveRed', 1, 2, 0, 'AreaManager', 1, 0, 60, N'Two red hours in a row on a line'),
('ConsecutiveRed', 2, 3, 0, 'SiteManager', 1, 1, NULL, N'Three red hours in a row, or level 1 left unacknowledged for an hour'),
('ShiftBelowTarget', 1, 85, 0, 'AreaManager,SiteManager', 1, 0, NULL, N'Line below 85% of target for the day after 3 complete hours'),
('ActionOverdue', 1, NULL, 0, 'AreaManager', 0, 1, NULL, N'Corrective action past its due date: the owner and area manager')) AS r (RuleType, Lvl, Threshold, DelayMins, NotifyRoles, ToTeams, ToEmail, EscalateAfterMins, Description)
WHERE NOT EXISTS (SELECT 1 FROM ctl.EscalationRule x WHERE x.SiteKey = st.SiteKey AND x.RuleType = r.RuleType AND x.Lvl = r.Lvl);
-- Teams channel per site: Address is the Key Vault secret NAME that holds the Workflows webhook URL, never the URL itself.
INSERT ctl.NotificationTarget (SiteKey, Channel, Address, MinLvl, IsActive, Description)
SELECT SiteKey, 'Teams', CONCAT('teams-sic-', LOWER(SiteKey)), 2, 0, CONCAT(SiteName, N' SIC channel, level 2 and above') FROM ctl.Site st
WHERE NOT EXISTS (SELECT 1 FROM ctl.NotificationTarget x WHERE x.SiteKey = st.SiteKey AND x.Channel = 'Teams');
SELECT (SELECT COUNT(*) FROM ctl.EscalationRule) AS Rules, (SELECT COUNT(*) FROM ctl.NotificationTarget) AS Targets;

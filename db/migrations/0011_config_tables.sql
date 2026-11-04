-- SIC app, step 11: per-site configuration, so a new site is rows, not code.
-- ctl.Site: time zone, production day start, RAG limits, comment deadline, feed source, and the switch that lets notifications leave the database.
-- ctl.Area and ctl.Line: the area and cell each line belongs to. ctl.ReasonCode: the reasons a line leader picks on a red hour.
-- ctl.DeviceKey: read-only keys for floor TVs, stored as a SHA-256 hash. ctl.SchemaMigration: what has been applied, by whom.
IF SCHEMA_ID(N'app') IS NULL EXEC (N'CREATE SCHEMA app');
IF OBJECT_ID(N'ctl.Site') IS NULL
CREATE TABLE ctl.Site (SiteKey varchar(10) NOT NULL CONSTRAINT PK_Site PRIMARY KEY, SiteName nvarchar(100) NOT NULL, Country char(2) NOT NULL,
TimeZoneId varchar(64) NOT NULL, DayStartHour tinyint NOT NULL CONSTRAINT DF_Site_DayStart DEFAULT 0,
RagGreenPct decimal(5,2) NOT NULL CONSTRAINT DF_Site_Green DEFAULT 95, RagAmberPct decimal(5,2) NOT NULL CONSTRAINT DF_Site_Amber DEFAULT 85,
RagMinAvailMins int NOT NULL CONSTRAINT DF_Site_MinAvail DEFAULT 10, CommentDueMins int NOT NULL CONSTRAINT DF_Site_CommentDue DEFAULT 30,
DataSourceName sysname NULL, ContainerName sysname NULL, NotificationsLive bit NOT NULL CONSTRAINT DF_Site_NotifLive DEFAULT 0,
LiveFromUtc datetime2(0) NULL, IsActive bit NOT NULL CONSTRAINT DF_Site_Active DEFAULT 1, ModifiedUtc datetime2(0) NOT NULL CONSTRAINT DF_Site_Mod DEFAULT SYSUTCDATETIME());
IF OBJECT_ID(N'ctl.Area') IS NULL
CREATE TABLE ctl.Area (SiteKey varchar(10) NOT NULL CONSTRAINT FK_Area_Site REFERENCES ctl.Site (SiteKey), AreaKey varchar(20) NOT NULL,
AreaName nvarchar(50) NOT NULL, DisplayOrder int NOT NULL CONSTRAINT DF_Area_Order DEFAULT 0, CONSTRAINT PK_Area PRIMARY KEY (SiteKey, AreaKey));
IF OBJECT_ID(N'ctl.Line') IS NULL
CREATE TABLE ctl.Line (SiteKey varchar(10) NOT NULL CONSTRAINT FK_Line_Site REFERENCES ctl.Site (SiteKey), [LineNo] int NOT NULL,
LineName nvarchar(50) NOT NULL, AreaKey varchar(20) NULL, CellName nvarchar(50) NULL, DisplayOrder int NOT NULL CONSTRAINT DF_Line_Order DEFAULT 0,
IsActive bit NOT NULL CONSTRAINT DF_Line_Active DEFAULT 1, CONSTRAINT PK_Line PRIMARY KEY (SiteKey, [LineNo]),
CONSTRAINT FK_Line_Area FOREIGN KEY (SiteKey, AreaKey) REFERENCES ctl.Area (SiteKey, AreaKey));
IF OBJECT_ID(N'ctl.ReasonCode') IS NULL
CREATE TABLE ctl.ReasonCode (SiteKey varchar(10) NOT NULL CONSTRAINT FK_Reason_Site REFERENCES ctl.Site (SiteKey), ReasonCode varchar(20) NOT NULL,
ReasonName nvarchar(80) NOT NULL, LossCategory varchar(20) NOT NULL, DisplayOrder int NOT NULL CONSTRAINT DF_Reason_Order DEFAULT 0,
IsActive bit NOT NULL CONSTRAINT DF_Reason_Active DEFAULT 1, CONSTRAINT PK_ReasonCode PRIMARY KEY (SiteKey, ReasonCode));
IF OBJECT_ID(N'ctl.DeviceKey') IS NULL
CREATE TABLE ctl.DeviceKey (DeviceKeyId int IDENTITY(1,1) NOT NULL CONSTRAINT PK_DeviceKey PRIMARY KEY, SiteKey varchar(10) NOT NULL CONSTRAINT FK_Device_Site REFERENCES ctl.Site (SiteKey),
AreaKey varchar(20) NULL, [LineNo] int NULL, DeviceName nvarchar(100) NOT NULL, KeyHash varbinary(32) NOT NULL CONSTRAINT UQ_DeviceKey_Hash UNIQUE,
CreatedUtc datetime2(0) NOT NULL CONSTRAINT DF_Device_Created DEFAULT SYSUTCDATETIME(), ExpiresUtc datetime2(0) NULL, RevokedUtc datetime2(0) NULL, LastSeenUtc datetime2(0) NULL);
IF OBJECT_ID(N'ctl.SchemaMigration') IS NULL
CREATE TABLE ctl.SchemaMigration (MigrationId varchar(100) NOT NULL CONSTRAINT PK_SchemaMigration PRIMARY KEY,
AppliedUtc datetime2(0) NOT NULL CONSTRAINT DF_Mig_Applied DEFAULT SYSUTCDATETIME(), AppliedBy sysname NOT NULL CONSTRAINT DF_Mig_By DEFAULT SUSER_SNAME(), Notes nvarchar(400) NULL);

-- Seed: both sites from the off. HFUK areas and lines are added in the admin screen once its first files land.
MERGE ctl.Site AS t USING (VALUES
('HFI', N'Hilton Foods Ireland, Drogheda', 'IE', 'GMT Standard Time', 'HfiInbound', 'hfi-inbound'),
('HFUK', N'Hilton Foods UK, Huntingdon', 'GB', 'GMT Standard Time', 'HfukInbound', 'hfuk-inbound')) AS s (SiteKey, SiteName, Country, TimeZoneId, DataSourceName, ContainerName)
ON t.SiteKey = s.SiteKey
WHEN NOT MATCHED THEN INSERT (SiteKey, SiteName, Country, TimeZoneId, DataSourceName, ContainerName) VALUES (s.SiteKey, s.SiteName, s.Country, s.TimeZoneId, s.DataSourceName, s.ContainerName);
MERGE ctl.Area AS t USING (VALUES ('HFI', 'fresh', N'Fresh', 1), ('HFI', 'cured', N'Cured', 2), ('HFI', 'other', N'Other', 3)) AS s (SiteKey, AreaKey, AreaName, DisplayOrder)
ON t.SiteKey = s.SiteKey AND t.AreaKey = s.AreaKey WHEN NOT MATCHED THEN INSERT VALUES (s.SiteKey, s.AreaKey, s.AreaName, s.DisplayOrder);
MERGE ctl.Line AS t USING (VALUES
(1, 'fresh', N'Formed'), (2, 'fresh', N'Formed'), (3, 'fresh', N'Formed'), (4, 'fresh', N'Sliced'), (5, 'fresh', N'Sliced'), (6, 'fresh', N'Sliced'), (7, 'fresh', N'Sliced'),
(9, 'fresh', N'Sausage'), (10, 'fresh', N'Sausage'), (11, 'cured', N'Rasher'), (13, 'cured', N'Rasher'), (16, 'cured', N'Rasher'), (12, 'cured', N'Joints'), (14, 'cured', N'Joints'),
(17, 'cured', N'Joints'), (15, 'other', N'Christmas line'), (23, 'other', N'Not in area lookup')) AS s ([LineNo], AreaKey, CellName)
ON t.SiteKey = 'HFI' AND t.[LineNo] = s.[LineNo]
WHEN NOT MATCHED THEN INSERT (SiteKey, [LineNo], LineName, AreaKey, CellName, DisplayOrder) VALUES ('HFI', s.[LineNo], CONCAT(N'Line ', s.[LineNo]), s.AreaKey, s.CellName, s.[LineNo]);
MERGE ctl.ReasonCode AS t USING (SELECT st.SiteKey, r.ReasonCode, r.ReasonName, r.LossCategory, r.DisplayOrder FROM ctl.Site st CROSS JOIN (VALUES
('BREAKDOWN', N'Breakdown', 'Availability', 1), ('CHANGEOVER', N'Changeover overrun', 'Availability', 2), ('MATERIAL', N'Meat or material supply', 'Availability', 3),
('PACKAGING', N'Packaging or film', 'Availability', 4), ('LABOUR', N'Labour shortage', 'People', 5), ('SPEED', N'Running below speed', 'Performance', 6),
('MINORSTOPS', N'Minor stops', 'Performance', 7), ('QUALITY', N'Quality hold or rework', 'Quality', 8), ('GIVEAWAY', N'Giveaway or weight', 'Quality', 9),
('PLAN', N'Plan or schedule change', 'Planning', 10), ('HYGIENE', N'Hygiene or cleaning', 'Planning', 11), ('OTHER', N'Other', 'Other', 12)) AS r (ReasonCode, ReasonName, LossCategory, DisplayOrder)) AS s
ON t.SiteKey = s.SiteKey AND t.ReasonCode = s.ReasonCode
WHEN NOT MATCHED THEN INSERT (SiteKey, ReasonCode, ReasonName, LossCategory, DisplayOrder) VALUES (s.SiteKey, s.ReasonCode, s.ReasonName, s.LossCategory, s.DisplayOrder);
SELECT (SELECT COUNT(*) FROM ctl.Site) AS Sites, (SELECT COUNT(*) FROM ctl.Area) AS Areas, (SELECT COUNT(*) FROM ctl.Line) AS Lines, (SELECT COUNT(*) FROM ctl.ReasonCode) AS Reasons;

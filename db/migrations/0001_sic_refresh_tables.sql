-- SIC refresh, step 1: frozen daily targets, refresh state and refresh log.
-- curated.SIC_Target holds the best-shift rates for each production day, built once from the days before it, so the target does not move mid-shift.
-- ctl.SIC_RefreshState holds one row per site: Pending is set by each load, InlineRefresh runs the refresh straight after the load, Version goes up on every refresh.
-- LastLoadId is the last ctl.FileLoad id a refresh covered, so the next refresh recalculates only the days that later loads touched.
-- BurstFiles stops a backfill running one refresh per file: once more than that many files have loaded for the site in 5 minutes, a load only marks the site pending.
-- MinGapSecs, when above 0, also skips the inline refresh if the last one ended less than that many seconds ago. 0 means every load refreshes.
IF OBJECT_ID(N'curated.SIC_Target') IS NULL
CREATE TABLE curated.SIC_Target (SiteKey varchar(10) NOT NULL, AsOfDate date NOT NULL, Lvl char(1) NOT NULL, [LineNo] int NOT NULL,
ArticleKey nvarchar(50) NOT NULL CONSTRAINT DF_SIC_Target_Art DEFAULT N'', StdSig nvarchar(200) NOT NULL CONSTRAINT DF_SIC_Target_Sig DEFAULT N'',
BestRate float NOT NULL, nDays int NOT NULL, BuiltUtc datetime2(0) NOT NULL CONSTRAINT DF_SIC_Target_Built DEFAULT SYSUTCDATETIME(),
CONSTRAINT PK_SIC_Target PRIMARY KEY (SiteKey, AsOfDate, Lvl, [LineNo], ArticleKey, StdSig));
IF OBJECT_ID(N'ctl.SIC_RefreshState') IS NULL
CREATE TABLE ctl.SIC_RefreshState (SiteKey varchar(10) NOT NULL CONSTRAINT PK_SIC_RefreshState PRIMARY KEY,
Pending bit NOT NULL CONSTRAINT DF_SIC_RS_Pending DEFAULT 1, InlineRefresh bit NOT NULL CONSTRAINT DF_SIC_RS_Inline DEFAULT 1,
WindowDays int NOT NULL CONSTRAINT DF_SIC_RS_Days DEFAULT 3, RequestedUtc datetime2(3) NULL, LastStartUtc datetime2(3) NULL, LastEndUtc datetime2(3) NULL,
LastFrom date NULL, LastTo date NULL, LastRows int NULL, LastMs int NULL, LastError nvarchar(4000) NULL,
Version bigint NOT NULL CONSTRAINT DF_SIC_RS_Version DEFAULT 0, MinGapSecs int NOT NULL CONSTRAINT DF_SIC_RS_Gap DEFAULT 0,
BurstFiles int NOT NULL CONSTRAINT DF_SIC_RS_Burst DEFAULT 6, LastLoadId bigint NULL);
IF COL_LENGTH(N'ctl.SIC_RefreshState', N'MinGapSecs') IS NULL
ALTER TABLE ctl.SIC_RefreshState ADD MinGapSecs int NOT NULL CONSTRAINT DF_SIC_RS_Gap DEFAULT 0;
IF COL_LENGTH(N'ctl.SIC_RefreshState', N'BurstFiles') IS NULL
ALTER TABLE ctl.SIC_RefreshState ADD BurstFiles int NOT NULL CONSTRAINT DF_SIC_RS_Burst DEFAULT 6;
IF COL_LENGTH(N'ctl.SIC_RefreshState', N'LastLoadId') IS NULL
ALTER TABLE ctl.SIC_RefreshState ADD LastLoadId bigint NULL;
IF OBJECT_ID(N'ctl.SIC_RefreshLog') IS NULL
CREATE TABLE ctl.SIC_RefreshLog (LogId bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_SIC_RefreshLog PRIMARY KEY, SiteKey varchar(10) NOT NULL,
StartUtc datetime2(3) NOT NULL, EndUtc datetime2(3) NULL, FromDate date NULL, ToDate date NULL, RowsWritten int NULL, TargetsBuilt int NULL,
Ms int NULL, Outcome varchar(20) NOT NULL, ErrorMessage nvarchar(4000) NULL);
INSERT ctl.SIC_RefreshState (SiteKey) SELECT DISTINCT SiteKey FROM stg.F1_RunPerformance WHERE SiteKey IS NOT NULL AND SiteKey NOT IN (SELECT SiteKey FROM ctl.SIC_RefreshState);
SELECT SiteKey, Pending, InlineRefresh, WindowDays, Version FROM ctl.SIC_RefreshState;

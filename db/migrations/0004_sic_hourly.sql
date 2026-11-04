-- SIC refresh, step 4: the materialised SIC table, one row per site, production day, line and clock hour.
-- Columns come straight from curated.fnSIC_Hourly, plus RefreshedUtc. The app and the floor screens read this table, never the view.
IF OBJECT_ID(N'curated.SIC_Hourly') IS NULL
BEGIN
SELECT TOP 0 * INTO curated.SIC_Hourly FROM curated.fnSIC_Hourly('HFI', '2026-11-02', '2026-11-02');
ALTER TABLE curated.SIC_Hourly ALTER COLUMN SiteKey varchar(10) NOT NULL;
ALTER TABLE curated.SIC_Hourly ALTER COLUMN ProductionDate date NOT NULL;
ALTER TABLE curated.SIC_Hourly ALTER COLUMN [LineNo] int NOT NULL;
ALTER TABLE curated.SIC_Hourly ALTER COLUMN HourStart datetime2(3) NOT NULL;
ALTER TABLE curated.SIC_Hourly ADD RefreshedUtc datetime2(3) NOT NULL CONSTRAINT DF_SIC_Hourly_Refreshed DEFAULT SYSUTCDATETIME();
ALTER TABLE curated.SIC_Hourly ADD CONSTRAINT PK_SIC_Hourly PRIMARY KEY CLUSTERED (SiteKey, ProductionDate, [LineNo], HourStart);
END
SELECT COUNT(*) AS Cols FROM sys.columns WHERE object_id = OBJECT_ID(N'curated.SIC_Hourly');

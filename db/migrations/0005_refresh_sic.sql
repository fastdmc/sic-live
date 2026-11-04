CREATE OR ALTER PROCEDURE ctl.usp_RefreshSIC @SiteKey varchar(10) = NULL, @Days int = NULL, @Force bit = 0
AS
BEGIN
-- Recalculates the rolling window of SIC hours into curated.SIC_Hourly for each site with a refresh pending, or every site with @Force = 1.
-- One refresh per site at a time: an application lock that does not wait. A load that arrives mid-refresh sets Pending again and the loop runs once more.
-- Builds the frozen targets for any day in the window that has none, then swaps the rows in one transaction so a reader never sees half a refresh.
-- The window ends at the latest production day in F1 and covers WindowDays days, 3 by default. Older days are kept as they are.
-- Within the window only the days touched since the last refresh are recalculated: run days of new F1, F3, F4 and F5 rows, schedule days of new F12 rows,
-- and any day still showing an hour in progress. A new F8 or F9 file, @Force = 1 or a first run recalculates the whole window.
-- OPTION (RECOMPILE) lets the optimiser see the real dates: without it the same call takes about three times as long on S1.
SET NOCOUNT ON;
DECLARE @s varchar(10), @rc int, @from date, @to date, @day date, @t0 datetime2(3), @rows int, @tb int, @loops int, @wd int, @res nvarchar(100), @log bigint, @last bigint, @max bigint, @lo date, @chg date;
DECLARE c CURSOR LOCAL FAST_FORWARD FOR SELECT SiteKey FROM ctl.SIC_RefreshState WHERE (@SiteKey IS NULL OR SiteKey = @SiteKey) AND (Pending = 1 OR @Force = 1);
OPEN c;
FETCH NEXT FROM c INTO @s;
WHILE @@FETCH_STATUS = 0
BEGIN
SET @res = N'SIC_Refresh_' + @s;
EXEC @rc = sp_getapplock @Resource = @res, @LockMode = 'Exclusive', @LockOwner = 'Session', @LockTimeout = 0;
IF @rc >= 0
BEGIN
SET @loops = 0;
WHILE @loops < 3 AND ((@loops = 0 AND @Force = 1) OR EXISTS (SELECT 1 FROM ctl.SIC_RefreshState WHERE SiteKey = @s AND Pending = 1))
BEGIN
SET @loops += 1; SET @t0 = SYSUTCDATETIME(); SET @tb = 0;
UPDATE ctl.SIC_RefreshState SET Pending = 0, LastStartUtc = @t0 WHERE SiteKey = @s;
SELECT @wd = COALESCE(@Days, WindowDays, 3), @last = CASE WHEN @Force = 1 THEN 0 ELSE ISNULL(LastLoadId, 0) END FROM ctl.SIC_RefreshState WHERE SiteKey = @s;
SELECT @max = MAX(LoadId) FROM ctl.FileLoad WHERE SiteKey = @s AND LoadStatus = 'Succeeded';
INSERT ctl.SIC_RefreshLog (SiteKey, StartUtc, Outcome) VALUES (@s, @t0, 'Running');
SET @log = SCOPE_IDENTITY();
BEGIN TRY
SELECT @to = MAX(CAST(TRY_CONVERT(datetime2(3), RunStart) AS date)) FROM stg.F1_RunPerformance WHERE SiteKey = @s;
IF @to IS NULL THROW 50300, N'no F1 run data for this site yet', 1;
SET @lo = DATEADD(day, 1 - @wd, @to); SET @from = @lo; SET @chg = NULL;
IF @last > 0 AND NOT EXISTS (SELECT 1 FROM ctl.FileLoad WHERE SiteKey = @s AND LoadId > @last AND LoadStatus = 'Succeeded' AND FeedCode IN ('F8', 'F9'))
BEGIN
SELECT @chg = MIN(d) FROM (SELECT MIN(CAST(TRY_CONVERT(datetime2(3), RunStart) AS date)) AS d FROM stg.F1_RunPerformance WHERE SiteKey = @s AND LoadId > @last
UNION ALL SELECT MIN(CAST(TRY_CONVERT(datetime2(3), StartDate) AS date)) FROM stg.F3_Downtime WHERE SiteKey = @s AND LoadId > @last
UNION ALL SELECT MIN(CAST(TRY_CONVERT(datetime2(3), f.RunStart) AS date)) FROM stg.F4_GiveawayAndWeight x JOIN stg.F1_RunPerformance f ON f.SiteKey = x.SiteKey AND f.RunRollupKey = x.RunRollupKey WHERE x.SiteKey = @s AND x.LoadId > @last
UNION ALL SELECT MIN(CAST(TRY_CONVERT(datetime2(3), f.RunStart) AS date)) FROM stg.F5_OrderStandardsSpine x JOIN stg.F1_RunPerformance f ON f.SiteKey = x.SiteKey AND f.RunRollupKey = x.RunRollupKey WHERE x.SiteKey = @s AND x.LoadId > @last
UNION ALL SELECT MIN(TRY_CONVERT(date, ScheduleDate)) FROM stg.F12_ProductionSchedule WHERE SiteKey = @s AND LoadId > @last
UNION ALL SELECT MIN(ProductionDate) FROM curated.SIC_Hourly WHERE SiteKey = @s AND ProductionDate >= @lo AND HourStatus = 'In progress') z;
SET @from = CASE WHEN @chg IS NULL OR @chg > @to THEN @to WHEN @chg < @lo THEN @lo ELSE @chg END;
END
SET @day = @from;
WHILE @day <= @to
BEGIN
IF NOT EXISTS (SELECT 1 FROM curated.SIC_Target WHERE SiteKey = @s AND AsOfDate = @day)
BEGIN
EXEC ctl.usp_BuildSICTargets @SiteKey = @s, @AsOfDate = @day;
SET @tb += 1;
END
SET @day = DATEADD(day, 1, @day);
END
SELECT * INTO #t FROM curated.fnSIC_Hourly(@s, @from, @to) OPTION (RECOMPILE);
SET @rows = @@ROWCOUNT;
BEGIN TRAN;
DELETE FROM curated.SIC_Hourly WHERE SiteKey = @s AND ProductionDate BETWEEN @from AND @to;
INSERT curated.SIC_Hourly SELECT *, SYSUTCDATETIME() FROM #t;
UPDATE ctl.SIC_RefreshState SET LastEndUtc = SYSUTCDATETIME(), LastFrom = @from, LastTo = @to, LastRows = @rows, LastMs = DATEDIFF(millisecond, @t0, SYSUTCDATETIME()), LastError = NULL, Version = Version + 1, LastLoadId = @max WHERE SiteKey = @s;
COMMIT;
DROP TABLE #t;
UPDATE ctl.SIC_RefreshLog SET EndUtc = SYSUTCDATETIME(), FromDate = @from, ToDate = @to, RowsWritten = @rows, TargetsBuilt = @tb, Ms = DATEDIFF(millisecond, @t0, SYSUTCDATETIME()), Outcome = 'Succeeded' WHERE LogId = @log;
END TRY
BEGIN CATCH
IF @@TRANCOUNT > 0 ROLLBACK;
IF OBJECT_ID(N'tempdb..#t') IS NOT NULL DROP TABLE #t;
UPDATE ctl.SIC_RefreshState SET Pending = 1, LastError = ERROR_MESSAGE(), LastEndUtc = SYSUTCDATETIME() WHERE SiteKey = @s;
UPDATE ctl.SIC_RefreshLog SET EndUtc = SYSUTCDATETIME(), Outcome = 'Failed', ErrorMessage = ERROR_MESSAGE(), Ms = DATEDIFF(millisecond, @t0, SYSUTCDATETIME()) WHERE LogId = @log;
SET @loops = 3;
END CATCH
END
EXEC sp_releaseapplock @Resource = @res, @LockOwner = 'Session';
END
FETCH NEXT FROM c INTO @s;
END
CLOSE c;
DEALLOCATE c;
END

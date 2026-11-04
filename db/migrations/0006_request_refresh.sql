CREATE OR ALTER PROCEDURE ctl.usp_RequestSICRefresh @SiteKey varchar(10)
AS
BEGIN
-- Called by ctl.usp_LoadFeedFile after each SIC feed file loads. Marks the site for a SIC refresh and, with InlineRefresh on, runs it straight away,
-- unless a backfill is running (more than BurstFiles files for the site in 5 minutes) or the last refresh ended less than MinGapSecs ago.
-- Then the site stays pending and the next load, or the next read through curated.usp_GetSICHourly, picks it up.
-- It never raises an error, so a file can never fail to load because of the SIC refresh. Failures are kept in ctl.SIC_RefreshState and ctl.SIC_RefreshLog.
SET NOCOUNT ON;
BEGIN TRY
IF EXISTS (SELECT 1 FROM ctl.SIC_RefreshState WHERE SiteKey = @SiteKey)
UPDATE ctl.SIC_RefreshState SET Pending = 1, RequestedUtc = SYSUTCDATETIME() WHERE SiteKey = @SiteKey;
ELSE
INSERT ctl.SIC_RefreshState (SiteKey, Pending, RequestedUtc) VALUES (@SiteKey, 1, SYSUTCDATETIME());
IF EXISTS (SELECT 1 FROM ctl.SIC_RefreshState WHERE SiteKey = @SiteKey AND InlineRefresh = 1
AND (MinGapSecs = 0 OR LastEndUtc IS NULL OR LastEndUtc < DATEADD(second, -MinGapSecs, SYSUTCDATETIME()))
AND BurstFiles >= (SELECT COUNT(*) FROM ctl.FileLoad WHERE SiteKey = @SiteKey AND StartedUtc >= DATEADD(minute, -5, SYSUTCDATETIME())))
EXEC ctl.usp_RefreshSIC @SiteKey = @SiteKey;
END TRY
BEGIN CATCH
PRINT ERROR_MESSAGE();
END CATCH
END

CREATE OR ALTER PROCEDURE curated.usp_GetSICHourly @SiteKey varchar(10), @From date = NULL, @To date = NULL, @LineNo int = NULL
AS
BEGIN
-- Read path for the app, the floor screens and any API: returns SIC hours from curated.SIC_Hourly.
-- If a load has marked the site pending and no refresh is running, it refreshes first, so a reader never waits for the next file to see the last one.
-- After a failed refresh it waits 5 minutes before trying again, so a fault does not slow every read.
-- The second result set says how fresh the rows are: Version goes up on every refresh, so a screen can poll this cheaply and redraw only on change.
SET NOCOUNT ON;
IF EXISTS (SELECT 1 FROM ctl.SIC_RefreshState WHERE SiteKey = @SiteKey AND Pending = 1 AND (LastError IS NULL OR LastEndUtc < DATEADD(minute, -5, SYSUTCDATETIME())))
BEGIN TRY EXEC ctl.usp_RefreshSIC @SiteKey = @SiteKey; END TRY BEGIN CATCH PRINT ERROR_MESSAGE(); END CATCH
IF @To IS NULL SELECT @To = MAX(ProductionDate) FROM curated.SIC_Hourly WHERE SiteKey = @SiteKey;
IF @From IS NULL SET @From = @To;
SELECT * FROM curated.SIC_Hourly WHERE SiteKey = @SiteKey AND ProductionDate BETWEEN @From AND @To AND (@LineNo IS NULL OR [LineNo] = @LineNo) ORDER BY ProductionDate, [LineNo], HourStart;
SELECT SiteKey, Version, Pending, LastEndUtc AS RefreshedUtc, LastFrom, LastTo, LastRows, LastMs, LastError FROM ctl.SIC_RefreshState WHERE SiteKey = @SiteKey;
END

-- SIC refresh, step 9: backfill, checks and the settings you can change. Run one block at a time.

-- 1. Backfill every day F1 holds (builds the frozen targets for each day, then the hours). About 70 s on S1 for 9 days.
EXEC ctl.usp_RefreshSIC @SiteKey = 'HFI', @Days = 9, @Force = 1;

-- 2. Is it keeping up? Last refreshes, newest first. Ms is the whole refresh, typically 13 to 15 s on S1.
SELECT TOP 20 LogId, SiteKey, StartUtc, EndUtc, FromDate, ToDate, RowsWritten, TargetsBuilt, Ms, Outcome, ErrorMessage
FROM ctl.SIC_RefreshLog ORDER BY LogId DESC;

-- 3. Current state per site. Pending = 1 means a load is waiting for a refresh. Version goes up on every refresh.
SELECT SiteKey, Pending, InlineRefresh, WindowDays, MinGapSecs, BurstFiles, LastLoadId, Version, RequestedUtc, LastStartUtc, LastEndUtc,
LastFrom, LastTo, LastRows, LastMs, LastError
FROM ctl.SIC_RefreshState;

-- 4. Read path (what the app or an API should call). Returns the hours, then the freshness row.
EXEC curated.usp_GetSICHourly @SiteKey = 'HFI', @From = '2026-11-02', @To = '2026-11-02';
EXEC curated.usp_GetSICHourly @SiteKey = 'HFI', @LineNo = 7;

-- 5. Check the table against the view for one day: every figure that does not depend on the target should match exactly.
-- Targets differ by design: the table freezes each day at the best shift from the days before it, the view uses all history.
WITH a AS (SELECT [LineNo], COUNT(*) AS n, SUM(ActualPacks) AS ap, SUM(GiveawayKg) AS gk, SUM(RejectedPacks) AS rj, SUM(StopMins) AS st,
SUM(AvailableMins) AS av, SUM(PlanPacks) AS pl, SUM(TargetPacks) AS tg FROM curated.SIC_Hourly WHERE SiteKey = 'HFI' AND ProductionDate = '2026-11-02' GROUP BY [LineNo]),
b AS (SELECT [LineNo], COUNT(*) AS n, SUM(ActualPacks) AS ap, SUM(GiveawayKg) AS gk, SUM(RejectedPacks) AS rj, SUM(StopMins) AS st,
SUM(AvailableMins) AS av, SUM(PlanPacks) AS pl, SUM(TargetPacks) AS tg FROM curated.vSIC_Hourly WHERE SiteKey = 'HFI' AND ProductionDate = '2026-11-02' GROUP BY [LineNo])
SELECT COALESCE(a.[LineNo], b.[LineNo]) AS [LineNo], a.n, b.n AS view_n, a.ap, b.ap AS view_ap, a.gk, b.gk AS view_gk, a.pl, b.pl AS view_pl, a.tg, b.tg AS view_tg,
CASE WHEN a.n = b.n AND a.ap = b.ap AND a.gk = b.gk AND a.rj = b.rj AND a.st = b.st AND a.av = b.av AND ISNULL(a.pl, -1) = ISNULL(b.pl, -1) THEN 'match' ELSE 'CHECK' END AS result
FROM a FULL JOIN b ON a.[LineNo] = b.[LineNo] ORDER BY 1;

-- 6. Settings.
-- Stop refreshing inside the load (loads only mark the site pending, the read path refreshes on demand):
-- UPDATE ctl.SIC_RefreshState SET InlineRefresh = 0 WHERE SiteKey = 'HFI';
-- Recalculate more or fewer days at the end of the data (default 3):
-- UPDATE ctl.SIC_RefreshState SET WindowDays = 2 WHERE SiteKey = 'HFI';
-- Treat more than N files in 5 minutes as a backfill and skip the inline refresh (default 6):
-- UPDATE ctl.SIC_RefreshState SET BurstFiles = 10 WHERE SiteKey = 'HFI';
-- Skip the inline refresh if the last one ended less than N seconds ago (default 0, off):
-- UPDATE ctl.SIC_RefreshState SET MinGapSecs = 60 WHERE SiteKey = 'HFI';
-- Rebuild the frozen targets for one day (for example after a data correction), then refresh:
-- EXEC ctl.usp_BuildSICTargets @SiteKey = 'HFI', @AsOfDate = '2026-11-03';
-- EXEC ctl.usp_RefreshSIC @SiteKey = 'HFI', @Force = 1;

-- 7. If curated.vSIC_Hourly changes, rebuild the function from it (step 3), then drop and rebuild the table (step 4) and backfill (block 1).
-- The refresh fails safe if the columns no longer match: the load still succeeds and the error shows in ctl.SIC_RefreshState.LastError.

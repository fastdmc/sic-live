CREATE OR ALTER PROCEDURE ctl.usp_BuildSICTargets @SiteKey varchar(10), @AsOfDate date, @HistoryDays int = 56
AS
BEGIN
-- Best-shift targets for one site and production day, from the days BEFORE it only, so the target is fixed for the whole day.
-- Same rules as curated.vSIC_Hourly: best day rate in packs per run minute for the line and product under the same standard on 2 or more days (S),
-- else for the line and product on 2 or more days (A), else the best day for the line with 4 or more run hours (L). A day needs 60 run minutes.
-- The standard signature is built exactly as in the view, so the join in curated.fnSIC_Hourly matches.
SET NOCOUNT ON;
DECLARE @lo datetime2(3) = DATEADD(day, -@HistoryDays, CAST(@AsOfDate AS datetime2(3))), @hi datetime2(3) = CAST(@AsOfDate AS datetime2(3));
DELETE FROM curated.SIC_Target WHERE SiteKey = @SiteKey AND AsOfDate = @AsOfDate;
WITH f1 AS (SELECT TRY_CONVERT(int, [LineNo]) AS [LineNo], RunRollupKey, ArticleKey, TRY_CONVERT(datetime2(3), RunStart) AS RunStart,
TRY_CONVERT(int, ShiftLength) AS RunSecs, TRY_CONVERT(int, PacksCount) AS Packs,
ROW_NUMBER() OVER (PARTITION BY RunRollupKey ORDER BY LoadId DESC) AS rn
FROM stg.F1_RunPerformance
WHERE SiteKey = @SiteKey AND TRY_CONVERT(datetime2(3), RunStart) >= @lo AND TRY_CONVERT(datetime2(3), RunStart) < @hi),
s AS (SELECT RunRollupKey, TRY_CONVERT(float, StdTargetSpeed) AS StdSpeed, TRY_CONVERT(decimal(9,3), StdTrayTargetWt) AS StdTrayKg,
ROW_NUMBER() OVER (PARTITION BY RunRollupKey ORDER BY LoadId DESC) AS rn
FROM stg.F5_OrderStandardsSpine WHERE SiteKey = @SiteKey AND RunRollupKey IN (SELECT RunRollupKey FROM f1)),
g AS (SELECT RunRollupKey, MAX(TRY_CONVERT(decimal(9,3), TrayTargetWeight)) AS TargetKg,
MAX(TRY_CONVERT(decimal(9,3), REPLACE(TrayFixedWeight, CHAR(13), ''))) AS FixedKg
FROM (SELECT *, DENSE_RANK() OVER (PARTITION BY RunRollupKey ORDER BY LoadId DESC) AS dr FROM stg.F4_GiveawayAndWeight WHERE SiteKey = @SiteKey AND RunRollupKey IN (SELECT RunRollupKey FROM f1)) x
WHERE dr = 1 GROUP BY RunRollupKey),
d AS (SELECT r.[LineNo], r.ArticleKey, CONCAT(s.StdSpeed, '|', s.StdTrayKg, '|', g.TargetKg, '|', g.FixedKg) AS StdSig, CAST(r.RunStart AS date) AS D, r.Packs, r.RunSecs
FROM f1 r LEFT JOIN s ON s.RunRollupKey = r.RunRollupKey AND s.rn = 1 LEFT JOIN g ON g.RunRollupKey = r.RunRollupKey
WHERE r.rn = 1 AND r.RunStart IS NOT NULL AND r.[LineNo] IS NOT NULL)
INSERT curated.SIC_Target (SiteKey, AsOfDate, Lvl, [LineNo], ArticleKey, StdSig, BestRate, nDays)
SELECT @SiteKey, @AsOfDate, 'S', [LineNo], ArticleKey, StdSig, MAX(DayRate), COUNT(*)
FROM (SELECT [LineNo], ArticleKey, StdSig, D, SUM(Packs) * 60.0 / NULLIF(SUM(RunSecs), 0) AS DayRate FROM d WHERE ArticleKey IS NOT NULL
GROUP BY [LineNo], ArticleKey, StdSig, D HAVING SUM(RunSecs) >= 3600) x WHERE DayRate IS NOT NULL GROUP BY [LineNo], ArticleKey, StdSig
UNION ALL
SELECT @SiteKey, @AsOfDate, 'A', [LineNo], ArticleKey, N'', MAX(DayRate), COUNT(*)
FROM (SELECT [LineNo], ArticleKey, D, SUM(Packs) * 60.0 / NULLIF(SUM(RunSecs), 0) AS DayRate FROM d WHERE ArticleKey IS NOT NULL
GROUP BY [LineNo], ArticleKey, D HAVING SUM(RunSecs) >= 3600) x WHERE DayRate IS NOT NULL GROUP BY [LineNo], ArticleKey
UNION ALL
SELECT @SiteKey, @AsOfDate, 'L', [LineNo], N'', N'', MAX(DayRate), COUNT(*)
FROM (SELECT [LineNo], D, SUM(Packs) * 60.0 / NULLIF(SUM(RunSecs), 0) AS DayRate FROM d
GROUP BY [LineNo], D HAVING SUM(RunSecs) >= 14400) x WHERE DayRate IS NOT NULL GROUP BY [LineNo];
END

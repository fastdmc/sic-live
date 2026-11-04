-- SIC refresh, step 3: builds curated.fnSIC_Hourly(@SiteKey, @From, @To) from the deployed curated.vSIC_Hourly definition,
-- so the hour logic stays in one place. Each edit checks its anchor and stops if the view text has changed.
-- Changes from the view: one site and a date window (35 days of history for the standard-change comparison),
-- targets read from curated.SIC_Target for the production day instead of being recalculated from all history.
-- Plan packs and the planned first crate come through unchanged from the view, which reads curated.vProductionSchedule.
DECLARE @d nvarchar(max) = REPLACE(OBJECT_DEFINITION(OBJECT_ID(N'curated.vSIC_Hourly')), NCHAR(13), N''), @nl nchar(1) = NCHAR(10), @n int, @p int, @q int, @x nvarchar(max);
IF @d IS NULL THROW 50100, N'curated.vSIC_Hourly not found', 1;
SET @p = CHARINDEX(N'WITH f1 AS (', @d);
IF @p = 0 THROW 50101, N'anchor WITH f1', 1;
SET @d = STUFF(@d, 1, @p - 1, N'CREATE OR ALTER FUNCTION curated.fnSIC_Hourly (@SiteKey varchar(10), @From date, @To date)' + @nl + N'RETURNS TABLE' + @nl + N'AS' + @nl + N'RETURN' + @nl);
SET @n = LEN(@d); SET @d = REPLACE(@d, N'FROM stg.F1_RunPerformance),', N'FROM stg.F1_RunPerformance WHERE SiteKey = @SiteKey AND TRY_CONVERT(datetime2(3), RunStart) >= DATEADD(day, -35, CAST(@From AS datetime2(3))) AND TRY_CONVERT(datetime2(3), RunStart) < DATEADD(day, 1, CAST(@To AS datetime2(3)))),');
IF LEN(@d) = @n THROW 50102, N'anchor F1', 1;
SET @n = LEN(@d); SET @d = REPLACE(@d, N'FROM stg.F5_OrderStandardsSpine),', N'FROM stg.F5_OrderStandardsSpine WHERE SiteKey = @SiteKey AND RunRollupKey IN (SELECT RunRollupKey FROM f1)),');
IF LEN(@d) = @n THROW 50103, N'anchor F5', 1;
SET @n = LEN(@d); SET @d = REPLACE(@d, N'FROM stg.F4_GiveawayAndWeight) x', N'FROM stg.F4_GiveawayAndWeight WHERE SiteKey = @SiteKey AND RunRollupKey IN (SELECT RunRollupKey FROM f1)) x');
IF LEN(@d) = @n THROW 50104, N'anchor F4', 1;
SET @p = CHARINDEX(N'best_sig AS (', @d); SET @q = CHARINDEX(N'day_ AS (', @d);
IF @p = 0 OR @q <= @p THROW 50105, N'anchor best block', 1;
SET @x = N'best_sig AS (SELECT SiteKey, [LineNo], ArticleKey, StdSig, AsOfDate, BestRate, nDays FROM curated.SIC_Target WHERE SiteKey = @SiteKey AND Lvl = ''S'' AND AsOfDate BETWEEN @From AND @To),' + @nl
+ N'best_art AS (SELECT SiteKey, [LineNo], ArticleKey, AsOfDate, BestRate, nDays FROM curated.SIC_Target WHERE SiteKey = @SiteKey AND Lvl = ''A'' AND AsOfDate BETWEEN @From AND @To),' + @nl
+ N'best_line AS (SELECT SiteKey, [LineNo], AsOfDate, BestRate FROM curated.SIC_Target WHERE SiteKey = @SiteKey AND Lvl = ''L'' AND AsOfDate BETWEEN @From AND @To),' + @nl;
SET @d = STUFF(@d, @p, @q - @p, @x);
SET @n = LEN(@d); SET @d = REPLACE(@d, N'FROM f1d' + @nl + N'GROUP BY SiteKey, [LineNo], CAST(RunStart AS date)),', N'FROM f1d' + @nl + N'WHERE RunStart >= CAST(@From AS datetime2(3))' + @nl + N'GROUP BY SiteKey, [LineNo], CAST(RunStart AS date)),');
IF LEN(@d) = @n THROW 50106, N'anchor day_', 1;
SET @n = LEN(@d); SET @d = REPLACE(@d, N'AND bs.nDays >= 2', N'AND bs.nDays >= 2 AND bs.AsOfDate = CAST(r.RunStart AS date)');
IF LEN(@d) = @n THROW 50107, N'anchor bs', 1;
SET @n = LEN(@d); SET @d = REPLACE(@d, N'AND ba.nDays >= 2', N'AND ba.nDays >= 2 AND ba.AsOfDate = CAST(r.RunStart AS date)');
IF LEN(@d) = @n THROW 50108, N'anchor ba', 1;
SET @n = LEN(@d); SET @d = REPLACE(@d, N'LEFT JOIN best_line bl ON bl.SiteKey = r.SiteKey AND bl.[LineNo] = r.[LineNo]', N'LEFT JOIN best_line bl ON bl.SiteKey = r.SiteKey AND bl.[LineNo] = r.[LineNo] AND bl.AsOfDate = CAST(r.RunStart AS date)');
IF LEN(@d) = @n THROW 50109, N'anchor bl agg', 1;
SET @n = LEN(@d); SET @d = REPLACE(@d, N'GROUP BY r.SiteKey, r.[LineNo], r.HourStart),', N'WHERE r.RunStart >= CAST(@From AS datetime2(3))' + @nl + N'GROUP BY r.SiteKey, r.[LineNo], r.HourStart),');
IF LEN(@d) = @n THROW 50110, N'anchor agg', 1;
SET @n = LEN(@d); SET @d = REPLACE(@d, N'LEFT JOIN best_line bl ON bl.SiteKey = h.SiteKey AND bl.[LineNo] = h.[LineNo]', N'LEFT JOIN best_line bl ON bl.SiteKey = h.SiteKey AND bl.[LineNo] = h.[LineNo] AND bl.AsOfDate = h.ProductionDate');
IF LEN(@d) = @n THROW 50111, N'anchor bl calc', 1;
SET @n = LEN(@d); SET @d = REPLACE(@d, N'FROM stg.F3_Downtime),', N'FROM stg.F3_Downtime WHERE SiteKey = @SiteKey AND TRY_CONVERT(datetime2(3), StartDate) >= DATEADD(day, -2, CAST(@From AS datetime2(3))) AND TRY_CONVERT(datetime2(3), StartDate) < DATEADD(day, 2, CAST(@To AS datetime2(3)))),');
IF LEN(@d) = @n THROW 50112, N'anchor F3', 1;
EXEC sp_executesql @d;
SELECT OBJECT_ID(N'curated.fnSIC_Hourly') AS FnId, LEN(@d) AS DefinitionLength;

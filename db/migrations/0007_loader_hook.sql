-- SIC refresh, step 7: adds the SIC refresh request to the end of ctl.usp_LoadFeedFile, after a successful load only.
-- Feeds that change a SIC figure: F1, F3, F4 and F5 (runs, downtime, giveaway, standards), F8 and F9 (article master and changes), F12 (plan).
-- Edits the deployed definition in place, so nothing else in the loader changes. Safe to re-run: stops if the hook is already there.
DECLARE @d nvarchar(max) = OBJECT_DEFINITION(OBJECT_ID(N'ctl.usp_LoadFeedFile')), @i int, @e int, @inj nvarchar(max), @crlf nchar(2) = NCHAR(13) + NCHAR(10);
IF @d IS NULL THROW 50200, N'ctl.usp_LoadFeedFile not found', 1;
IF CHARINDEX(N'usp_RequestSICRefresh', @d) > 0 THROW 50201, N'hook already in place', 1;
SET @i = CHARINDEX(REVERSE(N'END CATCH'), REVERSE(@d));
IF @i = 0 THROW 50202, N'END CATCH not found', 1;
SET @e = DATALENGTH(@d) / 2 - @i + 1;
SET @inj = @crlf + N'-- SIC refresh request: only reached when the load succeeded, and it can never fail the load' + @crlf
+ N'IF @FeedCode IN (''F1'', ''F3'', ''F4'', ''F5'', ''F8'', ''F9'', ''F12'')' + @crlf
+ N'BEGIN TRY EXEC ctl.usp_RequestSICRefresh @SiteKey = @SiteKey; END TRY BEGIN CATCH PRINT ERROR_MESSAGE(); END CATCH';
SET @d = STUFF(@d, @e + 1, 0, @inj);
SET @d = STUFF(@d, 1, CHARINDEX(N'PROCEDURE', @d) - 1, N'CREATE OR ALTER ');
EXEC sp_executesql @d;
SELECT RIGHT(OBJECT_DEFINITION(OBJECT_ID(N'ctl.usp_LoadFeedFile')), 420) AS LoaderTail;

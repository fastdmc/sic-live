-- SIC refresh rollback. Only run this to take the materialised SIC out again.
-- Block 1 removes the hook from ctl.usp_LoadFeedFile, leaving the loader exactly as it was before step 7.
DECLARE @d nvarchar(max) = OBJECT_DEFINITION(OBJECT_ID(N'ctl.usp_LoadFeedFile')), @p int, @q int;
SET @p = CHARINDEX(NCHAR(13) + NCHAR(10) + N'-- SIC refresh request:', @d);
SET @q = CHARINDEX(N'END CATCH', @d, CHARINDEX(N'usp_RequestSICRefresh', @d));
IF @p = 0 OR @q = 0 THROW 50500, N'hook not found', 1;
SET @d = STUFF(@d, @p, @q + LEN(N'END CATCH') - @p, N'');
SET @d = STUFF(@d, 1, CHARINDEX(N'PROCEDURE', @d) - 1, N'CREATE OR ALTER ');
EXEC sp_executesql @d;
SELECT CHARINDEX(N'usp_RequestSICRefresh', OBJECT_DEFINITION(OBJECT_ID(N'ctl.usp_LoadFeedFile'))) AS HookStillThere;

-- Block 2 (optional) drops the refresh objects and tables. Uncomment to run.
-- DROP PROCEDURE IF EXISTS curated.usp_GetSICHourly;
-- DROP PROCEDURE IF EXISTS ctl.usp_RequestSICRefresh;
-- DROP PROCEDURE IF EXISTS ctl.usp_RefreshSIC;
-- DROP PROCEDURE IF EXISTS ctl.usp_BuildSICTargets;
-- DROP FUNCTION IF EXISTS curated.fnSIC_Hourly;
-- DROP TABLE IF EXISTS curated.SIC_Hourly;
-- DROP TABLE IF EXISTS curated.SIC_Target;
-- DROP TABLE IF EXISTS ctl.SIC_RefreshLog;
-- DROP TABLE IF EXISTS ctl.SIC_RefreshState;

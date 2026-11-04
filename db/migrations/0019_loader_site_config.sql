-- 0019: NOT APPLIED. Review, then apply to HiltonMoa-test first, then live.
-- ctl.usp_LoadFeedFile picks the external data source and blob container from ctl.Site instead of a hard-coded CASE for HFI and HFUK,
-- so a new site's files load once its row exists in ctl.Site (and its external data source exists). Everything else in the loader is kept.
-- Edits the deployed definition in place with anchored REPLACEs (checked live on 4 Nov 2026: the CASE anchor at character 290, the message at 524).
DECLARE @d nvarchar(max) = OBJECT_DEFINITION(OBJECT_ID(N'ctl.usp_LoadFeedFile')), @n int;
IF @d IS NULL THROW 50800, N'ctl.usp_LoadFeedFile not found', 1;
IF CHARINDEX(N'FROM ctl.Site WHERE SiteKey = @SiteKey', @d) > 0 THROW 50801, N'0019 already applied', 1;
SET @n = LEN(@d);
SET @d = REPLACE(@d,
N'SELECT @DataSource = CASE @SiteKey WHEN ''HFI'' THEN ''HfiInbound'' WHEN ''HFUK'' THEN ''HfukInbound'' END, @Container = CASE @SiteKey WHEN ''HFI'' THEN ''hfi-inbound'' WHEN ''HFUK'' THEN ''hfuk-inbound'' END;',
N'SELECT @DataSource = DataSourceName, @Container = ContainerName FROM ctl.Site WHERE SiteKey = @SiteKey AND IsActive = 1;');
IF LEN(@d) = @n THROW 50802, N'Anchor not found: the loader has changed. Export its definition and update this script.', 1;
SET @d = REPLACE(@d, N'Unknown SiteKey %s. Expected HFI or HFUK.', N'Unknown or inactive SiteKey %s. Add the site to ctl.Site.');
SET @d = STUFF(@d, 1, CHARINDEX(N'PROCEDURE', @d) - 1, N'CREATE OR ALTER ');
EXEC sp_executesql @d;
INSERT ctl.SchemaMigration (MigrationId, Notes) SELECT '0019_loader_site_config', N'Loader reads data source and container from ctl.Site'
WHERE NOT EXISTS (SELECT 1 FROM ctl.SchemaMigration WHERE MigrationId = '0019_loader_site_config');
SELECT CHARINDEX(N'FROM ctl.Site WHERE SiteKey = @SiteKey', OBJECT_DEFINITION(OBJECT_ID(N'ctl.usp_LoadFeedFile'))) AS Applied,
CHARINDEX(N'usp_RequestSICRefresh', OBJECT_DEFINITION(OBJECT_ID(N'ctl.usp_LoadFeedFile'))) AS SicHookKept;

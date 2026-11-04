# 0019: loader reads site config (not applied)

**What it changes.** One statement in `ctl.usp_LoadFeedFile`: the external data source and container now come from `ctl.Site` (`DataSourceName`, `ContainerName`, active sites only) instead of a CASE that knows only HFI and HFUK. The error message for an unknown site changes to say "Add the site to ctl.Site". Nothing else in the loader changes, and the SIC refresh hook from 0007 is kept (the script's last select proves it).

**Why.** So a new site needs rows, not a code change. HFI and HFUK already have the same values in `ctl.Site` as the CASE, so behaviour for them is identical.

**Before applying.**
1. Check `ctl.Site` has `DataSourceName` and `ContainerName` for every site that loads files: `SELECT SiteKey, DataSourceName, ContainerName, IsActive FROM ctl.Site;` (HFI `HfiInbound` / `hfi-inbound`, HFUK `HfukInbound` / `hfuk-inbound`).
2. Apply on `HiltonMoa-test`, load one HFI file through the Function App or by calling `EXEC ctl.usp_LoadFeedFile @FeedCode = 'F1', @SiteKey = 'HFI', @BlobName = '<a test blob>'`, and confirm `ctl.FileLoad` shows it Succeeded.
3. Agree a quiet window with whoever else edits the loader (it was last changed on 4 Nov 2026 at 10:53 UTC).

**Roll back.** Run the same technique in reverse:

```sql
DECLARE @d nvarchar(max) = OBJECT_DEFINITION(OBJECT_ID(N'ctl.usp_LoadFeedFile'));
SET @d = REPLACE(@d, N'SELECT @DataSource = DataSourceName, @Container = ContainerName FROM ctl.Site WHERE SiteKey = @SiteKey AND IsActive = 1;',
N'SELECT @DataSource = CASE @SiteKey WHEN ''HFI'' THEN ''HfiInbound'' WHEN ''HFUK'' THEN ''HfukInbound'' END, @Container = CASE @SiteKey WHEN ''HFI'' THEN ''hfi-inbound'' WHEN ''HFUK'' THEN ''hfuk-inbound'' END;');
SET @d = REPLACE(@d, N'Unknown or inactive SiteKey %s. Add the site to ctl.Site.', N'Unknown SiteKey %s. Expected HFI or HFUK.');
SET @d = STUFF(@d, 1, CHARINDEX(N'PROCEDURE', @d) - 1, N'CREATE OR ALTER ');
EXEC sp_executesql @d;
DELETE ctl.SchemaMigration WHERE MigrationId = '0019_loader_site_config';
```

**A new site also needs** its database scoped credential and external data source for its blob container (a DMC admin task, not part of this script), its row in `ctl.Site`, its areas and lines, and role grants.

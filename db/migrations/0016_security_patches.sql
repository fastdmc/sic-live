-- SIC app, step 16: database roles, row-level security on site, and two patches to existing objects. Each block is its own batch.
-- sic_app_role: the API's managed identity. It sees only the sites its signed-in user (SESSION_CONTEXT UserId) or floor device (DeviceSiteKey) is allowed.
-- sic_worker_role: the 1-minute worker's managed identity. Not filtered, and can only run the refresh, the escalation engine and the outbox.
-- Everyone outside sic_app_role (the feed loader, admins) is unaffected. Add the identities later with:
--   CREATE USER [<api identity name>] FROM EXTERNAL PROVIDER; ALTER ROLE sic_app_role ADD MEMBER [<api identity name>];
--   CREATE USER [<worker identity name>] FROM EXTERNAL PROVIDER; ALTER ROLE sic_worker_role ADD MEMBER [<worker identity name>];

-- 16a. Roles and grants.
IF DATABASE_PRINCIPAL_ID(N'sic_app_role') IS NULL CREATE ROLE sic_app_role;
IF DATABASE_PRINCIPAL_ID(N'sic_worker_role') IS NULL CREATE ROLE sic_worker_role;
GRANT SELECT ON curated.vSIC_HourlyApp TO sic_app_role;
GRANT SELECT ON ctl.Site TO sic_app_role;
GRANT SELECT ON ctl.Area TO sic_app_role;
GRANT SELECT ON ctl.Line TO sic_app_role;
GRANT SELECT ON ctl.ReasonCode TO sic_app_role;
GRANT SELECT ON ctl.EscalationRule TO sic_app_role;
GRANT SELECT ON app.HourComment TO sic_app_role;
GRANT SELECT ON app.Action TO sic_app_role;
GRANT SELECT ON app.ActionUpdate TO sic_app_role;
GRANT SELECT ON app.Escalation TO sic_app_role;
GRANT SELECT ON app.Notification TO sic_app_role;
GRANT SELECT (UserId, Email, DisplayName, JobTitle, IsActive) ON app.AppUser TO sic_app_role;
GRANT EXECUTE ON curated.usp_GetSICHourly TO sic_app_role;
GRANT EXECUTE ON app.usp_UpsertUser TO sic_app_role;
GRANT EXECUTE ON app.usp_AddHourComment TO sic_app_role;
GRANT EXECUTE ON app.usp_SaveAction TO sic_app_role;
GRANT EXECUTE ON app.usp_AckEscalation TO sic_app_role;
GRANT EXECUTE ON app.usp_MarkNotificationsRead TO sic_app_role;
GRANT EXECUTE ON app.usp_SaveUserSiteRole TO sic_app_role;
GRANT EXECUTE ON app.usp_ResolveDeviceKey TO sic_app_role;
GRANT EXECUTE ON app.usp_EvaluateEscalations TO sic_worker_role;
GRANT EXECUTE ON app.usp_ClaimNotifications TO sic_worker_role;
GRANT EXECUTE ON app.usp_CompleteNotification TO sic_worker_role;
GRANT EXECUTE ON ctl.usp_RefreshSIC TO sic_worker_role;
GRANT SELECT ON ctl.NotificationTarget TO sic_worker_role;
GRANT SELECT ON ctl.Site TO sic_worker_role;
SELECT name, type_desc FROM sys.database_principals WHERE name IN (N'sic_app_role', N'sic_worker_role');

-- 16b. The site predicate.
CREATE OR ALTER FUNCTION app.fnSiteAccess (@SiteKey varchar(10)) RETURNS TABLE WITH SCHEMABINDING
AS
RETURN SELECT 1 AS ok
WHERE IS_MEMBER(N'sic_app_role') = 0
OR CAST(SESSION_CONTEXT(N'DeviceSiteKey') AS varchar(10)) = @SiteKey
OR EXISTS (SELECT 1 FROM app.AppUser u WHERE u.UserId = CAST(SESSION_CONTEXT(N'UserId') AS int) AND u.IsActive = 1
AND (u.IsGroupAdmin = 1 OR EXISTS (SELECT 1 FROM app.UserSiteRole r WHERE r.UserId = u.UserId AND r.SiteKey = @SiteKey)));

-- 16c. The policy. To rebuild curated.SIC_Hourly later: ALTER SECURITY POLICY app.SiteFilter WITH (STATE = OFF), drop the SIC_Hourly predicate, rebuild, add it back.
CREATE SECURITY POLICY app.SiteFilter
ADD FILTER PREDICATE app.fnSiteAccess(SiteKey) ON curated.SIC_Hourly,
ADD FILTER PREDICATE app.fnSiteAccess(SiteKey) ON app.HourComment,
ADD BLOCK PREDICATE app.fnSiteAccess(SiteKey) ON app.HourComment AFTER INSERT,
ADD FILTER PREDICATE app.fnSiteAccess(SiteKey) ON app.Action,
ADD BLOCK PREDICATE app.fnSiteAccess(SiteKey) ON app.Action AFTER INSERT,
ADD BLOCK PREDICATE app.fnSiteAccess(SiteKey) ON app.Action AFTER UPDATE,
ADD FILTER PREDICATE app.fnSiteAccess(SiteKey) ON app.ActionUpdate,
ADD FILTER PREDICATE app.fnSiteAccess(SiteKey) ON app.Escalation,
ADD FILTER PREDICATE app.fnSiteAccess(SiteKey) ON app.Notification,
ADD FILTER PREDICATE app.fnSiteAccess(SiteKey) ON app.AuditLog
WITH (STATE = ON);

-- 16d. Multi-site fix: F9 master-data changes are matched on site as well as SAP number, in the view and in the refresh function.
DECLARE @o sysname, @d nvarchar(max), @n int, @kw nvarchar(20);
DECLARE p CURSOR LOCAL FAST_FORWARD FOR SELECT N'curated.vSIC_Hourly' UNION ALL SELECT N'curated.fnSIC_Hourly';
OPEN p; FETCH NEXT FROM p INTO @o;
WHILE @@FETCH_STATUS = 0
BEGIN
SET @d = OBJECT_DEFINITION(OBJECT_ID(@o)); SET @kw = CASE WHEN @o LIKE N'%.v%' THEN N'VIEW' ELSE N'FUNCTION' END;
IF CHARINDEX(N'f.SiteKey = h.SiteKey', @d) = 0
BEGIN
SET @n = LEN(@d); SET @d = REPLACE(@d, N'f9 AS (SELECT c.ArticleNumber,', N'f9 AS (SELECT c.SiteKey, c.ArticleNumber,'); IF LEN(@d) = @n THROW 50701, N'anchor f9 select', 1;
SET @n = LEN(@d); SET @d = REPLACE(@d, N'GROUP BY c.ArticleNumber, c.[Column]', N'GROUP BY c.SiteKey, c.ArticleNumber, c.[Column]'); IF LEN(@d) = @n THROW 50702, N'anchor f9 group', 1;
SET @n = LEN(@d); SET @d = REPLACE(@d, N'FROM f9 f WHERE f.ArticleNumber = km.SAPNumber', N'FROM f9 f WHERE f.SiteKey = h.SiteKey AND f.ArticleNumber = km.SAPNumber'); IF LEN(@d) = @n THROW 50703, N'anchor f9 join', 1;
SET @d = STUFF(@d, 1, CHARINDEX(@kw, @d) - 1, N'CREATE OR ALTER ');
EXEC sp_executesql @d;
END
FETCH NEXT FROM p INTO @o;
END
CLOSE p; DEALLOCATE p;
SELECT CHARINDEX(N'f.SiteKey = h.SiteKey', OBJECT_DEFINITION(OBJECT_ID(N'curated.vSIC_Hourly'))) AS ViewFixed, CHARINDEX(N'f.SiteKey = h.SiteKey', OBJECT_DEFINITION(OBJECT_ID(N'curated.fnSIC_Hourly'))) AS FunctionFixed;

-- 16e. Each feed load also runs the escalation engine after the SIC refresh, so escalations do not wait for the worker.
DECLARE @r nvarchar(max) = OBJECT_DEFINITION(OBJECT_ID(N'ctl.usp_RequestSICRefresh')), @m int;
IF CHARINDEX(N'usp_EvaluateEscalations', @r) = 0
BEGIN
SET @m = LEN(@r); SET @r = REPLACE(@r, N'EXEC ctl.usp_RefreshSIC @SiteKey = @SiteKey;', N'EXEC ctl.usp_RefreshSIC @SiteKey = @SiteKey;' + NCHAR(13) + NCHAR(10) + N'EXEC app.usp_EvaluateEscalations @SiteKey = @SiteKey;');
IF LEN(@r) = @m THROW 50711, N'anchor refresh call', 1;
SET @r = STUFF(@r, 1, CHARINDEX(N'PROCEDURE', @r) - 1, N'CREATE OR ALTER ');
EXEC sp_executesql @r;
END
SELECT CHARINDEX(N'usp_EvaluateEscalations', OBJECT_DEFINITION(OBJECT_ID(N'ctl.usp_RequestSICRefresh'))) AS Hooked;

-- 16f. Record what has been applied.
INSERT ctl.SchemaMigration (MigrationId, Notes) SELECT m, n FROM (VALUES
('0001_sic_refresh_tables', N'SIC refresh 1'), ('0002_build_sic_targets', N'SIC refresh 2'), ('0003_fn_sic_hourly', N'SIC refresh 3'), ('0004_sic_hourly', N'SIC refresh 4'),
('0005_refresh_sic', N'SIC refresh 5, incremental + RECOMPILE'), ('0006_request_refresh', N'SIC refresh 6, burst guard'), ('0007_loader_hook', N'SIC refresh 7'),
('0008_get_sic_hourly', N'SIC refresh 8'), ('0011_config_tables', N'SIC app 11'), ('0012_app_tables', N'SIC app 12'), ('0013_view_functions', N'SIC app 13'),
('0014_procedures', N'SIC app 14'), ('0015_escalation_outbox', N'SIC app 15'), ('0016_security_patches', N'SIC app 16')) AS v (m, n)
WHERE NOT EXISTS (SELECT 1 FROM ctl.SchemaMigration x WHERE x.MigrationId = v.m);
SELECT MigrationId, AppliedUtc, AppliedBy FROM ctl.SchemaMigration ORDER BY MigrationId;

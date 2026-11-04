-- SIC app, step 18: the cheap freshness check the screens poll every 30 s. Each block is its own batch.
CREATE OR ALTER PROCEDURE app.usp_GetSicVersion @SiteKey varchar(10)
AS
BEGIN
-- Cheap freshness check the screens poll every 30 s: Version goes up on every SIC refresh, so a screen refetches only when it changes.
SET NOCOUNT ON;
IF IS_MEMBER(N'sic_app_role') = 1 AND NOT EXISTS (SELECT 1 FROM app.fnSiteAccess(@SiteKey)) THROW 50651, N'No access to this site', 1;
SELECT s.SiteKey, ISNULL(r.Version, 0) AS Version, r.LastEndUtc AS RefreshedUtc, CAST(ISNULL(r.Pending, 0) AS bit) AS Pending, r.LastFrom, r.LastTo,
(SELECT MAX(h.ProductionDate) FROM curated.SIC_Hourly h WHERE h.SiteKey = s.SiteKey) AS LatestDay
FROM ctl.Site s LEFT JOIN ctl.SIC_RefreshState r ON r.SiteKey = s.SiteKey WHERE s.SiteKey = @SiteKey;
END;

GRANT EXECUTE ON app.usp_GetSicVersion TO sic_app_role;
INSERT ctl.SchemaMigration (MigrationId, Notes) SELECT '0018_get_sic_version', N'SIC app 18' WHERE NOT EXISTS (SELECT 1 FROM ctl.SchemaMigration WHERE MigrationId = '0018_get_sic_version');

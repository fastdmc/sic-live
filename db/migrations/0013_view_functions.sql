-- SIC app, step 13: what the app reads, and two helpers. Run each block on its own (each CREATE must start its batch).

-- 13a. curated.vSIC_HourlyApp: the materialised SIC hour + site, area and line names, the RAG at the site's own limits,
-- the latest comment (Note* columns, which fill the SIC form's Issue, Containment, Help called and Help arrived) and open actions.
CREATE OR ALTER VIEW curated.vSIC_HourlyApp
AS
SELECT h.*, s.SiteName, l.LineName, l.AreaKey, a.AreaName, l.CellName,
CASE WHEN h.TargetPacks > 0 AND h.AvailableMins >= s.RagMinAvailMins THEN CASE WHEN h.ActualPacks >= s.RagGreenPct / 100.0 * h.TargetPacks THEN 'G'
WHEN h.ActualPacks >= s.RagAmberPct / 100.0 * h.TargetPacks THEN 'A' ELSE 'R' END END AS SiteRAG,
c.CommentId AS NoteId, c.ReasonCode AS NoteReason, rc.ReasonName AS NoteReasonName, c.Issue AS NoteIssue, c.ContainmentAction AS NoteContainment,
c.HelpCalledAt AS NoteHelpCalled, c.HelpArrivedAt AS NoteHelpArrived, u.DisplayName AS NoteBy, c.CreatedUtc AS NoteUtc,
ISNULL(nc.n, 0) AS NoteCount, ISNULL(ac.n, 0) AS OpenActions, ac.NextDue AS NextActionDue, ac.Owners AS ActionOwners
FROM curated.SIC_Hourly h
JOIN ctl.Site s ON s.SiteKey = h.SiteKey
LEFT JOIN ctl.Line l ON l.SiteKey = h.SiteKey AND l.[LineNo] = h.[LineNo]
LEFT JOIN ctl.Area a ON a.SiteKey = l.SiteKey AND a.AreaKey = l.AreaKey
OUTER APPLY (SELECT TOP 1 x.CommentId, x.ReasonCode, x.Issue, x.ContainmentAction, x.HelpCalledAt, x.HelpArrivedAt, x.CreatedBy, x.CreatedUtc FROM app.HourComment x
WHERE x.SiteKey = h.SiteKey AND x.ProductionDate = h.ProductionDate AND x.[LineNo] = h.[LineNo] AND x.HourStart = h.HourStart AND x.IsDeleted = 0 ORDER BY x.CreatedUtc DESC) c
LEFT JOIN app.AppUser u ON u.UserId = c.CreatedBy
LEFT JOIN ctl.ReasonCode rc ON rc.SiteKey = h.SiteKey AND rc.ReasonCode = c.ReasonCode
OUTER APPLY (SELECT COUNT(*) AS n FROM app.HourComment x WHERE x.SiteKey = h.SiteKey AND x.ProductionDate = h.ProductionDate AND x.[LineNo] = h.[LineNo] AND x.HourStart = h.HourStart AND x.IsDeleted = 0) nc
OUTER APPLY (SELECT COUNT(*) AS n, MIN(x.DueDate) AS NextDue, STRING_AGG(CAST(COALESCE(o.DisplayName, x.OwnerName) AS nvarchar(max)), ', ') AS Owners
FROM app.Action x LEFT JOIN app.AppUser o ON o.UserId = x.OwnerUserId
WHERE x.SiteKey = h.SiteKey AND x.[LineNo] = h.[LineNo] AND x.HourStart = h.HourStart AND x.Status IN ('Open', 'InProgress')) ac;

-- 13b. The current app user, set by the API on every request with sp_set_session_context N'UserId'.
CREATE OR ALTER FUNCTION app.fnCurrentUserId () RETURNS int AS BEGIN RETURN CAST(SESSION_CONTEXT(N'UserId') AS int); END;

-- 13c. A user's highest role at a site, for an area or the whole site: 0 none, 1 Viewer, 2 LineLeader, 3 AreaManager, 4 SiteManager, 5 SiteAdmin or group admin.
CREATE OR ALTER FUNCTION app.fnRoleRank (@UserId int, @SiteKey varchar(10), @AreaKey varchar(20)) RETURNS int
AS
BEGIN
DECLARE @r int;
SELECT @r = MAX(CASE Role WHEN 'Viewer' THEN 1 WHEN 'LineLeader' THEN 2 WHEN 'AreaManager' THEN 3 WHEN 'SiteManager' THEN 4 WHEN 'SiteAdmin' THEN 5 END)
FROM app.UserSiteRole WHERE UserId = @UserId AND SiteKey = @SiteKey AND (AreaKey = '' OR AreaKey = ISNULL(@AreaKey, ''));
IF EXISTS (SELECT 1 FROM app.AppUser WHERE UserId = @UserId AND IsGroupAdmin = 1 AND IsActive = 1) SET @r = 5;
IF NOT EXISTS (SELECT 1 FROM app.AppUser WHERE UserId = @UserId AND IsActive = 1) SET @r = 0;
RETURN ISNULL(@r, 0);
END;

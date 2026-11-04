# Database: HiltonMoa (Azure SQL, server hiltonfoods, S1)

## Applied to live on 4 Nov 2026 (never edit these files)

| File | What it does |
| --- | --- |
| 0001_sic_refresh_tables | `curated.SIC_Target`, `ctl.SIC_RefreshState`, `ctl.SIC_RefreshLog` |
| 0002_build_sic_targets | `ctl.usp_BuildSICTargets`: frozen best-shift targets per day from earlier days |
| 0003_fn_sic_hourly | `curated.fnSIC_Hourly`: the SIC calculation for one site and date window, built from `curated.vSIC_Hourly` |
| 0004_sic_hourly | `curated.SIC_Hourly`: the materialised hourly SIC table |
| 0005_refresh_sic | `ctl.usp_RefreshSIC`: incremental refresh of the last 3 days (13 to 15 s on S1) |
| 0006_request_refresh | `ctl.usp_RequestSICRefresh`: called after each feed load; burst guard |
| 0007_loader_hook | Adds the refresh request to `ctl.usp_LoadFeedFile` |
| 0008_get_sic_hourly | `curated.usp_GetSICHourly` |
| 0011_config_tables | `ctl.Site`, `ctl.Area`, `ctl.Line`, `ctl.ReasonCode`, `ctl.DeviceKey`, `ctl.SchemaMigration`; HFI and HFUK seeded |
| 0012_app_tables | People, roles, comments, actions, escalation rules, escalations, notification outbox, audit; default rules |
| 0013_view_functions | `curated.vSIC_HourlyApp`, `app.fnCurrentUserId`, `app.fnRoleRank` |
| 0014_procedures | Sign-in, comments, actions, acknowledge, inbox, roles, device keys |
| 0015_escalation_outbox | `app.usp_EvaluateEscalations`, `app.usp_ClaimNotifications`, `app.usp_CompleteNotification` |
| 0016_security_patches | Roles `sic_app_role` and `sic_worker_role`, grants, row-level security `app.SiteFilter`, F9 site fix, escalation run after each load |
| 0017_admin_procedures | Admin procedures for the site admin screens |
| 0018_get_sic_version | `app.usp_GetSicVersion` for the 30-second freshness poll |
| 0020_people_tests_changekey | `app.usp_GetSitePeople` (owner picker), `app.usp_QueueTestNotification`, `app.usp_GetNotificationPreview`, and `ChangeKey` on `app.usp_GetSicVersion` |

`ctl.SchemaMigration` holds one row per file above. Also applied by hand on 4 Nov: RedNoComment level 2 set to in-app only, and Teams targets set to level 2 and above (0012 already contains both for a fresh install).

## Not applied

| File | Status |
| --- | --- |
| 0019_loader_site_config | Written and anchor-checked against live; apply on test first (see its README) |

## Adding a migration

1. Next free number (0021 onwards; 0019 is taken), descriptive name: `0021_<what>.sql`.
2. Idempotent: `CREATE OR ALTER`, `IF OBJECT_ID(...) IS NULL`, `IF COL_LENGTH(...) IS NULL`.
3. Each `CREATE OR ALTER PROCEDURE/FUNCTION/VIEW` and `CREATE SECURITY POLICY` starts its own batch (`db/scripts/migrate.ts` splits on them).
4. End with an insert into `ctl.SchemaMigration`.
5. A table that row-level security covers cannot be altered while the policy binds it: `ALTER SECURITY POLICY app.SiteFilter WITH (STATE = OFF)` first, or drop and re-add its predicate.
6. Note it in `docs/DECISIONS.md`.

## Operations

`ops_backfill_and_checks.sql` (backfill, checks, settings) and `ops_rollback_refresh.sql` (removes the loader hook).

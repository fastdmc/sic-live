# Chunk 14: infrastructure, CI/CD, monitoring and the go-live runbook

**Depends on:** 01 to 13 (at least 03, 04 and 12).
**Goal:** one command deploys everything to the DMC subscription, and a person can switch from fake data to the live database in the morning by following a checklist.

## Read first
`docs/ARCHITECTURE.md` (Components, Settings, Environments).

## Tasks
1. `infra/main.bicep` with modules, parameters for environment (`test`, `live`), location `uksouth`, and the Hilton and DMC tenant IDs:
   - Static Web App (Standard) for `apps/web`, custom domain optional.
   - Two Function Apps on Flex Consumption (Node 20): `func-sic-api-<env>` and `func-sic-worker-<env>`, each with its own user-assigned managed identity, App Insights connection, and the settings in ARCHITECTURE (no secrets in settings; Key Vault references only).
   - Storage account for the Function Apps (identity-based connection, no keys).
   - Key Vault (RBAC mode) `kv-sic-<env>`: the worker identity gets "Key Vault Secrets User".
   - Application Insights + Log Analytics workspace; an alert rule when the worker's run count drops to 0 for 10 minutes, and when Failed notifications exceed 5 in an hour.
   - Outputs: URLs and identity client IDs.
   - **Do not** create or change SQL firewall rules, the SQL server, Entra app registrations or Hilton anything. Those are manual steps below.
2. `.github/workflows/deploy.yml`: manual dispatch with environment input; OIDC login to Azure (federated credential, no secrets); `az deployment group create`; build and deploy web (SWA token from a GitHub environment secret), api and worker (zip deploy); run `scripts/smoke.mjs` against the deployed API.
3. `scripts/smoke.mjs`: `GET /api/health`, then (if `SIC_SMOKE_TOKEN` is set) `GET /api/me` and `GET /api/sites/HFI/sic/version`; exits non-zero with a clear message on failure.
4. `docs/RUNBOOK.md`: daily checks (worker runs, refresh log, failed notifications), how to add a site, how to rotate a Teams webhook, how to revoke a TV key, how to roll back a deployment, how to pause notifications for a site, who to call.
5. `docs/GO_LIVE.md`, the morning switch-over checklist, in this order:
   1. Create `HiltonMoa-test` as a copy of HiltonMoa; run `SqlRepository.contract.test.ts` against it with a test identity.
   2. Deploy `infra` for `test`; add the two identities to the database: `CREATE USER [id-sic-api-test] FROM EXTERNAL PROVIDER; ALTER ROLE sic_app_role ADD MEMBER [id-sic-api-test];` and the same for the worker with `sic_worker_role`.
   3. App registration (DMC tenant): multi-tenant, SPA redirect URIs, expose `api://<client-id>/access_as_user`, optional claims `email`, `acct`, `upn`. Record the client ID.
   4. Hilton IT: admin consent for the app; enterprise app "assignment required"; assign the pilot users or a group; create a Workflows webhook in each site's SIC Teams channel and send the URL to DMC securely; optional shared mailbox and application access policy for Mail.Send.
   5. Store each webhook URL in Key Vault as the secret named in `ctl.NotificationTarget.Address` (`teams-sic-hfi`, `teams-sic-hfuk`); set the targets active.
   6. Grant pilot roles with `usp_SaveUserSiteRole` (or the admin screen once a group admin exists: set `IsGroupAdmin = 1` for Derek Cunningham directly in SQL first).
   7. Switch `SIC_DATA_MODE=sql`, `SIC_AUTH_MODE=entra`; smoke test; walk the pilot through the screens on test.
   8. Repeat for `live`; set `ctl.Site.LiveFromUtc` to the go-live time; keep `NotificationsLive = 0` for the first shift, review Suppressed counts in the escalation screens, then switch on.
6. Update the root `README.md` with how to run locally, test, deploy, and where the docs are.

## Acceptance checks
- `az bicep build --file infra/main.bicep` succeeds (install the Bicep CLI in CI; skip with a message if unavailable locally).
- `node scripts/smoke.mjs --base http://localhost:7071/api` passes against the dev server.
- `docs/GO_LIVE.md` and `docs/RUNBOOK.md` exist and every step names who does it (DMC or Hilton IT).
- `pnpm check` passes. Write the overnight summary at the top of `docs/PROGRESS.md`.

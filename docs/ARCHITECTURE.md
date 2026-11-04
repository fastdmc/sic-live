# SIC Live: architecture

## Components

| Component | Tech | Hosting (DMC subscription, UK South) | Identity |
| --- | --- | --- | --- |
| Web app | React 18 + Vite SPA | Azure Static Web Apps (Standard) | Signs users in with MSAL; calls the API with a bearer token |
| API | Azure Functions v4, Node 20, TypeScript | Function App `func-sic-api` (Flex Consumption) | User-assigned managed identity `id-sic-api`, a database user in `sic_app_role` |
| Worker | Azure Functions v4 timer, every minute | Function App `func-sic-worker` (Flex Consumption) | User-assigned managed identity `id-sic-worker`, a database user in `sic_worker_role`; reads Key Vault; sends mail with Graph |
| Database | Azure SQL `HiltonMoa` on `hiltonfoods` (S1) | Existing | Row-level security by site (policy `app.SiteFilter`) |
| Feed loader | Existing Function App `func-moa-hilton-dmc` | Existing, unchanged | Calls `ctl.usp_LoadFeedFile`, which now refreshes the SIC and evaluates escalations after each file |
| Secrets | Azure Key Vault `kv-sic-live` | DMC subscription | Teams Workflows webhook URLs, one secret per channel, named as in `ctl.NotificationTarget.Address` |
| Telemetry | Application Insights `appi-sic-live` | DMC subscription | All three apps |

## Repository layout

```
apps/web        React SPA
apps/api        HTTP API (handlers + Functions adapter + local dev server)
apps/worker     Timer worker (refresh, escalations, outbox)
packages/shared Types, zod schemas, RAG and time helpers, the Repository interface, the fake repository and fixture loader
db/migrations   SQL, numbered; 0001 to 0018 and 0020 are applied to live, 0019 is held
db/scripts      migrate.ts (applies pending migrations), export-definitions.ts (dumps live object definitions to db/live)
fixtures        Test data (HFI 2 Nov 2026, DEMO site, config, users, expected totals)
e2e             Playwright tests against the dev server in fake mode
infra           Bicep for every Azure resource above
docs            Spec, contract, design, chunks, progress
```

## Sign-in

One app registration, **SIC Live**, owned by DMC, set to multi-tenant ("accounts in any organisational directory"), with two layers of tenant control:

1. Only the tenant IDs in `SIC_ALLOWED_TENANT_IDS` are accepted by the API (Hilton's and DMC's). Every other tenant gets 403 even with a valid token.
2. Hilton IT grants admin consent once in the Hilton tenant and sets "assignment required" on the enterprise app, so only assigned Hilton users or groups can get a token at all.

The registration has:
- a SPA platform with redirect URIs for the Static Web App and `http://localhost:5173`;
- an exposed API `api://<client-id>` with one delegated scope `access_as_user`;
- optional app roles `SIC.Viewer`, `SIC.LineLeader`, `SIC.Manager`, `SIC.Admin` (informational; the database roles are the authority);
- optional claims `email`, `acct` (0 member, 1 guest) and `upn` on the access token.

The SPA uses authority `https://login.microsoftonline.com/organizations`, scope `api://<client-id>/access_as_user`, and redirect sign-in. It checks the token's `tid` against `VITE_ALLOWED_TENANT_IDS` and shows "Your organisation is not set up for SIC Live" otherwise.

The API validates every request with `jose`:
- signature against the JWKS at `https://login.microsoftonline.com/common/discovery/v2.0/keys` (cached 24 h, refreshed on an unknown `kid`);
- `iss` equals `https://login.microsoftonline.com/{tid}/v2.0` and `tid` is in the allow-list;
- `aud` equals `SIC_API_AUDIENCE` (the client ID or `api://<client-id>`);
- `scp` contains `access_as_user`;
- `exp` and `nbf` with 5 minutes of clock skew.

Then it calls `app.usp_UpsertUser` with `tid`, `oid`, email (`email`, else `preferred_username`, else `upn`), name and `IsGuest` (`acct` = 1, or the token was issued by the DMC tenant for a non-DMC email). The returned `UserId` is cached per (`tid`, `oid`) for 5 minutes.

**Guests (fallback route):** a Hilton manager invited as a guest to the DMC tenant signs in through DMC, gets a DMC-tenant token, and is accepted because the DMC tenant is on the allow-list. When the same person later signs in natively from Hilton, `usp_UpsertUser` links the new identity to the same `UserId` by email, so their history and roles carry over.

**Dev mode:** with `SIC_AUTH_MODE=dev` (refused unless the request comes from localhost), the API accepts `x-dev-user: <email>` naming a user in `fixtures/users.json`. The SPA shows a "Sign in as" picker instead of MSAL when `VITE_AUTH_MODE=dev`.

**Floor screens:** `/tv/:key`. The API hashes the key (SHA-256), calls `app.usp_ResolveDeviceKey`, and serves only SIC read endpoints for that site, area or line, with `DeviceSiteKey` in the session context. Keys are 32 random bytes, base64url, shown once when created, revocable.

## Data access

One interface, two implementations, chosen by `SIC_DATA_MODE`:

- `FakeRepository` (packages/shared): in memory, loaded from `fixtures/`, implements the same behaviour as the procedures, including role checks, RLS-style site filtering and a TypeScript port of the escalation rules, so the UI and e2e tests behave as they will live.
- `SqlRepository` (apps/api and apps/worker): `mssql` with Entra auth (`authentication.type = 'azure-active-directory-default'` or a token from `@azure/identity`), a pool of 10, and **every batch prefixed** with:

```sql
EXEC sp_set_session_context @key = N'UserId', @value = @__userId;
EXEC sp_set_session_context @key = N'DeviceSiteKey', @value = @__deviceSiteKey;
```

so a pooled connection can never carry one person's context into another request. Errors 50600 to 50699 thrown by the procedures map to HTTP 400 (bad input) or 403 (role), with the procedure's message shown to the user. Everything else is 500 with a correlation ID and no detail.

## Worker (every minute)

1. `EXEC ctl.usp_RefreshSIC` (pending sites only; returns at once if nothing is pending).
2. `EXEC app.usp_EvaluateEscalations`.
3. Loop `EXEC app.usp_ClaimNotifications @Batch = 20` until empty or 50 seconds have passed:
   - **Teams:** group claimed notices by `Address`; read the secret of that name from Key Vault (cache 10 min); POST one Adaptive Card per group (up to 10 items, then "and N more") to the Workflows URL; then `usp_CompleteNotification` for each, `@Ok = 1` on HTTP 2xx.
   - **Email:** `POST https://graph.microsoft.com/v1.0/users/{SIC_MAIL_SENDER}/sendMail` with an app-only Graph token (`Mail.Send`, limited to that mailbox by an application access policy); HTML body with the subject, detail and a button to the deep link.
   - A failure calls `usp_CompleteNotification @Ok = 0, @Error = <short reason>`; the database schedules the retry.
4. Log counts (claimed, sent, failed) to Application Insights. Never log addresses, URLs or bodies.

## Settings

| Variable | Used by | Example | Notes |
| --- | --- | --- | --- |
| `SIC_DATA_MODE` | api, worker | `fake` / `sql` | `fake` overnight and in tests |
| `SIC_AUTH_MODE` | api | `dev` / `entra` | `dev` only on localhost |
| `SIC_ALLOWED_TENANT_IDS` | api | `<hilton-tid>,<dmc-tid>` | Comma separated |
| `SIC_API_AUDIENCE` | api | `api://<client-id>` | |
| `SIC_SQL_SERVER` | api, worker | `hiltonfoods.database.windows.net` | |
| `SIC_SQL_DATABASE` | api, worker | `HiltonMoa` | |
| `AZURE_CLIENT_ID` | api, worker | client ID of the user-assigned identity | Picks the identity for `@azure/identity` |
| `SIC_KEYVAULT_URI` | worker | `https://kv-sic-live.vault.azure.net/` | |
| `SIC_MAIL_SENDER` | worker | `sic-alerts@<domain>` | Shared mailbox |
| `SIC_APP_BASE_URL` | worker | `https://sic.<domain>` | For deep links in Teams and email |
| `SIC_CORS_ORIGINS` | api | the Static Web App URL | |
| `VITE_API_BASE_URL` | web | `https://func-sic-api.azurewebsites.net/api` | |
| `VITE_MSAL_CLIENT_ID` | web | `<client-id>` | |
| `VITE_ALLOWED_TENANT_IDS` | web | same as API | |
| `VITE_AUTH_MODE` | web | `dev` / `entra` | |

## Environments

- **Local / overnight:** fake data, dev auth, no Azure.
- **Test:** the Azure resources with `-test` suffixes pointing at a copy of HiltonMoa (`HiltonMoa-test`, created with `CREATE DATABASE ... AS COPY OF`).
- **Live:** HiltonMoa. Notifications switched on per site with `ctl.Site.NotificationsLive` once the site signs off.

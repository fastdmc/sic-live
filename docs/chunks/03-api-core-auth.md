# Chunk 03: API core, sign-in and the SQL repository

**Depends on:** 02.
**Goal:** an API skeleton that validates Entra tokens from allowed tenants, supports dev sign-in and floor-screen keys, and has a SQL repository that sets the session context on every batch. All of it runs in tests without Azure.

## Read first
`docs/ARCHITECTURE.md` (Sign-in, Data access, Settings), `docs/DB_CONTRACT.md` (session context, errors).

## Tasks
1. `apps/api/src/http.ts`: a tiny framework-free router: `route(method, path, handler)` with path params, JSON bodies validated by zod, and `{ status, body, headers }` results. Errors: `SicError` maps to its status with `{ error: { code, message } }`; zod errors to 400 with field messages; anything else to 500 with `{ error: { correlationId } }` and the detail only in logs.
2. `apps/api/src/functions.ts`: one Azure Functions v4 HTTP trigger (`app.http('api', { route: '{*path}', methods: [...] })`) that adapts Functions requests to the router. `apps/api/src/dev-server.ts`: a `node:http` server on port 7071 using the same router, for `pnpm dev` and e2e.
3. `apps/api/src/auth/`:
   - `entra.ts`: validate bearer tokens with `jose` (`createRemoteJWKSet` for `https://login.microsoftonline.com/common/discovery/v2.0/keys`): issuer `https://login.microsoftonline.com/{tid}/v2.0`, `tid` in `SIC_ALLOWED_TENANT_IDS`, audience `SIC_API_AUDIENCE`, scope `access_as_user`, 5 minutes of clock skew. Derive email, name, guest flag as the architecture says. The JWKS source is injectable so tests use a local key pair.
   - `dev.ts`: `x-dev-user` header looked up in `fixtures/users.json`; only when `SIC_AUTH_MODE=dev` and the socket's remote address is `127.0.0.1`, `::1` or `::ffff:127.0.0.1` (never the Host header), otherwise 401.
   - `device.ts`: `/api/tv/:key/...` routes hash the key with SHA-256 and call `resolveDeviceKey`; unknown, expired or revoked keys get 401.
   - Cache user lookups per (`tid`, `oid`) for 5 minutes.
4. `apps/api/src/sql/SqlRepository.ts`: implements `Repository` with `mssql`, Entra auth via `@azure/identity` (`DefaultAzureCredential`, honouring `AZURE_CLIENT_ID`). Every call goes through one helper, `run(caller, sql, params)`, that prefixes the batch with the two `sp_set_session_context` calls from the contract, parameterised. Map SQL error numbers 50600 to 50699 to `SicError` with the status table in the contract. Use the view and procedures exactly as the contract lists them.
   - Unit-test `run` with a fake `mssql` request object: the batch text starts with both context calls, user and device are parameters, never interpolated.
   - A contract test file `SqlRepository.contract.test.ts` that runs the same behaviour tests as the fake repository but is skipped unless `SIC_SQL_SERVER` is set (it will be run in the morning against the test database).
5. `apps/api/src/config.ts`: read and validate every setting with zod at start-up; fail fast with a list of what is missing. Pick the repository from `SIC_DATA_MODE`.
6. CORS from `SIC_CORS_ORIGINS`; security headers (`X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` on API responses).
7. `GET /api/health` (no auth): `{ status: 'ok', dataMode, version }`.
8. Dev-only test routes under `/api/__test/`, registered only when `SIC_AUTH_MODE=dev` and `SIC_DATA_MODE=fake`, and only answering local socket addresses: `POST reset` (reload fixtures, clock to `2026-11-02T12:00:00Z`, one escalation-engine run), `POST clock { nowUtc }`, `POST run-engine`, `POST bump-version { site }`, `POST device-key { site, areaKey?, lineNo? }` (returns a plain key). The dev server starts in the same state as after `reset`. Unit-test that every `__test` route answers 404 when `SIC_AUTH_MODE=entra`.

## Out of scope
The business endpoints (chunks 04 and 05).

## Acceptance checks
- Tokens: a token signed by the test key for an allowed tenant is accepted; the same token with another `tid` gets 403 "Your organisation is not set up for SIC Live"; wrong audience, missing scope, expired, or wrong signature get 401.
- Dev auth is refused when `SIC_AUTH_MODE=entra`, and when the request is not from localhost.
- The fixture device key `test-hfi-fresh-tv-key-0001` reaches `GET /api/tv/:key/health` with 200; `test-hfi-revoked-key-0003` gets 401; an unknown key gets 401.
- `pnpm check` passes.

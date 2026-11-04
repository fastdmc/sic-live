# Chunk 12: worker: refresh, escalations and the notification outbox

**Depends on:** 02, 03.
**Goal:** a timer function, every minute, that keeps the SIC fresh, raises escalations and delivers Teams and email notices reliably, without ever logging a secret.

## Read first
`docs/ARCHITECTURE.md` (Worker), `docs/DB_CONTRACT.md` (Procedures for the worker).

## Tasks
1. `apps/worker/src/functions.ts`: Azure Functions v4 timer `0 */1 * * * *`, `runOnStartup: false`, singleton by design (the database leases and app locks make overlap safe anyway). The work itself is a plain `runOnce(deps, clock)` function.
2. `runOnce`: `refreshSic()`, `evaluateEscalations()`, then loop `claimNotifications(20)` until empty or 50 seconds have passed; send; `completeNotification` each. Return counts.
3. `senders/teams.ts`: group claimed Teams notices by address; resolve the secret (`@azure/keyvault-secrets`, `DefaultAzureCredential`, cache 10 minutes); POST `{ type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: <card> }] }` where the card (Adaptive Card 1.4) has a title ("HFI: 3 escalations"), up to 10 items (level badge, title, detail) and an "Open SIC Live" action to `SIC_APP_BASE_URL + deepLink`; 2xx = sent; 429 and 5xx = retry; other 4xx = failed with the status code only.
4. `senders/email.ts`: Graph `POST /v1.0/users/{SIC_MAIL_SENDER}/sendMail` with an app-only token (`https://graph.microsoft.com/.default`); HTML template with the subject, detail and a button; plain-text alternative; `saveToSentItems: false`.
5. Test notifications from the admin "Send test" (chunk 11) go through the same path.
6. Telemetry: one log line per run with counts and duration; never the address, URL, recipient or body. Unit-test that log output contains none of the fixture addresses.
7. All HTTP goes through an injectable `fetch`, and secrets through an injectable `SecretReader`, so tests use fakes (msw or hand-rolled).

## Acceptance checks
- With the FakeRepository at 2026-11-02T12:00:00Z and HFI notifications switched on with an active Teams target: one run claims the Pending Teams and email notices, posts one Teams card per target grouping up to 10 items, sends one email per recipient, and completes them all as Sent.
- A Teams 500 leaves the notice Pending with the next attempt 2 minutes later; after 5 failures it is Failed.
- With notifications off, nothing is sent and nothing is claimed (all Suppressed).
- No log line contains a fixture email address, a secret name's value or a URL.
- `pnpm check` passes.

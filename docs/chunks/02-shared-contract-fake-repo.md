# Chunk 02: shared contract, helpers and the fake repository

**Depends on:** 01.
**Goal:** one typed contract that web, API and worker share, and an in-memory repository that behaves like the database (roles, site filtering, errors, escalation rules), loaded from `fixtures/`.

## Read first
`docs/DB_CONTRACT.md` (all of it), `docs/SPEC.md` (behaviour), `fixtures/` (all files), `fixtures/expected.json`.

## Tasks
1. `packages/shared/src/schemas.ts`: zod schemas and inferred types, camelCase, for: `Site`, `Area`, `Line`, `ReasonCode`, `EscalationRule`, `NotificationTarget`, `DeviceKey`, `SicHour` (the `curated.vSIC_HourlyApp` columns the app uses, with `rag` from `SiteRAG` and a nested `note` object or null), `SicVersion`, `HourComment`, `Action`, `ActionUpdate`, `Escalation`, `Notification`, `AppUser`, `UserRole`, `Me` (user plus roles plus sites), and request bodies (`AddCommentRequest`, `SaveActionRequest`, `AckRequest`, admin saves). Fixture JSON must parse with these schemas unchanged. `notifyRoles` is `string[]` in the shared schema (the database stores a comma list; the SQL repository splits and joins it). `targetBasis` is optional and null in the fixtures. `deviceKeys` in `fixtures/config.json` carry `plainKeyForTestsOnly` so the fake can hash them; it is never part of an API response.
2. `packages/shared/src/rag.ts`: `siteRag(actual, target, availableMins, site)` returning `'G' | 'A' | 'R' | null`, the same rule as `SiteRAG`. Test it against every fixture row (the fixture `rag` came from the view at 95/85/10, so all 216 must match with HFI defaults).
3. `packages/shared/src/time.ts`: a Windows-to-IANA map for at least `GMT Standard Time` (Europe/London), `W. Europe Standard Time` (Europe/Berlin), `AUS Eastern Standard Time` (Australia/Sydney), `E. Australia Standard Time` (Australia/Brisbane), `W. Australia Standard Time` (Australia/Perth), `New Zealand Standard Time` (Pacific/Auckland); `toSiteTime(utc, site)`, `formatDay`, `formatTime`, `formatPacks`. Test the November and June offsets for London and Auckland.
4. `packages/shared/src/repository.ts`: the `Repository` interface. Every method takes a `Caller` (`{ userId } | { deviceSiteKey, areaKey?, lineNo? }`) and returns typed results or throws `SicError { code: number; status: 400 | 403 | 404; message }` using the codes in the contract. Methods: `upsertUser`, `getMe`, `listSites`, `getSiteConfig`, `getSicVersion`, `listDays`, `getSicHours(site, day, lineNo?)`, `addComment`, `listComments(site, day, lineNo, hourStart)`, `saveAction`, `listActions(filter)`, `getAction`, `listEscalations(filter)`, `getEscalation`, `ackEscalation`, `listInbox`, `markRead`, and the admin methods matching the 0017 procedures, plus `resolveDeviceKey`, and for the worker `evaluateEscalations(asOfUtc)`, `claimNotifications`, `completeNotification`.
5. `packages/shared/src/fake/FakeRepository.ts`: implements the interface from `fixtures/` (HFI, DEMO, config, users). Rules it must follow exactly:
   - site filtering as row-level security does (any role at the site, or group admin, or the device's site);
   - role ranks as `app.fnRoleRank` (area-scoped roles count only for lines in that area);
   - comments snapshot RAG, actual and target; resolve RedNoComment escalations for the hour;
   - action status rules and history;
   - a TypeScript port of `app.usp_EvaluateEscalations` as described in the contract, including the 12-hour window, once per subject and level, skip when a lower level is acknowledged, area rule beats site rule, next level after `EscalateAfterMins`, in-app to role holders, Teams and email Pending only when `notificationsLive` and the target is active, else Suppressed;
   - notification claim with lease and completion with backoff (2, 4, 8, 16 minutes, Failed after 5 attempts).
6. A `FixtureClock` so tests can set "now" (default `2026-11-02T12:00:00Z`). The fake sets every hour's `refreshedUtc` and the SIC version's `refreshedUtc` from this clock at load time, and `getArticleKeyGaps` counts days back from the clock, never from the real date.
7. The fake's `getSicVersion` returns `version` and a `changeKey` that moves on any comment, action update or escalation change at the site (as `app.usp_GetSicVersion` does since 0020), and a test hook `bumpVersion(site)` that simulates a SIC refresh.

## Out of scope
SQL. HTTP. UI.

## Acceptance checks
- Fixture totals equal `fixtures/expected.json` for HFI 2026-11-02: 216 rows, 16 lines, 135,048 actual, 175,904 target, 137,640 plan, 88 red hours, 1,791.79 kg giveaway, 7,118 rejects.
- Site isolation: the DEMO line leader gets 403 for HFI hours and HFI's line leader gets 403 for DEMO; the HFUK viewer sees HFUK (no hours) and nothing of HFI; the group admin sees all three sites.
- Escalations at `2026-11-02T12:00:00Z`: the first run's counts are on or very near `escalationEngine_2026-11-02_12:00_fake_reference` in `fixtures/expected.json` (RedNoComment 39 and 39, ConsecutiveRed 10 and 4, ShiftBelowTarget 8); record yours in `docs/PROGRESS.md`. A second run raises nothing new. Commenting line 1 06:00 resolves its RedNoComment escalations. An action due 2026-11-01 raises ActionOverdue on the next run. With the default config (HFI `notificationsLive = false`) every Teams and email notification is Suppressed.
- In a fresh fake with HFI `notificationsLive = true` and target `teams-sic-hfi` set active, a run at 12:00 creates ConsecutiveRed L2 Teams and email notifications with status Pending.
- Role checks: Lena (line leader, fresh) can comment on line 4 and gets 403 on line 11 (cured); Aidan (area manager, fresh) can acknowledge a fresh escalation; Lena cannot verify an action.

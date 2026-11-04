# Progress

Overnight summary: (the agent writes it here at the end of the run)

- [x] 01 Repository, tooling and the database folder (2026-11-04, 8 unit + 1 e2e passing; migrate SQL apply path is offline-only overnight)
- [x] 02 Shared contract, helpers and the fake repository (2026-11-04, 17 unit + 1 e2e; escalation engine at 12:00: RedNoComment 39/39, ConsecutiveRed 10/4, ShiftBelowTarget 8 — matches fake_reference)
- [x] 03 API core, sign-in and the SQL repository (2026-11-04, API auth/router/SqlRepository.run tests green; SqlRepository business methods stubbed for morning)
- [ ] 04 API read endpoints for the SIC
- [ ] 05 API writes: comments, actions, escalations, inbox and admin
- [ ] 06 Web shell, sign-in and site switching
- [ ] 07 SIC screens: site, area, line and the printable sheet
- [ ] 08 Hour drawer, red-hour comments and quick actions
- [ ] 09 Actions board, action detail and my actions
- [ ] 10 Manager inbox and escalations
- [ ] 11 Site admin
- [ ] 12 Worker: refresh, escalations and the notification outbox
- [ ] 13 Floor TV mode, and the loader migration for site config
- [ ] 14 Infrastructure, CI/CD, monitoring and the go-live runbook

Tick a chunk as `- [x] NN Title (date, tests passing, anything left out)`.

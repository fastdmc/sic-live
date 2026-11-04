# Fixtures

| File | What it is |
| --- | --- |
| `sic-hfi-2026-11-02.json` | 216 hours for 16 HFI lines on Mon 2 Nov 2026, from `curated.vSIC_Hourly`, in the shape of `curated.vSIC_HourlyApp` (camelCase, `rag` = SiteRAG at 95/85/10). Targets come from the view (all history), so they are a little lower than the frozen targets in the live table. Plan packs are rounded per hour. |
| `sic-demo-2026-11-02.json` | A synthetic second site, DEMO: HFI lines 1 and 2 at half volume (line 3 had no data that day), area `packing`. Config lists lines 1 to 3, so line 3 shows the "no data" state. Exists only to prove site isolation. |
| `config.json` | Sites (HFI, HFUK, DEMO), areas, lines, reason codes, escalation rules and Teams targets, as seeded live. |
| `users.json` | Seven test people with roles: line leader (HFI fresh), area manager (HFI fresh), site manager (HFI), site admin (HFI), HFUK viewer, group admin, DEMO line leader. |
| `expected.json` | Totals the tests must reproduce, and the escalation counts measured live for 2 Nov at 12:00. |

HFI on 2 Nov 2026: 135,048 packs against a target of 175,904 (plan 137,640), 88 red hours, 1,791.79 kg giveaway, 7,118 rejects. Line 7 has 14 hours.

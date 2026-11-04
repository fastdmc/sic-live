# SIC Live: Cursor build pack

Everything a Cursor agent needs to build the finished SIC Live app overnight, one chunk at a time, without access to Azure or the database.
The database side is already live in HiltonMoa (scripts in `db/migrations`, all applied on 4 Nov 2026). The app is built and tested against `fixtures/`, real HFI data for 2 Nov 2026, and switched to the live database in the morning.

## What is in here

| Path | What it is |
| --- | --- |
| `AGENTS.md`, `.cursor/rules/sic-live.mdc` | The rules every agent follows. Read first. |
| `OVERNIGHT_PROMPT.md` | The one prompt to give a Cursor Background Agent to run all 14 chunks in order. |
| `scripts/run-overnight.sh`, `scripts/run-overnight.ps1` | The same run with the Cursor CLI, one headless agent per chunk. |
| `docs/SPEC.md` | What the app does: users, roles, screens, rules. |
| `docs/ARCHITECTURE.md` | How it is built: stack, sign-in, API, worker, hosting, settings. |
| `docs/DB_CONTRACT.md` | Every view and procedure the app may call, with parameters, results and error codes. |
| `docs/DESIGN.md` | The look: tokens, RAG shapes, layouts, taken from the mockup. |
| `docs/chunks/01..14` | The build, in order. Each has a goal, tasks, out of scope and acceptance checks. |
| `docs/PROGRESS.md`, `docs/BLOCKERS.md`, `docs/DECISIONS.md` | Written by the agents as they go. |
| `db/migrations` | The SQL already applied to HiltonMoa (0001 to 0018 and 0020), and 0019 written but held. Do not re-run against live without reading `db/README.md`. |
| `fixtures` | HFI 2 Nov 2026 (216 hours, 16 lines), a synthetic DEMO site, config, test users, expected totals. |
| `reference/mockup` | The working HTML mockup (`SIC Live - HFI Drogheda.html`) and its source. The visual reference for every screen. |

## Run it overnight

1. Create an empty GitHub repository (for example `dmc-digital/sic-live`) and copy this whole folder into it as the first commit.
2. Open the repository in Cursor and check the model is set to a strong agent model.
3. Pick one route:
   - **Background Agent (recommended):** in Cursor, start a Background Agent on the repository with the text of `OVERNIGHT_PROMPT.md`. It runs on Cursor's cloud machine, works through `docs/chunks` in order, commits after each chunk and pushes a branch `overnight/build`.
   - **Cursor CLI:** on macOS, Linux or WSL, install the CLI, sign in, then run `scripts/run-overnight.sh` from the repo root (Windows PowerShell: `scripts/run-overnight.ps1`). It runs one headless agent per chunk with `-p --force` and writes logs to `logs/`.
4. Leave it. Each chunk takes roughly 20 to 60 minutes.

## In the morning

1. Read `docs/PROGRESS.md` (what finished, test counts) and `docs/BLOCKERS.md` (anything that stopped).
2. Run `pnpm install && pnpm check` locally. It runs typecheck, lint, unit tests and the Playwright tests against the fixtures.
3. Run `pnpm dev` and open http://localhost:5173. In dev mode you pick a test user (line leader, area manager, site admin, HFUK viewer) instead of signing in.
4. Then follow `docs/chunks/14-infra-cicd-golive.md`, section "Morning switch-over": create the Azure resources, register the app, add the two managed identities to `sic_app_role` and `sic_worker_role`, set `SIC_DATA_MODE=sql`, and deploy.

## Ground rules baked into the pack

- Nothing in the overnight run touches Azure, the live database or Hilton's tenant. Tests use `fixtures/` only.
- The database contract is fixed. If a chunk needs something the contract does not offer, the agent writes a new migration file and a note in `docs/DECISIONS.md`. It does not change an applied migration.
- Multi-site from the start: every query, screen and test takes a site, and the DEMO site exists to prove one site never sees another.

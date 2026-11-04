# Prompt for the overnight Background Agent

Copy everything below the line into a Cursor Background Agent started on this repository.

---

You are building SIC Live, a multi-site short interval control app for Hilton Foods, from the specification in this repository. Work unattended through all 14 chunks in `docs/chunks`, one after another, until every chunk is done or no chunk can be started. This prompt overrides the "one chunk" limit in AGENTS.md: do as many chunks as you can.

1. Read `AGENTS.md`, then `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DB_CONTRACT.md` and `docs/DESIGN.md`. Open `reference/mockup/SIC Live - HFI Drogheda.html` for the look.
2. Create and switch to branch `overnight/build`.
3. Loop:
   - Pick the next chunk: the lowest-numbered chunk that is not ticked in `docs/PROGRESS.md`, is not listed in `docs/BLOCKERS.md`, and whose "Depends on" chunks are all ticked. If there is none, stop the loop.
   - Do that chunk completely, exactly as its file says. Run its acceptance checks and `pnpm check`. Fix failures.
   - Tick it in `docs/PROGRESS.md` with the date, the number of tests passing and anything deliberately left out. Commit with `chunk NN: <title>` and push the branch.
   - If a check still fails after three attempts, record it in `docs/BLOCKERS.md`, commit and push, then go back to the top of the loop (the blocked chunk and anything that depends on it will be skipped).
4. Never connect to Azure, the live database, Microsoft Graph, Teams, or any Hilton or DMC system. Use `SIC_DATA_MODE=fake`, `SIC_AUTH_MODE=dev` and `fixtures/` only. Package installs and the Playwright browser download are allowed.
5. When you stop, write a short summary at the top of `docs/PROGRESS.md`: chunks done, chunks blocked and why, total tests, and the three things a person should look at first in the morning. Commit and push.

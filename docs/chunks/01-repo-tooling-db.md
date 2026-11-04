# Chunk 01: repository, tooling and the database folder

**Depends on:** nothing.
**Goal:** a monorepo where `pnpm install && pnpm check` passes on an empty app, CI runs the same checks, and the SQL lives in version control with a migration runner.

## Read first
`AGENTS.md`, `docs/ARCHITECTURE.md` (layout and settings), `db/migrations`.

## Tasks
1. pnpm 9 workspace: `apps/web`, `apps/api`, `apps/worker`, `packages/shared`, `e2e`, `db`. Root `package.json` scripts:
   - `typecheck`, `lint`, `test` (Vitest across packages), `e2e` (Playwright), `check` (all four in that order), `dev` (web and the API dev server together), `build`.
2. `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, ES2022, moduleResolution bundler for web and node16 for api and worker), ESLint flat config with typescript-eslint, Prettier, `.editorconfig`, `.nvmrc` (20), `.gitignore` (node_modules, dist, coverage, logs, `.env*` except `.env.example`).
3. Empty but compiling packages: `packages/shared/src/index.ts` exporting a `version` constant; `apps/api/src/index.ts`; `apps/worker/src/index.ts`; `apps/web` from the Vite React TS template with one placeholder page. Each with one passing Vitest test. One placeholder Playwright spec in `e2e/` that loads the web placeholder page, so `pnpm e2e` has a test to run. `pnpm e2e` installs Chromium first if missing (`playwright install --with-deps chromium`).
4. `.env.example` at the root listing every variable in `docs/ARCHITECTURE.md`, with safe dev values (`SIC_DATA_MODE=fake`, `SIC_AUTH_MODE=dev`).
5. Keep the existing `db/README.md` (it lists what is applied and what is held). Add only a short section describing the batch-split rule `migrate.ts` uses.
6. `db/scripts/migrate.ts` (run with `tsx`): reads `db/migrations/*.sql` in name order (ignoring `.md`), splits each file into batches on lines that start a new top-level block (a line beginning `CREATE OR ALTER`, `CREATE SECURITY POLICY`, `GRANT`-block markers, or the comment markers `-- NNx.` used in these files; document the rule), and plans which migrations are missing. Modes:
   - `--offline --dry-run`: plan from the files and the Applied / Not applied tables in `db/README.md` only; no database, no settings needed.
   - `--dry-run`: plan against `ctl.SchemaMigration` (needs `SIC_SQL_SERVER`, `SIC_SQL_DATABASE`).
   - no flag: apply missing migrations in order, recording each. Migrations in the "Not applied" table are held unless `--include-unapplied` is passed.
   Connection with `@azure/identity`. Unit-test ordering and batch splitting against the real files (no database).
7. `db/scripts/export-definitions.ts`: for an operator to run against live later; writes `OBJECT_DEFINITION` of every object in schemas `ctl`, `curated`, `app` to `db/live/<schema>.<name>.sql`. Unit-test the file naming only.
8. GitHub Actions `.github/workflows/ci.yml`: on push and pull request, Node 20, pnpm cache, `pnpm install --frozen-lockfile`, `pnpm check` (install Playwright Chromium first).
9. Create `docs/PROGRESS.md` (a checklist `- [ ] 01` to `- [ ] 14` with chunk titles), `docs/BLOCKERS.md` and `docs/DECISIONS.md` if missing.

## Out of scope
Any application code beyond placeholders. Running migrations against any database.

## Acceptance checks
- `pnpm install && pnpm check` passes.
- `pnpm --filter db test` shows the ordering test reading all 18 `.sql` files in `db/migrations` (0001 to 0020, with 0009 and 0010 absent), ignoring the `.md` file, and a batch-split test proving `0014_procedures.sql` splits into 7 procedure batches.
- `pnpm --filter db exec tsx scripts/migrate.ts --offline --dry-run` lists 0001 to 0018 and 0020 as applied and 0019 as "held: not applied, needs --include-unapplied".
- `pnpm --filter db exec tsx scripts/migrate.ts --dry-run` without SQL settings exits with a clear "SIC_SQL_SERVER not set (use --offline to plan without a database)" message, not a stack trace.

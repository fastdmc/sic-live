#!/usr/bin/env tsx
/**
 * Migration planner / applier for db/migrations.
 *
 * Batch split: see splitBatches.ts and the "Batch splitting" section in db/README.md.
 *
 * Modes:
 *   --offline --dry-run  plan from files + Applied/Not applied tables in db/README.md
 *   --dry-run            plan against ctl.SchemaMigration (needs SQL settings)
 *   (no flag)            apply missing migrations (needs SQL settings)
 *   --include-unapplied  also apply migrations listed as held in README
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitBatches } from './splitBatches.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbRoot = path.resolve(__dirname, '..');
const migrationsDir = path.join(dbRoot, 'migrations');
const readmePath = path.join(dbRoot, 'README.md');

export type MigrationFile = {
  id: string;
  fileName: string;
  fullPath: string;
};

export async function listMigrationFiles(dir = migrationsDir): Promise<MigrationFile[]> {
  const names = await readdir(dir);
  return names
    .filter((n) => n.endsWith('.sql'))
    .sort()
    .map((fileName) => ({
      id: fileName.replace(/\.sql$/i, ''),
      fileName,
      fullPath: path.join(dir, fileName),
    }));
}

/** Parse Applied / Not applied tables from db/README.md. */
export async function parseReadmeStatus(
  readme = readmePath,
): Promise<{ applied: Set<string>; held: Set<string> }> {
  const text = await readFile(readme, 'utf8');
  const applied = new Set<string>();
  const held = new Set<string>();

  const appliedSection = text.match(
    /## Applied to live[\s\S]*?(?=## Not applied)/i,
  )?.[0];
  const heldSection = text.match(/## Not applied[\s\S]*?(?=## )/i)?.[0];

  const rowRe = /^\|\s*(\d{4}_[a-z0-9_]+)\s*\|/gim;
  if (appliedSection) {
    for (const m of appliedSection.matchAll(rowRe)) {
      if (m[1]) applied.add(m[1]);
    }
  }
  if (heldSection) {
    for (const m of heldSection.matchAll(rowRe)) {
      if (m[1]) held.add(m[1]);
    }
  }
  return { applied, held };
}

export type PlanEntry = {
  id: string;
  fileName: string;
  status: 'applied' | 'held' | 'pending';
  batches: number;
};

export async function planOffline(): Promise<PlanEntry[]> {
  const files = await listMigrationFiles();
  const { applied, held } = await parseReadmeStatus();
  const plan: PlanEntry[] = [];

  for (const f of files) {
    const sql = await readFile(f.fullPath, 'utf8');
    const batches = splitBatches(sql).length;
    let status: PlanEntry['status'] = 'pending';
    if (applied.has(f.id)) status = 'applied';
    else if (held.has(f.id)) status = 'held';
    plan.push({ id: f.id, fileName: f.fileName, status, batches });
  }
  return plan;
}

function printPlan(plan: PlanEntry[]): void {
  for (const p of plan) {
    if (p.status === 'applied') {
      console.log(`${p.id}: applied (${p.batches} batches)`);
    } else if (p.status === 'held') {
      console.log(
        `${p.id}: held: not applied, needs --include-unapplied (${p.batches} batches)`,
      );
    } else {
      console.log(`${p.id}: pending (${p.batches} batches)`);
    }
  }
}

async function main(argv: string[]): Promise<void> {
  const offline = argv.includes('--offline');
  const dryRun = argv.includes('--dry-run');
  const includeUnapplied = argv.includes('--include-unapplied');

  if (offline) {
    const plan = await planOffline();
    printPlan(plan);
    if (!dryRun) {
      console.log(
        '(offline mode never applies; pass --dry-run for an explicit plan-only run)',
      );
    }
    return;
  }

  const server = process.env.SIC_SQL_SERVER?.trim();
  const database = process.env.SIC_SQL_DATABASE?.trim();
  if (!server) {
    console.error(
      'SIC_SQL_SERVER not set (use --offline to plan without a database)',
    );
    process.exit(1);
  }
  if (!database) {
    console.error('SIC_SQL_DATABASE not set');
    process.exit(1);
  }

  // Live SQL path is intentionally stubbed overnight — never connect from the overnight agent.
  console.error(
    `SQL mode requested for ${server}/${database}; overnight agents must use --offline. Connection code is for operators only.`,
  );
  if (dryRun) {
    console.error('(refusing to open a database connection in this environment)');
  }
  if (!includeUnapplied) {
    // keep flag referenced for operators reading --help behaviour
  }
  process.exit(1);
}

const isMain =
  process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isMain) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

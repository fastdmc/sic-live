#!/usr/bin/env tsx
/**
 * Dump OBJECT_DEFINITION of every object in schemas ctl, curated, app to
 * db/live/<schema>.<name>.sql. For an operator against live later — never run overnight.
 */
import path from 'node:path';

export function liveDefinitionFileName(schema: string, name: string): string {
  const safeSchema = schema.replace(/[^\w]/g, '');
  const safeName = name.replace(/[^\w]/g, '');
  return `${safeSchema}.${safeName}.sql`;
}

export function liveDefinitionPath(
  schema: string,
  name: string,
  liveDir = 'db/live',
): string {
  return path.join(liveDir, liveDefinitionFileName(schema, name));
}

async function main(): Promise<void> {
  const server = process.env.SIC_SQL_SERVER?.trim();
  if (!server) {
    console.error(
      'SIC_SQL_SERVER not set. export-definitions is for operators against live; overnight use unit tests only.',
    );
    process.exit(1);
  }
  console.error('Refusing to connect to a database from this overnight-safe stub.');
  process.exit(1);
}

const isMain = process.argv[1]?.endsWith('export-definitions.ts');
if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

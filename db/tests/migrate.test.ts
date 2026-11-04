import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { listMigrationFiles, planOffline } from '../scripts/migrate.js';
import { splitBatches } from '../scripts/splitBatches.js';
import { liveDefinitionFileName } from '../scripts/export-definitions.js';

const dbRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(dbRoot, 'migrations');

describe('migration file ordering', () => {
  it('lists all 18 .sql files in name order, ignoring .md (0009/0010 absent)', async () => {
    const files = await listMigrationFiles(migrationsDir);
    expect(files).toHaveLength(18);
    expect(files.map((f) => f.fileName)).toEqual([
      '0001_sic_refresh_tables.sql',
      '0002_build_sic_targets.sql',
      '0003_fn_sic_hourly.sql',
      '0004_sic_hourly.sql',
      '0005_refresh_sic.sql',
      '0006_request_refresh.sql',
      '0007_loader_hook.sql',
      '0008_get_sic_hourly.sql',
      '0011_config_tables.sql',
      '0012_app_tables.sql',
      '0013_view_functions.sql',
      '0014_procedures.sql',
      '0015_escalation_outbox.sql',
      '0016_security_patches.sql',
      '0017_admin_procedures.sql',
      '0018_get_sic_version.sql',
      '0019_loader_site_config.sql',
      '0020_people_tests_changekey.sql',
    ]);
    expect(files.some((f) => f.fileName.endsWith('.md'))).toBe(false);
    expect(files.some((f) => f.id.startsWith('0009') || f.id.startsWith('0010'))).toBe(
      false,
    );
  });
});

describe('batch splitting', () => {
  it('splits 0014_procedures.sql into 7 procedure batches', async () => {
    const sql = await readFile(path.join(migrationsDir, '0014_procedures.sql'), 'utf8');
    const batches = splitBatches(sql);
    expect(batches).toHaveLength(7);
    expect(batches[0]).toMatch(/usp_UpsertUser/i);
    expect(batches[1]).toMatch(/usp_AddHourComment/i);
    expect(batches[2]).toMatch(/usp_SaveAction/i);
    expect(batches[3]).toMatch(/usp_AckEscalation/i);
    expect(batches[4]).toMatch(/usp_MarkNotificationsRead/i);
    expect(batches[5]).toMatch(/usp_SaveUserSiteRole/i);
    expect(batches[6]).toMatch(/usp_ResolveDeviceKey/i);
  });
});

describe('offline plan', () => {
  it('marks 0001–0018 and 0020 applied, 0019 held', async () => {
    const plan = await planOffline();
    const byId = Object.fromEntries(plan.map((p) => [p.id, p.status]));
    expect(byId['0019_loader_site_config']).toBe('held');
    expect(byId['0020_people_tests_changekey']).toBe('applied');
    expect(byId['0001_sic_refresh_tables']).toBe('applied');
    expect(byId['0018_get_sic_version']).toBe('applied');
  });
});

describe('export-definitions naming', () => {
  it('names files as schema.name.sql', () => {
    expect(liveDefinitionFileName('app', 'usp_GetSicVersion')).toBe(
      'app.usp_GetSicVersion.sql',
    );
    expect(liveDefinitionFileName('curated', 'vSIC_HourlyApp')).toBe(
      'curated.vSIC_HourlyApp.sql',
    );
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SicFileSchema } from './schemas.js';
import { stripNamesFromHours, summariseSicHours } from './summary.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');
const hfi = SicFileSchema.parse(
  JSON.parse(readFileSync(path.join(root, 'fixtures/sic-hfi-2026-11-02.json'), 'utf8')),
);

describe('summariseSicHours', () => {
  it('matches HFI day totals', () => {
    const summary = summariseSicHours(hfi.rows);
    expect(summary.actualPacks).toBe(135048);
    expect(summary.targetPacks).toBe(175904);
    expect(summary.redHours).toBe(88);
  });
});

describe('stripNamesFromHours', () => {
  it('clears note.by and actionOwners', () => {
    const [row] = stripNamesFromHours([
      {
        ...hfi.rows[0]!,
        actionOwners: 'Lena Leader',
        note: { by: 'Lena Leader', issue: 'x' },
      },
    ]);
    expect(row?.actionOwners).toBeNull();
    expect(row?.note?.by).toBeNull();
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { siteRag } from './rag.js';
import { ConfigFixtureSchema, SicFileSchema } from './schemas.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');
const config = ConfigFixtureSchema.parse(
  JSON.parse(readFileSync(path.join(root, 'fixtures/config.json'), 'utf8')),
);
const hfi = SicFileSchema.parse(
  JSON.parse(readFileSync(path.join(root, 'fixtures/sic-hfi-2026-11-02.json'), 'utf8')),
);
const site = config.sites.find((s) => s.siteKey === 'HFI')!;

describe('siteRag', () => {
  it('matches every HFI fixture row at site limits', () => {
    expect(hfi.rows).toHaveLength(216);
    for (const row of hfi.rows) {
      const got = siteRag(row.actualPacks, row.targetPacks, row.availableMins, site);
      expect(got).toBe(row.rag);
    }
  });
});

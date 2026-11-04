import { describe, it } from 'vitest';

/**
 * Behaviour contract against HiltonMoa-test. Skipped overnight unless SIC_SQL_SERVER is set.
 */
const enabled = Boolean(process.env.SIC_SQL_SERVER);

describe.skipIf(!enabled)('SqlRepository contract', () => {
  it('placeholder — run in the morning against HiltonMoa-test', () => {
    // Filled when SIC_SQL_SERVER points at the test copy.
  });
});

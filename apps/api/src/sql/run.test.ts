import { describe, expect, it, vi } from 'vitest';
import { run, type SqlRequestLike } from './run.js';

describe('run session context', () => {
  it('prefixes both context calls and binds user/device as parameters', async () => {
    const inputs: Array<{ name: string; value: unknown }> = [];
    let sqlText = '';
    const request: SqlRequestLike = {
      input(name, value) {
        inputs.push({ name, value });
        return request;
      },
      async query(sql) {
        sqlText = sql;
        return { recordset: [], recordsets: [[]] };
      },
    };
    const pool = { request: () => request };

    await run(pool, { userId: 42 }, 'SELECT 1 AS ok;', { siteKey: 'HFI' });

    expect(sqlText.startsWith(`EXEC sp_set_session_context @key = N'UserId', @value = @__userId;`)).toBe(
      true,
    );
    expect(sqlText).toContain(
      `EXEC sp_set_session_context @key = N'DeviceSiteKey', @value = @__deviceSiteKey;`,
    );
    expect(sqlText).toContain('SELECT 1 AS ok;');
    expect(sqlText).not.toContain('42');
    expect(sqlText).not.toContain("'HFI'");
    expect(inputs).toEqual(
      expect.arrayContaining([
        { name: '__userId', value: 42 },
        { name: '__deviceSiteKey', value: null },
        { name: 'siteKey', value: 'HFI' },
      ]),
    );
  });

  it('sets device site key for floor screens', async () => {
    const inputs: Array<{ name: string; value: unknown }> = [];
    const request: SqlRequestLike = {
      input(name, value) {
        inputs.push({ name, value });
        return request;
      },
      query: vi.fn(async () => ({ recordset: [] })),
    };
    await run({ request: () => request }, { deviceSiteKey: 'HFI' }, 'SELECT 1;');
    expect(inputs).toEqual(
      expect.arrayContaining([
        { name: '__userId', value: null },
        { name: '__deviceSiteKey', value: 'HFI' },
      ]),
    );
  });
});

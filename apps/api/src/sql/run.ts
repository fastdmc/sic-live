import type { Caller } from '@sic/shared';
import { SicError, statusForSqlError } from '@sic/shared';

export type SqlRequestLike = {
  input: (name: string, value: unknown) => SqlRequestLike;
  query: (sql: string) => Promise<{ recordset?: unknown[]; recordsets?: unknown[][] }>;
};

export type SqlPoolLike = {
  request: () => SqlRequestLike;
};

/**
 * Prefix every batch with session context. Parameters only — never interpolate.
 */
export async function run(
  pool: SqlPoolLike,
  caller: Caller,
  sql: string,
  params: Record<string, unknown> = {},
): Promise<{ recordset: unknown[]; recordsets: unknown[][] }> {
  const userId = 'userId' in caller && caller.userId != null ? caller.userId : null;
  const deviceSiteKey =
    'deviceSiteKey' in caller && caller.deviceSiteKey ? caller.deviceSiteKey : null;

  const batch = [
    `EXEC sp_set_session_context @key = N'UserId', @value = @__userId;`,
    `EXEC sp_set_session_context @key = N'DeviceSiteKey', @value = @__deviceSiteKey;`,
    sql,
  ].join('\n');

  const req = pool.request();
  req.input('__userId', userId);
  req.input('__deviceSiteKey', deviceSiteKey);
  for (const [name, value] of Object.entries(params)) {
    if (name.startsWith('__')) continue;
    req.input(name, value);
  }

  try {
    const result = await req.query(batch);
    return {
      recordset: (result.recordset as unknown[]) ?? [],
      recordsets: (result.recordsets as unknown[][]) ?? [result.recordset as unknown[]],
    };
  } catch (err) {
    const number = Number((err as { number?: number }).number ?? 0);
    if (number >= 50600 && number <= 50699) {
      const message = String((err as { message?: string }).message ?? 'Request failed');
      throw new SicError(number, statusForSqlError(number), message);
    }
    throw err;
  }
}

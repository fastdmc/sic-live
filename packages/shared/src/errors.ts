export type SicHttpStatus = 400 | 403 | 404;

export class SicError extends Error {
  readonly code: number;
  readonly status: SicHttpStatus;

  constructor(code: number, status: SicHttpStatus, message: string) {
    super(message);
    this.name = 'SicError';
    this.code = code;
    this.status = status;
  }
}

/** Map procedure error numbers 50600–50699 to HTTP status (DB_CONTRACT). */
export function statusForSqlError(code: number): SicHttpStatus {
  const forbidden = new Set([50602, 50612, 50614, 50615, 50622, 50631, 50641, 50651, 50652]);
  const notFound = new Set([50613, 50621, 50661]);
  if (forbidden.has(code)) return 403;
  if (notFound.has(code)) return 404;
  return 400;
}

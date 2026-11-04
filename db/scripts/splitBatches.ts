/** Batch-split rule for SQL migration files (see db/README.md). */

const SECTION = /^--\s+\d{2}[a-z]\./i;
const CREATE_OR_ALTER = /^\s*CREATE\s+OR\s+ALTER\b/i;
const SECURITY_POLICY = /^\s*CREATE\s+SECURITY\s+POLICY\b/i;

function isBlankOrComment(line: string): boolean {
  const t = line.trim();
  return t.length === 0 || t.startsWith('--');
}

function hasExecutableSql(lines: string[]): boolean {
  return lines.some((line) => {
    const t = line.trim();
    if (!t || t.startsWith('--')) return false;
    return true;
  });
}

function nextSignificant(lines: string[], from: number): string | null {
  for (let i = from; i < lines.length; i++) {
    const t = lines[i]?.trim() ?? '';
    if (!t || t.startsWith('--')) continue;
    return t;
  }
  return null;
}

/**
 * Split a migration file into batches.
 * New batch on: CREATE OR ALTER, CREATE SECURITY POLICY, or a `-- NNx.` section
 * that is not immediately followed by CREATE OR ALTER / CREATE SECURITY POLICY
 * (grant / IF ROLE / misc blocks). A leading `-- NNx.` comment stays with the
 * following CREATE so procedure files such as 0014 yield one batch per procedure.
 */
export function splitBatches(sql: string): string[] {
  const lines = sql.replace(/\r\n/g, '\n').split('\n');
  const batches: string[][] = [];
  let current: string[] = [];

  const flush = () => {
    const text = current.join('\n').trim();
    if (text.length > 0) batches.push([...current]);
    current = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    if (CREATE_OR_ALTER.test(trimmed) || SECURITY_POLICY.test(trimmed)) {
      if (hasExecutableSql(current)) flush();
      current.push(line);
      continue;
    }

    if (SECTION.test(trimmed)) {
      const next = nextSignificant(lines, i + 1);
      const nextIsCreate =
        !!next && (CREATE_OR_ALTER.test(next) || SECURITY_POLICY.test(next));
      if (!nextIsCreate) {
        flush();
      } else if (hasExecutableSql(current)) {
        // New lettered section that will own a CREATE: close the previous procedure.
        flush();
      }
      current.push(line);
      continue;
    }

    current.push(line);
  }

  flush();
  return batches.map((b) => b.join('\n').trim()).filter((b) => b.length > 0);
}

export function isSectionComment(line: string): boolean {
  return SECTION.test(line.trim());
}

export { isBlankOrComment };

export type Rag = 'G' | 'A' | 'R' | null;

export type SiteRagLimits = {
  ragGreenPct: number;
  ragAmberPct: number;
  ragMinAvailMins: number;
};

/** Same rule as curated.vSIC_HourlyApp SiteRAG. */
export function siteRag(
  actual: number | null | undefined,
  target: number | null | undefined,
  availableMins: number | null | undefined,
  site: SiteRagLimits,
): Rag {
  const tgt = target ?? 0;
  const act = actual ?? 0;
  const avail = availableMins ?? 0;
  if (tgt <= 0 || avail < site.ragMinAvailMins) return null;
  const pct = (100 * act) / tgt;
  if (pct >= site.ragGreenPct) return 'G';
  if (pct >= site.ragAmberPct) return 'A';
  return 'R';
}

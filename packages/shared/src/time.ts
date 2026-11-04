const WINDOWS_TO_IANA: Record<string, string> = {
  'GMT Standard Time': 'Europe/London',
  'W. Europe Standard Time': 'Europe/Berlin',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'E. Australia Standard Time': 'Australia/Brisbane',
  'W. Australia Standard Time': 'Australia/Perth',
  'New Zealand Standard Time': 'Pacific/Auckland',
};

export function windowsToIana(windowsId: string): string {
  const iana = WINDOWS_TO_IANA[windowsId];
  if (!iana) throw new Error(`Unknown Windows time zone: ${windowsId}`);
  return iana;
}

export function toSiteTime(utc: Date | string, timeZoneId: string): Date {
  const d = typeof utc === 'string' ? new Date(utc) : utc;
  const iana = windowsToIana(timeZoneId);
  // Format parts in the site zone, then rebuild a "wall clock" Date (no real TZ).
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: iana,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return new Date(
    `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`,
  );
}

const DAY_FMT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

export function formatDay(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  // "Mon 2 Nov"
  const raw = DAY_FMT.format(d);
  return raw.replace(',', '');
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function formatPacks(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return Math.round(n).toLocaleString('en-GB');
}

export { WINDOWS_TO_IANA };

import { describe, expect, it } from 'vitest';
import { formatDay, formatPacks, formatTime, toSiteTime, windowsToIana } from './time.js';

describe('time helpers', () => {
  it('maps Windows zones', () => {
    expect(windowsToIana('GMT Standard Time')).toBe('Europe/London');
    expect(windowsToIana('New Zealand Standard Time')).toBe('Pacific/Auckland');
  });

  it('applies November and June offsets for London and Auckland', () => {
    const nov = new Date('2026-11-02T12:00:00Z');
    const jun = new Date('2026-06-02T12:00:00Z');

    const londonNov = toSiteTime(nov, 'GMT Standard Time');
    expect(londonNov.getHours()).toBe(12); // GMT

    const londonJun = toSiteTime(jun, 'GMT Standard Time');
    expect(londonJun.getHours()).toBe(13); // BST

    const akNov = toSiteTime(nov, 'New Zealand Standard Time');
    expect(akNov.getHours()).toBe(1); // NZDT UTC+13 → 01:00 next day
    expect(akNov.getDate()).toBe(3);

    const akJun = toSiteTime(jun, 'New Zealand Standard Time');
    expect(akJun.getHours()).toBe(0); // NZST UTC+12
    expect(akJun.getDate()).toBe(3);
  });

  it('formats day, time and packs', () => {
    expect(formatDay('2026-11-02T00:00:00Z')).toMatch(/Nov/);
    expect(formatTime(new Date('2026-11-02T06:00:00'))).toBe('06:00');
    expect(formatPacks(12480)).toBe('12,480');
  });
});

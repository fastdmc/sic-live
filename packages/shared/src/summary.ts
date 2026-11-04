import type { SicHour } from './schemas.js';

export type LineSummary = {
  lineNo: number;
  lineName: string | null;
  areaKey: string | null;
  actualPacks: number;
  targetPacks: number;
  planPacks: number;
  attainmentPct: number | null;
  redHours: number;
  redHoursNeedingComment: number;
  giveawayKg: number;
  rejectedPacks: number;
};

export type AreaSummary = {
  areaKey: string | null;
  actualPacks: number;
  targetPacks: number;
  planPacks: number;
  attainmentPct: number | null;
  redHours: number;
  redHoursNeedingComment: number;
  giveawayKg: number;
  rejectedPacks: number;
};

export type SicSummary = {
  actualPacks: number;
  targetPacks: number;
  planPacks: number;
  attainmentPct: number | null;
  redHours: number;
  redHoursNeedingComment: number;
  giveawayKg: number;
  rejectedPacks: number;
  areas: AreaSummary[];
  lines: LineSummary[];
};

function attainment(actual: number, target: number): number | null {
  if (target <= 0) return null;
  return Math.round((1000 * actual) / target) / 10;
}

export function summariseSicHours(hours: SicHour[]): SicSummary {
  const byLine = new Map<number, SicHour[]>();
  for (const h of hours) {
    const list = byLine.get(h.lineNo) ?? [];
    list.push(h);
    byLine.set(h.lineNo, list);
  }

  const lines: LineSummary[] = [];
  for (const [lineNo, rows] of byLine) {
    const actualPacks = rows.reduce((s, h) => s + (h.actualPacks ?? 0), 0);
    const targetPacks = rows.reduce((s, h) => s + (h.targetPacks ?? 0), 0);
    const planPacks = rows.reduce((s, h) => s + (h.planPacks ?? 0), 0);
    const redHours = rows.filter((h) => h.rag === 'R').length;
    const redHoursNeedingComment = rows.filter(
      (h) => h.rag === 'R' && h.hourStatus === 'Complete' && (h.noteCount ?? 0) === 0,
    ).length;
    const giveawayKg = rows.reduce((s, h) => s + (h.giveawayKg ?? 0), 0);
    const rejectedPacks = rows.reduce((s, h) => s + (h.rejectedPacks ?? 0), 0);
    const first = rows[0]!;
    lines.push({
      lineNo,
      lineName: first.lineName ?? null,
      areaKey: first.areaKey ?? null,
      actualPacks,
      targetPacks,
      planPacks,
      attainmentPct: attainment(actualPacks, targetPacks),
      redHours,
      redHoursNeedingComment,
      giveawayKg: Math.round(giveawayKg * 100) / 100,
      rejectedPacks,
    });
  }
  lines.sort((a, b) => a.lineNo - b.lineNo);

  const byArea = new Map<string | null, LineSummary[]>();
  for (const line of lines) {
    const list = byArea.get(line.areaKey) ?? [];
    list.push(line);
    byArea.set(line.areaKey, list);
  }
  const areas: AreaSummary[] = [...byArea.entries()].map(([areaKey, ls]) => {
    const actualPacks = ls.reduce((s, l) => s + l.actualPacks, 0);
    const targetPacks = ls.reduce((s, l) => s + l.targetPacks, 0);
    return {
      areaKey,
      actualPacks,
      targetPacks,
      planPacks: ls.reduce((s, l) => s + l.planPacks, 0),
      attainmentPct: attainment(actualPacks, targetPacks),
      redHours: ls.reduce((s, l) => s + l.redHours, 0),
      redHoursNeedingComment: ls.reduce((s, l) => s + l.redHoursNeedingComment, 0),
      giveawayKg: Math.round(ls.reduce((s, l) => s + l.giveawayKg, 0) * 100) / 100,
      rejectedPacks: ls.reduce((s, l) => s + l.rejectedPacks, 0),
    };
  });

  const actualPacks = lines.reduce((s, l) => s + l.actualPacks, 0);
  const targetPacks = lines.reduce((s, l) => s + l.targetPacks, 0);
  return {
    actualPacks,
    targetPacks,
    planPacks: lines.reduce((s, l) => s + l.planPacks, 0),
    attainmentPct: attainment(actualPacks, targetPacks),
    redHours: lines.reduce((s, l) => s + l.redHours, 0),
    redHoursNeedingComment: lines.reduce((s, l) => s + l.redHoursNeedingComment, 0),
    giveawayKg: Math.round(lines.reduce((s, l) => s + l.giveawayKg, 0) * 100) / 100,
    rejectedPacks: lines.reduce((s, l) => s + l.rejectedPacks, 0),
    areas,
    lines,
  };
}

/** Strip person names from SIC hours for floor TVs. */
export function stripNamesFromHours(hours: SicHour[]): SicHour[] {
  return hours.map((h) => ({
    ...h,
    actionOwners: null,
    note: h.note
      ? {
          ...h.note,
          by: null,
        }
      : h.note,
  }));
}

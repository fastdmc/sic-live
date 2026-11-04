import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SicError } from '../errors.js';
import { FakeRepository } from './FakeRepository.js';
import { FixtureClock } from './FixtureClock.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../');
const expected = JSON.parse(
  readFileSync(path.join(root, 'fixtures/expected.json'), 'utf8'),
) as {
  'HFI_2026-11-02': {
    rows: number;
    lines: number;
    actualPacks: number;
    targetPacks: number;
    planPacks: number;
    redHours: number;
    giveawayKg: number;
    rejectedPacks: number;
  };
  'escalationEngine_2026-11-02_12:00_fake_reference': Record<string, number | string>;
};

const LENA = { userId: 1 };
const AIDAN = { userId: 2 };
const DEMO_LEADER = { userId: 7 };
const UK_VIEWER = { userId: 5 };
const GROUP_ADMIN = { userId: 6 };

describe('FakeRepository totals', () => {
  it('matches HFI expected fixture totals', async () => {
    const repo = new FakeRepository();
    const hours = await repo.getSicHours(LENA, 'HFI', '2026-11-02');
    const exp = expected['HFI_2026-11-02'];
    expect(hours).toHaveLength(exp.rows);
    expect(new Set(hours.map((h) => h.lineNo)).size).toBe(exp.lines);
    expect(hours.reduce((s, h) => s + (h.actualPacks ?? 0), 0)).toBe(exp.actualPacks);
    expect(hours.reduce((s, h) => s + (h.targetPacks ?? 0), 0)).toBe(exp.targetPacks);
    expect(hours.reduce((s, h) => s + (h.planPacks ?? 0), 0)).toBe(exp.planPacks);
    expect(hours.filter((h) => h.rag === 'R').length).toBe(exp.redHours);
    const giveaway = hours.reduce((s, h) => s + (h.giveawayKg ?? 0), 0);
    expect(Number(giveaway.toFixed(2))).toBe(exp.giveawayKg);
    expect(hours.reduce((s, h) => s + (h.rejectedPacks ?? 0), 0)).toBe(exp.rejectedPacks);
  });
});

describe('site isolation', () => {
  it('blocks cross-site reads and lets group admin see all', async () => {
    const repo = new FakeRepository();
    await expect(repo.getSicHours(DEMO_LEADER, 'HFI', '2026-11-02')).rejects.toBeInstanceOf(
      SicError,
    );
    await expect(repo.getSicHours(LENA, 'DEMO', '2026-11-02')).rejects.toBeInstanceOf(SicError);
    const uk = await repo.listSites(UK_VIEWER);
    expect(uk.map((s) => s.siteKey)).toEqual(['HFUK']);
    await expect(repo.getSicHours(UK_VIEWER, 'HFI', '2026-11-02')).rejects.toBeInstanceOf(SicError);
    const all = await repo.listSites(GROUP_ADMIN);
    expect(all.map((s) => s.siteKey).sort()).toEqual(['DEMO', 'HFI', 'HFUK']);
  });
});

describe('escalation engine', () => {
  it('matches fake reference counts at 12:00 and is idempotent', async () => {
    const repo = new FakeRepository();
    const raised = await repo.evaluateEscalations('2026-11-02T12:00:00Z');
    const count = (type: string, lvl: number) =>
      raised
        .filter((r) => r.siteKey === 'HFI' && r.ruleType === type && r.lvl === lvl)
        .reduce((s, r) => s + r.raised, 0);

    const ref = expected['escalationEngine_2026-11-02_12:00_fake_reference'];
    expect(count('RedNoComment', 1)).toBe(ref.RedNoComment_L1);
    expect(count('RedNoComment', 2)).toBe(ref.RedNoComment_L2);
    expect(count('ConsecutiveRed', 1)).toBe(ref.ConsecutiveRed_L1);
    expect(count('ConsecutiveRed', 2)).toBe(ref.ConsecutiveRed_L2);
    expect(count('ShiftBelowTarget', 1)).toBe(ref.ShiftBelowTarget_L1);

    const second = await repo.evaluateEscalations('2026-11-02T12:00:00Z');
    expect(second.reduce((s, r) => s + r.raised, 0)).toBe(0);

    // All Teams/email suppressed when notificationsLive is false
    const outbound = repo
      .getNotificationsRaw()
      .filter((n) => n.channel === 'Teams' || n.channel === 'Email');
    expect(outbound.length).toBeGreaterThan(0);
    expect(outbound.every((n) => n.status === 'Suppressed')).toBe(true);

    // Comment resolves RedNoComment on line 1 06:00
    await repo.addComment(LENA, {
      siteKey: 'HFI',
      lineNo: 1,
      hourStart: '2026-11-02T06:00:00',
      issue: 'Knife change overrun',
      reasonCode: 'CHANGEOVER',
    });
    const open = repo
      .getEscalationsRaw()
      .filter(
        (e) =>
          e.siteKey === 'HFI' &&
          e.ruleType === 'RedNoComment' &&
          e.lineNo === 1 &&
          e.hourStart === '2026-11-02T06:00:00' &&
          e.status === 'Open',
      );
    expect(open).toHaveLength(0);

    // Action overdue
    await repo.saveAction(LENA, {
      siteKey: 'HFI',
      title: 'Fix sealing head',
      lineNo: 4,
      dueDate: '2026-11-01',
      ownerUserId: 1,
    });
    const overdue = await repo.evaluateEscalations('2026-11-02T12:00:00Z');
    expect(overdue.some((r) => r.ruleType === 'ActionOverdue')).toBe(true);
  });

  it('creates Pending Teams/email when live and target active', async () => {
    const repo = new FakeRepository();
    const site = repo.getSitesRaw().find((s) => s.siteKey === 'HFI')!;
    site.notificationsLive = true;
    const target = repo.getTargetsRaw().find((t) => t.address === 'teams-sic-hfi')!;
    target.isActive = true;
    await repo.evaluateEscalations('2026-11-02T12:00:00Z');
    const pending = repo
      .getNotificationsRaw()
      .filter((n) => n.status === 'Pending' && n.siteKey === 'HFI');
    // ConsecutiveRed L2: Teams target + email to role holders
    expect(pending.some((n) => n.channel === 'Teams' && n.address === 'teams-sic-hfi')).toBe(
      true,
    );
    expect(pending.some((n) => n.channel === 'Email')).toBe(true);
  });
});

describe('role checks', () => {
  it('lets Lena comment on line 4 but not line 11; Aidan can ack; Lena cannot verify', async () => {
    const repo = new FakeRepository(new FixtureClock());
    await repo.addComment(LENA, {
      siteKey: 'HFI',
      lineNo: 4,
      hourStart: '2026-11-02T07:00:00',
      issue: 'Film break',
    });
    await expect(
      repo.addComment(LENA, {
        siteKey: 'HFI',
        lineNo: 11,
        hourStart: '2026-11-02T07:00:00',
        issue: 'Should fail',
      }),
    ).rejects.toMatchObject({ code: 50602, status: 403 });

    await repo.evaluateEscalations('2026-11-02T12:00:00Z');
    const esc = repo
      .getEscalationsRaw()
      .find((e) => e.siteKey === 'HFI' && e.areaKey === 'fresh' && e.status === 'Open');
    expect(esc).toBeTruthy();
    await repo.ackEscalation(AIDAN, esc!.escalationId, { note: 'Seen' });

    const action = await repo.saveAction(LENA, {
      siteKey: 'HFI',
      title: 'Needs verify',
      lineNo: 4,
      status: 'Done',
    });
    // create then mark done as owner path — save as Done on create not allowed via status on create
    await repo.saveAction(LENA, { actionId: action.actionId, status: 'Done' });
    await expect(
      repo.saveAction(LENA, { actionId: action.actionId, status: 'Verified' }),
    ).rejects.toMatchObject({ code: 50615, status: 403 });
  });
});

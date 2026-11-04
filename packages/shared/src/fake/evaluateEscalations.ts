import { toSiteTime } from '../time.js';
import type {
  Action,
  Escalation,
  EscalationRule,
  Notification,
  NotificationTarget,
  SicHour,
  Site,
  UserRole,
} from '../schemas.js';

export type EngineUser = {
  userId: number;
  email: string;
  displayName: string;
  isActive: boolean;
  isGroupAdmin: boolean;
  roles: UserRole[];
};

export type EngineState = {
  sites: Site[];
  hours: SicHour[];
  rules: EscalationRule[];
  targets: NotificationTarget[];
  users: EngineUser[];
  actions: Action[];
  escalations: Escalation[];
  notifications: Notification[];
  nextEscalationId: number;
  nextNotificationId: number;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Subject hour key: `{LineNo}|{yyyy-MM-ddTHH:mm}` matching SQL varchar(16) style 126. */
export function hourSubject(lineNo: number, hourStart: string): string {
  const d = new Date(hourStart);
  const stamp = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return `${lineNo}|${stamp}`;
}

function addMinutes(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60_000);
}

function dayStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function alreadyBlocked(
  existing: Escalation[],
  siteKey: string,
  ruleType: string,
  subjectKey: string,
  lvl: number,
): boolean {
  return existing.some(
    (e) =>
      e.siteKey === siteKey &&
      e.ruleType === ruleType &&
      e.subjectKey === subjectKey &&
      (e.lvl === lvl ||
        (e.lvl < lvl && (e.status === 'Acknowledged' || e.status === 'Resolved'))),
  );
}

function pickRule(
  rules: EscalationRule[],
  siteKey: string,
  ruleType: string,
  areaKey: string | null | undefined,
  lvl?: number,
): EscalationRule[] {
  const matched = rules.filter(
    (r) =>
      r.siteKey === siteKey &&
      r.ruleType === ruleType &&
      r.isActive &&
      (lvl == null || r.lvl === lvl) &&
      (r.areaKey === '' || r.areaKey === (areaKey ?? '')),
  );
  // Area-specific beats site-wide per subject+level: keep best per lvl
  const byLvl = new Map<number, EscalationRule>();
  for (const r of matched.sort((a, b) => (a.areaKey === '' ? 1 : 0) - (b.areaKey === '' ? 1 : 0))) {
    if (!byLvl.has(r.lvl)) byLvl.set(r.lvl, r);
  }
  return [...byLvl.values()];
}

export function runEvaluateEscalations(
  state: EngineState,
  asOfUtc: Date,
  siteKeyFilter?: string | null,
): { raised: Array<{ siteKey: string; ruleType: string; lvl: number; raised: number }>; newIds: number[] } {
  const newIds: number[] = [];
  const counts = new Map<string, { siteKey: string; ruleType: string; lvl: number; raised: number }>();

  const bump = (siteKey: string, ruleType: string, lvl: number) => {
    const k = `${siteKey}|${ruleType}|${lvl}`;
    const cur = counts.get(k) ?? { siteKey, ruleType, lvl, raised: 0 };
    cur.raised += 1;
    counts.set(k, cur);
  };

  const sites = state.sites.filter(
    (s) => s.isActive && (!siteKeyFilter || s.siteKey === siteKeyFilter),
  );

  for (const site of sites) {
    const nowLocal = toSiteTime(asOfUtc, site.timeZoneId);
    const liveFrom = site.liveFromUtc
      ? toSiteTime(site.liveFromUtc, site.timeZoneId)
      : new Date('2000-01-01T00:00:00');
    const windowStart = addMinutes(nowLocal, -12 * 60);
    const loadStart = addMinutes(nowLocal, -26 * 60);

    const siteHours = state.hours.filter((h) => {
      if (h.siteKey !== site.siteKey) return false;
      if (h.hourStatus !== 'Complete') return false;
      const end = new Date(h.hourEnd);
      return end <= nowLocal && end >= loadStart && end >= liveFrom;
    });

    const recentHours = siteHours.filter((h) => new Date(h.hourEnd) >= windowStart);

    // RedNoComment
    for (const h of recentHours) {
      if (h.rag !== 'R') continue;
      if ((h.noteCount ?? 0) > 0) continue;
      const end = new Date(h.hourEnd);
      for (const rule of pickRule(state.rules, site.siteKey, 'RedNoComment', h.areaKey)) {
        if (addMinutes(end, rule.delayMins) > nowLocal) continue;
        const subj = hourSubject(h.lineNo, h.hourStart);
        if (alreadyBlocked(state.escalations, site.siteKey, rule.ruleType, subj, rule.lvl)) continue;
        const id = state.nextEscalationId++;
        state.escalations.push({
          escalationId: id,
          ruleId: rule.ruleId,
          siteKey: site.siteKey,
          areaKey: h.areaKey ?? null,
          lineNo: h.lineNo,
          productionDate: h.productionDate,
          hourStart: h.hourStart,
          ruleType: rule.ruleType,
          lvl: rule.lvl,
          subjectKey: subj,
          title: `${h.lineName ?? `Line ${h.lineNo}`} red at ${pad2(new Date(h.hourStart).getHours())}:${pad2(new Date(h.hourStart).getMinutes())} with no comment`,
          detail: `Level ${rule.lvl}. ${rule.description ?? ''}`.trim(),
          status: 'Open',
          raisedUtc: asOfUtc.toISOString(),
        });
        newIds.push(id);
        bump(site.siteKey, rule.ruleType, rule.lvl);
      }
    }

    // ConsecutiveRed islands
    const byLineDay = new Map<string, SicHour[]>();
    for (const h of siteHours) {
      const k = `${h.lineNo}|${h.productionDate}`;
      const list = byLineDay.get(k) ?? [];
      list.push(h);
      byLineDay.set(k, list);
    }
    for (const rows of byLineDay.values()) {
      rows.sort((a, b) => a.hourStart.localeCompare(b.hourStart));
      let redPart = 0;
      const islands = new Map<number, SicHour[]>();
      rows.forEach((h, idx) => {
        const rnAll = idx + 1;
        if (h.rag === 'R') {
          redPart += 1;
          const grp = rnAll - redPart;
          const list = islands.get(grp) ?? [];
          list.push(h);
          islands.set(grp, list);
        }
      });
      for (const island of islands.values()) {
        if (!island.some((h) => new Date(h.hourEnd) >= windowStart)) continue;
        const first = island[0]!;
        for (const rule of pickRule(state.rules, site.siteKey, 'ConsecutiveRed', first.areaKey)) {
          if (island.length < (rule.threshold ?? 0)) continue;
          const subj = hourSubject(first.lineNo, first.hourStart);
          if (alreadyBlocked(state.escalations, site.siteKey, rule.ruleType, subj, rule.lvl)) continue;
          const id = state.nextEscalationId++;
          state.escalations.push({
            escalationId: id,
            ruleId: rule.ruleId,
            siteKey: site.siteKey,
            areaKey: first.areaKey ?? null,
            lineNo: first.lineNo,
            productionDate: first.productionDate,
            hourStart: first.hourStart,
            ruleType: rule.ruleType,
            lvl: rule.lvl,
            subjectKey: subj,
            title: `${first.lineName ?? `Line ${first.lineNo}`}: ${island.length} red hours in a row from ${pad2(new Date(first.hourStart).getHours())}:${pad2(new Date(first.hourStart).getMinutes())}`,
            detail: `Level ${rule.lvl}. ${rule.description ?? ''}`.trim(),
            status: 'Open',
            raisedUtc: asOfUtc.toISOString(),
          });
          newIds.push(id);
          bump(site.siteKey, rule.ruleType, rule.lvl);
        }
      }
    }

    // ShiftBelowTarget
    for (const rows of byLineDay.values()) {
      rows.sort((a, b) => a.hourStart.localeCompare(b.hourStart));
      if (rows.length < 3) continue;
      const last = rows[rows.length - 1]!;
      if (new Date(last.hourEnd) < windowStart) continue;
      const tgt = last.cumTargetPacks ?? 0;
      if (tgt <= 0) continue;
      const pct = (100 * (last.cumActualPacks ?? 0)) / tgt;
      for (const rule of pickRule(state.rules, site.siteKey, 'ShiftBelowTarget', last.areaKey)) {
        if (pct >= (rule.threshold ?? 0)) continue;
        const subj = `${last.lineNo}|${last.productionDate}`;
        if (alreadyBlocked(state.escalations, site.siteKey, rule.ruleType, subj, rule.lvl)) continue;
        const id = state.nextEscalationId++;
        state.escalations.push({
          escalationId: id,
          ruleId: rule.ruleId,
          siteKey: site.siteKey,
          areaKey: last.areaKey ?? null,
          lineNo: last.lineNo,
          productionDate: last.productionDate,
          hourStart: last.hourStart,
          ruleType: rule.ruleType,
          lvl: rule.lvl,
          subjectKey: subj,
          title: `${last.lineName ?? `Line ${last.lineNo}`} at ${pct.toFixed(1)}% of target after ${rows.length} hours`,
          detail: `Level ${rule.lvl}. ${rule.description ?? ''}`.trim(),
          status: 'Open',
          raisedUtc: asOfUtc.toISOString(),
        });
        newIds.push(id);
        bump(site.siteKey, rule.ruleType, rule.lvl);
      }
    }

    // ActionOverdue
    const today = dayStr(nowLocal);
    for (const a of state.actions) {
      if (a.siteKey !== site.siteKey) continue;
      if (a.status !== 'Open' && a.status !== 'InProgress') continue;
      if (!a.dueDate || a.dueDate >= today) continue;
      for (const rule of pickRule(state.rules, site.siteKey, 'ActionOverdue', a.areaKey)) {
        const subj = `A${a.actionId}`;
        if (alreadyBlocked(state.escalations, site.siteKey, rule.ruleType, subj, rule.lvl)) continue;
        const id = state.nextEscalationId++;
        state.escalations.push({
          escalationId: id,
          ruleId: rule.ruleId,
          siteKey: site.siteKey,
          areaKey: a.areaKey ?? null,
          lineNo: a.lineNo,
          productionDate: a.productionDate ?? null,
          hourStart: a.hourStart ?? null,
          actionId: a.actionId,
          ruleType: rule.ruleType,
          lvl: rule.lvl,
          subjectKey: subj,
          title: `Action overdue: ${a.title.slice(0, 200)}`,
          detail: `Was due ${a.dueDate}`,
          status: 'Open',
          raisedUtc: asOfUtc.toISOString(),
        });
        newIds.push(id);
        bump(site.siteKey, rule.ruleType, rule.lvl);
      }
    }
  }

  // Next level after EscalateAfterMins
  for (const e of [...state.escalations]) {
    if (e.status !== 'Open') continue;
    if (siteKeyFilter && e.siteKey !== siteKeyFilter) continue;
    const rule = state.rules.find((r) => r.ruleId === e.ruleId);
    if (!rule?.escalateAfterMins) continue;
    if (addMinutes(new Date(e.raisedUtc), rule.escalateAfterMins) > asOfUtc) continue;
    const nextRules = state.rules
      .filter(
        (x) =>
          x.siteKey === e.siteKey &&
          x.ruleType === e.ruleType &&
          x.lvl === e.lvl + 1 &&
          x.isActive &&
          (x.areaKey === '' || x.areaKey === (e.areaKey ?? '')),
      )
      .sort((a, b) => (a.areaKey === '' ? 1 : 0) - (b.areaKey === '' ? 1 : 0));
    const nx = nextRules[0];
    if (!nx) continue;
    if (
      state.escalations.some(
        (y) =>
          y.siteKey === e.siteKey &&
          y.ruleType === e.ruleType &&
          y.subjectKey === e.subjectKey &&
          y.lvl >= nx.lvl,
      )
    ) {
      continue;
    }
    const id = state.nextEscalationId++;
    state.escalations.push({
      escalationId: id,
      ruleId: nx.ruleId,
      siteKey: e.siteKey,
      areaKey: e.areaKey,
      lineNo: e.lineNo,
      productionDate: e.productionDate,
      hourStart: e.hourStart,
      actionId: e.actionId,
      ruleType: e.ruleType,
      lvl: nx.lvl,
      subjectKey: e.subjectKey,
      title: e.title,
      detail: `Level ${nx.lvl}. Not acknowledged within ${rule.escalateAfterMins} minutes`,
      status: 'Open',
      raisedUtc: asOfUtc.toISOString(),
    });
    newIds.push(id);
    bump(e.siteKey, e.ruleType, nx.lvl);
  }

  // Notifications for newly raised
  for (const id of newIds) {
    const e = state.escalations.find((x) => x.escalationId === id)!;
    const rule = state.rules.find((r) => r.ruleId === e.ruleId)!;
    const site = state.sites.find((s) => s.siteKey === e.siteKey)!;
    const live = site.notificationsLive;

    const recipients = new Map<number, string>();
    for (const u of state.users) {
      if (!u.isActive) continue;
      for (const ur of u.roles) {
        if (ur.siteKey !== e.siteKey) continue;
        if (ur.areaKey && ur.areaKey !== '' && ur.areaKey !== (e.areaKey ?? '')) continue;
        if (!rule.notifyRoles.includes(ur.role)) continue;
        recipients.set(u.userId, u.email);
      }
    }
    if (e.actionId) {
      const a = state.actions.find((x) => x.actionId === e.actionId);
      if (a?.ownerUserId) {
        const owner = state.users.find((u) => u.userId === a.ownerUserId && u.isActive);
        if (owner) recipients.set(owner.userId, owner.email);
      }
    }

    for (const [userId, email] of recipients) {
      // InApp Sent
      state.notifications.push({
        notificationId: state.nextNotificationId++,
        siteKey: e.siteKey,
        escalationId: e.escalationId,
        actionId: e.actionId ?? null,
        channel: 'InApp',
        recipientUserId: userId,
        subject: e.title,
        body: e.detail,
        deepLink: `/escalations/${e.escalationId}`,
        status: 'Sent',
        createdUtc: asOfUtc.toISOString(),
        sentUtc: asOfUtc.toISOString(),
        notBeforeUtc: asOfUtc.toISOString(),
        attempts: 0,
      });
      if (rule.toEmail) {
        state.notifications.push({
          notificationId: state.nextNotificationId++,
          siteKey: e.siteKey,
          escalationId: e.escalationId,
          actionId: e.actionId ?? null,
          channel: 'Email',
          recipientUserId: userId,
          address: email,
          subject: e.title,
          body: e.detail,
          deepLink: `/escalations/${e.escalationId}`,
          status: live ? 'Pending' : 'Suppressed',
          createdUtc: asOfUtc.toISOString(),
          notBeforeUtc: asOfUtc.toISOString(),
          attempts: 0,
        });
      }
    }

    for (const t of state.targets) {
      if (t.siteKey !== e.siteKey) continue;
      if (t.areaKey && t.areaKey !== '' && t.areaKey !== (e.areaKey ?? '')) continue;
      if (t.minLvl > e.lvl) continue;
      if (!((t.channel === 'Teams' && rule.toTeams) || (t.channel === 'Email' && rule.toEmail))) {
        continue;
      }
      state.notifications.push({
        notificationId: state.nextNotificationId++,
        siteKey: e.siteKey,
        escalationId: e.escalationId,
        actionId: e.actionId ?? null,
        channel: t.channel,
        address: t.address,
        subject: e.title,
        body: e.detail,
        deepLink: `/escalations/${e.escalationId}`,
        status: live && t.isActive ? 'Pending' : 'Suppressed',
        createdUtc: asOfUtc.toISOString(),
        notBeforeUtc: asOfUtc.toISOString(),
        attempts: 0,
      });
    }
  }

  return { raised: [...counts.values()], newIds };
}

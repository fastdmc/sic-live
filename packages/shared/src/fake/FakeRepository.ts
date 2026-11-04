import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SicError } from '../errors.js';
import type {
  Caller,
  ClaimedNotification,
  Repository,
  SiteConfig,
  UpsertUserInput,
} from '../repository.js';
import {
  ConfigFixtureSchema,
  SicFileSchema,
  UsersFixtureSchema,
  type Action,
  type ActionUpdate,
  type AddCommentRequest,
  type AppUser,
  type Area,
  type DeviceKey,
  type Escalation,
  type EscalationRule,
  type HourComment,
  type Line,
  type Me,
  type Notification,
  type NotificationTarget,
  type ReasonCode,
  type SaveActionRequest,
  type SicHour,
  type SicVersion,
  type Site,
  type UserRole,
} from '../schemas.js';
import { FixtureClock } from './FixtureClock.js';
import { runEvaluateEscalations, type EngineUser } from './evaluateEscalations.js';
import { hasAnySiteRole, roleRankForArea } from './roles.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../');
const FIXTURES = path.join(ROOT, 'fixtures');

function loadJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8'));
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

function requireUser(caller: Caller): number {
  if (!('userId' in caller) || caller.userId == null) {
    throw new SicError(50652, 403, 'Floor screens cannot do this');
  }
  return caller.userId;
}

export class FakeRepository implements Repository {
  readonly clock: FixtureClock;
  private sites: Site[] = [];
  private areas: Area[] = [];
  private lines: Line[] = [];
  private reasonCodes: ReasonCode[] = [];
  private rules: EscalationRule[] = [];
  private targets: NotificationTarget[] = [];
  private deviceKeys: DeviceKey[] = [];
  private hours: SicHour[] = [];
  private users: EngineUser[] = [];
  private comments: HourComment[] = [];
  private actions: Action[] = [];
  private actionUpdates: ActionUpdate[] = [];
  private escalations: Escalation[] = [];
  private notifications: Notification[] = [];
  private versions = new Map<string, { version: number; changeKey: number; refreshedUtc: string }>();
  private nextCommentId = 1;
  private nextActionId = 1;
  private nextUpdateId = 1;
  private nextEscalationId = 1;
  private nextNotificationId = 1;
  private nextDeviceKeyId = 100;
  private identities = new Map<string, number>();

  constructor(clock = new FixtureClock()) {
    this.clock = clock;
    this.reload();
  }

  reload(): void {
    const config = ConfigFixtureSchema.parse(loadJson('config.json'));
    const usersFile = UsersFixtureSchema.parse(loadJson('users.json'));
    const hfi = SicFileSchema.parse(loadJson('sic-hfi-2026-11-02.json'));
    const demo = SicFileSchema.parse(loadJson('sic-demo-2026-11-02.json'));

    this.sites = clone(config.sites);
    this.areas = clone(config.areas);
    this.lines = clone(config.lines);
    this.reasonCodes = clone(config.reasonCodes);
    this.rules = clone(config.escalationRules);
    this.targets = clone(config.notificationTargets);
    this.deviceKeys = clone(config.deviceKeys);
    this.hours = [...clone(hfi.rows), ...clone(demo.rows)];
    this.users = usersFile.users.map((u) => ({
      userId: u.userId,
      email: u.email,
      displayName: u.displayName,
      isActive: true,
      isGroupAdmin: u.isGroupAdmin,
      roles: clone(u.roles) as UserRole[],
    }));
    this.comments = [];
    this.actions = [];
    this.actionUpdates = [];
    this.escalations = [];
    this.notifications = [];
    this.nextCommentId = 1;
    this.nextActionId = 1;
    this.nextUpdateId = 1;
    this.nextEscalationId = 1;
    this.nextNotificationId = 1;
    this.identities.clear();

    const refreshed = this.clock.nowIso();
    for (const h of this.hours) h.refreshedUtc = refreshed;
    this.versions.clear();
    for (const s of this.sites) {
      this.versions.set(s.siteKey, { version: 1, changeKey: 1, refreshedUtc: refreshed });
    }
  }

  bumpVersion(siteKey: string): void {
    const v = this.versions.get(siteKey);
    if (!v) return;
    v.version += 1;
    v.changeKey += 1;
    v.refreshedUtc = this.clock.nowIso();
    for (const h of this.hours) {
      if (h.siteKey === siteKey) h.refreshedUtc = v.refreshedUtc;
    }
  }

  private touchChange(siteKey: string): void {
    const v = this.versions.get(siteKey);
    if (v) v.changeKey += 1;
  }

  private user(userId: number): EngineUser {
    const u = this.users.find((x) => x.userId === userId);
    if (!u) throw new SicError(50651, 403, 'No access');
    return u;
  }

  private assertSiteAccess(caller: Caller, siteKey: string): void {
    if ('deviceSiteKey' in caller && caller.deviceSiteKey) {
      if (caller.deviceSiteKey !== siteKey) {
        throw new SicError(50651, 403, 'No access to this site');
      }
      return;
    }
    const u = this.user(requireUser(caller));
    if (!hasAnySiteRole(u.isGroupAdmin, u.roles, siteKey)) {
      throw new SicError(50651, 403, 'No access to this site');
    }
  }

  private lineArea(siteKey: string, lineNo: number): string | null {
    return this.lines.find((l) => l.siteKey === siteKey && l.lineNo === lineNo)?.areaKey ?? null;
  }

  private assertRank(
    caller: Caller,
    siteKey: string,
    areaKey: string | null | undefined,
    minRank: number,
    code: number,
    message: string,
  ): number {
    const userId = requireUser(caller);
    const u = this.user(userId);
    const rank = roleRankForArea(u.isGroupAdmin, u.roles, siteKey, areaKey);
    if (rank < minRank) throw new SicError(code, 403, message);
    return userId;
  }

  async upsertUser(input: UpsertUserInput): Promise<Me> {
    const key = `${input.tenantId}:${input.objectId}`;
    let userId = this.identities.get(key);
    let u = userId ? this.users.find((x) => x.userId === userId) : undefined;
    if (!u) {
      u = this.users.find((x) => x.email.toLowerCase() === input.email.toLowerCase());
    }
    if (!u) {
      userId = Math.max(0, ...this.users.map((x) => x.userId)) + 1;
      u = {
        userId,
        email: input.email,
        displayName: input.displayName,
        isActive: true,
        isGroupAdmin: false,
        roles: [],
      };
      this.users.push(u);
    } else {
      u.email = input.email;
      u.displayName = input.displayName;
      userId = u.userId;
    }
    this.identities.set(key, userId!);
    return this.getMe({ userId: userId! });
  }

  async getMe(caller: Caller): Promise<Me> {
    const userId = requireUser(caller);
    const u = this.user(userId);
    const siteKeys = u.isGroupAdmin
      ? this.sites.map((s) => s.siteKey)
      : [...new Set(u.roles.map((r) => r.siteKey))];
    return {
      userId: u.userId,
      email: u.email,
      displayName: u.displayName,
      isGroupAdmin: u.isGroupAdmin,
      roles: clone(u.roles),
      sites: this.sites.filter((s) => siteKeys.includes(s.siteKey)),
    };
  }

  async listSites(caller: Caller): Promise<Site[]> {
    const me = await this.getMe(caller);
    return me.sites;
  }

  async getSiteConfig(caller: Caller, siteKey: string): Promise<SiteConfig> {
    this.assertSiteAccess(caller, siteKey);
    const site = this.sites.find((s) => s.siteKey === siteKey);
    if (!site) throw new SicError(50651, 403, 'No access to this site');
    return {
      site: clone(site),
      areas: clone(this.areas.filter((a) => a.siteKey === siteKey)),
      lines: clone(this.lines.filter((l) => l.siteKey === siteKey)),
      reasonCodes: clone(this.reasonCodes.filter((r) => r.siteKey === siteKey)),
      escalationRules: clone(this.rules.filter((r) => r.siteKey === siteKey)),
      notificationTargets: clone(this.targets.filter((t) => t.siteKey === siteKey)),
      deviceKeys: clone(
        this.deviceKeys
          .filter((d) => d.siteKey === siteKey)
          .map(({ plainKeyForTestsOnly: _, ...rest }) => rest),
      ),
    };
  }

  async getSicVersion(caller: Caller, siteKey: string): Promise<SicVersion> {
    this.assertSiteAccess(caller, siteKey);
    const v = this.versions.get(siteKey) ?? {
      version: 0,
      changeKey: 0,
      refreshedUtc: this.clock.nowIso(),
    };
    const days = [...new Set(this.hours.filter((h) => h.siteKey === siteKey).map((h) => h.productionDate))].sort();
    return {
      siteKey,
      version: v.version,
      refreshedUtc: v.refreshedUtc,
      pending: false,
      latestDay: days[days.length - 1] ?? null,
      changeKey: String(v.changeKey),
    };
  }

  async listDays(caller: Caller, siteKey: string): Promise<string[]> {
    this.assertSiteAccess(caller, siteKey);
    return [...new Set(this.hours.filter((h) => h.siteKey === siteKey).map((h) => h.productionDate))].sort();
  }

  async getSicHours(
    caller: Caller,
    siteKey: string,
    day: string,
    lineNo?: number,
  ): Promise<SicHour[]> {
    this.assertSiteAccess(caller, siteKey);
    const device =
      'deviceSiteKey' in caller && caller.deviceSiteKey
        ? {
            areaKey: caller.areaKey ?? null,
            lineNo: caller.lineNo ?? null,
          }
        : null;
    if (device?.lineNo != null && lineNo != null && device.lineNo !== lineNo) {
      throw new SicError(50651, 403, 'No access to this line');
    }
    return clone(
      this.hours.filter(
        (h) =>
          h.siteKey === siteKey &&
          h.productionDate === day &&
          (lineNo == null || h.lineNo === lineNo) &&
          (device?.areaKey == null || h.areaKey === device.areaKey) &&
          (device?.lineNo == null || h.lineNo === device.lineNo),
      ),
    );
  }

  async addComment(
    caller: Caller,
    req: AddCommentRequest,
  ): Promise<{ commentId: number; actionId: number | null }> {
    const area = this.lineArea(req.siteKey, req.lineNo);
    const userId = this.assertRank(
      caller,
      req.siteKey,
      area,
      2,
      50602,
      'Commenting needs the line leader role or above for this line',
    );
    if (!req.issue?.trim()) throw new SicError(50603, 400, 'Issue is required');
    const hour = this.hours.find(
      (h) =>
        h.siteKey === req.siteKey &&
        h.lineNo === req.lineNo &&
        h.hourStart === req.hourStart,
    );
    if (!hour) throw new SicError(50601, 400, 'No such hour');
    if (req.reasonCode) {
      const ok = this.reasonCodes.some(
        (r) => r.siteKey === req.siteKey && r.reasonCode === req.reasonCode && r.isActive,
      );
      if (!ok) throw new SicError(50604, 400, 'Unknown reason code');
    }
    const commentId = this.nextCommentId++;
    const comment: HourComment = {
      commentId,
      siteKey: req.siteKey,
      productionDate: hour.productionDate,
      lineNo: req.lineNo,
      hourStart: req.hourStart,
      reasonCode: req.reasonCode ?? null,
      issue: req.issue,
      containmentAction: req.containmentAction ?? null,
      helpCalledAt: req.helpCalledAt ?? null,
      helpArrivedAt: req.helpArrivedAt ?? null,
      ragAtEntry: hour.rag,
      actualAtEntry: hour.actualPacks ?? null,
      targetAtEntry: hour.targetPacks ?? null,
      createdBy: userId,
      createdUtc: this.clock.nowIso(),
    };
    this.comments.push(comment);
    hour.noteCount = (hour.noteCount ?? 0) + 1;
    const reasonName =
      this.reasonCodes.find(
        (r) => r.siteKey === req.siteKey && r.reasonCode === req.reasonCode,
      )?.reasonName ?? null;
    hour.note = {
      noteId: commentId,
      reasonCode: comment.reasonCode,
      reasonName,
      issue: comment.issue,
      containment: comment.containmentAction,
      helpCalled: comment.helpCalledAt,
      helpArrived: comment.helpArrivedAt,
      by: this.user(userId).displayName,
      utc: comment.createdUtc,
    };

    // Resolve RedNoComment for this hour
    const subjPrefix = `${req.lineNo}|`;
    for (const e of this.escalations) {
      if (
        e.siteKey === req.siteKey &&
        e.ruleType === 'RedNoComment' &&
        e.status === 'Open' &&
        e.subjectKey.startsWith(subjPrefix) &&
        e.hourStart === req.hourStart
      ) {
        e.status = 'Resolved';
        e.resolvedUtc = this.clock.nowIso();
        e.resolvedBy = userId;
        e.resolvedReason = 'Comment added';
      }
    }

    let actionId: number | null = null;
    if (req.actionTitle?.trim()) {
      const action = await this.saveAction(caller, {
        siteKey: req.siteKey,
        title: req.actionTitle,
        lineNo: req.lineNo,
        commentId,
        actionType: req.actionType ?? 'Corrective',
        ownerUserId: req.actionOwnerUserId ?? null,
        ownerName: req.actionOwnerName ?? null,
        dueDate: req.actionDueDate ?? null,
      });
      actionId = action.actionId;
      hour.openActions = (hour.openActions ?? 0) + 1;
    }

    this.touchChange(req.siteKey);
    return { commentId, actionId };
  }

  async listComments(
    caller: Caller,
    siteKey: string,
    _day: string,
    lineNo: number,
    hourStart: string,
  ): Promise<HourComment[]> {
    this.assertSiteAccess(caller, siteKey);
    return clone(
      this.comments.filter(
        (c) => c.siteKey === siteKey && c.lineNo === lineNo && c.hourStart === hourStart,
      ),
    );
  }

  async saveAction(caller: Caller, req: SaveActionRequest): Promise<Action> {
    const now = this.clock.nowIso();
    if (req.actionId == null) {
      if (!req.siteKey || !req.title?.trim()) {
        throw new SicError(50611, 400, 'Site and title are required');
      }
      const area =
        req.lineNo != null ? this.lineArea(req.siteKey, req.lineNo) : null;
      const userId = this.assertRank(
        caller,
        req.siteKey,
        area,
        2,
        50612,
        'Raising an action needs the line leader role or above',
      );
      const actionId = this.nextActionId++;
      const action: Action = {
        actionId,
        siteKey: req.siteKey,
        lineNo: req.lineNo ?? null,
        areaKey: area,
        commentId: req.commentId ?? null,
        escalationId: req.escalationId ?? null,
        actionType: req.actionType ?? 'Corrective',
        title: req.title,
        detail: req.detail ?? null,
        ownerUserId: req.ownerUserId ?? null,
        ownerName: req.ownerName ?? null,
        dueDate: req.dueDate ?? null,
        status: 'Open',
        priority: req.priority ?? null,
        createdBy: userId,
        createdUtc: now,
        modifiedBy: userId,
        modifiedUtc: now,
      };
      this.actions.push(action);
      this.actionUpdates.push({
        updateId: this.nextUpdateId++,
        actionId,
        siteKey: req.siteKey,
        updateType: 'Created',
        newValue: action.status,
        note: req.note ?? null,
        byUserId: userId,
        atUtc: now,
      });
      this.touchChange(req.siteKey);
      return clone(action);
    }

    const action = this.actions.find((a) => a.actionId === req.actionId);
    if (!action) throw new SicError(50613, 404, 'Action not found');
    this.assertSiteAccess(caller, action.siteKey);
    const userId = requireUser(caller);
    const u = this.user(userId);
    const rank = roleRankForArea(u.isGroupAdmin, u.roles, action.siteKey, action.areaKey);

    if (req.status === 'Verified') {
      if (rank < 3) {
        throw new SicError(50615, 403, 'Verifying an action needs the area manager role or above');
      }
    } else if (req.status === 'Done' || req.status != null || req.ownerUserId !== undefined || req.dueDate !== undefined) {
      const isOwner = action.ownerUserId === userId;
      if (!isOwner && rank < 2) {
        throw new SicError(50614, 403, 'Only the owner or a line leader can update this action');
      }
    }

    const track = (type: ActionUpdate['updateType'], oldValue: string | null, newValue: string | null) => {
      this.actionUpdates.push({
        updateId: this.nextUpdateId++,
        actionId: action.actionId,
        siteKey: action.siteKey,
        updateType: type,
        oldValue,
        newValue,
        note: req.note ?? null,
        byUserId: userId,
        atUtc: now,
      });
    };

    if (req.title != null) action.title = req.title;
    if (req.detail !== undefined) action.detail = req.detail;
    if (req.actionType !== undefined) action.actionType = req.actionType;
    if (req.priority !== undefined) action.priority = req.priority;
    if (req.ownerUserId !== undefined || req.ownerName !== undefined) {
      track('Owner', String(action.ownerUserId ?? ''), String(req.ownerUserId ?? req.ownerName ?? ''));
      if (req.ownerUserId !== undefined) action.ownerUserId = req.ownerUserId;
      if (req.ownerName !== undefined) action.ownerName = req.ownerName;
    }
    if (req.dueDate !== undefined) {
      track('DueDate', action.dueDate ?? null, req.dueDate);
      action.dueDate = req.dueDate;
    }
    if (req.status != null && req.status !== action.status) {
      track('Status', action.status, req.status);
      action.status = req.status;
      if (req.status === 'Done') action.doneUtc = now;
      if (req.status === 'Verified') {
        action.verifiedBy = userId;
        action.verifiedUtc = now;
      }
      if (req.status === 'Done' || req.status === 'Verified' || req.status === 'Cancelled') {
        for (const e of this.escalations) {
          if (e.actionId === action.actionId && e.ruleType === 'ActionOverdue' && e.status === 'Open') {
            e.status = 'Resolved';
            e.resolvedUtc = now;
            e.resolvedBy = userId;
            e.resolvedReason = `Action ${req.status}`;
          }
        }
      }
    } else if (req.note) {
      track('Comment', null, req.note);
    }
    action.modifiedBy = userId;
    action.modifiedUtc = now;
    this.touchChange(action.siteKey);
    return clone(action);
  }

  async listActions(caller: Caller, filter: import('../repository.js').ActionFilter): Promise<Action[]> {
    const me = await this.getMe(caller);
    const allowed = new Set(me.sites.map((s) => s.siteKey));
    let list = this.actions.filter((a) => allowed.has(a.siteKey));
    if (filter.siteKey) list = list.filter((a) => a.siteKey === filter.siteKey);
    if (filter.siteKeys) list = list.filter((a) => filter.siteKeys!.includes(a.siteKey));
    if (filter.areaKey) list = list.filter((a) => a.areaKey === filter.areaKey);
    if (filter.lineNo != null) list = list.filter((a) => a.lineNo === filter.lineNo);
    if (filter.ownerUserId != null) list = list.filter((a) => a.ownerUserId === filter.ownerUserId);
    if (filter.mine) list = list.filter((a) => a.ownerUserId === me.userId);
    if (filter.actionType) list = list.filter((a) => a.actionType === filter.actionType);
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      list = list.filter((a) => statuses.includes(a.status));
    }
    if (filter.overdue) {
      const today = this.clock.nowIso().slice(0, 10);
      list = list.filter(
        (a) =>
          a.dueDate &&
          a.dueDate < today &&
          (a.status === 'Open' || a.status === 'InProgress'),
      );
    }
    return clone(list);
  }

  async getAction(caller: Caller, actionId: number): Promise<Action> {
    const action = this.actions.find((a) => a.actionId === actionId);
    if (!action) throw new SicError(50613, 404, 'Action not found');
    this.assertSiteAccess(caller, action.siteKey);
    return clone(action);
  }

  async listActionUpdates(caller: Caller, actionId: number): Promise<ActionUpdate[]> {
    const action = await this.getAction(caller, actionId);
    return clone(this.actionUpdates.filter((u) => u.actionId === action.actionId));
  }

  async listEscalations(
    caller: Caller,
    filter: import('../repository.js').EscalationFilter,
  ): Promise<Escalation[]> {
    const me = await this.getMe(caller);
    const allowed = new Set(me.sites.map((s) => s.siteKey));
    let list = this.escalations.filter((e) => allowed.has(e.siteKey));
    if (filter.siteKey) list = list.filter((e) => e.siteKey === filter.siteKey);
    if (filter.siteKeys) list = list.filter((e) => filter.siteKeys!.includes(e.siteKey));
    if (filter.areaKey) list = list.filter((e) => e.areaKey === filter.areaKey);
    if (filter.ruleType) list = list.filter((e) => e.ruleType === filter.ruleType);
    if (filter.lvl != null) list = list.filter((e) => e.lvl === filter.lvl);
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      list = list.filter((e) => statuses.includes(e.status));
    }
    return clone(list);
  }

  async getEscalation(caller: Caller, escalationId: number): Promise<Escalation> {
    const e = this.escalations.find((x) => x.escalationId === escalationId);
    if (!e) throw new SicError(50621, 404, 'Escalation not found');
    this.assertSiteAccess(caller, e.siteKey);
    return clone(e);
  }

  async ackEscalation(caller: Caller, escalationId: number, req?: { note?: string | null }): Promise<void> {
    const e = this.escalations.find((x) => x.escalationId === escalationId);
    if (!e || e.status !== 'Open') throw new SicError(50621, 404, 'Escalation not found or not open');
    const userId = this.assertRank(
      caller,
      e.siteKey,
      e.areaKey,
      3,
      50622,
      'Acknowledging needs the area manager role or above',
    );
    e.status = 'Acknowledged';
    e.ackBy = userId;
    e.ackUtc = this.clock.nowIso();
    e.ackNote = req?.note ?? null;
    this.touchChange(e.siteKey);
  }

  async listInbox(caller: Caller): Promise<Notification[]> {
    const userId = requireUser(caller);
    return clone(
      this.notifications
        .filter((n) => n.channel === 'InApp' && n.recipientUserId === userId)
        .sort((a, b) => b.createdUtc.localeCompare(a.createdUtc)),
    );
  }

  async markRead(caller: Caller, notificationId?: number | null): Promise<number> {
    const userId = requireUser(caller);
    const now = this.clock.nowIso();
    let n = 0;
    for (const note of this.notifications) {
      if (note.channel !== 'InApp' || note.recipientUserId !== userId) continue;
      if (notificationId != null && note.notificationId !== notificationId) continue;
      if (!note.readUtc) {
        note.readUtc = now;
        n += 1;
      }
    }
    return n;
  }

  async getSitePeople(caller: Caller, siteKey: string, query?: string | null): Promise<AppUser[]> {
    if ('deviceSiteKey' in caller && caller.deviceSiteKey) {
      throw new SicError(50652, 403, 'Floor screens cannot do this');
    }
    this.assertSiteAccess(caller, siteKey);
    const q = query?.trim().toLowerCase();
    return this.users
      .filter(
        (u) =>
          u.isActive &&
          (u.isGroupAdmin || u.roles.some((r) => r.siteKey === siteKey)) &&
          (!q || u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)),
      )
      .slice(0, 50)
      .map((u) => ({ userId: u.userId, email: u.email, displayName: u.displayName, isActive: true }));
  }

  async getSiteUsers(caller: Caller, siteKey: string): Promise<unknown[]> {
    this.assertRank(caller, siteKey, null, 5, 50641, 'Site admin required');
    const rows: unknown[] = [];
    for (const u of this.users) {
      for (const r of u.roles.filter((x) => x.siteKey === siteKey)) {
        rows.push({
          userId: u.userId,
          email: u.email,
          displayName: u.displayName,
          isActive: u.isActive,
          areaKey: r.areaKey,
          role: r.role,
        });
      }
    }
    return rows;
  }

  async saveUserSiteRole(
    caller: Caller,
    input: {
      email: string;
      displayName?: string | null;
      siteKey: string;
      areaKey?: string;
      role: string;
      remove?: boolean;
    },
  ): Promise<unknown> {
    this.assertRank(caller, input.siteKey, null, 5, 50631, 'Site admin required');
    let u = this.users.find((x) => x.email.toLowerCase() === input.email.toLowerCase());
    if (!u) {
      u = {
        userId: Math.max(0, ...this.users.map((x) => x.userId)) + 1,
        email: input.email,
        displayName: input.displayName ?? input.email,
        isActive: true,
        isGroupAdmin: false,
        roles: [],
      };
      this.users.push(u);
    }
    const areaKey = input.areaKey ?? '';
    if (input.remove) {
      u.roles = u.roles.filter(
        (r) => !(r.siteKey === input.siteKey && r.areaKey === areaKey && r.role === input.role),
      );
    } else {
      if (!u.roles.some((r) => r.siteKey === input.siteKey && r.areaKey === areaKey && r.role === input.role)) {
        u.roles.push({ siteKey: input.siteKey, areaKey, role: input.role as UserRole['role'] });
      }
    }
    return u.roles.filter((r) => r.siteKey === input.siteKey);
  }

  async saveSiteSettings(
    caller: Caller,
    siteKey: string,
    patch: Partial<Site>,
  ): Promise<Site> {
    this.assertRank(caller, siteKey, null, 5, 50641, 'Site admin required');
    const site = this.sites.find((s) => s.siteKey === siteKey);
    if (!site) throw new SicError(50641, 403, 'Site admin required');
    const next = { ...site, ...patch };
    if (next.ragAmberPct > next.ragGreenPct) {
      throw new SicError(50644, 400, 'Amber percent must be at or below green');
    }
    Object.assign(site, next);
    return clone(site);
  }

  async saveArea(caller: Caller, area: Area): Promise<Area[]> {
    this.assertRank(caller, area.siteKey, null, 5, 50641, 'Site admin required');
    const idx = this.areas.findIndex((a) => a.siteKey === area.siteKey && a.areaKey === area.areaKey);
    if (idx >= 0) this.areas[idx] = area;
    else this.areas.push(area);
    return clone(this.areas.filter((a) => a.siteKey === area.siteKey));
  }

  async saveLine(caller: Caller, line: Line): Promise<Line> {
    this.assertRank(caller, line.siteKey, null, 5, 50641, 'Site admin required');
    if (line.areaKey) {
      const ok = this.areas.some((a) => a.siteKey === line.siteKey && a.areaKey === line.areaKey);
      if (!ok) throw new SicError(50643, 400, 'Unknown area');
    }
    const idx = this.lines.findIndex((l) => l.siteKey === line.siteKey && l.lineNo === line.lineNo);
    if (idx >= 0) this.lines[idx] = line;
    else this.lines.push(line);
    return clone(line);
  }

  async saveReasonCode(caller: Caller, reason: ReasonCode): Promise<ReasonCode[]> {
    this.assertRank(caller, reason.siteKey, null, 5, 50641, 'Site admin required');
    const idx = this.reasonCodes.findIndex(
      (r) => r.siteKey === reason.siteKey && r.reasonCode === reason.reasonCode,
    );
    if (idx >= 0) this.reasonCodes[idx] = reason;
    else this.reasonCodes.push(reason);
    return clone(this.reasonCodes.filter((r) => r.siteKey === reason.siteKey));
  }

  async saveEscalationRule(
    caller: Caller,
    rule: Partial<EscalationRule> & { siteKey: string },
  ): Promise<EscalationRule> {
    this.assertRank(caller, rule.siteKey, null, 5, 50641, 'Site admin required');
    const roles = rule.notifyRoles ?? [];
    const known = new Set(['Viewer', 'LineLeader', 'AreaManager', 'SiteManager', 'SiteAdmin']);
    if (roles.some((r) => !known.has(r))) throw new SicError(50645, 400, 'Unknown role in notifyRoles');
    if (rule.ruleId != null) {
      const idx = this.rules.findIndex((r) => r.ruleId === rule.ruleId);
      if (idx >= 0) {
        this.rules[idx] = { ...this.rules[idx]!, ...rule } as EscalationRule;
        return clone(this.rules[idx]!);
      }
    }
    const created: EscalationRule = {
      ruleId: Math.max(0, ...this.rules.map((r) => r.ruleId)) + 1,
      siteKey: rule.siteKey,
      areaKey: rule.areaKey ?? '',
      ruleType: rule.ruleType ?? 'RedNoComment',
      lvl: rule.lvl ?? 1,
      threshold: rule.threshold ?? null,
      delayMins: rule.delayMins ?? 0,
      notifyRoles: roles,
      toTeams: rule.toTeams ?? false,
      toEmail: rule.toEmail ?? false,
      escalateAfterMins: rule.escalateAfterMins ?? null,
      isActive: rule.isActive ?? true,
      description: rule.description ?? null,
    };
    this.rules.push(created);
    return clone(created);
  }

  async saveNotificationTarget(
    caller: Caller,
    target: Partial<NotificationTarget> & {
      siteKey: string;
      channel: 'Teams' | 'Email';
      address: string;
    },
  ): Promise<NotificationTarget> {
    this.assertRank(caller, target.siteKey, null, 5, 50641, 'Site admin required');
    if (target.channel === 'Teams' && /^https?:\/\//i.test(target.address)) {
      throw new SicError(50646, 400, 'Teams address must be a Key Vault secret name, not a URL');
    }
    if (target.targetId != null) {
      const idx = this.targets.findIndex((t) => t.targetId === target.targetId);
      if (idx >= 0) {
        this.targets[idx] = { ...this.targets[idx]!, ...target } as NotificationTarget;
        return clone(this.targets[idx]!);
      }
    }
    const created: NotificationTarget = {
      targetId: Math.max(0, ...this.targets.map((t) => t.targetId)) + 1,
      siteKey: target.siteKey,
      areaKey: target.areaKey ?? '',
      channel: target.channel,
      address: target.address,
      minLvl: target.minLvl ?? 2,
      isActive: target.isActive ?? false,
      description: target.description ?? null,
    };
    this.targets.push(created);
    return clone(created);
  }

  async saveDeviceKey(
    caller: Caller,
    input:
      | {
          siteKey: string;
          areaKey?: string | null;
          lineNo?: number | null;
          deviceName: string;
          keyHash: Buffer;
          expiresUtc?: string | null;
        }
      | { deviceKeyId: number; siteKey: string; revoke: true },
  ): Promise<DeviceKey[]> {
    const siteKey = input.siteKey;
    this.assertRank(caller, siteKey, null, 5, 50641, 'Site admin required');
    if ('revoke' in input && input.revoke) {
      const d = this.deviceKeys.find((x) => x.deviceKeyId === input.deviceKeyId && x.siteKey === siteKey);
      if (d) d.revokedUtc = this.clock.nowIso();
    } else if (!('revoke' in input)) {
      if (input.keyHash.length !== 32) throw new SicError(50647, 400, 'Key hash must be 32 bytes');
      this.deviceKeys.push({
        deviceKeyId: this.nextDeviceKeyId++,
        siteKey,
        areaKey: input.areaKey ?? null,
        lineNo: input.lineNo ?? null,
        deviceName: input.deviceName,
        expiresUtc: input.expiresUtc ?? null,
        revokedUtc: null,
        plainKeyForTestsOnly: undefined,
      });
      // Store hash on a side channel via plainKeyForTestsOnly hex for resolve
      const last = this.deviceKeys[this.deviceKeys.length - 1]!;
      (last as DeviceKey & { keyHashHex?: string }).keyHashHex = input.keyHash.toString('hex');
    }
    return clone(
      this.deviceKeys
        .filter((d) => d.siteKey === siteKey)
        .map(({ plainKeyForTestsOnly: _, ...rest }) => rest),
    );
  }

  async getArticleKeyGaps(caller: Caller, siteKey: string, days = 14) {
    this.assertRank(caller, siteKey, null, 5, 50641, 'Site admin required');
    const now = this.clock.now();
    const from = new Date(now.getTime() - days * 86400_000);
    const map = new Map<
      string,
      { articleKey: string; hours: number; packs: number; firstSeen: string; lastSeen: string; exampleLine: number }
    >();
    for (const h of this.hours) {
      if (h.siteKey !== siteKey) continue;
      if (new Date(h.hourStart) < from) continue;
      if (!h.product || h.productSap) continue;
      const cur = map.get(h.product) ?? {
        articleKey: h.product,
        hours: 0,
        packs: 0,
        firstSeen: h.hourStart,
        lastSeen: h.hourStart,
        exampleLine: h.lineNo,
      };
      cur.hours += 1;
      cur.packs += h.actualPacks ?? 0;
      if (h.hourStart < cur.firstSeen) cur.firstSeen = h.hourStart;
      if (h.hourStart > cur.lastSeen) cur.lastSeen = h.hourStart;
      map.set(h.product, cur);
    }
    return [...map.values()].sort((a, b) => b.packs - a.packs);
  }

  async saveArticleKeyMap(
    caller: Caller,
    siteKey: string,
    articleKey: string,
    sapNumber: string,
    _articleName?: string | null,
  ): Promise<{ hoursUpdated: number }> {
    this.assertRank(caller, siteKey, null, 5, 50641, 'Site admin required');
    let n = 0;
    for (const h of this.hours) {
      if (h.siteKey === siteKey && h.product === articleKey) {
        h.productSap = sapNumber;
        n += 1;
      }
    }
    return { hoursUpdated: n };
  }

  async queueTestNotification(caller: Caller, targetId: number) {
    const target = this.targets.find((t) => t.targetId === targetId);
    if (!target) throw new SicError(50661, 404, 'Target not found');
    this.assertRank(caller, target.siteKey, null, 5, 50641, 'Site admin required');
    if (!target.isActive) throw new SicError(50662, 400, 'Target is not active');
    const id = this.nextNotificationId++;
    this.notifications.push({
      notificationId: id,
      siteKey: target.siteKey,
      channel: target.channel,
      address: target.address,
      subject: 'SIC Live test notice',
      body: 'Test',
      deepLink: '/',
      status: 'Pending',
      createdUtc: this.clock.nowIso(),
      notBeforeUtc: this.clock.nowIso(),
      attempts: 0,
    });
    return { notificationId: id };
  }

  async getNotificationPreview(caller: Caller, siteKey: string, days = 7) {
    this.assertRank(caller, siteKey, null, 5, 50641, 'Site admin required');
    const from = new Date(this.clock.now().getTime() - days * 86400_000);
    const rows = this.notifications.filter(
      (n) => n.siteKey === siteKey && new Date(n.createdUtc) >= from,
    );
    const map = new Map<string, { channel: string; status: string; notices: number; escalations: Set<number>; teamsPostsOrEmails: number }>();
    for (const n of rows) {
      const k = `${n.channel}|${n.status}`;
      const cur = map.get(k) ?? {
        channel: n.channel,
        status: n.status,
        notices: 0,
        escalations: new Set<number>(),
        teamsPostsOrEmails: 0,
      };
      cur.notices += 1;
      if (n.escalationId) cur.escalations.add(n.escalationId);
      if (n.channel === 'Teams' || n.channel === 'Email') cur.teamsPostsOrEmails += 1;
      map.set(k, cur);
    }
    return [...map.values()].map((r) => ({
      channel: r.channel,
      status: r.status,
      notices: r.notices,
      escalations: r.escalations.size,
      teamsPostsOrEmails: r.teamsPostsOrEmails,
    }));
  }

  async resolveDeviceKey(keyHash: Buffer) {
    const hex = keyHash.toString('hex');
    for (const d of this.deviceKeys) {
      const plain = d.plainKeyForTestsOnly;
      const stored = (d as DeviceKey & { keyHashHex?: string }).keyHashHex;
      const match =
        (plain && createHash('sha256').update(plain, 'utf8').digest('hex') === hex) ||
        stored === hex;
      if (!match) continue;
      if (d.revokedUtc) return null;
      if (d.expiresUtc && new Date(d.expiresUtc) < this.clock.now()) return null;
      d.lastSeenUtc = this.clock.nowIso();
      return {
        deviceKeyId: d.deviceKeyId,
        siteKey: d.siteKey,
        areaKey: d.areaKey ?? null,
        lineNo: d.lineNo ?? null,
        deviceName: d.deviceName,
      };
    }
    return null;
  }

  async evaluateEscalations(asOfUtc?: string | Date | null, siteKey?: string | null) {
    const asOf = asOfUtc ? new Date(asOfUtc) : this.clock.now();
    const { raised } = runEvaluateEscalations(
      {
        sites: this.sites,
        hours: this.hours,
        rules: this.rules,
        targets: this.targets,
        users: this.users,
        actions: this.actions,
        escalations: this.escalations,
        notifications: this.notifications,
        nextEscalationId: this.nextEscalationId,
        nextNotificationId: this.nextNotificationId,
      },
      asOf,
      siteKey,
    );
    // sync id counters from mutated arrays
    this.nextEscalationId =
      Math.max(0, ...this.escalations.map((e) => e.escalationId), this.nextEscalationId - 1) + 1;
    this.nextNotificationId =
      Math.max(0, ...this.notifications.map((n) => n.notificationId), this.nextNotificationId - 1) +
      1;
    for (const site of new Set(raised.map((r) => r.siteKey))) this.touchChange(site);
    return raised;
  }

  async claimNotifications(batch = 20, leaseSecs = 120): Promise<ClaimedNotification[]> {
    const now = this.clock.now();
    const claimed: ClaimedNotification[] = [];
    for (const n of this.notifications) {
      if (claimed.length >= batch) break;
      if (n.channel === 'InApp') continue;
      if (n.status !== 'Pending' && n.status !== 'Sending') continue;
      if (n.notBeforeUtc && new Date(n.notBeforeUtc) > now) continue;
      if (n.leaseUntilUtc && new Date(n.leaseUntilUtc) > now && n.status === 'Sending') continue;
      n.status = 'Sending';
      n.leaseUntilUtc = new Date(now.getTime() + leaseSecs * 1000).toISOString();
      n.attempts = (n.attempts ?? 0) + 1;
      claimed.push(clone(n) as ClaimedNotification);
    }
    return claimed;
  }

  async completeNotification(notificationId: number, ok: boolean, error?: string | null) {
    const n = this.notifications.find((x) => x.notificationId === notificationId);
    if (!n) return 0;
    if (ok) {
      n.status = 'Sent';
      n.sentUtc = this.clock.nowIso();
      n.lastError = null;
      n.leaseUntilUtc = null;
      return 1;
    }
    const attempts = n.attempts ?? 1;
    n.lastError = error ?? 'send failed';
    n.leaseUntilUtc = null;
    if (attempts >= 5) {
      n.status = 'Failed';
    } else {
      n.status = 'Pending';
      const backoffMins = [2, 4, 8, 16][Math.min(attempts - 1, 3)]!;
      n.notBeforeUtc = new Date(this.clock.now().getTime() + backoffMins * 60_000).toISOString();
    }
    return 1;
  }

  /** Test helper: raw escalation list. */
  getEscalationsRaw(): Escalation[] {
    return this.escalations;
  }

  getNotificationsRaw(): Notification[] {
    return this.notifications;
  }

  getSitesRaw(): Site[] {
    return this.sites;
  }

  getTargetsRaw(): NotificationTarget[] {
    return this.targets;
  }
}

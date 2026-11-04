import type {
  AckRequest,
  Action,
  ActionUpdate,
  AddCommentRequest,
  AppUser,
  Area,
  DeviceKey,
  Escalation,
  EscalationRule,
  HourComment,
  Line,
  Me,
  Notification,
  NotificationTarget,
  ReasonCode,
  SaveActionRequest,
  SicHour,
  SicVersion,
  Site,
} from './schemas.js';

export type Caller =
  | { userId: number; deviceSiteKey?: undefined }
  | { deviceSiteKey: string; areaKey?: string | null; lineNo?: number | null; userId?: undefined };

export type UpsertUserInput = {
  tenantId: string;
  objectId: string;
  email: string;
  displayName: string;
  upn?: string | null;
  isGuest?: boolean;
  jobTitle?: string | null;
};

export type ActionFilter = {
  siteKeys?: string[];
  siteKey?: string;
  areaKey?: string;
  lineNo?: number;
  ownerUserId?: number;
  status?: string | string[];
  overdue?: boolean;
  actionType?: string;
  mine?: boolean;
};

export type EscalationFilter = {
  siteKey?: string;
  siteKeys?: string[];
  areaKey?: string;
  ruleType?: string;
  lvl?: number;
  status?: string | string[];
};

export type SiteConfig = {
  site: Site;
  areas: Area[];
  lines: Line[];
  reasonCodes: ReasonCode[];
  escalationRules: EscalationRule[];
  notificationTargets: NotificationTarget[];
  deviceKeys: DeviceKey[];
};

export type ClaimedNotification = Notification & {
  address: string | null;
  attempts: number;
};

export interface Repository {
  upsertUser(input: UpsertUserInput): Promise<Me>;
  getMe(caller: Caller): Promise<Me>;
  listSites(caller: Caller): Promise<Site[]>;
  getSiteConfig(caller: Caller, siteKey: string): Promise<SiteConfig>;
  getSicVersion(caller: Caller, siteKey: string): Promise<SicVersion>;
  listDays(caller: Caller, siteKey: string): Promise<string[]>;
  getSicHours(
    caller: Caller,
    siteKey: string,
    day: string,
    lineNo?: number,
  ): Promise<SicHour[]>;
  addComment(
    caller: Caller,
    req: AddCommentRequest,
  ): Promise<{ commentId: number; actionId: number | null }>;
  listComments(
    caller: Caller,
    siteKey: string,
    day: string,
    lineNo: number,
    hourStart: string,
  ): Promise<HourComment[]>;
  saveAction(caller: Caller, req: SaveActionRequest): Promise<Action>;
  listActions(caller: Caller, filter: ActionFilter): Promise<Action[]>;
  getAction(caller: Caller, actionId: number): Promise<Action>;
  listActionUpdates(caller: Caller, actionId: number): Promise<ActionUpdate[]>;
  listEscalations(caller: Caller, filter: EscalationFilter): Promise<Escalation[]>;
  getEscalation(caller: Caller, escalationId: number): Promise<Escalation>;
  ackEscalation(caller: Caller, escalationId: number, req?: AckRequest): Promise<void>;
  listInbox(caller: Caller): Promise<Notification[]>;
  markRead(caller: Caller, notificationId?: number | null): Promise<number>;
  getSitePeople(caller: Caller, siteKey: string, query?: string | null): Promise<AppUser[]>;
  getSiteUsers(caller: Caller, siteKey: string): Promise<unknown[]>;
  saveUserSiteRole(
    caller: Caller,
    input: {
      email: string;
      displayName?: string | null;
      siteKey: string;
      areaKey?: string;
      role: string;
      remove?: boolean;
    },
  ): Promise<unknown>;
  saveSiteSettings(
    caller: Caller,
    siteKey: string,
    patch: Partial<Site> & { notificationsLive?: boolean },
  ): Promise<Site>;
  saveArea(caller: Caller, area: Area): Promise<Area[]>;
  saveLine(caller: Caller, line: Line): Promise<Line>;
  saveReasonCode(caller: Caller, reason: ReasonCode): Promise<ReasonCode[]>;
  saveEscalationRule(caller: Caller, rule: Partial<EscalationRule> & { siteKey: string }): Promise<EscalationRule>;
  saveNotificationTarget(
    caller: Caller,
    target: Partial<NotificationTarget> & { siteKey: string; channel: 'Teams' | 'Email'; address: string },
  ): Promise<NotificationTarget>;
  saveDeviceKey(
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
  ): Promise<DeviceKey[]>;
  getArticleKeyGaps(
    caller: Caller,
    siteKey: string,
    days?: number,
  ): Promise<
    Array<{
      articleKey: string;
      hours: number;
      packs: number;
      firstSeen: string;
      lastSeen: string;
      exampleLine: number;
    }>
  >;
  saveArticleKeyMap(
    caller: Caller,
    siteKey: string,
    articleKey: string,
    sapNumber: string,
    articleName?: string | null,
  ): Promise<{ hoursUpdated: number }>;
  queueTestNotification(caller: Caller, targetId: number): Promise<{ notificationId: number }>;
  getNotificationPreview(
    caller: Caller,
    siteKey: string,
    days?: number,
  ): Promise<Array<{ channel: string; status: string; notices: number; escalations: number; teamsPostsOrEmails: number }>>;
  resolveDeviceKey(keyHash: Buffer): Promise<{
    deviceKeyId: number;
    siteKey: string;
    areaKey: string | null;
    lineNo: number | null;
    deviceName: string;
  } | null>;
  evaluateEscalations(asOfUtc?: string | Date | null, siteKey?: string | null): Promise<
    Array<{ siteKey: string; ruleType: string; lvl: number; raised: number }>
  >;
  claimNotifications(batch?: number, leaseSecs?: number): Promise<ClaimedNotification[]>;
  completeNotification(
    notificationId: number,
    ok: boolean,
    error?: string | null,
  ): Promise<number>;
}

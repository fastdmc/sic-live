import { z } from 'zod';

export const RoleSchema = z.enum([
  'Viewer',
  'LineLeader',
  'AreaManager',
  'SiteManager',
  'SiteAdmin',
]);
export type Role = z.infer<typeof RoleSchema>;

export const SiteSchema = z.object({
  siteKey: z.string(),
  siteName: z.string(),
  country: z.string(),
  timeZoneId: z.string(),
  dayStartHour: z.number(),
  ragGreenPct: z.number(),
  ragAmberPct: z.number(),
  ragMinAvailMins: z.number(),
  commentDueMins: z.number(),
  notificationsLive: z.boolean(),
  liveFromUtc: z.string().nullable(),
  isActive: z.boolean(),
});
export type Site = z.infer<typeof SiteSchema>;

export const AreaSchema = z.object({
  siteKey: z.string(),
  areaKey: z.string(),
  areaName: z.string(),
  displayOrder: z.number(),
});
export type Area = z.infer<typeof AreaSchema>;

export const LineSchema = z.object({
  siteKey: z.string(),
  lineNo: z.number(),
  lineName: z.string(),
  areaKey: z.string().nullable(),
  cellName: z.string().nullable(),
  displayOrder: z.number(),
  isActive: z.boolean(),
});
export type Line = z.infer<typeof LineSchema>;

export const ReasonCodeSchema = z.object({
  siteKey: z.string(),
  reasonCode: z.string(),
  reasonName: z.string(),
  lossCategory: z.string(),
  displayOrder: z.number(),
  isActive: z.boolean(),
});
export type ReasonCode = z.infer<typeof ReasonCodeSchema>;

export const EscalationRuleSchema = z.object({
  ruleId: z.number(),
  siteKey: z.string(),
  areaKey: z.string(),
  ruleType: z.enum(['RedNoComment', 'ConsecutiveRed', 'ShiftBelowTarget', 'ActionOverdue']),
  lvl: z.number(),
  threshold: z.number().nullable(),
  delayMins: z.number(),
  notifyRoles: z.array(z.string()),
  toTeams: z.boolean(),
  toEmail: z.boolean(),
  escalateAfterMins: z.number().nullable(),
  isActive: z.boolean(),
  description: z.string().nullable().optional(),
});
export type EscalationRule = z.infer<typeof EscalationRuleSchema>;

export const NotificationTargetSchema = z.object({
  targetId: z.number(),
  siteKey: z.string(),
  areaKey: z.string(),
  channel: z.enum(['Teams', 'Email']),
  address: z.string(),
  minLvl: z.number(),
  isActive: z.boolean(),
  description: z.string().nullable().optional(),
});
export type NotificationTarget = z.infer<typeof NotificationTargetSchema>;

export const DeviceKeySchema = z.object({
  deviceKeyId: z.number(),
  siteKey: z.string(),
  areaKey: z.string().nullable().optional(),
  lineNo: z.number().nullable().optional(),
  deviceName: z.string(),
  createdUtc: z.string().optional(),
  expiresUtc: z.string().nullable().optional(),
  revokedUtc: z.string().nullable().optional(),
  lastSeenUtc: z.string().nullable().optional(),
  plainKeyForTestsOnly: z.string().optional(),
});
export type DeviceKey = z.infer<typeof DeviceKeySchema>;

export const SicHourNoteSchema = z
  .object({
    noteId: z.number().optional(),
    reasonCode: z.string().nullable().optional(),
    reasonName: z.string().nullable().optional(),
    issue: z.string().nullable().optional(),
    containment: z.string().nullable().optional(),
    helpCalled: z.string().nullable().optional(),
    helpArrived: z.string().nullable().optional(),
    by: z.string().nullable().optional(),
    utc: z.string().nullable().optional(),
  })
  .nullable();

export const SicHourSchema = z.object({
  siteKey: z.string(),
  productionDate: z.string(),
  lineNo: z.number(),
  lineName: z.string().nullable().optional(),
  areaKey: z.string().nullable().optional(),
  areaName: z.string().nullable().optional(),
  cellName: z.string().nullable().optional(),
  hourNo: z.number().optional(),
  hour: z.string().optional(),
  hourStart: z.string(),
  hourEnd: z.string(),
  hourStatus: z.string(),
  shiftCrew: z.string().nullable().optional(),
  product: z.string().nullable().optional(),
  productSap: z.string().nullable().optional(),
  productName: z.string().nullable().optional(),
  productCount: z.number().nullable().optional(),
  targetBasis: z.string().nullable().optional(),
  planPacks: z.number().nullable().optional(),
  targetPacks: z.number().nullable().optional(),
  actualPacks: z.number().nullable().optional(),
  cumTargetPacks: z.number().nullable().optional(),
  cumActualPacks: z.number().nullable().optional(),
  attainmentPct: z.number().nullable().optional(),
  rag: z.enum(['G', 'A', 'R']).nullable(),
  giveawayKg: z.number().nullable().optional(),
  giveawayPct: z.number().nullable().optional(),
  rejectedPacks: z.number().nullable().optional(),
  lostMins: z.number().nullable().optional(),
  stopMins: z.number().nullable().optional(),
  unexplainedMins: z.number().nullable().optional(),
  plannedStopMins: z.number().nullable().optional(),
  unscheduledMins: z.number().nullable().optional(),
  availableMins: z.number().nullable().optional(),
  topLossType: z.string().nullable().optional(),
  issueSuggested: z.string().nullable().optional(),
  plannedStops: z.string().nullable().optional(),
  operatorNotes: z.string().nullable().optional(),
  shiftTargetPacks: z.number().nullable().optional(),
  shiftActualPacks: z.number().nullable().optional(),
  note: SicHourNoteSchema.optional(),
  noteCount: z.number().nullable().optional(),
  openActions: z.number().nullable().optional(),
  nextActionDue: z.string().nullable().optional(),
  actionOwners: z.string().nullable().optional(),
  refreshedUtc: z.string().nullable().optional(),
});
export type SicHour = z.infer<typeof SicHourSchema>;

export const SicVersionSchema = z.object({
  siteKey: z.string(),
  version: z.number(),
  refreshedUtc: z.string().nullable(),
  pending: z.boolean().optional(),
  lastFrom: z.string().nullable().optional(),
  lastTo: z.string().nullable().optional(),
  latestDay: z.string().nullable().optional(),
  changeKey: z.string(),
});
export type SicVersion = z.infer<typeof SicVersionSchema>;

export const HourCommentSchema = z.object({
  commentId: z.number(),
  siteKey: z.string(),
  productionDate: z.string(),
  lineNo: z.number(),
  hourStart: z.string(),
  reasonCode: z.string().nullable(),
  issue: z.string(),
  containmentAction: z.string().nullable(),
  helpCalledAt: z.string().nullable(),
  helpArrivedAt: z.string().nullable(),
  ragAtEntry: z.string().nullable(),
  actualAtEntry: z.number().nullable(),
  targetAtEntry: z.number().nullable(),
  createdBy: z.number(),
  createdUtc: z.string(),
  isDeleted: z.boolean().optional(),
});
export type HourComment = z.infer<typeof HourCommentSchema>;

export const ActionStatusSchema = z.enum([
  'Open',
  'InProgress',
  'Done',
  'Verified',
  'Cancelled',
]);
export type ActionStatus = z.infer<typeof ActionStatusSchema>;

export const ActionSchema = z.object({
  actionId: z.number(),
  siteKey: z.string(),
  lineNo: z.number().nullable(),
  areaKey: z.string().nullable(),
  commentId: z.number().nullable().optional(),
  escalationId: z.number().nullable().optional(),
  productionDate: z.string().nullable().optional(),
  hourStart: z.string().nullable().optional(),
  actionType: z.string().nullable().optional(),
  title: z.string(),
  detail: z.string().nullable().optional(),
  ownerUserId: z.number().nullable().optional(),
  ownerName: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  status: ActionStatusSchema,
  priority: z.string().nullable().optional(),
  createdBy: z.number(),
  createdUtc: z.string(),
  modifiedBy: z.number().nullable().optional(),
  modifiedUtc: z.string().nullable().optional(),
  doneUtc: z.string().nullable().optional(),
  verifiedBy: z.number().nullable().optional(),
  verifiedUtc: z.string().nullable().optional(),
});
export type Action = z.infer<typeof ActionSchema>;

export const ActionUpdateSchema = z.object({
  updateId: z.number(),
  actionId: z.number(),
  siteKey: z.string(),
  updateType: z.enum(['Created', 'Status', 'Owner', 'DueDate', 'Comment']),
  oldValue: z.string().nullable().optional(),
  newValue: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  byUserId: z.number(),
  atUtc: z.string(),
});
export type ActionUpdate = z.infer<typeof ActionUpdateSchema>;

export const EscalationSchema = z.object({
  escalationId: z.number(),
  ruleId: z.number(),
  siteKey: z.string(),
  areaKey: z.string().nullable(),
  lineNo: z.number().nullable(),
  productionDate: z.string().nullable(),
  hourStart: z.string().nullable(),
  actionId: z.number().nullable().optional(),
  ruleType: z.string(),
  lvl: z.number(),
  subjectKey: z.string(),
  title: z.string(),
  detail: z.string().nullable(),
  status: z.enum(['Open', 'Acknowledged', 'Resolved', 'Cancelled']),
  raisedUtc: z.string(),
  ackBy: z.number().nullable().optional(),
  ackUtc: z.string().nullable().optional(),
  ackNote: z.string().nullable().optional(),
  resolvedUtc: z.string().nullable().optional(),
  resolvedBy: z.number().nullable().optional(),
  resolvedReason: z.string().nullable().optional(),
});
export type Escalation = z.infer<typeof EscalationSchema>;

export const NotificationSchema = z.object({
  notificationId: z.number(),
  siteKey: z.string(),
  escalationId: z.number().nullable().optional(),
  actionId: z.number().nullable().optional(),
  channel: z.enum(['InApp', 'Teams', 'Email']),
  recipientUserId: z.number().nullable().optional(),
  address: z.string().nullable().optional(),
  subject: z.string(),
  body: z.string().nullable().optional(),
  deepLink: z.string().nullable().optional(),
  status: z.enum(['Pending', 'Sending', 'Sent', 'Failed', 'Suppressed']),
  createdUtc: z.string(),
  sentUtc: z.string().nullable().optional(),
  readUtc: z.string().nullable().optional(),
  lastError: z.string().nullable().optional(),
  attempts: z.number().optional(),
  notBeforeUtc: z.string().nullable().optional(),
  leaseUntilUtc: z.string().nullable().optional(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const AppUserSchema = z.object({
  userId: z.number(),
  email: z.string(),
  displayName: z.string(),
  jobTitle: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  isGroupAdmin: z.boolean().optional(),
});
export type AppUser = z.infer<typeof AppUserSchema>;

export const UserRoleSchema = z.object({
  siteKey: z.string(),
  areaKey: z.string(),
  role: RoleSchema,
});
export type UserRole = z.infer<typeof UserRoleSchema>;

export const MeSchema = z.object({
  userId: z.number(),
  email: z.string(),
  displayName: z.string(),
  isGroupAdmin: z.boolean(),
  roles: z.array(UserRoleSchema),
  sites: z.array(SiteSchema),
});
export type Me = z.infer<typeof MeSchema>;

export const AddCommentRequestSchema = z.object({
  siteKey: z.string(),
  lineNo: z.number(),
  hourStart: z.string(),
  issue: z.string().min(1),
  reasonCode: z.string().nullable().optional(),
  containmentAction: z.string().nullable().optional(),
  helpCalledAt: z.string().nullable().optional(),
  helpArrivedAt: z.string().nullable().optional(),
  actionTitle: z.string().nullable().optional(),
  actionType: z.string().optional(),
  actionOwnerUserId: z.number().nullable().optional(),
  actionOwnerName: z.string().nullable().optional(),
  actionDueDate: z.string().nullable().optional(),
});
export type AddCommentRequest = z.infer<typeof AddCommentRequestSchema>;

export const SaveActionRequestSchema = z.object({
  actionId: z.number().nullable().optional(),
  siteKey: z.string().optional(),
  title: z.string().optional(),
  lineNo: z.number().nullable().optional(),
  commentId: z.number().nullable().optional(),
  escalationId: z.number().nullable().optional(),
  actionType: z.string().nullable().optional(),
  detail: z.string().nullable().optional(),
  ownerUserId: z.number().nullable().optional(),
  ownerName: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  status: ActionStatusSchema.optional(),
  priority: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});
export type SaveActionRequest = z.infer<typeof SaveActionRequestSchema>;

export const AckRequestSchema = z.object({
  note: z.string().nullable().optional(),
});
export type AckRequest = z.infer<typeof AckRequestSchema>;

export const ConfigFixtureSchema = z.object({
  notes: z.string().optional(),
  sites: z.array(SiteSchema),
  areas: z.array(AreaSchema),
  lines: z.array(LineSchema),
  reasonCodes: z.array(ReasonCodeSchema),
  escalationRules: z.array(EscalationRuleSchema),
  notificationTargets: z.array(NotificationTargetSchema),
  deviceKeys: z.array(DeviceKeySchema),
});

export const UsersFixtureSchema = z.object({
  note: z.string().optional(),
  users: z.array(
    z.object({
      userId: z.number(),
      email: z.string(),
      displayName: z.string(),
      isGroupAdmin: z.boolean(),
      roles: z.array(UserRoleSchema),
    }),
  ),
});

export const SicFileSchema = z.object({
  source: z.string().optional(),
  rows: z.array(SicHourSchema),
});

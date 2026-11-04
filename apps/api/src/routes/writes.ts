import { createHash, randomBytes } from 'node:crypto';
import type { Repository } from '@sic/shared';
import { SicError } from '@sic/shared';
import { z } from 'zod';
import { resolveAuth } from '../auth/context.js';
import type { EntraDeps } from '../auth/entra.js';
import type { AppConfig } from '../config.js';
import { securityHeaders, type Router } from '../http.js';

const writeCounts = new Map<string, { n: number; reset: number }>();

function rateLimit(userKey: string): void {
  const now = Date.now();
  const cur = writeCounts.get(userKey);
  if (!cur || cur.reset < now) {
    writeCounts.set(userKey, { n: 1, reset: now + 60_000 });
    return;
  }
  cur.n += 1;
  if (cur.n > 60) {
    throw new SicError(42900, 400, 'Too many writes — wait a minute and try again');
  }
}

function headers() {
  return securityHeaders();
}

export function registerWriteRoutes(
  router: Router,
  cfg: AppConfig,
  repo: Repository,
  entra?: EntraDeps,
  appBaseUrl = 'http://localhost:5173',
): void {
  router.route('POST', '/api/sites/:site/hours/:line/:hourStart/comments', async (req, params) => {
    const a = await resolveAuth(req, params, cfg, repo, entra);
    if (a.identity.kind !== 'user') throw new SicError(50652, 403, 'Floor screens cannot do this');
    rateLimit(String(a.identity.userId));
    const body = z
      .object({
        reasonCode: z.string().nullable().optional(),
        issue: z.string().min(1, 'Say what the issue was'),
        containmentAction: z.string().nullable().optional(),
        helpCalledAt: z.string().nullable().optional(),
        helpArrivedAt: z.string().nullable().optional(),
        action: z
          .object({
            title: z.string(),
            type: z.string().optional(),
            ownerUserId: z.number().nullable().optional(),
            ownerName: z.string().nullable().optional(),
            dueDate: z.string().nullable().optional(),
          })
          .optional(),
      })
      .parse(req.body ?? {});
    if (!body.issue.trim()) throw new SicError(50603, 400, 'Say what the issue was');
    const result = await repo.addComment(a.caller, {
      siteKey: params.site!,
      lineNo: Number(params.line),
      hourStart: decodeURIComponent(params.hourStart!),
      issue: body.issue,
      reasonCode: body.reasonCode,
      containmentAction: body.containmentAction,
      helpCalledAt: body.helpCalledAt,
      helpArrivedAt: body.helpArrivedAt,
      actionTitle: body.action?.title,
      actionType: body.action?.type,
      actionOwnerUserId: body.action?.ownerUserId,
      actionOwnerName: body.action?.ownerName,
      actionDueDate: body.action?.dueDate,
    });
    return { status: 200, body: result, headers: headers() };
  });

  router.route('GET', '/api/actions', async (req) => {
    const a = await resolveAuth(req, {}, cfg, repo, entra);
    const page = Math.max(1, Number(req.query.page ?? 1));
    const list = await repo.listActions(a.caller, {
      siteKey: req.query.site,
      areaKey: req.query.area,
      lineNo: req.query.line ? Number(req.query.line) : undefined,
      ownerUserId: req.query.owner ? Number(req.query.owner) : undefined,
      status: req.query.status,
      overdue: req.query.overdue === '1' || req.query.overdue === 'true',
      actionType: req.query.type,
    });
    const today = new Date().toISOString().slice(0, 10);
    list.sort((x, y) => {
      const xo = x.dueDate && x.dueDate < today ? 0 : 1;
      const yo = y.dueDate && y.dueDate < today ? 0 : 1;
      if (xo !== yo) return xo - yo;
      return (x.dueDate ?? '9999').localeCompare(y.dueDate ?? '9999');
    });
    const start = (page - 1) * 50;
    return {
      status: 200,
      body: { items: list.slice(start, start + 50), page, total: list.length },
      headers: headers(),
    };
  });

  router.route('POST', '/api/actions', async (req) => {
    const a = await resolveAuth(req, {}, cfg, repo, entra);
    if (a.identity.kind !== 'user') throw new SicError(50652, 403, 'Floor screens cannot do this');
    rateLimit(String(a.identity.userId));
    const body = z
      .object({
        site: z.string(),
        title: z.string(),
        line: z.number().nullable().optional(),
        commentId: z.number().nullable().optional(),
        escalationId: z.number().nullable().optional(),
        type: z.string().optional(),
        detail: z.string().nullable().optional(),
        ownerUserId: z.number().nullable().optional(),
        ownerName: z.string().nullable().optional(),
        dueDate: z.string().nullable().optional(),
        priority: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
      })
      .parse(req.body ?? {});
    const action = await repo.saveAction(a.caller, {
      siteKey: body.site,
      title: body.title,
      lineNo: body.line,
      commentId: body.commentId,
      escalationId: body.escalationId,
      actionType: body.type,
      detail: body.detail,
      ownerUserId: body.ownerUserId,
      ownerName: body.ownerName,
      dueDate: body.dueDate,
      priority: body.priority,
      note: body.note,
    });
    return { status: 200, body: action, headers: headers() };
  });

  router.route('GET', '/api/actions/:id', async (req, params) => {
    const a = await resolveAuth(req, params, cfg, repo, entra);
    const action = await repo.getAction(a.caller, Number(params.id));
    const history = await repo.listActionUpdates(a.caller, action.actionId);
    return { status: 200, body: { ...action, history }, headers: headers() };
  });

  router.route('PATCH', '/api/actions/:id', async (req, params) => {
    const a = await resolveAuth(req, params, cfg, repo, entra);
    if (a.identity.kind !== 'user') throw new SicError(50652, 403, 'Floor screens cannot do this');
    rateLimit(String(a.identity.userId));
    const body = z
      .object({
        title: z.string().optional(),
        detail: z.string().nullable().optional(),
        type: z.string().nullable().optional(),
        ownerUserId: z.number().nullable().optional(),
        ownerName: z.string().nullable().optional(),
        dueDate: z.string().nullable().optional(),
        status: z.enum(['Open', 'InProgress', 'Done', 'Verified', 'Cancelled']).optional(),
        priority: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
      })
      .parse(req.body ?? {});
    const action = await repo.saveAction(a.caller, {
      actionId: Number(params.id),
      title: body.title,
      detail: body.detail,
      actionType: body.type,
      ownerUserId: body.ownerUserId,
      ownerName: body.ownerName,
      dueDate: body.dueDate,
      status: body.status,
      priority: body.priority,
      note: body.note,
    });
    return { status: 200, body: action, headers: headers() };
  });

  router.route('GET', '/api/me/actions', async (req) => {
    const a = await resolveAuth(req, {}, cfg, repo, entra);
    const items = await repo.listActions(a.caller, { mine: true });
    items.sort((x, y) => {
      const open = (s: string) => (s === 'Open' || s === 'InProgress' ? 0 : 1);
      const d = open(x.status) - open(y.status);
      if (d !== 0) return d;
      return (x.dueDate ?? '9999').localeCompare(y.dueDate ?? '9999');
    });
    return { status: 200, body: items, headers: headers() };
  });

  router.route('GET', '/api/escalations', async (req) => {
    const a = await resolveAuth(req, {}, cfg, repo, entra);
    const page = Math.max(1, Number(req.query.page ?? 1));
    const list = await repo.listEscalations(a.caller, {
      siteKey: req.query.site,
      areaKey: req.query.area,
      ruleType: req.query.type,
      lvl: req.query.level ? Number(req.query.level) : undefined,
      status: req.query.status === 'open' ? 'Open' : req.query.status,
    });
    const start = (page - 1) * 50;
    return {
      status: 200,
      body: { items: list.slice(start, start + 50), page, total: list.length },
      headers: headers(),
    };
  });

  router.route('GET', '/api/escalations/:id', async (req, params) => {
    const a = await resolveAuth(req, params, cfg, repo, entra);
    const escalation = await repo.getEscalation(a.caller, Number(params.id));
    // notifications without addresses
    const fake = repo as unknown as {
      getNotificationsRaw?: () => Array<{
        escalationId?: number | null;
        channel: string;
        status: string;
        sentUtc?: string | null;
        address?: string | null;
      }>;
    };
    const notices = (fake.getNotificationsRaw?.() ?? [])
      .filter((n) => n.escalationId === escalation.escalationId)
      .map(({ channel, status, sentUtc }) => ({ channel, status, sentUtc: sentUtc ?? null }));
    return { status: 200, body: { ...escalation, notifications: notices }, headers: headers() };
  });

  router.route('POST', '/api/escalations/:id/ack', async (req, params) => {
    const a = await resolveAuth(req, params, cfg, repo, entra);
    if (a.identity.kind !== 'user') throw new SicError(50652, 403, 'Floor screens cannot do this');
    rateLimit(String(a.identity.userId));
    const body = z.object({ note: z.string().nullable().optional() }).parse(req.body ?? {});
    await repo.ackEscalation(a.caller, Number(params.id), body);
    const escalation = await repo.getEscalation(a.caller, Number(params.id));
    return { status: 200, body: escalation, headers: headers() };
  });

  router.route('GET', '/api/inbox', async (req) => {
    const a = await resolveAuth(req, {}, cfg, repo, entra);
    let items = await repo.listInbox(a.caller);
    if (req.query.unread === '1' || req.query.unread === 'true') {
      items = items.filter((n) => !n.readUtc);
    }
    const unread = (await repo.listInbox(a.caller)).filter((n) => !n.readUtc).length;
    return { status: 200, body: { items, unread }, headers: headers() };
  });

  router.route('POST', '/api/inbox/read', async (req) => {
    const a = await resolveAuth(req, {}, cfg, repo, entra);
    if (a.identity.kind !== 'user') throw new SicError(50652, 403, 'Floor screens cannot do this');
    const body = z
      .object({ notificationId: z.number().nullable().optional() })
      .parse(req.body ?? {});
    const marked = await repo.markRead(a.caller, body.notificationId);
    return { status: 200, body: { marked }, headers: headers() };
  });

  router.route('GET', '/api/people', async (req) => {
    const a = await resolveAuth(req, {}, cfg, repo, entra);
    const site = req.query.site;
    if (!site) throw new SicError(50600, 400, 'site is required');
    const people = await repo.getSitePeople(a.caller, site, req.query.q);
    return {
      status: 200,
      body: people.map((p) => ({ userId: p.userId, displayName: p.displayName })),
      headers: headers(),
    };
  });

  // Admin
  router.route('GET', '/api/admin/:site/users', async (req, params) => {
    const a = await resolveAuth(req, params, cfg, repo, entra);
    const users = await repo.getSiteUsers(a.caller, params.site!);
    return { status: 200, body: users, headers: headers() };
  });

  router.route('POST', '/api/admin/:site/roles', async (req, params) => {
    const a = await resolveAuth(req, params, cfg, repo, entra);
    if (a.identity.kind !== 'user') throw new SicError(50652, 403, 'Floor screens cannot do this');
    rateLimit(String(a.identity.userId));
    const body = z
      .object({
        email: z.string(),
        displayName: z.string().nullable().optional(),
        areaKey: z.string().optional(),
        role: z.string(),
        remove: z.boolean().optional(),
      })
      .parse(req.body ?? {});
    const roles = await repo.saveUserSiteRole(a.caller, { ...body, siteKey: params.site! });
    return { status: 200, body: roles, headers: headers() };
  });

  router.route('PATCH', '/api/admin/:site/settings', async (req, params) => {
    const a = await resolveAuth(req, params, cfg, repo, entra);
    if (a.identity.kind !== 'user') throw new SicError(50652, 403, 'Floor screens cannot do this');
    rateLimit(String(a.identity.userId));
    const body = z
      .object({
        ragGreenPct: z.number().optional(),
        ragAmberPct: z.number().optional(),
        ragMinAvailMins: z.number().optional(),
        commentDueMins: z.number().optional(),
        notificationsLive: z.boolean().optional(),
        liveFromUtc: z.string().nullable().optional(),
      })
      .parse(req.body ?? {});
    const site = await repo.saveSiteSettings(a.caller, params.site!, body);
    return { status: 200, body: site, headers: headers() };
  });

  router.route('PUT', '/api/admin/:site/areas/:area', async (req, params) => {
    const a = await resolveAuth(req, params, cfg, repo, entra);
    if (a.identity.kind !== 'user') throw new SicError(50652, 403, 'Floor screens cannot do this');
    const body = z.object({ areaName: z.string(), displayOrder: z.number().optional() }).parse(req.body ?? {});
    const areas = await repo.saveArea(a.caller, {
      siteKey: params.site!,
      areaKey: params.area!,
      areaName: body.areaName,
      displayOrder: body.displayOrder ?? 0,
    });
    return { status: 200, body: areas, headers: headers() };
  });

  router.route('PUT', '/api/admin/:site/lines/:line', async (req, params) => {
    const a = await resolveAuth(req, params, cfg, repo, entra);
    if (a.identity.kind !== 'user') throw new SicError(50652, 403, 'Floor screens cannot do this');
    const body = z
      .object({
        lineName: z.string(),
        areaKey: z.string().nullable().optional(),
        cellName: z.string().nullable().optional(),
        displayOrder: z.number().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body ?? {});
    const line = await repo.saveLine(a.caller, {
      siteKey: params.site!,
      lineNo: Number(params.line),
      lineName: body.lineName,
      areaKey: body.areaKey ?? null,
      cellName: body.cellName ?? null,
      displayOrder: body.displayOrder ?? 0,
      isActive: body.isActive ?? true,
    });
    return { status: 200, body: line, headers: headers() };
  });

  router.route('PUT', '/api/admin/:site/reasons/:code', async (req, params) => {
    const a = await resolveAuth(req, params, cfg, repo, entra);
    if (a.identity.kind !== 'user') throw new SicError(50652, 403, 'Floor screens cannot do this');
    const body = z
      .object({
        reasonName: z.string(),
        lossCategory: z.string(),
        displayOrder: z.number().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body ?? {});
    const reasons = await repo.saveReasonCode(a.caller, {
      siteKey: params.site!,
      reasonCode: params.code!,
      reasonName: body.reasonName,
      lossCategory: body.lossCategory,
      displayOrder: body.displayOrder ?? 0,
      isActive: body.isActive ?? true,
    });
    return { status: 200, body: reasons, headers: headers() };
  });

  router.route('GET', '/api/admin/:site/rules', async (req, params) => {
    const a = await resolveAuth(req, params, cfg, repo, entra);
    const config = await repo.getSiteConfig(a.caller, params.site!);
    // site admin check via getSiteUsers
    await repo.getSiteUsers(a.caller, params.site!);
    return { status: 200, body: config.escalationRules, headers: headers() };
  });

  router.route('POST', '/api/admin/:site/rules', async (req, params) => {
    const a = await resolveAuth(req, params, cfg, repo, entra);
    if (a.identity.kind !== 'user') throw new SicError(50652, 403, 'Floor screens cannot do this');
    const body = z
      .object({
        areaKey: z.string().optional(),
        ruleType: z.enum(['RedNoComment', 'ConsecutiveRed', 'ShiftBelowTarget', 'ActionOverdue']),
        lvl: z.number(),
        threshold: z.number().nullable().optional(),
        delayMins: z.number().optional(),
        notifyRoles: z.array(z.string()),
        toTeams: z.boolean().optional(),
        toEmail: z.boolean().optional(),
        escalateAfterMins: z.number().nullable().optional(),
        isActive: z.boolean().optional(),
        description: z.string().nullable().optional(),
      })
      .parse(req.body ?? {});
    const rule = await repo.saveEscalationRule(a.caller, { ...body, siteKey: params.site! });
    return { status: 200, body: rule, headers: headers() };
  });

  router.route('PUT', '/api/admin/:site/rules/:id', async (req, params) => {
    const a = await resolveAuth(req, params, cfg, repo, entra);
    if (a.identity.kind !== 'user') throw new SicError(50652, 403, 'Floor screens cannot do this');
    const body = z.record(z.any()).parse(req.body ?? {});
    const rule = await repo.saveEscalationRule(a.caller, {
      ...body,
      ruleId: Number(params.id),
      siteKey: params.site!,
    } as never);
    return { status: 200, body: rule, headers: headers() };
  });

  router.route('GET', '/api/admin/:site/targets', async (req, params) => {
    const a = await resolveAuth(req, params, cfg, repo, entra);
    await repo.getSiteUsers(a.caller, params.site!);
    const config = await repo.getSiteConfig(a.caller, params.site!);
    return { status: 200, body: config.notificationTargets, headers: headers() };
  });

  router.route('POST', '/api/admin/:site/targets', async (req, params) => {
    const a = await resolveAuth(req, params, cfg, repo, entra);
    if (a.identity.kind !== 'user') throw new SicError(50652, 403, 'Floor screens cannot do this');
    const body = z
      .object({
        areaKey: z.string().optional(),
        channel: z.enum(['Teams', 'Email']),
        address: z.string(),
        minLvl: z.number().optional(),
        isActive: z.boolean().optional(),
        description: z.string().nullable().optional(),
      })
      .parse(req.body ?? {});
    const target = await repo.saveNotificationTarget(a.caller, { ...body, siteKey: params.site! });
    return { status: 200, body: target, headers: headers() };
  });

  router.route('PUT', '/api/admin/:site/targets/:id', async (req, params) => {
    const a = await resolveAuth(req, params, cfg, repo, entra);
    if (a.identity.kind !== 'user') throw new SicError(50652, 403, 'Floor screens cannot do this');
    const body = z.record(z.any()).parse(req.body ?? {});
    const target = await repo.saveNotificationTarget(a.caller, {
      ...body,
      targetId: Number(params.id),
      siteKey: params.site!,
      channel: body.channel ?? 'Teams',
      address: body.address ?? '',
    } as never);
    return { status: 200, body: target, headers: headers() };
  });

  router.route('GET', '/api/admin/:site/devices', async (req, params) => {
    const a = await resolveAuth(req, params, cfg, repo, entra);
    await repo.getSiteUsers(a.caller, params.site!);
    const config = await repo.getSiteConfig(a.caller, params.site!);
    return { status: 200, body: config.deviceKeys, headers: headers() };
  });

  router.route('POST', '/api/admin/:site/devices', async (req, params) => {
    const a = await resolveAuth(req, params, cfg, repo, entra);
    if (a.identity.kind !== 'user') throw new SicError(50652, 403, 'Floor screens cannot do this');
    rateLimit(String(a.identity.userId));
    const body = z
      .object({
        areaKey: z.string().nullable().optional(),
        lineNo: z.number().nullable().optional(),
        deviceName: z.string(),
        expiresUtc: z.string().nullable().optional(),
      })
      .parse(req.body ?? {});
    const plain = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(plain, 'utf8').digest();
    const devices = await repo.saveDeviceKey(a.caller, {
      siteKey: params.site!,
      areaKey: body.areaKey,
      lineNo: body.lineNo,
      deviceName: body.deviceName,
      keyHash: hash,
      expiresUtc: body.expiresUtc,
    });
    return {
      status: 200,
      body: {
        devices,
        key: plain,
        url: `${appBaseUrl}/tv/${plain}`,
      },
      headers: headers(),
    };
  });

  router.route('POST', '/api/admin/:site/devices/:id/revoke', async (req, params) => {
    const a = await resolveAuth(req, params, cfg, repo, entra);
    if (a.identity.kind !== 'user') throw new SicError(50652, 403, 'Floor screens cannot do this');
    const devices = await repo.saveDeviceKey(a.caller, {
      deviceKeyId: Number(params.id),
      siteKey: params.site!,
      revoke: true,
    });
    return { status: 200, body: devices, headers: headers() };
  });

  router.route('GET', '/api/admin/:site/article-gaps', async (req, params) => {
    const a = await resolveAuth(req, params, cfg, repo, entra);
    const gaps = await repo.getArticleKeyGaps(
      a.caller,
      params.site!,
      req.query.days ? Number(req.query.days) : 14,
    );
    return { status: 200, body: gaps, headers: headers() };
  });

  router.route('PUT', '/api/admin/:site/article-map/:articleKey', async (req, params) => {
    const a = await resolveAuth(req, params, cfg, repo, entra);
    if (a.identity.kind !== 'user') throw new SicError(50652, 403, 'Floor screens cannot do this');
    const body = z
      .object({ sapNumber: z.string(), articleName: z.string().nullable().optional() })
      .parse(req.body ?? {});
    const result = await repo.saveArticleKeyMap(
      a.caller,
      params.site!,
      decodeURIComponent(params.articleKey!),
      body.sapNumber,
      body.articleName,
    );
    return { status: 200, body: result, headers: headers() };
  });

  router.route('POST', '/api/admin/:site/targets/:id/test', async (req, params) => {
    const a = await resolveAuth(req, params, cfg, repo, entra);
    if (a.identity.kind !== 'user') throw new SicError(50652, 403, 'Floor screens cannot do this');
    const result = await repo.queueTestNotification(a.caller, Number(params.id));
    return { status: 200, body: result, headers: headers() };
  });

  router.route('GET', '/api/admin/:site/notification-preview', async (req, params) => {
    const a = await resolveAuth(req, params, cfg, repo, entra);
    const preview = await repo.getNotificationPreview(
      a.caller,
      params.site!,
      req.query.days ? Number(req.query.days) : 7,
    );
    return { status: 200, body: preview, headers: headers() };
  });
}

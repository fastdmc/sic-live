import {
  createHash,
} from 'node:crypto';
import {
  stripNamesFromHours,
  summariseSicHours,
  type Repository,
} from '@sic/shared';
import type { AppConfig } from '../config.js';
import { resolveAuth, type AuthContext } from '../auth/context.js';
import type { EntraDeps } from '../auth/entra.js';
import type { Router } from '../http.js';
import { securityHeaders } from '../http.js';

function headers(extra?: Record<string, string>) {
  return { ...securityHeaders(), ...extra };
}

async function auth(
  req: Parameters<Parameters<Router['route']>[2]>[0],
  params: Record<string, string>,
  cfg: AppConfig,
  repo: Repository,
  entra?: EntraDeps,
): Promise<AuthContext> {
  return resolveAuth(req, params, cfg, repo, entra);
}

export function registerReadRoutes(
  router: Router,
  cfg: AppConfig,
  repo: Repository,
  entra?: EntraDeps,
): void {
  router.route('GET', '/api/me', async (req) => {
    const a = await auth(req, {}, cfg, repo, entra);
    const me = await repo.getMe(a.caller);
    return { status: 200, body: me, headers: headers() };
  });

  router.route('GET', '/api/sites', async (req) => {
    const a = await auth(req, {}, cfg, repo, entra);
    const sites = await repo.listSites(a.caller);
    return { status: 200, body: sites, headers: headers() };
  });

  router.route('GET', '/api/sites/:site/config', async (req, params) => {
    const a = await auth(req, params, cfg, repo, entra);
    const config = await repo.getSiteConfig(a.caller, params.site!);
    return { status: 200, body: config, headers: headers() };
  });

  router.route('GET', '/api/sites/:site/days', async (req, params) => {
    const a = await auth(req, params, cfg, repo, entra);
    const days = await repo.listDays(a.caller, params.site!);
    const limit = Number(req.query.limit ?? 14);
    return {
      status: 200,
      body: days.reverse().slice(0, limit),
      headers: headers(),
    };
  });

  router.route('GET', '/api/sites/:site/sic/version', async (req, params) => {
    const a = await auth(req, params, cfg, repo, entra);
    const version = await repo.getSicVersion(a.caller, params.site!);
    return { status: 200, body: version, headers: headers() };
  });

  router.route('GET', '/api/sites/:site/sic', async (req, params) => {
    const a = await auth(req, params, cfg, repo, entra);
    const site = params.site!;
    const version = await repo.getSicVersion(a.caller, site);
    const day = req.query.day ?? version.latestDay;
    if (!day) {
      return { status: 200, body: { hours: [], summary: summariseSicHours([]), day: null }, headers: headers() };
    }
    const line = req.query.line != null ? Number(req.query.line) : undefined;
    const hours = await repo.getSicHours(a.caller, site, day, line);
    hours.sort((x, y) => x.lineNo - y.lineNo || x.hourStart.localeCompare(y.hourStart));
    const etag = `"${createHash('sha1').update(`${site}|${day}|${line ?? ''}|${version.changeKey}`).digest('hex')}"`;
    if (req.headers['if-none-match'] === etag) {
      return { status: 304, headers: headers({ ETag: etag }) };
    }
    return {
      status: 200,
      body: { day, hours, summary: summariseSicHours(hours), changeKey: version.changeKey },
      headers: headers({ ETag: etag }),
    };
  });

  router.route('GET', '/api/sites/:site/hours/:line/:hourStart/comments', async (req, params) => {
    const a = await auth(req, params, cfg, repo, entra);
    const hourStart = decodeURIComponent(params.hourStart!);
    const day = hourStart.slice(0, 10);
    const comments = await repo.listComments(
      a.caller,
      params.site!,
      day,
      Number(params.line),
      hourStart,
    );
    comments.sort((x, y) => y.createdUtc.localeCompare(x.createdUtc));
    return { status: 200, body: comments, headers: headers() };
  });

  router.route('GET', '/api/tv/:key/sic/version', async (req, params) => {
    const a = await auth(req, params, cfg, repo, entra);
    const site = a.identity.kind === 'device' ? a.identity.deviceSiteKey : '';
    const version = await repo.getSicVersion(a.caller, site);
    return { status: 200, body: version, headers: headers() };
  });

  router.route('GET', '/api/tv/:key/sic', async (req, params) => {
    const a = await auth(req, params, cfg, repo, entra);
    if (a.identity.kind !== 'device') {
      return { status: 401, body: { error: { message: 'Device auth required' } }, headers: headers() };
    }
    const site = a.identity.deviceSiteKey;
    const version = await repo.getSicVersion(a.caller, site);
    const day = req.query.day ?? version.latestDay;
    if (!day) {
      return { status: 200, body: { hours: [], summary: summariseSicHours([]) }, headers: headers() };
    }
    const device = a.identity;
    let hours = await repo.getSicHours(
      a.caller,
      site,
      day,
      device.lineNo ?? undefined,
    );
    if (device.areaKey) {
      hours = hours.filter((h) => h.areaKey === device.areaKey);
    }
    const cleaned = stripNamesFromHours(hours);
    return {
      status: 200,
      body: { day, hours: cleaned, summary: summariseSicHours(cleaned), changeKey: version.changeKey },
      headers: headers(),
    };
  });
}

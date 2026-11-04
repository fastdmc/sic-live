import { createHash, randomBytes } from 'node:crypto';
import { FakeRepository, version as sharedVersion, type Repository } from '@sic/shared';
import { z } from 'zod';
import { asFake, clearAuthCache, resolveAuth } from './auth/context.js';
import { createRemoteJwks, type EntraDeps } from './auth/entra.js';
import type { AppConfig } from './config.js';
import { loadConfig } from './config.js';
import {
  isLocalAddress,
  Router,
  securityHeaders,
  type HttpRequest,
  type HttpResponse,
} from './http.js';
import { SqlRepository } from './sql/SqlRepository.js';

export type App = {
  config: AppConfig;
  repo: Repository;
  router: Router;
  handle: (req: HttpRequest) => Promise<HttpResponse>;
};

export function createRepository(cfg: AppConfig): Repository {
  if (cfg.dataMode === 'fake') return new FakeRepository();
  // Pool is wired at process start in live; overnight never reaches here without settings.
  return new SqlRepository({
    request: () => {
      throw new Error('SQL pool not connected');
    },
  });
}

export async function resetFake(repo: FakeRepository): Promise<void> {
  repo.clock.reset();
  repo.reload();
  clearAuthCache();
  await repo.evaluateEscalations(repo.clock.nowIso());
}

export function createApp(options?: {
  config?: AppConfig;
  repo?: Repository;
  entra?: EntraDeps;
}): App {
  const config = options?.config ?? loadConfig();
  const repo = options?.repo ?? createRepository(config);
  const entra =
    options?.entra ??
    (config.authMode === 'entra'
      ? {
          allowedTenantIds: config.allowedTenantIds,
          audience: config.apiAudience!,
          getKey: createRemoteJwks(),
        }
      : undefined);

  const router = new Router();
  const withHeaders = (res: HttpResponse): HttpResponse => ({
    ...res,
    headers: { ...securityHeaders(), ...corsHeaders(config), ...res.headers },
  });

  router.route('OPTIONS', '/api/*', async () =>
    withHeaders({ status: 204, body: undefined }),
  );

  router.route('GET', '/api/health', async () =>
    withHeaders({
      status: 200,
      body: { status: 'ok', dataMode: config.dataMode, version: sharedVersion },
    }),
  );

  // TV health (device auth)
  router.route('GET', '/api/tv/:key/health', async (req, params) => {
    const auth = await resolveAuth(req, params, config, repo, entra);
    const siteKey =
      auth.identity.kind === 'device' ? auth.identity.deviceSiteKey : null;
    return withHeaders({
      status: 200,
      body: {
        status: 'ok',
        siteKey,
        device:
          auth.identity.kind === 'device'
            ? { name: auth.identity.deviceName, areaKey: auth.identity.areaKey, lineNo: auth.identity.lineNo }
            : null,
      },
    });
  });

  if (config.authMode === 'dev' && config.dataMode === 'fake') {
    const fakeOnly = async (req: HttpRequest, handler: () => Promise<HttpResponse>) => {
      if (!isLocalAddress(req.remoteAddress)) {
        return withHeaders({ status: 404, body: { error: { message: 'Not found' } } });
      }
      return withHeaders(await handler());
    };

    router.route('POST', '/api/__test/reset', async (req) =>
      fakeOnly(req, async () => {
        const fake = asFake(repo);
        if (!fake) return { status: 404, body: { error: { message: 'Not found' } } };
        await resetFake(fake);
        return { status: 200, body: { ok: true } };
      }),
    );

    router.route('POST', '/api/__test/clock', async (req) =>
      fakeOnly(req, async () => {
        const fake = asFake(repo);
        if (!fake) return { status: 404, body: { error: { message: 'Not found' } } };
        const body = z.object({ nowUtc: z.string() }).parse(req.body ?? {});
        fake.clock.set(body.nowUtc);
        return { status: 200, body: { nowUtc: fake.clock.nowIso() } };
      }),
    );

    router.route('POST', '/api/__test/run-engine', async (req) =>
      fakeOnly(req, async () => {
        const fake = asFake(repo);
        if (!fake) return { status: 404, body: { error: { message: 'Not found' } } };
        const raised = await fake.evaluateEscalations(fake.clock.nowIso());
        return { status: 200, body: { raised } };
      }),
    );

    router.route('POST', '/api/__test/bump-version', async (req) =>
      fakeOnly(req, async () => {
        const fake = asFake(repo);
        if (!fake) return { status: 404, body: { error: { message: 'Not found' } } };
        const body = z.object({ site: z.string() }).parse(req.body ?? {});
        fake.bumpVersion(body.site);
        return { status: 200, body: { ok: true } };
      }),
    );

    router.route('POST', '/api/__test/device-key', async (req) =>
      fakeOnly(req, async () => {
        const fake = asFake(repo);
        if (!fake) return { status: 404, body: { error: { message: 'Not found' } } };
        const body = z
          .object({
            site: z.string(),
            areaKey: z.string().nullable().optional(),
            lineNo: z.number().nullable().optional(),
          })
          .parse(req.body ?? {});
        const plain = randomBytes(32).toString('base64url');
        const hash = createHash('sha256').update(plain, 'utf8').digest();
        // Use site admin user 4 to save
        await fake.saveDeviceKey(
          { userId: 4 },
          {
            siteKey: body.site,
            areaKey: body.areaKey ?? null,
            lineNo: body.lineNo ?? null,
            deviceName: 'Test device',
            keyHash: hash,
          },
        );
        return {
          status: 200,
          body: { key: plain, url: `/tv/${plain}` },
        };
      }),
    );
  }

  const handle = async (req: HttpRequest): Promise<HttpResponse> => {
    const started = Date.now();
    const res = await router.handle(normalize(req));
    const out = withHeaders(res);
    const template = (res as { routeTemplate?: string }).routeTemplate ?? req.path;
    console.log(
      JSON.stringify({
        method: req.method,
        route: template,
        status: out.status,
        ms: Date.now() - started,
      }),
    );
    return out;
  };

  // Start fake in reset state
  const fake = asFake(repo);
  if (fake && config.authMode === 'dev') {
    void resetFake(fake);
  }

  return { config, repo, router, handle };
}

function normalize(req: HttpRequest): HttpRequest {
  const headers: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    headers[k.toLowerCase()] = v;
  }
  let path = req.path;
  if (!path.startsWith('/')) path = `/${path}`;
  // Strip query
  path = path.split('?')[0] ?? path;
  return { ...req, path, headers };
}

function corsHeaders(cfg: AppConfig): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': cfg.corsOrigins[0] ?? '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-dev-user, If-None-Match',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  };
}

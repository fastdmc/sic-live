import type { Caller, FakeRepository, Repository } from '@sic/shared';
import type { AppConfig } from '../config.js';
import type { HttpRequest } from '../http.js';
import { authenticateDevice, type DeviceIdentity } from './device.js';
import { authenticateDev } from './dev.js';
import { authenticateEntra, type EntraDeps, type EntraIdentity } from './entra.js';
import { AuthError } from './errors.js';

export type AuthContext =
  | { caller: Caller; identity: { kind: 'user'; userId: number; email: string; displayName: string } }
  | { caller: Caller; identity: DeviceIdentity };

type CacheEntry = { userId: number; expires: number };
const userCache = new Map<string, CacheEntry>();

export function clearAuthCache(): void {
  userCache.clear();
}

export async function resolveAuth(
  req: HttpRequest,
  params: Record<string, string>,
  cfg: AppConfig,
  repo: Repository,
  entraDeps?: EntraDeps,
): Promise<AuthContext> {
  if (params.key || req.path.startsWith('/api/tv/')) {
    const key = params.key ?? req.path.split('/')[3];
    if (!key) throw new AuthError(401, 'Missing device key');
    const device = await authenticateDevice(key, repo);
    return {
      caller: {
        deviceSiteKey: device.deviceSiteKey,
        areaKey: device.areaKey,
        lineNo: device.lineNo,
      },
      identity: device,
    };
  }

  if (cfg.authMode === 'dev') {
    const dev = authenticateDev(req, cfg.authMode);
    return {
      caller: { userId: dev.userId },
      identity: {
        kind: 'user',
        userId: dev.userId,
        email: dev.email,
        displayName: dev.displayName,
      },
    };
  }

  if (!entraDeps) throw new AuthError(401, 'Entra auth is not configured');
  const entra = await authenticateEntra(req.headers.authorization, entraDeps);
  const userId = await upsertCached(repo, entra);
  return {
    caller: { userId },
    identity: {
      kind: 'user',
      userId,
      email: entra.email,
      displayName: entra.displayName,
    },
  };
}

async function upsertCached(repo: Repository, entra: EntraIdentity): Promise<number> {
  const key = `${entra.tenantId}:${entra.objectId}`;
  const hit = userCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.userId;
  const me = await repo.upsertUser({
    tenantId: entra.tenantId,
    objectId: entra.objectId,
    email: entra.email,
    displayName: entra.displayName,
    upn: entra.upn,
    isGuest: entra.isGuest,
  });
  userCache.set(key, { userId: me.userId, expires: Date.now() + 5 * 60_000 });
  return me.userId;
}

export function asFake(repo: Repository): FakeRepository | null {
  return (repo as { reload?: unknown }).reload ? (repo as FakeRepository) : null;
}

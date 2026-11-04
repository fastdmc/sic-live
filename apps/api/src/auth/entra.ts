import * as jose from 'jose';
import { AuthError } from './errors.js';

export type EntraIdentity = {
  kind: 'user';
  tenantId: string;
  objectId: string;
  email: string;
  displayName: string;
  isGuest: boolean;
  upn?: string;
};

export type EntraDeps = {
  allowedTenantIds: string[];
  audience: string;
  dmcTenantId?: string;
  getKey: jose.JWTVerifyGetKey;
  clockToleranceSec?: number;
};

export async function authenticateEntra(
  authorization: string | undefined,
  deps: EntraDeps,
): Promise<EntraIdentity> {
  if (!authorization?.toLowerCase().startsWith('bearer ')) {
    throw new AuthError(401, 'Missing bearer token');
  }
  const token = authorization.slice(7).trim();
  let payload: jose.JWTPayload;
  try {
    const verified = await jose.jwtVerify(token, deps.getKey, {
      audience: deps.audience,
      clockTolerance: deps.clockToleranceSec ?? 300,
    });
    payload = verified.payload;
  } catch {
    throw new AuthError(401, 'Invalid token');
  }

  const tid = String(payload.tid ?? '');
  const oid = String(payload.oid ?? '');
  if (!tid || !oid) throw new AuthError(401, 'Invalid token');

  const iss = `https://login.microsoftonline.com/${tid}/v2.0`;
  if (payload.iss !== iss) throw new AuthError(401, 'Invalid token issuer');

  if (!deps.allowedTenantIds.includes(tid)) {
    throw new AuthError(403, 'Your organisation is not set up for SIC Live');
  }

  const scp = String(payload.scp ?? '');
  const scopes = scp.split(' ').filter(Boolean);
  if (!scopes.includes('access_as_user')) {
    throw new AuthError(401, 'Missing access_as_user scope');
  }

  const email =
    (typeof payload.email === 'string' && payload.email) ||
    (typeof payload.preferred_username === 'string' && payload.preferred_username) ||
    (typeof payload.upn === 'string' && payload.upn) ||
    '';
  if (!email) throw new AuthError(401, 'Token has no email');

  const name =
    (typeof payload.name === 'string' && payload.name) ||
    email;

  const acct = payload.acct;
  const isGuest =
    acct === 1 ||
    (deps.dmcTenantId != null &&
      tid === deps.dmcTenantId &&
      !email.toLowerCase().endsWith('@dmc.example') &&
      !email.toLowerCase().includes('@dmc.'));

  return {
    kind: 'user',
    tenantId: tid,
    objectId: oid,
    email,
    displayName: name,
    isGuest: Boolean(isGuest),
    upn: typeof payload.upn === 'string' ? payload.upn : undefined,
  };
}

export function createRemoteJwks(): jose.JWTVerifyGetKey {
  return jose.createRemoteJWKSet(
    new URL('https://login.microsoftonline.com/common/discovery/v2.0/keys'),
  );
}

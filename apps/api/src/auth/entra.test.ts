import * as jose from 'jose';
import { describe, expect, it } from 'vitest';
import { authenticateEntra } from './entra.js';
import { AuthError } from './errors.js';

const tenant = '11111111-1111-1111-1111-111111111111';
const otherTenant = '22222222-2222-2222-2222-222222222222';
const audience = 'api://sic-live-test';

async function keyPair() {
  return jose.generateKeyPair('RS256');
}

async function sign(
  privateKey: jose.KeyLike,
  claims: Record<string, unknown>,
  opts?: { exp?: string },
) {
  return new jose.SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuedAt()
    .setExpirationTime(opts?.exp ?? '1h')
    .sign(privateKey);
}

describe('authenticateEntra', () => {
  it('accepts a valid token for an allowed tenant', async () => {
    const { publicKey, privateKey } = await keyPair();
    const token = await sign(privateKey, {
      tid: tenant,
      oid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      iss: `https://login.microsoftonline.com/${tenant}/v2.0`,
      aud: audience,
      scp: 'access_as_user',
      email: 'lena@hfi.example',
      name: 'Lena Leader',
    });
    const id = await authenticateEntra(`Bearer ${token}`, {
      allowedTenantIds: [tenant],
      audience,
      getKey: async () => publicKey,
    });
    expect(id.email).toBe('lena@hfi.example');
    expect(id.tenantId).toBe(tenant);
  });

  it('rejects a disallowed tenant with 403', async () => {
    const { publicKey, privateKey } = await keyPair();
    const token = await sign(privateKey, {
      tid: otherTenant,
      oid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      iss: `https://login.microsoftonline.com/${otherTenant}/v2.0`,
      aud: audience,
      scp: 'access_as_user',
      email: 'x@y.z',
      name: 'X',
    });
    await expect(
      authenticateEntra(`Bearer ${token}`, {
        allowedTenantIds: [tenant],
        audience,
        getKey: async () => publicKey,
      }),
    ).rejects.toMatchObject({ status: 403, message: 'Your organisation is not set up for SIC Live' });
  });

  it('rejects wrong audience, missing scope, expired and bad signature with 401', async () => {
    const { publicKey, privateKey } = await keyPair();
    const { privateKey: otherPriv } = await keyPair();

    const base = {
      tid: tenant,
      oid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      iss: `https://login.microsoftonline.com/${tenant}/v2.0`,
      scp: 'access_as_user',
      email: 'a@b.c',
      name: 'A',
    };

    const wrongAud = await sign(privateKey, { ...base, aud: 'wrong' });
    await expect(
      authenticateEntra(`Bearer ${wrongAud}`, {
        allowedTenantIds: [tenant],
        audience,
        getKey: async () => publicKey,
      }),
    ).rejects.toBeInstanceOf(AuthError);

    const noScope = await sign(privateKey, { ...base, aud: audience, scp: 'other' });
    await expect(
      authenticateEntra(`Bearer ${noScope}`, {
        allowedTenantIds: [tenant],
        audience,
        getKey: async () => publicKey,
      }),
    ).rejects.toMatchObject({ status: 401 });

    const expired = await sign(privateKey, { ...base, aud: audience }, { exp: '0s' });
    await expect(
      authenticateEntra(`Bearer ${expired}`, {
        allowedTenantIds: [tenant],
        audience,
        getKey: async () => publicKey,
        clockToleranceSec: 0,
      }),
    ).rejects.toMatchObject({ status: 401 });

    const badSig = await sign(otherPriv, { ...base, aud: audience });
    await expect(
      authenticateEntra(`Bearer ${badSig}`, {
        allowedTenantIds: [tenant],
        audience,
        getKey: async () => publicKey,
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
});

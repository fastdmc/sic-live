import { createHash } from 'node:crypto';
import type { Repository } from '@sic/shared';
import { AuthError } from './errors.js';

export type DeviceIdentity = {
  kind: 'device';
  deviceSiteKey: string;
  areaKey: string | null;
  lineNo: number | null;
  deviceKeyId: number;
  deviceName: string;
};

export async function authenticateDevice(
  key: string,
  repo: Repository,
): Promise<DeviceIdentity> {
  const hash = createHash('sha256').update(key, 'utf8').digest();
  const resolved = await repo.resolveDeviceKey(hash);
  if (!resolved) throw new AuthError(401, 'Unknown or revoked device key');
  return {
    kind: 'device',
    deviceSiteKey: resolved.siteKey,
    areaKey: resolved.areaKey,
    lineNo: resolved.lineNo,
    deviceKeyId: resolved.deviceKeyId,
    deviceName: resolved.deviceName,
  };
}

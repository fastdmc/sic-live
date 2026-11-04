import type { Role, UserRole } from '../schemas.js';

const RANK: Record<Role, number> = {
  Viewer: 1,
  LineLeader: 2,
  AreaManager: 3,
  SiteManager: 4,
  SiteAdmin: 5,
};

export function roleRank(
  isGroupAdmin: boolean,
  roles: UserRole[],
  siteKey: string,
  areaKey?: string | null,
): number {
  if (isGroupAdmin) return 5;
  let best = 0;
  for (const r of roles) {
    if (r.siteKey !== siteKey) continue;
    // Site-wide roles (empty area) count for every area.
    if (r.areaKey && areaKey && r.areaKey !== areaKey) continue;
    if (r.areaKey && !areaKey) {
      // Asking site-wide: area-scoped roles still count at their area only —
      // for site-wide checks without an area, include area-scoped ranks
      // (fnRoleRank with a specific area). When areaKey is null/undefined
      // meaning "any access at site", take the max across all areas.
    }
    best = Math.max(best, RANK[r.role] ?? 0);
  }
  return best;
}

/** Highest rank at the site for a specific line's area. */
export function roleRankForArea(
  isGroupAdmin: boolean,
  roles: UserRole[],
  siteKey: string,
  areaKey: string | null | undefined,
): number {
  if (isGroupAdmin) return 5;
  let best = 0;
  for (const r of roles) {
    if (r.siteKey !== siteKey) continue;
    if (r.areaKey === '' || r.areaKey == null) {
      best = Math.max(best, RANK[r.role] ?? 0);
      continue;
    }
    if (areaKey && r.areaKey === areaKey) {
      best = Math.max(best, RANK[r.role] ?? 0);
    }
  }
  return best;
}

export function hasAnySiteRole(
  isGroupAdmin: boolean,
  roles: UserRole[],
  siteKey: string,
): boolean {
  if (isGroupAdmin) return true;
  return roles.some((r) => r.siteKey === siteKey);
}

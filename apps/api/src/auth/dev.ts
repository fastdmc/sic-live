import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UsersFixtureSchema } from '@sic/shared';
import { isLocalAddress, type HttpRequest } from '../http.js';
import { AuthError } from './errors.js';

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../fixtures',
);

let cachedUsers: ReturnType<typeof UsersFixtureSchema.parse>['users'] | null = null;

function users() {
  if (!cachedUsers) {
    cachedUsers = UsersFixtureSchema.parse(
      JSON.parse(readFileSync(path.join(fixturesDir, 'users.json'), 'utf8')),
    ).users;
  }
  return cachedUsers;
}

export type DevIdentity = {
  kind: 'user';
  userId: number;
  email: string;
  displayName: string;
};

export function authenticateDev(req: HttpRequest, authMode: string): DevIdentity {
  if (authMode !== 'dev') {
    throw new AuthError(403, 'Dev sign-in is not enabled');
  }
  if (!isLocalAddress(req.remoteAddress)) {
    throw new AuthError(401, 'Dev sign-in is only allowed from localhost');
  }
  const email = req.headers['x-dev-user']?.trim();
  if (!email) throw new AuthError(401, 'Missing x-dev-user header');
  const user = users().find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) throw new AuthError(401, 'Unknown dev user');
  return {
    kind: 'user',
    userId: user.userId,
    email: user.email,
    displayName: user.displayName,
  };
}

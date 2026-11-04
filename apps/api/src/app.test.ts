import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

function req(
  partial: Partial<{
    method: string;
    path: string;
    headers: Record<string, string>;
    body: unknown;
    remoteAddress: string;
  }>,
) {
  return {
    method: partial.method ?? 'GET',
    path: partial.path ?? '/',
    headers: partial.headers ?? {},
    query: {},
    body: partial.body,
    remoteAddress: partial.remoteAddress ?? '127.0.0.1',
  };
}

describe('API core', () => {
  it('refuses dev auth when SIC_AUTH_MODE=entra', async () => {
    const app = createApp({
      config: loadConfig({
        SIC_DATA_MODE: 'fake',
        SIC_AUTH_MODE: 'entra',
        SIC_ALLOWED_TENANT_IDS: '11111111-1111-1111-1111-111111111111',
        SIC_API_AUDIENCE: 'api://test',
      }),
    });
    const res = await app.handle(
      req({
        path: '/api/tv/test-hfi-fresh-tv-key-0001/health',
        // device auth still works; probe __test
      }),
    );
    expect(res.status).toBe(200);

    const testRes = await app.handle(req({ method: 'POST', path: '/api/__test/reset' }));
    expect(testRes.status).toBe(404);
  });

  it('refuses dev auth from non-localhost', async () => {
    const app = createApp({
      config: loadConfig({ SIC_DATA_MODE: 'fake', SIC_AUTH_MODE: 'dev' }),
    });
    // Force a user route that uses resolveAuth — use TV for device; for dev user we need a route.
    // __test also checks localhost.
    const res = await app.handle(
      req({ method: 'POST', path: '/api/__test/reset', remoteAddress: '10.0.0.1' }),
    );
    expect(res.status).toBe(404);
  });

  it('resolves fixture device keys', async () => {
    const app = createApp({
      config: loadConfig({ SIC_DATA_MODE: 'fake', SIC_AUTH_MODE: 'dev' }),
    });
    // wait briefly for resetFake
    await new Promise((r) => setTimeout(r, 50));

    const ok = await app.handle(req({ path: '/api/tv/test-hfi-fresh-tv-key-0001/health' }));
    expect(ok.status).toBe(200);
    expect((ok.body as { siteKey: string }).siteKey).toBe('HFI');

    const revoked = await app.handle(req({ path: '/api/tv/test-hfi-revoked-key-0003/health' }));
    expect(revoked.status).toBe(401);

    const unknown = await app.handle(req({ path: '/api/tv/not-a-real-key/health' }));
    expect(unknown.status).toBe(401);
  });

  it('health works without auth', async () => {
    const app = createApp({
      config: loadConfig({ SIC_DATA_MODE: 'fake', SIC_AUTH_MODE: 'dev' }),
    });
    const res = await app.handle(req({ path: '/api/health' }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', dataMode: 'fake' });
  });
});

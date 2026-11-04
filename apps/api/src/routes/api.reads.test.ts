import { FakeRepository } from '@sic/shared';
import { describe, expect, it } from 'vitest';
import { createApp, resetFake } from '../app.js';
import { loadConfig } from '../config.js';

function req(
  path: string,
  opts?: { method?: string; headers?: Record<string, string>; body?: unknown; query?: string },
) {
  const url = new URL(path, 'http://localhost');
  if (opts?.query) {
    new URLSearchParams(opts.query).forEach((v, k) => url.searchParams.set(k, v));
  }
  const query: Record<string, string | undefined> = {};
  url.searchParams.forEach((v, k) => {
    query[k] = v;
  });
  return {
    method: opts?.method ?? 'GET',
    path: url.pathname,
    headers: { 'x-dev-user': 'line.leader@hfi.example', ...opts?.headers },
    query,
    body: opts?.body,
    remoteAddress: '127.0.0.1',
  };
}

describe('SIC read endpoints', () => {
  it('returns HFI hours and summary for Lena', async () => {
    const repo = new FakeRepository();
    await resetFake(repo);
    const app = createApp({
      config: loadConfig({ SIC_DATA_MODE: 'fake', SIC_AUTH_MODE: 'dev' }),
      repo,
    });
    const res = await app.handle(req('/api/sites/HFI/sic', { query: 'day=2026-11-02' }));
    expect(res.status).toBe(200);
    const body = res.body as {
      hours: unknown[];
      summary: { actualPacks: number; targetPacks: number; redHours: number };
    };
    expect(body.hours).toHaveLength(216);
    expect(body.summary.actualPacks).toBe(135048);
    expect(body.summary.targetPacks).toBe(175904);
    expect(body.summary.redHours).toBe(88);

    const line7 = await app.handle(
      req('/api/sites/HFI/sic', { query: 'day=2026-11-02&line=7' }),
    );
    expect((line7.body as { hours: unknown[] }).hours).toHaveLength(14);
  });

  it('enforces site isolation', async () => {
    const repo = new FakeRepository();
    await resetFake(repo);
    const app = createApp({
      config: loadConfig({ SIC_DATA_MODE: 'fake', SIC_AUTH_MODE: 'dev' }),
      repo,
    });
    const demo = await app.handle(
      req('/api/sites/HFI/sic', {
        query: 'day=2026-11-02',
        headers: { 'x-dev-user': 'demo.leader@demo.example' },
      }),
    );
    expect(demo.status).toBe(403);

    const sites = await app.handle(
      req('/api/sites', { headers: { 'x-dev-user': 'demo.leader@demo.example' } }),
    );
    expect((sites.body as { siteKey: string }[]).map((s) => s.siteKey)).toEqual(['DEMO']);

    const greta = await app.handle(
      req('/api/sites', { headers: { 'x-dev-user': 'group.admin@dmc.example' } }),
    );
    expect(
      (greta.body as { siteKey: string }[]).map((s) => s.siteKey).sort(),
    ).toEqual(['DEMO', 'HFI', 'HFUK']);
  });

  it('TV endpoint strips names and scopes to fresh', async () => {
    const repo = new FakeRepository();
    await resetFake(repo);
    const app = createApp({
      config: loadConfig({ SIC_DATA_MODE: 'fake', SIC_AUTH_MODE: 'dev' }),
      repo,
    });
    const res = await app.handle(
      req('/api/tv/test-hfi-fresh-tv-key-0001/sic', { query: 'day=2026-11-02', headers: {} }),
    );
    expect(res.status).toBe(200);
    const body = res.body as { hours: Array<{ areaKey?: string | null; note?: { by?: string | null } }> };
    expect(body.hours.every((h) => h.areaKey === 'fresh')).toBe(true);
    const json = JSON.stringify(body);
    for (const name of ['Lena Leader', 'Aidan Manager', 'Siobhan Site', 'Sam Admin', 'Greta Group']) {
      expect(json).not.toContain(name);
    }
  });

  it('supports ETag / 304 and refreshes after comment', async () => {
    const repo = new FakeRepository();
    await resetFake(repo);
    const app = createApp({
      config: loadConfig({ SIC_DATA_MODE: 'fake', SIC_AUTH_MODE: 'dev' }),
      repo,
    });
    const first = await app.handle(req('/api/sites/HFI/sic', { query: 'day=2026-11-02' }));
    const etag = first.headers?.ETag;
    expect(etag).toBeTruthy();
    const notModified = await app.handle(
      req('/api/sites/HFI/sic', {
        query: 'day=2026-11-02',
        headers: { 'if-none-match': etag! },
      }),
    );
    expect(notModified.status).toBe(304);

    await app.handle(
      req('/api/sites/HFI/hours/1/2026-11-02T06:00:00/comments', {
        method: 'POST',
        body: { issue: 'Film break', action: { title: 'Fix film' } },
      }),
    );
    const after = await app.handle(
      req('/api/sites/HFI/sic', {
        query: 'day=2026-11-02&line=1',
        headers: { 'if-none-match': etag! },
      }),
    );
    expect(after.status).toBe(200);
    const hour = (after.body as { hours: Array<{ hourStart: string; noteCount?: number }> }).hours.find(
      (h) => h.hourStart === '2026-11-02T06:00:00',
    );
    expect(hour?.noteCount).toBe(1);
  });
});

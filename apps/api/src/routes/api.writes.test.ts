import { FakeRepository } from '@sic/shared';
import { describe, expect, it } from 'vitest';
import { createApp, resetFake } from '../app.js';
import { loadConfig } from '../config.js';

function call(
  app: ReturnType<typeof createApp>,
  path: string,
  opts?: {
    method?: string;
    user?: string;
    body?: unknown;
  },
) {
  return app.handle({
    method: opts?.method ?? 'GET',
    path,
    headers: { 'x-dev-user': opts?.user ?? 'line.leader@hfi.example' },
    query: {},
    body: opts?.body,
    remoteAddress: '127.0.0.1',
  });
}

describe('API writes', () => {
  it('lets Lena comment with an action and resolves RedNoComment', async () => {
    const repo = new FakeRepository();
    await resetFake(repo);
    const app = createApp({
      config: loadConfig({ SIC_DATA_MODE: 'fake', SIC_AUTH_MODE: 'dev' }),
      repo,
    });
    const res = await call(app, '/api/sites/HFI/hours/1/2026-11-02T06:00:00/comments', {
      method: 'POST',
      body: { issue: 'Changeover overrun', reasonCode: 'CHANGEOVER', action: { title: 'Speed up changeover' } },
    });
    expect(res.status).toBe(200);
    const hours = await repo.getSicHours({ userId: 1 }, 'HFI', '2026-11-02', 1);
    const hour = hours.find((h) => h.hourStart === '2026-11-02T06:00:00');
    expect(hour?.noteCount).toBe(1);
    expect(hour?.openActions).toBe(1);
    const open = repo
      .getEscalationsRaw()
      .filter(
        (e) =>
          e.siteKey === 'HFI' &&
          e.ruleType === 'RedNoComment' &&
          e.lineNo === 1 &&
          e.hourStart === '2026-11-02T06:00:00' &&
          e.status === 'Open',
      );
    expect(open).toHaveLength(0);
  });

  it('blocks Lena on cured line 11 and empty issue', async () => {
    const repo = new FakeRepository();
    await resetFake(repo);
    const app = createApp({
      config: loadConfig({ SIC_DATA_MODE: 'fake', SIC_AUTH_MODE: 'dev' }),
      repo,
    });
    const forbidden = await call(app, '/api/sites/HFI/hours/11/2026-11-02T07:00:00/comments', {
      method: 'POST',
      body: { issue: 'Should fail' },
    });
    expect(forbidden.status).toBe(403);

    const empty = await call(app, '/api/sites/HFI/hours/1/2026-11-02T06:00:00/comments', {
      method: 'POST',
      body: { issue: '' },
    });
    expect(empty.status).toBe(400);
  });

  it('verify needs area manager', async () => {
    const repo = new FakeRepository();
    await resetFake(repo);
    const app = createApp({
      config: loadConfig({ SIC_DATA_MODE: 'fake', SIC_AUTH_MODE: 'dev' }),
      repo,
    });
    const created = await call(app, '/api/actions', {
      method: 'POST',
      body: { site: 'HFI', title: 'Check seals', line: 4 },
    });
    const id = (created.body as { actionId: number }).actionId;
    await call(app, `/api/actions/${id}`, { method: 'PATCH', body: { status: 'Done' } });
    const deny = await call(app, `/api/actions/${id}`, {
      method: 'PATCH',
      body: { status: 'Verified' },
    });
    expect(deny.status).toBe(403);
    const ok = await call(app, `/api/actions/${id}`, {
      method: 'PATCH',
      user: 'area.manager@hfi.example',
      body: { status: 'Verified' },
    });
    expect(ok.status).toBe(200);
  });

  it('isolates admin and devices', async () => {
    const repo = new FakeRepository();
    await resetFake(repo);
    const app = createApp({
      config: loadConfig({ SIC_DATA_MODE: 'fake', SIC_AUTH_MODE: 'dev' }),
      repo,
    });
    const demoOnHfi = await call(app, '/api/admin/HFI/users', {
      user: 'demo.leader@demo.example',
    });
    expect(demoOnHfi.status).toBe(403);

    const samOnDemo = await call(app, '/api/admin/DEMO/users', {
      user: 'site.admin@hfi.example',
    });
    expect(samOnDemo.status).toBe(403);

    const created = await call(app, '/api/admin/HFI/devices', {
      method: 'POST',
      user: 'site.admin@hfi.example',
      body: { deviceName: 'New TV', areaKey: 'fresh' },
    });
    expect(created.status).toBe(200);
    const key = (created.body as { key: string }).key;
    expect(key).toBeTruthy();
    const listed = await call(app, '/api/admin/HFI/devices', {
      user: 'site.admin@hfi.example',
    });
    const json = JSON.stringify(listed.body);
    expect(json).not.toContain(key);
    expect(json).not.toContain('plainKeyForTestsOnly');

    const tv = await call(app, `/api/tv/${key}/health`, { user: 'site.admin@hfi.example' });
    // device routes ignore x-dev-user
    expect(tv.status).toBe(200);

    const badTeams = await call(app, '/api/admin/HFI/targets', {
      method: 'POST',
      user: 'site.admin@hfi.example',
      body: { channel: 'Teams', address: 'https://example.com/hook' },
    });
    expect(badTeams.status).toBe(400);
  });
});

import { describe, expect, it } from 'vitest';
import { authenticateDev } from './dev.js';
import { AuthError } from './errors.js';

describe('authenticateDev', () => {
  it('accepts a fixture user from localhost', () => {
    const id = authenticateDev(
      {
        method: 'GET',
        path: '/api/me',
        headers: { 'x-dev-user': 'line.leader@hfi.example' },
        query: {},
        remoteAddress: '127.0.0.1',
      },
      'dev',
    );
    expect(id.userId).toBe(1);
  });

  it('refuses when auth mode is entra', () => {
    expect(() =>
      authenticateDev(
        {
          method: 'GET',
          path: '/api/me',
          headers: { 'x-dev-user': 'line.leader@hfi.example' },
          query: {},
          remoteAddress: '127.0.0.1',
        },
        'entra',
      ),
    ).toThrow(AuthError);
  });

  it('refuses non-localhost', () => {
    try {
      authenticateDev(
        {
          method: 'GET',
          path: '/api/me',
          headers: { 'x-dev-user': 'line.leader@hfi.example' },
          query: {},
          remoteAddress: '10.1.2.3',
        },
        'dev',
      );
      expect.fail('should throw');
    } catch (err) {
      expect(err).toMatchObject({ status: 401 });
    }
  });
});


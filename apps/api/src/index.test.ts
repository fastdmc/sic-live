import { describe, expect, it } from 'vitest';
import { apiName } from './index.js';

describe('api', () => {
  it('names itself', () => {
    expect(apiName).toBe('sic-api');
  });
});

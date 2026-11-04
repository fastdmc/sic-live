import { describe, expect, it } from 'vitest';
import { workerName } from './index.js';

describe('worker', () => {
  it('names itself', () => {
    expect(workerName).toBe('sic-worker');
  });
});

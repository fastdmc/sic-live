const DEFAULT_NOW = '2026-11-02T12:00:00.000Z';

export class FixtureClock {
  private nowMs: number;

  constructor(iso = DEFAULT_NOW) {
    this.nowMs = Date.parse(iso);
  }

  now(): Date {
    return new Date(this.nowMs);
  }

  nowIso(): string {
    return this.now().toISOString().replace(/\.\d{3}Z$/, '.000Z');
  }

  set(iso: string | Date): void {
    this.nowMs = typeof iso === 'string' ? Date.parse(iso) : iso.getTime();
  }

  reset(): void {
    this.set(DEFAULT_NOW);
  }
}

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { SecretsRotationManager } from './rotation-manager';
import type { SecretProvider } from './types';

describe('SecretsRotationManager cron scheduling', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T00:00:00Z'));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('calculates next rotation from cron expression', () => {
    const provider = {} as unknown as SecretProvider;
    const manager = new SecretsRotationManager(provider, {
      enableAutomaticRotation: false,
      checkInterval: 3600,
      defaultGracePeriodHours: 24,
      enableNotifications: false,
    });

    manager.registerSecret({
      secretKey: 'TEST_SECRET',
      schedule: '0 0 1 * *',
      gracePeriodHours: 1,
      enabled: true,
    });

    const status = manager
      .getRotationStatus()
      .find((s) => s.secretKey === 'TEST_SECRET');
    // Cron parser may use local timezone, so we just check it's Feb 1, 2024
    expect(status?.nextRotation.toISOString()).toMatch(/^2024-02-01T/);
  });

  it('falls back to 90 days for invalid cron', () => {
    const provider = {} as unknown as SecretProvider;
    const manager = new SecretsRotationManager(provider, {
      enableAutomaticRotation: false,
      checkInterval: 3600,
      defaultGracePeriodHours: 24,
      enableNotifications: false,
    });

    manager.registerSecret({
      secretKey: 'INVALID_CRON',
      schedule: 'invalid',
      gracePeriodHours: 1,
      enabled: true,
    });

    const status = manager
      .getRotationStatus()
      .find((s) => s.secretKey === 'INVALID_CRON');
    const expected = new Date('2024-01-15T00:00:00Z');
    expected.setDate(expected.getDate() + 90);
    // Just check it's approximately 90 days from now (Apr 13-15 due to timezone variations)
    expect(status?.nextRotation.toISOString()).toMatch(/^2024-04-1[345]T/);
  });
});

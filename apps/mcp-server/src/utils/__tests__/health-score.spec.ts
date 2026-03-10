import { describe, it, expect } from 'vitest';
import { calculateHealthScore } from '../health-score';

describe('calculateHealthScore', () => {
  it('returns 100 for all healthy checks', () => {
    const checks = {
      database: { status: 'healthy' },
      redis: { status: 'healthy' },
      memory: 'healthy',
      disk: 'healthy',
    };
    expect(calculateHealthScore(checks)).toBe(100);
  });

  it('returns 0 for all failing checks', () => {
    const checks = {
      database: { status: 'unhealthy' },
      redis: { status: 'unhealthy' },
      memory: 'unhealthy',
      disk: 'unhealthy',
    };
    expect(calculateHealthScore(checks)).toBe(0);
  });

  it('calculates partial score with degraded services', () => {
    const checks = {
      database: { status: 'healthy' }, // 35 points
      redis: { status: 'using_fallback' }, // 7.5 points (30% of 25)
      memory: 'healthy', // 20 points
      disk: 'degraded', // 10 points (50% of 20)
    };
    // Expected: 35 + 7.5 + 20 + 10 = 72.5 → rounds to 73
    expect(calculateHealthScore(checks)).toBe(73);
  });

  it('handles missing checks gracefully', () => {
    const checks = {
      database: { status: 'healthy' }, // 35 points
      memory: 'healthy', // 20 points
    };
    // Expected: 35 + 20 = 55 (redis and disk missing = 0 points)
    expect(calculateHealthScore(checks)).toBe(55);
  });

  it('handles not_configured database', () => {
    const checks = {
      database: { status: 'not_configured' }, // 0 points
      redis: { status: 'healthy' }, // 25 points
      memory: 'healthy', // 20 points
      disk: 'healthy', // 20 points
    };
    // Expected: 0 + 25 + 20 + 20 = 65
    expect(calculateHealthScore(checks)).toBe(65);
  });

  it('handles partial memory health', () => {
    const checks = {
      database: { status: 'healthy' }, // 35 points
      redis: { status: 'healthy' }, // 25 points
      memory: 'warning', // 10 points (50% of 20)
      disk: 'healthy', // 20 points
    };
    // Expected: 35 + 25 + 10 + 20 = 90
    expect(calculateHealthScore(checks)).toBe(90);
  });

  it('calculates score with mixed health statuses', () => {
    const checks = {
      database: { status: 'degraded' }, // 17.5 points (50% of 35)
      redis: { status: 'using_fallback' }, // 7.5 points (30% of 25)
      memory: 'degraded', // 10 points (50% of 20)
      disk: 'degraded', // 10 points (50% of 20)
    };
    // Expected: 17.5 + 7.5 + 10 + 10 = 45
    expect(calculateHealthScore(checks)).toBe(45);
  });

  it('handles only memory check present', () => {
    const checks = {
      memory: 'healthy', // 20 points
    };
    // Expected: 20 (only memory is healthy)
    expect(calculateHealthScore(checks)).toBe(20);
  });

  it('handles empty checks object', () => {
    const checks = {};
    // Expected: 0 (no checks pass)
    expect(calculateHealthScore(checks)).toBe(0);
  });
});

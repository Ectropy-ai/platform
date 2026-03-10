import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { AutoMonitor } from './services/auto-monitor';
import path from 'path';

// Mock expensive operations for CI/testing
vi.mock('child_process', () => ({
  execSync: vi.fn((command: string) => {
    if (typeof command === 'string') {
      // Simulate successful builds
      if (command.includes('pnpm nx run') && command.includes(':build')) {
        return Buffer.from('Build successful');
      }
      // Simulate security audit
      if (command.includes('pnpm audit')) {
        return Buffer.from(JSON.stringify({
          metadata: {
            vulnerabilities: { high: 0, critical: 0 }
          }
        }));
      }
    }
    return Buffer.from('');
  })
}));

describe('MCP Server', () => {
  let autoMonitor: AutoMonitor;
  const testRepoRoot = path.resolve(__dirname, '../../..');

  beforeAll(() => {
    autoMonitor = new AutoMonitor(testRepoRoot);
  });

  afterAll(() => {
    if (autoMonitor) {
      autoMonitor.stopMonitoring();
    }
    vi.restoreAllMocks();
  });

  it('should exist and be importable', () => {
    expect(AutoMonitor).toBeDefined();
  });

  it('should create AutoMonitor instance', () => {
    expect(autoMonitor).toBeInstanceOf(AutoMonitor);
  });

  it('should perform health check', async () => {
    const health = await autoMonitor.checkHealth();
    
    expect(health).toHaveProperty('builds');
    expect(health).toHaveProperty('tests');
    expect(health).toHaveProperty('security');
    expect(health).toHaveProperty('performance');
    expect(health).toHaveProperty('score');
    expect(health).toHaveProperty('timestamp');
    expect(health).toHaveProperty('issues');
    
    expect(typeof health.score).toBe('number');
    expect(health.score).toBeGreaterThanOrEqual(0);
    expect(health.score).toBeLessThanOrEqual(100);
    expect(Array.isArray(health.issues)).toBe(true);
  }, 10000); // 10 second timeout for mocked health check

  it('should be able to start and stop monitoring', async () => {
    await expect(autoMonitor.startMonitoring()).resolves.toBeUndefined();
    expect(autoMonitor.stopMonitoring()).toBeUndefined();
  }, 15000); // 15 second timeout for mocked monitoring cycle
});
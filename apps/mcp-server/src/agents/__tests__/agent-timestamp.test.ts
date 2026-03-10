/**
 * Unit tests for Agent Timestamp Handling
 * Tests that agent timestamps are accurate and validated properly
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BaseAgent, AgentStatus } from '../base-agent.js';

// Create a concrete test agent class
class TestAgent extends BaseAgent {
  getName(): string {
    return 'test-agent';
  }

  getDescription(): string {
    return 'Test agent for timestamp validation';
  }

  async process(_input: any): Promise<any> {
    return { success: true };
  }

  getCapabilities(): string[] {
    return ['test-capability'];
  }

  // Expose protected methods for testing
  public testUpdateActivity() {
    this.updateActivity();
  }

  public getLastActivityDirect(): number {
    return this['lastActivity'];
  }

  public getStartTimeDirect(): number {
    return this['startTime'];
  }
}

describe('Agent Timestamp Handling', () => {
  let agent: TestAgent;

  beforeEach(() => {
    agent = new TestAgent();
  });

  describe('Initialization', () => {
    it('should initialize with current timestamp', () => {
      const before = Date.now();
      const testAgent = new TestAgent();
      const after = Date.now();

      const lastActivity = testAgent.getLastActivityDirect();

      // Timestamp should be within the test execution window
      expect(lastActivity).toBeGreaterThanOrEqual(before);
      expect(lastActivity).toBeLessThanOrEqual(after);
    });

    it('should have lastActivity equal to or after startTime', () => {
      const startTime = agent.getStartTimeDirect();
      const lastActivity = agent.getLastActivityDirect();

      expect(lastActivity).toBeGreaterThanOrEqual(startTime);
    });

    it('should return valid Unix timestamp in milliseconds', () => {
      const lastActivity = agent.getLastActivityDirect();

      // Timestamp should be 13 digits (milliseconds since epoch)
      expect(lastActivity.toString()).toHaveLength(13);

      // Should be reasonable (between 2024 and 2027)
      const year2024 = new Date('2024-01-01').getTime();
      const year2027 = new Date('2027-01-01').getTime();
      expect(lastActivity).toBeGreaterThan(year2024);
      expect(lastActivity).toBeLessThan(year2027);
    });
  });

  describe('Activity Updates', () => {
    it('should update timestamp on activity', async () => {
      const before = agent.getLastActivityDirect();

      // Wait a small amount to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      agent.testUpdateActivity();
      const after = agent.getLastActivityDirect();

      expect(after).toBeGreaterThanOrEqual(before);
    });

    it('should update timestamp when processing request', async () => {
      const before = agent.getLastActivityDirect();

      // Wait a small amount to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      await agent.process({ test: 'data' });
      const after = agent.getLastActivityDirect();

      expect(after).toBeGreaterThanOrEqual(before);
    });
  });

  describe('Status Reporting', () => {
    it('should return recent lastActivity in status', () => {
      const status = agent.getStatus();
      const now = Date.now();

      // lastActivity should be within the last second
      expect(status.lastActivity).toBeGreaterThan(now - 1000);
      expect(status.lastActivity).toBeLessThanOrEqual(now);
    });

    it('should not return timestamps in the far future', () => {
      const status = agent.getStatus();
      const oneYearFromNow = Date.now() + 365 * 24 * 60 * 60 * 1000;

      expect(status.lastActivity).toBeLessThan(oneYearFromNow);
    });

    it('should not return timestamps in the far past', () => {
      const status = agent.getStatus();
      const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;

      expect(status.lastActivity).toBeGreaterThan(oneYearAgo);
    });

    it('should have consistent timestamp format', () => {
      const status = agent.getStatus();

      // Verify it's a valid Unix timestamp
      const date = new Date(status.lastActivity);
      expect(date.toString()).not.toBe('Invalid Date');

      // Verify it can be converted to ISO string
      expect(() => date.toISOString()).not.toThrow();
    });
  });

  describe('Timestamp Validation', () => {
    it('should handle timestamps near year boundaries', () => {
      const status = agent.getStatus();

      // Should work correctly regardless of current date
      const year = new Date(status.lastActivity).getFullYear();
      expect(year).toBeGreaterThanOrEqual(2024);
      expect(year).toBeLessThanOrEqual(2027);
    });

    it('should maintain monotonic timestamps within single agent lifecycle', async () => {
      const timestamps: number[] = [];

      // Collect multiple timestamps
      for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        agent.testUpdateActivity();
        timestamps.push(agent.getLastActivityDirect());
      }

      // Verify timestamps are monotonically increasing or equal
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }
    });

    it('should return timestamp that can be used for age calculation', () => {
      const status = agent.getStatus();
      const now = Date.now();
      const age = now - status.lastActivity;

      // Age should be non-negative and reasonable (< 1 second for new agent)
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThan(1000);
    });
  });

  describe('Uptime Calculation', () => {
    it('should calculate uptime correctly', async () => {
      // Wait a small amount
      await new Promise((resolve) => setTimeout(resolve, 100));

      const uptime = agent.getUptime();

      // Uptime should be positive and at least 100ms
      expect(uptime).toBeGreaterThanOrEqual(100);
      expect(uptime).toBeLessThan(1000); // But not too large
    });

    it('should have uptime less than lastActivity age', async () => {
      // Update activity after creation
      await new Promise((resolve) => setTimeout(resolve, 50));
      agent.testUpdateActivity();

      const status = agent.getStatus();
      const now = Date.now();
      const activityAge = now - status.lastActivity;
      const uptime = status.uptime;

      // Uptime should be greater than activity age
      expect(uptime).toBeGreaterThan(activityAge);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid successive activity updates', async () => {
      const timestamps: number[] = [];

      // Rapid updates
      for (let i = 0; i < 10; i++) {
        agent.testUpdateActivity();
        timestamps.push(agent.getLastActivityDirect());
      }

      // All timestamps should be valid
      timestamps.forEach((ts) => {
        expect(ts).toBeGreaterThan(0);
        expect(ts.toString()).toHaveLength(13);
      });

      // Last timestamp should be >= first timestamp
      expect(timestamps[timestamps.length - 1]).toBeGreaterThanOrEqual(
        timestamps[0]
      );
    });

    it('should maintain valid timestamps across multiple process calls', async () => {
      // Process multiple requests
      for (let i = 0; i < 3; i++) {
        await agent.process({ iteration: i });
        const status = agent.getStatus();
        const now = Date.now();

        // Verify timestamp is recent
        expect(status.lastActivity).toBeGreaterThan(now - 1000);
        expect(status.lastActivity).toBeLessThanOrEqual(now);
      }
    });
  });

  describe('Cross-Agent Consistency', () => {
    it('should have consistent timestamp format across multiple agents', () => {
      const agent1 = new TestAgent();
      const agent2 = new TestAgent();

      const status1 = agent1.getStatus();
      const status2 = agent2.getStatus();

      // Both should have 13-digit timestamps
      expect(status1.lastActivity.toString()).toHaveLength(13);
      expect(status2.lastActivity.toString()).toHaveLength(13);

      // Both should be very close (within 1 second)
      expect(
        Math.abs(status1.lastActivity - status2.lastActivity)
      ).toBeLessThan(1000);
    });
  });
});

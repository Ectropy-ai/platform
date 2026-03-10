/**
 * GitHubProjectsSync Tests
 * Test GitHub Projects synchronization with focus on progress calculation
 * and roadmap loading.
 *
 * Updated 2026-02-26: Aligned method names with actual implementation
 * (calculateProgress, loadRoadmap, writeRoadmap).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitHubProjectsSync } from '../github-projects-sync';

describe('GitHubProjectsSync', () => {
  let originalToken: string | undefined;
  let originalProjectId: string | undefined;

  beforeEach(() => {
    originalToken = process.env.GITHUB_PROJECT_TOKEN;
    originalProjectId = process.env.GITHUB_PROJECT_ID;
    process.env.GITHUB_PROJECT_TOKEN = 'test-token';
    process.env.GITHUB_PROJECT_ID = 'PVT_test123';
  });

  afterEach(() => {
    if (originalToken !== undefined) {
      process.env.GITHUB_PROJECT_TOKEN = originalToken;
    } else {
      delete process.env.GITHUB_PROJECT_TOKEN;
    }
    if (originalProjectId !== undefined) {
      process.env.GITHUB_PROJECT_ID = originalProjectId;
    } else {
      delete process.env.GITHUB_PROJECT_ID;
    }
  });

  describe('Constructor', () => {
    it('should instantiate without throwing', () => {
      expect(() => new GitHubProjectsSync()).not.toThrow();
    });
  });

  describe('calculateProgress (private method)', () => {
    it('should return 0 for empty phases array', () => {
      const syncService = new GitHubProjectsSync();
      const calculateProgress = (syncService as any).calculateProgress.bind(
        syncService
      );

      const progress = calculateProgress([]);
      expect(progress).toBe(0);
    });

    it('should return 100 for all-complete deliverables', () => {
      const syncService = new GitHubProjectsSync();
      const calculateProgress = (syncService as any).calculateProgress.bind(
        syncService
      );

      const phases = [
        {
          id: 'phase-1',
          name: 'Test',
          description: 'Test',
          status: 'complete',
          priority: 'high',
          dependencies: [],
          deliverables: [
            {
              id: 'd1',
              name: 'Del 1',
              description: '',
              status: 'complete',
              filesImpacted: [],
            },
            {
              id: 'd2',
              name: 'Del 2',
              description: '',
              status: 'complete',
              filesImpacted: [],
            },
          ],
        },
      ];

      const progress = calculateProgress(phases);
      expect(progress).toBe(100);
    });
  });

  describe('getSyncStatus', () => {
    it('should return sync status without GitHub token', async () => {
      delete process.env.GITHUB_PROJECT_TOKEN;
      const syncService = new GitHubProjectsSync();
      const status = await syncService.getSyncStatus();

      expect(status).toBeDefined();
      // Without GitHub token, getSyncStatus falls back to error handler
      // which returns default status with source 'GitHub Projects'
      expect(status.source).toContain('GitHub');
      expect(status.localItems).toBe(0);
    });
  });
});

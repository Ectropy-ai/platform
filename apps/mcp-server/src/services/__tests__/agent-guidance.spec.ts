/**
 * Agent Guidance Test Suite
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentGuidance, type GuidanceRequest } from '../agent-guidance';

describe('AgentGuidance', () => {
  let guidance: AgentGuidance;

  beforeEach(() => {
    guidance = new AgentGuidance();
  });

  describe('Build Failures Pattern', () => {
    it('should match "build fail" query', () => {
      const request: GuidanceRequest = {
        query: 'How to fix TypeScript build failing?',
      };

      const result = guidance.getGuidance(request);

      expect(result.recommendation).toContain('build analyzer');
      expect(result.estimatedComplexity).toBe('moderate');
    });

    it('should match "build error" query', () => {
      const request: GuidanceRequest = {
        query: 'Build error in mcp-server',
      };

      const result = guidance.getGuidance(request);

      expect(result.recommendation).toContain('build analyzer');
    });

    it('should provide build failure checklist', () => {
      const request: GuidanceRequest = {
        query: 'Webpack compilation error',
      };

      const result = guidance.getGuidance(request);

      expect(result.checklistItems.length).toBeGreaterThan(0);
      expect(result.checklistItems.some(item => item.includes('analyze-build-failure'))).toBe(true);
    });

    it('should warn against common build mistakes', () => {
      const request: GuidanceRequest = {
        query: 'Build failing',
      };

      const result = guidance.getGuidance(request);

      expect(result.commonMistakes.length).toBeGreaterThan(0);
      expect(result.commonMistakes.some(m => m.includes('sed/awk'))).toBe(true);
    });
  });

  describe('Module Resolution Pattern', () => {
    it('should match "module not found" query', () => {
      const request: GuidanceRequest = {
        query: 'Module not found error',
      };

      const result = guidance.getGuidance(request);

      expect(result.recommendation).toContain('tsconfig');
      expect(result.estimatedComplexity).toBe('moderate');
    });

    it('should match "cannot find module" query', () => {
      const request: GuidanceRequest = {
        query: 'Cannot find module @ectropy/shared',
      };

      const result = guidance.getGuidance(request);

      expect(result.recommendation).toContain('dist');
    });

    it('should provide module resolution checklist', () => {
      const request: GuidanceRequest = {
        query: 'Import error',
      };

      const result = guidance.getGuidance(request);

      expect(result.checklistItems.some(item => item.includes('dist/'))).toBe(true);
      expect(result.checklistItems.some(item => item.includes('tsconfig'))).toBe(true);
    });

    it('should warn against import path mistakes', () => {
      const request: GuidanceRequest = {
        query: 'Path mapping issue',
      };

      const result = guidance.getGuidance(request);

      expect(result.commonMistakes.some(m => m.includes('relative paths'))).toBe(true);
    });
  });

  describe('Documentation Needed Pattern', () => {
    it('should match "how to document" query', () => {
      const request: GuidanceRequest = {
        query: 'How to document this feature?',
      };

      const result = guidance.getGuidance(request);

      expect(result.recommendation).toContain('inline');
      expect(result.estimatedComplexity).toBe('simple');
    });

    it('should match "add documentation" query', () => {
      const request: GuidanceRequest = {
        query: 'Need to add documentation',
      };

      const result = guidance.getGuidance(request);

      expect(result.recommendation).toContain('CURRENT_TRUTH');
    });

    it('should warn against creating new .md files', () => {
      const request: GuidanceRequest = {
        query: 'Create guide for troubleshooting',
      };

      const result = guidance.getGuidance(request);

      expect(result.commonMistakes.some(m => m.includes('TROUBLESHOOTING.md'))).toBe(true);
    });

    it('should provide inline documentation checklist', () => {
      const request: GuidanceRequest = {
        query: 'Write docs',
      };

      const result = guidance.getGuidance(request);

      expect(result.checklistItems.some(item => item.includes('WHY'))).toBe(true);
    });
  });

  describe('Test Failures Pattern', () => {
    it('should match "test fail" query', () => {
      const request: GuidanceRequest = {
        query: 'Tests are failing',
      };

      const result = guidance.getGuidance(request);

      expect(result.recommendation).toContain('Fix the test');
      expect(result.estimatedComplexity).toBe('moderate');
    });

    it('should match "spec fail" query', () => {
      const request: GuidanceRequest = {
        query: 'Spec file failing',
      };

      const result = guidance.getGuidance(request);

      expect(result.recommendation).toContain('root cause');
    });

    it('should warn against skipping tests', () => {
      const request: GuidanceRequest = {
        query: 'Jest assertion failed',
      };

      const result = guidance.getGuidance(request);

      expect(result.commonMistakes.some(m => m.includes('it.skip'))).toBe(true);
    });

    it('should provide test debugging checklist', () => {
      const request: GuidanceRequest = {
        query: 'Test error',
      };

      const result = guidance.getGuidance(request);

      expect(result.checklistItems.some(item => item.includes('isolation'))).toBe(true);
    });
  });

  describe('Configuration Changes Pattern', () => {
    it('should match "config change" query', () => {
      const request: GuidanceRequest = {
        query: 'Need to update config',
      };

      const result = guidance.getGuidance(request);

      expect(result.recommendation).toContain('config files');
      expect(result.estimatedComplexity).toBe('simple');
    });

    it('should match "environment variable" query', () => {
      const request: GuidanceRequest = {
        query: 'Add environment variable',
      };

      const result = guidance.getGuidance(request);

      expect(result.recommendation).toContain('config');
    });

    it('should warn against hardcoding', () => {
      const request: GuidanceRequest = {
        query: 'Settings change needed',
      };

      const result = guidance.getGuidance(request);

      expect(result.commonMistakes.some(m => m.includes('Hardcoding'))).toBe(true);
    });
  });

  describe('API Endpoint Changes Pattern', () => {
    it('should match "api endpoint" query', () => {
      const request: GuidanceRequest = {
        query: 'Add new API endpoint',
      };

      const result = guidance.getGuidance(request);

      expect(result.recommendation).toContain('error handling');
      expect(result.estimatedComplexity).toBe('moderate');
    });

    it('should match "route change" query', () => {
      const request: GuidanceRequest = {
        query: 'Need to change route',
      };

      const result = guidance.getGuidance(request);

      expect(result.recommendation).toBeTruthy();
      expect(result.checklistItems.length).toBeGreaterThan(0);
    });

    it('should provide API endpoint checklist', () => {
      const request: GuidanceRequest = {
        query: 'REST API endpoint',
      };

      const result = guidance.getGuidance(request);

      expect(result.checklistItems.some(item => item.includes('TypeScript interfaces'))).toBe(true);
      expect(result.checklistItems.some(item => item.includes('try-catch'))).toBe(true);
    });

    it('should warn against common API mistakes', () => {
      const request: GuidanceRequest = {
        query: 'Add endpoint',
      };

      const result = guidance.getGuidance(request);

      expect(result.commonMistakes.some(m => m.includes('validation'))).toBe(true);
    });
  });

  describe('Default Guidance', () => {
    it('should provide default guidance for unknown query', () => {
      const request: GuidanceRequest = {
        query: 'Something completely unrelated',
      };

      const result = guidance.getGuidance(request);

      expect(result.recommendation).toContain('MCP');
      expect(result.estimatedComplexity).toBe('moderate');
    });

    it('should include MCP validation steps in default', () => {
      const request: GuidanceRequest = {
        query: 'Random task',
      };

      const result = guidance.getGuidance(request);

      expect(result.checklistItems.some(item => item.includes('validate-work-plan'))).toBe(true);
    });

    it('should warn against common mistakes in default', () => {
      const request: GuidanceRequest = {
        query: 'Do something',
      };

      const result = guidance.getGuidance(request);

      expect(result.commonMistakes.length).toBeGreaterThan(0);
    });
  });

  describe('Context Handling', () => {
    it('should use context in pattern matching', () => {
      const request: GuidanceRequest = {
        query: 'How to fix?',
        context: 'Build is failing with TypeScript errors',
      };

      const result = guidance.getGuidance(request);

      expect(result.recommendation).toContain('build analyzer');
    });

    it('should work without context', () => {
      const request: GuidanceRequest = {
        query: 'Module not found',
      };

      const result = guidance.getGuidance(request);

      expect(result).toBeDefined();
      expect(result.recommendation).toBeTruthy();
    });
  });

  describe('Response Structure', () => {
    it('should return all required fields', () => {
      const request: GuidanceRequest = {
        query: 'Test query',
      };

      const result = guidance.getGuidance(request);

      expect(result).toHaveProperty('recommendation');
      expect(result).toHaveProperty('approvedApproach');
      expect(result).toHaveProperty('checklistItems');
      expect(result).toHaveProperty('commonMistakes');
      expect(result).toHaveProperty('validationSteps');
      expect(result).toHaveProperty('estimatedComplexity');
      expect(result).toHaveProperty('estimatedTime');
    });

    it('should have non-empty arrays', () => {
      const request: GuidanceRequest = {
        query: 'Build failing',
      };

      const result = guidance.getGuidance(request);

      expect(result.checklistItems.length).toBeGreaterThan(0);
      expect(result.commonMistakes.length).toBeGreaterThan(0);
      expect(result.validationSteps.length).toBeGreaterThan(0);
    });

    it('should have valid complexity values', () => {
      const request: GuidanceRequest = {
        query: 'Test',
      };

      const result = guidance.getGuidance(request);

      expect(['simple', 'moderate', 'complex']).toContain(result.estimatedComplexity);
    });
  });
});

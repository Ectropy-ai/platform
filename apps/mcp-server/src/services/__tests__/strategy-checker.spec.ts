/**
 * Strategy Checker Test Suite
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StrategyChecker, type StrategyInput } from '../strategy-checker';

describe('StrategyChecker', () => {
  let checker: StrategyChecker;

  beforeEach(() => {
    checker = new StrategyChecker();
  });

  describe('checkRootCause', () => {
    it('should detect symptom treatment with "bypass"', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkRootCause('Bypass the validation', violations, recommendations);
      
      expect(result).toBe(false);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]).toContain('symptoms');
    });

    it('should detect symptom treatment with "disable"', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkRootCause('Disable the error checking', violations, recommendations);
      
      expect(result).toBe(false);
    });

    it('should detect symptom treatment with "ignore"', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkRootCause('Ignore the warning', violations, recommendations);
      
      expect(result).toBe(false);
    });

    it('should pass proper root cause fix', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkRootCause('Fix the root cause of the issue', violations, recommendations);
      
      expect(result).toBe(true);
      expect(violations.length).toBe(0);
    });
  });

  describe('checkWorkarounds', () => {
    it('should detect "quick fix"', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkWorkarounds('Apply quick fix', violations, recommendations);
      
      expect(result).toBe(false);
      expect(violations.length).toBeGreaterThan(0);
    });

    it('should detect "temporary"', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkWorkarounds('Add temporary solution', violations, recommendations);
      
      expect(result).toBe(false);
    });

    it('should detect "workaround"', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkWorkarounds('Use workaround', violations, recommendations);
      
      expect(result).toBe(false);
    });

    it('should detect "hack"', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkWorkarounds('Apply hack to fix', violations, recommendations);
      
      expect(result).toBe(false);
    });

    it('should pass proper solution', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkWorkarounds('Implement proper solution', violations, recommendations);
      
      expect(result).toBe(true);
      expect(violations.length).toBe(0);
    });
  });

  describe('checkSequential', () => {
    it('should detect sequential steps with numbering', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkSequential('Step 1: Do this. Step 2: Do that.', violations, recommendations);
      
      expect(result).toBe(true);
      expect(violations.length).toBe(0);
    });

    it('should detect sequential with "first then"', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkSequential('First do X, then verify Y', violations, recommendations);
      
      expect(result).toBe(true);
    });

    it('should flag complex approach without steps', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      const longApproach = 'A'.repeat(150); // Long without structure
      
      const result = checker.checkSequential(longApproach, violations, recommendations);
      
      expect(result).toBe(false);
      expect(violations.length).toBeGreaterThan(0);
    });

    it('should pass short approaches without structure', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkSequential('Just fix it', violations, recommendations);
      
      expect(result).toBe(true);
    });
  });

  describe('checkDocumentation', () => {
    it('should detect "create .md" pattern', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkDocumentation('Create TROUBLESHOOTING.md', violations, recommendations);
      
      expect(result).toBe(false);
      expect(violations.length).toBeGreaterThan(0);
    });

    it('should detect "new .md" pattern', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkDocumentation('New GUIDE.md file', violations, recommendations);
      
      expect(result).toBe(false);
    });

    it('should pass inline documentation', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkDocumentation('Add inline comments', violations, recommendations);
      
      expect(result).toBe(true);
    });

    it('should pass CURRENT_TRUTH.md update', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkDocumentation('Update CURRENT_TRUTH.md', violations, recommendations);
      
      expect(result).toBe(true);
    });
  });

  describe('checkEvidence', () => {
    it('should flag no validation steps', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkEvidence([], violations, recommendations);
      
      expect(result).toBe(false);
      expect(violations.length).toBeGreaterThan(0);
    });

    it('should flag vague validation steps', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkEvidence(['Check it works'], violations, recommendations);
      
      expect(result).toBe(false);
    });

    it('should pass concrete curl command', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkEvidence(['curl localhost:3001/health'], violations, recommendations);
      
      expect(result).toBe(true);
      expect(violations.length).toBe(0);
    });

    it('should pass test command', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkEvidence(['Run tests'], violations, recommendations);
      
      expect(result).toBe(true);
    });

    it('should pass build command', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkEvidence(['pnpm nx build mcp-server'], violations, recommendations);
      
      expect(result).toBe(true);
    });
  });

  describe('checkMCPFirst', () => {
    it('should detect MCP health check', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkMCPFirst('Query MCP health first', violations, recommendations);
      
      expect(result).toBe(true);
    });

    it('should detect localhost:3001', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkMCPFirst('curl localhost:3001/health', violations, recommendations);
      
      expect(result).toBe(true);
    });

    it('should flag missing MCP check', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkMCPFirst('Just implement the feature', violations, recommendations);
      
      expect(result).toBe(false);
      expect(recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('checkTests', () => {
    it('should detect "skip test"', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkTests('Skip tests for now', violations, recommendations);
      
      expect(result).toBe(false);
      expect(violations.length).toBeGreaterThan(0);
    });

    it('should detect "without test"', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkTests('Implement without tests', violations, recommendations);
      
      expect(result).toBe(false);
    });

    it('should detect "test later"', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkTests('Add feature, test later', violations, recommendations);
      
      expect(result).toBe(false);
    });

    it('should pass when tests included', () => {
      const violations: string[] = [];
      const recommendations: string[] = [];
      
      const result = checker.checkTests('Write tests first', violations, recommendations);
      
      expect(result).toBe(true);
      expect(violations.length).toBe(0);
    });
  });

  describe('calculateScore', () => {
    it('should score 100 for all checks passing', () => {
      const score = checker.calculateScore({
        isRootCauseFix: true,
        avoidsWorkarounds: true,
        followsSequentialApproach: true,
        usesInlineDocumentation: true,
        evidenceBased: true,
        queriesMCPFirst: true,
        maintainsTests: true,
      });
      
      expect(score).toBe(100);
    });

    it('should score 0 for all checks failing', () => {
      const score = checker.calculateScore({
        isRootCauseFix: false,
        avoidsWorkarounds: false,
        followsSequentialApproach: false,
        usesInlineDocumentation: false,
        evidenceBased: false,
        queriesMCPFirst: false,
        maintainsTests: false,
      });
      
      expect(score).toBe(0);
    });

    it('should weight root cause fix at 20 points', () => {
      const score = checker.calculateScore({
        isRootCauseFix: true,
        avoidsWorkarounds: false,
        followsSequentialApproach: false,
        usesInlineDocumentation: false,
        evidenceBased: false,
        queriesMCPFirst: false,
        maintainsTests: false,
      });
      
      expect(score).toBe(20);
    });

    it('should weight workaround avoidance at 20 points', () => {
      const score = checker.calculateScore({
        isRootCauseFix: false,
        avoidsWorkarounds: true,
        followsSequentialApproach: false,
        usesInlineDocumentation: false,
        evidenceBased: false,
        queriesMCPFirst: false,
        maintainsTests: false,
      });
      
      expect(score).toBe(20);
    });
  });

  describe('check integration', () => {
    it('should score perfect strategy highly', () => {
      const input: StrategyInput = {
        approach: 'Step 1: Query MCP health. Step 2: Fix the root cause. Step 3: Write tests first. Step 4: Add inline comments.',
        validationSteps: ['curl localhost:3001/health', 'pnpm nx test mcp-server'],
      };
      
      const result = checker.check(input);
      
      expect(result.score).toBeGreaterThanOrEqual(90);
      expect(result.violations.length).toBe(0);
    });

    it('should detect multiple violations', () => {
      const input: StrategyInput = {
        approach: 'Quick workaround: bypass validation, skip tests, create TROUBLESHOOTING.md',
        validationSteps: [],
      };
      
      const result = checker.check(input);
      
      expect(result.score).toBeLessThan(50);
      expect(result.violations.length).toBeGreaterThan(2);
    });

    it('should provide recommendations', () => {
      const input: StrategyInput = {
        approach: 'Just implement it',
        validationSteps: ['Check it works'],
      };
      
      const result = checker.check(input);
      
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should check all 7 criteria', () => {
      const input: StrategyInput = {
        approach: 'Test approach',
        validationSteps: ['verify'],
      };
      
      const result = checker.check(input);
      
      expect(result).toHaveProperty('isRootCauseFix');
      expect(result).toHaveProperty('avoidsWorkarounds');
      expect(result).toHaveProperty('followsSequentialApproach');
      expect(result).toHaveProperty('usesInlineDocumentation');
      expect(result).toHaveProperty('evidenceBased');
      expect(result).toHaveProperty('queriesMCPFirst');
      expect(result).toHaveProperty('maintainsTests');
    });
  });
});

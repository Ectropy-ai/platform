/**
 * Work Plan Validator Test Suite
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WorkPlanValidator, type WorkPlan } from '../work-plan-validator';

describe('WorkPlanValidator', () => {
  let validator: WorkPlanValidator;

  beforeEach(() => {
    validator = new WorkPlanValidator();
  });

  describe('validateScope', () => {
    it('should flag when too many files impacted (>10)', () => {
      const plan: WorkPlan = {
        taskDescription: 'Refactor',
        proposedApproach: 'Update files',
        filesImpacted: Array(11).fill('src/test.ts'),
        estimatedComplexity: 'complex',
        requiresTests: true,
        requiresDocumentation: false,
      };

      const concerns = validator.validateScope(plan);
      
      expect(concerns.length).toBeGreaterThan(0);
      expect(concerns[0].severity).toBe('high');
      expect(concerns[0].description).toContain('Too many files');
    });

    it('should flag mixed concerns (code + docs)', () => {
      const plan: WorkPlan = {
        taskDescription: 'Update',
        proposedApproach: 'Fix code and docs',
        filesImpacted: ['src/test.ts', 'docs/GUIDE.md'],
        estimatedComplexity: 'simple',
        requiresTests: false,
        requiresDocumentation: false,
      };

      const concerns = validator.validateScope(plan);
      
      const mixedConcern = concerns.find(c => c.description.includes('Mixed concerns'));
      expect(mixedConcern).toBeDefined();
      expect(mixedConcern?.severity).toBe('medium');
    });

    it('should flag new documentation files', () => {
      const plan: WorkPlan = {
        taskDescription: 'Add docs',
        proposedApproach: 'Create guide',
        filesImpacted: ['docs/TROUBLESHOOTING.md'],
        estimatedComplexity: 'simple',
        requiresTests: false,
        requiresDocumentation: true,
      };

      const concerns = validator.validateScope(plan);
      
      const docConcern = concerns.find(c => c.category === 'scope' && c.severity === 'critical');
      expect(docConcern).toBeDefined();
      expect(docConcern?.description).toContain('Creating new documentation files');
    });

    it('should allow README.md', () => {
      const plan: WorkPlan = {
        taskDescription: 'Update README',
        proposedApproach: 'Fix typos',
        filesImpacted: ['README.md'],
        estimatedComplexity: 'simple',
        requiresTests: false,
        requiresDocumentation: true,
      };

      const concerns = validator.validateScope(plan);
      
      const docConcern = concerns.find(c => c.description.includes('Creating new documentation'));
      expect(docConcern).toBeUndefined();
    });

    it('should allow CURRENT_TRUTH.md', () => {
      const plan: WorkPlan = {
        taskDescription: 'Update truth',
        proposedApproach: 'Add status',
        filesImpacted: ['docs/CURRENT_TRUTH.md'],
        estimatedComplexity: 'simple',
        requiresTests: false,
        requiresDocumentation: true,
      };

      const concerns = validator.validateScope(plan);
      
      const docConcern = concerns.find(c => c.description.includes('Creating new documentation'));
      expect(docConcern).toBeUndefined();
    });
  });

  describe('validateApproach', () => {
    it('should detect "quick fix" workaround', () => {
      const plan: WorkPlan = {
        taskDescription: 'Fix bug',
        proposedApproach: 'Apply quick fix to resolve issue',
        filesImpacted: ['src/test.ts'],
        estimatedComplexity: 'simple',
        requiresTests: false,
        requiresDocumentation: false,
      };

      const concerns = validator.validateApproach(plan);
      
      expect(concerns.length).toBeGreaterThan(0);
      expect(concerns[0].severity).toBe('critical');
      expect(concerns[0].description).toContain('Workaround detected');
    });

    it('should detect "temporary" workaround', () => {
      const plan: WorkPlan = {
        taskDescription: 'Fix',
        proposedApproach: 'Add temporary solution',
        filesImpacted: ['src/test.ts'],
        estimatedComplexity: 'simple',
        requiresTests: false,
        requiresDocumentation: false,
      };

      const concerns = validator.validateApproach(plan);
      
      const workaroundConcern = concerns.find(c => c.description.includes('Workaround detected'));
      expect(workaroundConcern).toBeDefined();
      expect(workaroundConcern?.severity).toBe('critical');
    });

    it('should detect "hack" workaround', () => {
      const plan: WorkPlan = {
        taskDescription: 'Fix',
        proposedApproach: 'Use a hack to get it working',
        filesImpacted: ['src/test.ts'],
        estimatedComplexity: 'simple',
        requiresTests: false,
        requiresDocumentation: false,
      };

      const concerns = validator.validateApproach(plan);
      
      expect(concerns.some(c => c.description.includes('Workaround detected'))).toBe(true);
    });

    it('should detect "skip tests" shortcut', () => {
      const plan: WorkPlan = {
        taskDescription: 'Add feature',
        proposedApproach: 'Implement feature, skip tests for now',
        filesImpacted: ['src/test.ts'],
        estimatedComplexity: 'simple',
        requiresTests: false,
        requiresDocumentation: false,
      };

      const concerns = validator.validateApproach(plan);
      
      const shortcutConcern = concerns.find(c => c.description.includes('Shortcut detected'));
      expect(shortcutConcern).toBeDefined();
      expect(shortcutConcern?.severity).toBe('high');
    });

    it('should detect "add later" shortcut', () => {
      const plan: WorkPlan = {
        taskDescription: 'Feature',
        proposedApproach: 'Implement now, add error handling later',
        filesImpacted: ['src/test.ts'],
        estimatedComplexity: 'simple',
        requiresTests: false,
        requiresDocumentation: false,
      };

      const concerns = validator.validateApproach(plan);
      
      expect(concerns.some(c => c.description.includes('Shortcut detected'))).toBe(true);
    });

    it('should detect "@ts-ignore" shortcut', () => {
      const plan: WorkPlan = {
        taskDescription: 'Fix',
        proposedApproach: 'Use @ts-ignore to bypass type error',
        filesImpacted: ['src/test.ts'],
        estimatedComplexity: 'simple',
        requiresTests: false,
        requiresDocumentation: false,
      };

      const concerns = validator.validateApproach(plan);
      
      expect(concerns.some(c => c.description.includes('Shortcut detected'))).toBe(true);
    });

    it('should pass clean approach', () => {
      const plan: WorkPlan = {
        taskDescription: 'Add feature',
        proposedApproach: 'Implement proper solution with tests',
        filesImpacted: ['src/test.ts'],
        estimatedComplexity: 'simple',
        requiresTests: true,
        requiresDocumentation: false,
      };

      const concerns = validator.validateApproach(plan);
      
      expect(concerns.length).toBe(0);
    });
  });

  describe('validateTesting', () => {
    it('should flag code changes without tests', () => {
      const plan: WorkPlan = {
        taskDescription: 'Add feature',
        proposedApproach: 'Implement new API endpoint',
        filesImpacted: ['src/api.ts'],
        estimatedComplexity: 'simple',
        requiresTests: false,
        requiresDocumentation: false,
      };

      const concerns = validator.validateTesting(plan);
      
      expect(concerns.length).toBeGreaterThan(0);
      expect(concerns[0].severity).toBe('high');
      expect(concerns[0].description).toContain('without tests');
    });

    it('should flag "add tests later"', () => {
      const plan: WorkPlan = {
        taskDescription: 'Feature',
        proposedApproach: 'Implement feature, add tests later',
        filesImpacted: ['src/test.ts'],
        estimatedComplexity: 'simple',
        requiresTests: false,
        requiresDocumentation: false,
      };

      const concerns = validator.validateTesting(plan);
      
      const deferredConcern = concerns.find(c => c.description.includes('deferred'));
      expect(deferredConcern).toBeDefined();
      expect(deferredConcern?.severity).toBe('critical');
    });

    it('should flag "tests in follow-up"', () => {
      const plan: WorkPlan = {
        taskDescription: 'Feature',
        proposedApproach: 'Add feature, tests in follow-up PR',
        filesImpacted: ['src/test.ts'],
        estimatedComplexity: 'simple',
        requiresTests: false,
        requiresDocumentation: false,
      };

      const concerns = validator.validateTesting(plan);
      
      expect(concerns.some(c => c.description.includes('deferred'))).toBe(true);
    });

    it('should suggest test-first for complex features', () => {
      const plan: WorkPlan = {
        taskDescription: 'Complex feature',
        proposedApproach: 'Implement complex logic',
        filesImpacted: ['src/test.ts'],
        estimatedComplexity: 'complex',
        requiresTests: true,
        requiresDocumentation: false,
      };

      const concerns = validator.validateTesting(plan);
      
      const testFirstConcern = concerns.find(c => c.description.includes('test-first'));
      expect(testFirstConcern).toBeDefined();
      expect(testFirstConcern?.severity).toBe('low');
    });

    it('should pass when tests are planned', () => {
      const plan: WorkPlan = {
        taskDescription: 'Add feature',
        proposedApproach: 'Write tests first, then implement',
        filesImpacted: ['src/test.ts', 'src/test.spec.ts'],
        estimatedComplexity: 'simple',
        requiresTests: true,
        requiresDocumentation: false,
      };

      const concerns = validator.validateTesting(plan);
      
      const criticalConcerns = concerns.filter(c => c.severity === 'critical' || c.severity === 'high');
      expect(criticalConcerns.length).toBe(0);
    });
  });

  describe('validateDocumentation', () => {
    it('should flag new .md files', () => {
      const plan: WorkPlan = {
        taskDescription: 'Add docs',
        proposedApproach: 'Create TROUBLESHOOTING.md',
        filesImpacted: ['TROUBLESHOOTING.md'],
        estimatedComplexity: 'simple',
        requiresTests: false,
        requiresDocumentation: true,
      };

      const concerns = validator.validateDocumentation(plan);
      
      expect(concerns.length).toBeGreaterThan(0);
      expect(concerns[0].severity).toBe('critical');
      expect(concerns[0].description).toContain('inline policy');
    });

    it('should suggest inline comments for complex logic', () => {
      const plan: WorkPlan = {
        taskDescription: 'Complex feature',
        proposedApproach: 'Implement algorithm',
        filesImpacted: ['src/algo.ts'],
        estimatedComplexity: 'complex',
        requiresTests: true,
        requiresDocumentation: true,
      };

      const concerns = validator.validateDocumentation(plan);
      
      const inlineConcern = concerns.find(c => c.description.includes('inline comments'));
      expect(inlineConcern).toBeDefined();
    });

    it('should suggest CURRENT_TRUTH.md for platform changes', () => {
      const plan: WorkPlan = {
        taskDescription: 'Update config',
        proposedApproach: 'Change server config',
        filesImpacted: ['src/config/server.ts'],
        estimatedComplexity: 'simple',
        requiresTests: false,
        requiresDocumentation: true,
      };

      const concerns = validator.validateDocumentation(plan);
      
      const truthConcern = concerns.find(c => c.description.includes('CURRENT_TRUTH'));
      expect(truthConcern).toBeDefined();
      expect(truthConcern?.severity).toBe('medium');
    });

    it('should pass when CURRENT_TRUTH.md is included', () => {
      const plan: WorkPlan = {
        taskDescription: 'Update config',
        proposedApproach: 'Change server config and update docs',
        filesImpacted: ['src/config/server.ts', 'docs/CURRENT_TRUTH.md'],
        estimatedComplexity: 'simple',
        requiresTests: false,
        requiresDocumentation: true,
      };

      const concerns = validator.validateDocumentation(plan);
      
      const truthConcern = concerns.find(c => c.description.includes('CURRENT_TRUTH'));
      expect(truthConcern).toBeUndefined();
    });
  });

  describe('validateStrategy', () => {
    it('should flag missing verification steps', () => {
      const plan: WorkPlan = {
        taskDescription: 'Add feature',
        proposedApproach: 'Just implement it',
        filesImpacted: ['src/test.ts'],
        estimatedComplexity: 'simple',
        requiresTests: false,
        requiresDocumentation: false,
      };

      const concerns = validator.validateStrategy(plan);
      
      const verifyConcern = concerns.find(c => c.description.includes('verification'));
      expect(verifyConcern).toBeDefined();
      expect(verifyConcern?.severity).toBe('medium');
    });

    it('should flag missing sequential steps for complex tasks', () => {
      const plan: WorkPlan = {
        taskDescription: 'Complex refactor',
        proposedApproach: 'Refactor everything',
        filesImpacted: ['src/test.ts'],
        estimatedComplexity: 'complex',
        requiresTests: true,
        requiresDocumentation: false,
      };

      const concerns = validator.validateStrategy(plan);
      
      const sequentialConcern = concerns.find(c => c.description.includes('sequential'));
      expect(sequentialConcern).toBeDefined();
    });

    it('should flag missing MCP health check', () => {
      const plan: WorkPlan = {
        taskDescription: 'Fix bug',
        proposedApproach: 'Apply fix and verify',
        filesImpacted: ['src/test.ts'],
        estimatedComplexity: 'simple',
        requiresTests: false,
        requiresDocumentation: false,
      };

      const concerns = validator.validateStrategy(plan);
      
      const mcpConcern = concerns.find(c => c.description.includes('MCP health'));
      expect(mcpConcern).toBeDefined();
      expect(mcpConcern?.severity).toBe('low');
    });

    it('should pass with proper strategy', () => {
      const plan: WorkPlan = {
        taskDescription: 'Add feature',
        proposedApproach: 'Step 1: Query MCP health (curl localhost:3001/health). Step 2: Implement. Step 3: Verify with tests.',
        filesImpacted: ['src/test.ts'],
        estimatedComplexity: 'simple',
        requiresTests: true,
        requiresDocumentation: false,
      };

      const concerns = validator.validateStrategy(plan);
      
      expect(concerns.length).toBe(0);
    });
  });

  describe('calculateScore', () => {
    it('should start at 100 for no concerns', () => {
      const score = validator.calculateScore([]);
      expect(score).toBe(100);
    });

    it('should deduct 40 points for critical', () => {
      const concerns = [{
        category: 'approach' as const,
        severity: 'critical' as const,
        description: 'Test',
        suggestion: 'Fix',
      }];
      
      const score = validator.calculateScore(concerns);
      expect(score).toBe(60);
    });

    it('should deduct 25 points for high', () => {
      const concerns = [{
        category: 'testing' as const,
        severity: 'high' as const,
        description: 'Test',
        suggestion: 'Fix',
      }];
      
      const score = validator.calculateScore(concerns);
      expect(score).toBe(75);
    });

    it('should deduct 15 points for medium', () => {
      const concerns = [{
        category: 'strategy' as const,
        severity: 'medium' as const,
        description: 'Test',
        suggestion: 'Fix',
      }];
      
      const score = validator.calculateScore(concerns);
      expect(score).toBe(85);
    });

    it('should deduct 5 points for low', () => {
      const concerns = [{
        category: 'strategy' as const,
        severity: 'low' as const,
        description: 'Test',
        suggestion: 'Fix',
      }];
      
      const score = validator.calculateScore(concerns);
      expect(score).toBe(95);
    });

    it('should not go below 0', () => {
      const concerns = Array(10).fill({
        category: 'approach',
        severity: 'critical',
        description: 'Test',
        suggestion: 'Fix',
      });
      
      const score = validator.calculateScore(concerns);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('generateRecommendation', () => {
    it('should reject on critical concerns', () => {
      const concerns = [{
        category: 'approach' as const,
        severity: 'critical' as const,
        description: 'Test',
        suggestion: 'Fix',
      }];
      
      const recommendation = validator.generateRecommendation(100, concerns);
      expect(recommendation).toBe('reject');
    });

    it('should reject when score < 40', () => {
      const recommendation = validator.generateRecommendation(35, []);
      expect(recommendation).toBe('reject');
    });

    it('should revise when score 40-69', () => {
      const recommendation = validator.generateRecommendation(50, []);
      expect(recommendation).toBe('revise');
    });

    it('should proceed when score >= 70', () => {
      const recommendation = validator.generateRecommendation(80, []);
      expect(recommendation).toBe('proceed');
    });
  });

  describe('validate integration', () => {
    it('should approve good work plan', () => {
      const plan: WorkPlan = {
        taskDescription: 'Add error handling to API endpoint',
        proposedApproach: 'Step 1: Query MCP health. Step 2: Implement try-catch. Step 3: Write tests first. Step 4: Verify with curl.',
        filesImpacted: ['apps/api/src/routes/users.ts', 'apps/api/src/routes/users.spec.ts'],
        estimatedComplexity: 'simple',
        requiresTests: true,
        requiresDocumentation: false,
      };

      const result = validator.validate(plan);
      
      expect(result.approved).toBe(true);
      expect(result.recommendation).toBe('proceed');
      expect(result.score).toBeGreaterThanOrEqual(70);
    });

    it('should reject bad work plan', () => {
      const plan: WorkPlan = {
        taskDescription: 'Fix auth bug',
        proposedApproach: 'Quick workaround using @ts-ignore, will fix properly later',
        filesImpacted: ['apps/api/src/auth.ts', 'TROUBLESHOOTING.md'],
        estimatedComplexity: 'simple',
        requiresTests: false,
        requiresDocumentation: false,
      };

      const result = validator.validate(plan);
      
      expect(result.approved).toBe(false);
      expect(result.recommendation).toBe('reject');
      expect(result.concerns.length).toBeGreaterThan(0);
    });

    it('should generate suggestions', () => {
      const plan: WorkPlan = {
        taskDescription: 'Fix',
        proposedApproach: 'Quick fix',
        filesImpacted: ['src/test.ts'],
        estimatedComplexity: 'simple',
        requiresTests: false,
        requiresDocumentation: false,
      };

      const result = validator.validate(plan);
      
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should generate required checks', () => {
      const plan: WorkPlan = {
        taskDescription: 'Add feature',
        proposedApproach: 'Implement properly with tests',
        filesImpacted: ['src/test.ts'],
        estimatedComplexity: 'simple',
        requiresTests: true,
        requiresDocumentation: false,
      };

      const result = validator.validate(plan);
      
      expect(result.requiredChecks.length).toBeGreaterThan(0);
      expect(result.requiredChecks.some(c => c.includes('MCP health'))).toBe(true);
    });
  });
});

/**
 * Agent Guidance Integration Test Suite
 * End-to-end testing of the complete AI agent guidance workflow
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WorkPlanValidator } from '../services/work-plan-validator';
import { StrategyChecker } from '../services/strategy-checker';
import { AgentGuidance } from '../services/agent-guidance';

describe('Agent Guidance Integration', () => {
  let workPlanValidator: WorkPlanValidator;
  let strategyChecker: StrategyChecker;
  let agentGuidance: AgentGuidance;

  beforeEach(() => {
    workPlanValidator = new WorkPlanValidator();
    strategyChecker = new StrategyChecker();
    agentGuidance = new AgentGuidance();
  });

  describe('Complete Workflow: Query → Validate → Check → Implement', () => {
    it('should guide agent through successful implementation', () => {
      // Step 1: Agent queries for guidance
      const guidanceRequest = {
        query: 'How to fix TypeScript build error?',
        context: 'Module not found in api-gateway',
      };

      const guidance = agentGuidance.getGuidance(guidanceRequest);
      
      expect(guidance.recommendation).toBeTruthy();
      expect(guidance.checklistItems.length).toBeGreaterThan(0);

      // Step 2: Agent creates work plan based on guidance
      const workPlan = {
        taskDescription: 'Fix module resolution in api-gateway',
        proposedApproach: guidance.approvedApproach,
        filesImpacted: ['apps/api-gateway/src/main.ts', 'tsconfig.base.json'],
        estimatedComplexity: 'moderate' as const,
        requiresTests: true,
        requiresDocumentation: true,
      };

      // Step 3: Validate work plan
      const validation = workPlanValidator.validate(workPlan);
      
      // Should have some concerns due to missing details
      expect(validation.score).toBeGreaterThan(0);
      expect(validation.recommendation).toBeDefined();

      // Step 4: Check strategy alignment
      const strategyCheck = strategyChecker.check({
        approach: workPlan.proposedApproach,
        validationSteps: guidance.validationSteps,
      });

      expect(strategyCheck.score).toBeGreaterThan(0);
      expect(strategyCheck).toHaveProperty('violations');
      expect(strategyCheck).toHaveProperty('recommendations');
    });

    it('should reject bad work plan workflow', () => {
      // Step 1: Agent queries for guidance but ignores it
      const guidanceRequest = {
        query: 'Fix auth bug',
      };

      const guidance = agentGuidance.getGuidance(guidanceRequest);

      // Step 2: Agent creates bad work plan (ignoring guidance)
      const badWorkPlan = {
        taskDescription: 'Fix auth',
        proposedApproach: 'Quick workaround using @ts-ignore, will fix later',
        filesImpacted: ['apps/api/src/auth.ts', 'TROUBLESHOOTING.md'],
        estimatedComplexity: 'simple' as const,
        requiresTests: false,
        requiresDocumentation: false,
      };

      // Step 3: Validate work plan (should reject)
      const validation = workPlanValidator.validate(badWorkPlan);
      
      expect(validation.approved).toBe(false);
      expect(validation.recommendation).toBe('reject');
      expect(validation.concerns.length).toBeGreaterThan(0);
      expect(validation.score).toBeLessThan(70);

      // Step 4: Check strategy (should have violations)
      const strategyCheck = strategyChecker.check({
        approach: badWorkPlan.proposedApproach,
        validationSteps: [],
      });

      expect(strategyCheck.score).toBeLessThan(50);
      expect(strategyCheck.violations.length).toBeGreaterThan(0);
    });
  });

  describe('Guidance → Work Plan Flow', () => {
    it('should provide guidance that passes validation', () => {
      const guidance = agentGuidance.getGuidance({
        query: 'Add new API endpoint',
      });

      // Create work plan from guidance
      const workPlan = {
        taskDescription: 'Add user profile endpoint',
        proposedApproach: guidance.approvedApproach,
        filesImpacted: ['apps/api/src/routes/users.ts'],
        estimatedComplexity: guidance.estimatedComplexity,
        requiresTests: true,
        requiresDocumentation: false,
      };

      const validation = workPlanValidator.validate(workPlan);

      // Guidance-based plans should score reasonably well
      expect(validation.score).toBeGreaterThan(50);
    });

    it('should handle build failure scenario end-to-end', () => {
      // 1. Get guidance for build failure
      const guidance = agentGuidance.getGuidance({
        query: 'Build failing in mcp-server',
        context: 'TypeScript compilation errors',
      });

      expect(guidance.recommendation).toContain('analyzer');

      // 2. Create work plan following guidance
      const workPlan = {
        taskDescription: 'Fix TypeScript build errors',
        proposedApproach: 'Step 1: Query MCP health. Step 2: Analyze build failure. Step 3: Apply fix. Step 4: Verify with tests.',
        filesImpacted: ['apps/mcp-server/tsconfig.json'],
        estimatedComplexity: 'moderate' as const,
        requiresTests: true,
        requiresDocumentation: true,
      };

      const validation = workPlanValidator.validate(workPlan);
      
      // Should pass or require revision, not reject
      expect(validation.recommendation).not.toBe('reject');

      // 3. Check strategy
      const strategyCheck = strategyChecker.check({
        approach: workPlan.proposedApproach,
        validationSteps: guidance.validationSteps,
      });

      expect(strategyCheck.followsSequentialApproach).toBe(true);
      expect(strategyCheck.evidenceBased).toBe(true);
    });
  });

  describe('Strategy Alignment with Work Plan', () => {
    it('should align strategy check with work plan validation', () => {
      const workPlan = {
        taskDescription: 'Add feature',
        proposedApproach: 'Implement proper solution with tests',
        filesImpacted: ['src/feature.ts'],
        estimatedComplexity: 'simple' as const,
        requiresTests: true,
        requiresDocumentation: false,
      };

      const validation = workPlanValidator.validate(workPlan);
      const strategyCheck = strategyChecker.check({
        approach: workPlan.proposedApproach,
        validationSteps: ['pnpm nx test', 'pnpm nx build'],
      });

      // Both should agree on approval
      if (validation.approved) {
        expect(strategyCheck.score).toBeGreaterThan(50);
      }
    });

    it('should both reject workaround approaches', () => {
      const workPlan = {
        taskDescription: 'Fix issue',
        proposedApproach: 'Quick hack to bypass validation',
        filesImpacted: ['src/test.ts'],
        estimatedComplexity: 'simple' as const,
        requiresTests: false,
        requiresDocumentation: false,
      };

      const validation = workPlanValidator.validate(workPlan);
      const strategyCheck = strategyChecker.check({
        approach: workPlan.proposedApproach,
        validationSteps: [],
      });

      // Both should detect workarounds
      expect(validation.approved).toBe(false);
      expect(strategyCheck.avoidsWorkarounds).toBe(false);
    });
  });

  describe('Feedback Loop: Improve Based on Validation', () => {
    it('should provide suggestions to improve rejected plan', () => {
      // Initial bad plan
      const initialPlan = {
        taskDescription: 'Update',
        proposedApproach: 'Quick fix',
        filesImpacted: ['src/test.ts'],
        estimatedComplexity: 'simple' as const,
        requiresTests: false,
        requiresDocumentation: false,
      };

      const validation = workPlanValidator.validate(initialPlan);
      
      expect(validation.approved).toBe(false);
      expect(validation.suggestions.length).toBeGreaterThan(0);

      // Improved plan based on suggestions
      const improvedPlan = {
        taskDescription: 'Update feature with proper implementation',
        proposedApproach: 'Step 1: Query MCP health. Step 2: Implement root cause fix. Step 3: Write tests. Step 4: Verify.',
        filesImpacted: ['src/test.ts', 'src/test.spec.ts'],
        estimatedComplexity: 'simple' as const,
        requiresTests: true,
        requiresDocumentation: false,
      };

      const improvedValidation = workPlanValidator.validate(improvedPlan);
      
      // Improved plan should score better
      expect(improvedValidation.score).toBeGreaterThan(validation.score);
    });
  });

  describe('Complex Scenario: Multiple Services', () => {
    it('should handle complex task requiring all three services', () => {
      // 1. Get guidance
      const guidance = agentGuidance.getGuidance({
        query: 'Refactor authentication system',
        context: 'Need to improve security and add MFA support',
      });

      expect(guidance).toBeDefined();

      // 2. Create comprehensive work plan
      const workPlan = {
        taskDescription: 'Refactor auth system with MFA',
        proposedApproach: [
          'Step 1: Query MCP health',
          'Step 2: Design new auth flow',
          'Step 3: Implement MFA logic with proper error handling',
          'Step 4: Write comprehensive tests',
          'Step 5: Update inline documentation',
          'Step 6: Verify with integration tests',
        ].join('. '),
        filesImpacted: [
          'apps/api/src/auth/mfa.ts',
          'apps/api/src/auth/mfa.spec.ts',
          'apps/api/src/middleware/auth.ts',
          'docs/CURRENT_TRUTH.md',
        ],
        estimatedComplexity: 'complex' as const,
        requiresTests: true,
        requiresDocumentation: true,
      };

      // 3. Validate work plan
      const validation = workPlanValidator.validate(workPlan);
      
      expect(validation.score).toBeGreaterThan(0);

      // 4. Check strategy
      const strategyCheck = strategyChecker.check({
        approach: workPlan.proposedApproach,
        validationSteps: [
          'curl localhost:3001/health',
          'pnpm nx test api',
          'pnpm nx build api',
        ],
      });

      expect(strategyCheck.score).toBeGreaterThan(0);

      // 5. Verify alignment
      expect(strategyCheck.followsSequentialApproach).toBe(true);
      expect(strategyCheck.evidenceBased).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty validation steps gracefully', () => {
      const strategyCheck = strategyChecker.check({
        approach: 'Do something',
        validationSteps: [],
      });

      expect(strategyCheck.evidenceBased).toBe(false);
      expect(strategyCheck.violations.some(v => v.includes('validation'))).toBe(true);
    });

    it('should handle minimal work plan', () => {
      const workPlan = {
        taskDescription: 'Fix',
        proposedApproach: 'Fix it',
        filesImpacted: [],
        estimatedComplexity: 'simple' as const,
        requiresTests: false,
        requiresDocumentation: false,
      };

      const validation = workPlanValidator.validate(workPlan);

      // Should still provide feedback
      expect(validation).toBeDefined();
      expect(validation.score).toBeDefined();
    });

    it('should provide guidance for vague queries', () => {
      const guidance = agentGuidance.getGuidance({
        query: 'Help',
      });

      // Should return default guidance
      expect(guidance).toBeDefined();
      expect(guidance.recommendation).toBeTruthy();
      expect(guidance.checklistItems.length).toBeGreaterThan(0);
    });
  });
});

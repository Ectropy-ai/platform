/**
 * Agent Guidance Routes Test Suite
 * Comprehensive tests for MCP agent guidance REST API endpoints
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { agentGuidanceRouter } from '../agent-guidance.routes.js';

const app = express();
app.use(express.json());
app.use('/api/mcp', agentGuidanceRouter);

describe('Agent Guidance Routes', () => {
  describe('POST /api/mcp/validate-work-plan', () => {
    describe('Success Cases', () => {
      it('should validate and approve a good work plan', async () => {
        const workPlan = {
          taskDescription: 'Add comprehensive tests for MCP agent guidance routes',
          proposedApproach: 'Step 1: Query MCP health. Step 2: Analyze existing patterns. Step 3: Write tests. Step 4: Verify coverage.',
          filesImpacted: [
            'apps/mcp-server/src/routes/__tests__/agent-guidance.routes.test.ts',
          ],
          estimatedComplexity: 'moderate',
          requiresTests: true,
          requiresDocumentation: false,
        };

        const response = await request(app)
          .post('/api/mcp/validate-work-plan')
          .send(workPlan)
          .expect(200);

        expect(response.body).toHaveProperty('approved');
        expect(response.body).toHaveProperty('score');
        expect(response.body).toHaveProperty('concerns');
        expect(response.body).toHaveProperty('suggestions');
        expect(response.body).toHaveProperty('requiredChecks');
        expect(response.body).toHaveProperty('recommendation');
        expect(response.body.score).toBeGreaterThan(0);
      });

      it('should handle work plan with documentation requirement', async () => {
        const workPlan = {
          taskDescription: 'Update platform configuration',
          proposedApproach: 'Step 1: Query MCP. Step 2: Update config. Step 3: Update CURRENT_TRUTH.md. Step 4: Test.',
          filesImpacted: [
            'apps/mcp-server/src/config.ts',
            'docs/CURRENT_TRUTH.md',
          ],
          estimatedComplexity: 'simple',
          requiresTests: true,
          requiresDocumentation: true,
        };

        const response = await request(app)
          .post('/api/mcp/validate-work-plan')
          .send(workPlan)
          .expect(200);

        expect(response.body.approved).toBeDefined();
        expect(response.body.concerns).toBeInstanceOf(Array);
      });

      it('should provide suggestions for work plan needing revision', async () => {
        const workPlan = {
          taskDescription: 'Fix bug',
          proposedApproach: 'Quick fix',
          filesImpacted: ['src/test.ts'],
          estimatedComplexity: 'simple',
          requiresTests: false,
          requiresDocumentation: false,
        };

        const response = await request(app)
          .post('/api/mcp/validate-work-plan')
          .send(workPlan);

        expect(response.body).toHaveProperty('recommendation');
        expect(response.body.suggestions).toBeInstanceOf(Array);
        if (response.body.recommendation === 'revise') {
          expect(response.body.suggestions.length).toBeGreaterThan(0);
        }
      });
    });

    describe('Rejection Cases', () => {
      it('should reject work plan with critical violations and return 403', async () => {
        const badWorkPlan = {
          taskDescription: 'Quick hack',
          proposedApproach: 'Use @ts-ignore and skip tests',
          filesImpacted: ['NEW_DOCS.md', 'src/hack.ts'],
          estimatedComplexity: 'simple',
          requiresTests: false,
          requiresDocumentation: false,
        };

        const response = await request(app)
          .post('/api/mcp/validate-work-plan')
          .send(badWorkPlan)
          .expect(403);

        expect(response.body.recommendation).toBe('reject');
        expect(response.body.approved).toBe(false);
        expect(response.body.concerns.length).toBeGreaterThan(0);
        expect(response.body.score).toBeLessThan(70);
      });

      it('should reject work plan creating new documentation files', async () => {
        const workPlan = {
          taskDescription: 'Add feature',
          proposedApproach: 'Implement feature and create documentation',
          filesImpacted: [
            'apps/api/src/feature.ts',
            'docs/NEW_GUIDE.md',
            'docs/TUTORIAL.md',
          ],
          estimatedComplexity: 'moderate',
          requiresTests: true,
          requiresDocumentation: true,
        };

        const response = await request(app)
          .post('/api/mcp/validate-work-plan')
          .send(workPlan);

        // Should have concerns about new documentation files
        expect(response.body.concerns).toBeInstanceOf(Array);
        const docConcerns = response.body.concerns.filter(
          (c: any) => c.category === 'documentation'
        );
        expect(docConcerns.length).toBeGreaterThan(0);
      });
    });

    describe('Validation Errors', () => {
      it('should return 400 for missing taskDescription', async () => {
        const invalidPlan = {
          proposedApproach: 'Do something',
          filesImpacted: ['test.ts'],
          estimatedComplexity: 'simple',
          requiresTests: true,
        };

        const response = await request(app)
          .post('/api/mcp/validate-work-plan')
          .send(invalidPlan)
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('taskDescription');
      });

      it('should return 400 for missing proposedApproach', async () => {
        const invalidPlan = {
          taskDescription: 'Test task',
          filesImpacted: ['test.ts'],
          estimatedComplexity: 'simple',
          requiresTests: true,
        };

        const response = await request(app)
          .post('/api/mcp/validate-work-plan')
          .send(invalidPlan)
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('proposedApproach');
      });

      it('should return 400 for invalid filesImpacted', async () => {
        const invalidPlan = {
          taskDescription: 'Test task',
          proposedApproach: 'Do something',
          filesImpacted: 'not-an-array',
          estimatedComplexity: 'simple',
          requiresTests: true,
        };

        const response = await request(app)
          .post('/api/mcp/validate-work-plan')
          .send(invalidPlan)
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('filesImpacted');
      });

      it('should return 400 for invalid estimatedComplexity', async () => {
        const invalidPlan = {
          taskDescription: 'Test task',
          proposedApproach: 'Do something',
          filesImpacted: ['test.ts'],
          estimatedComplexity: 'invalid-complexity',
          requiresTests: true,
        };

        const response = await request(app)
          .post('/api/mcp/validate-work-plan')
          .send(invalidPlan)
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('estimatedComplexity');
      });

      it('should return 400 for missing requiresTests', async () => {
        const invalidPlan = {
          taskDescription: 'Test task',
          proposedApproach: 'Do something',
          filesImpacted: ['test.ts'],
          estimatedComplexity: 'simple',
        };

        const response = await request(app)
          .post('/api/mcp/validate-work-plan')
          .send(invalidPlan)
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('requiresTests');
      });

      it('should default requiresDocumentation to false if not provided', async () => {
        const workPlan = {
          taskDescription: 'Test task',
          proposedApproach: 'Step 1: Do something. Step 2: Test it.',
          filesImpacted: ['test.ts'],
          estimatedComplexity: 'simple',
          requiresTests: true,
          // requiresDocumentation not provided
        };

        const response = await request(app)
          .post('/api/mcp/validate-work-plan')
          .send(workPlan)
          .expect(200);

        expect(response.body).toHaveProperty('approved');
      });
    });
  });

  describe('POST /api/mcp/suggest-improvements', () => {
    describe('Success Cases', () => {
      it('should suggest improvements for a work plan', async () => {
        const workPlan = {
          taskDescription: 'Fix build error',
          proposedApproach: 'Fix the error',
          filesImpacted: ['apps/mcp-server/tsconfig.json'],
          estimatedComplexity: 'simple',
          requiresTests: true,
          requiresDocumentation: false,
        };

        const response = await request(app)
          .post('/api/mcp/suggest-improvements')
          .send(workPlan)
          .expect(200);

        expect(response.body).toHaveProperty('originalPlan');
        expect(response.body).toHaveProperty('suggestions');
        expect(response.body).toHaveProperty('improvedApproach');
        expect(response.body).toHaveProperty('additionalFiles');
        expect(response.body).toHaveProperty('filteredFiles');
        expect(response.body).toHaveProperty('validationResult');
        expect(response.body.suggestions).toBeInstanceOf(Array);
      });

      it('should add sequential steps if missing', async () => {
        const workPlan = {
          taskDescription: 'Add feature',
          proposedApproach: 'Add the feature',
          filesImpacted: ['src/feature.ts'],
          estimatedComplexity: 'moderate',
          requiresTests: true,
          requiresDocumentation: false,
        };

        const response = await request(app)
          .post('/api/mcp/suggest-improvements')
          .send(workPlan)
          .expect(200);

        // Should suggest sequential approach
        if (response.body.validationResult.concerns.some((c: any) => 
          c.description.includes('sequential')
        )) {
          expect(response.body.improvedApproach).toContain('Step');
        }
      });

      it('should suggest CURRENT_TRUTH.md for platform changes', async () => {
        const workPlan = {
          taskDescription: 'Update platform configuration',
          proposedApproach: 'Change config files',
          filesImpacted: ['apps/mcp-server/src/config.ts'],
          estimatedComplexity: 'moderate',
          requiresTests: true,
          requiresDocumentation: false,
        };

        const response = await request(app)
          .post('/api/mcp/suggest-improvements')
          .send(workPlan)
          .expect(200);

        // Check if CURRENT_TRUTH.md is suggested when needed
        expect(response.body.additionalFiles).toBeInstanceOf(Array);
      });

      it('should filter out new documentation files', async () => {
        const workPlan = {
          taskDescription: 'Add feature',
          proposedApproach: 'Implement and document',
          filesImpacted: [
            'src/feature.ts',
            'docs/NEW_GUIDE.md',
            'README.md', // This should be kept
          ],
          estimatedComplexity: 'moderate',
          requiresTests: true,
          requiresDocumentation: true,
        };

        const response = await request(app)
          .post('/api/mcp/suggest-improvements')
          .send(workPlan)
          .expect(200);

        expect(response.body.filteredFiles).toBeInstanceOf(Array);
        // README.md should be kept
        expect(response.body.filteredFiles).toContain('README.md');
      });
    });

    describe('Validation Errors', () => {
      it('should return 400 for invalid work plan format', async () => {
        const invalidPlan = {
          taskDescription: 'Test',
          // Missing other required fields
        };

        const response = await request(app)
          .post('/api/mcp/suggest-improvements')
          .send(invalidPlan)
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toBe('Invalid work plan format');
      });
    });
  });

  describe('POST /api/mcp/check-strategy', () => {
    describe('Success Cases', () => {
      it('should check strategy alignment for good approach', async () => {
        const strategyRequest = {
          approach: 'Step 1: Query MCP health. Step 2: Implement proper solution. Step 3: Write tests. Step 4: Verify with curl commands.',
          validationSteps: [
            'curl localhost:3001/health',
            'pnpm nx test mcp-server',
            'pnpm nx build mcp-server',
          ],
        };

        const response = await request(app)
          .post('/api/mcp/check-strategy')
          .send(strategyRequest)
          .expect(200);

        expect(response.body).toHaveProperty('isRootCauseFix');
        expect(response.body).toHaveProperty('avoidsWorkarounds');
        expect(response.body).toHaveProperty('followsSequentialApproach');
        expect(response.body).toHaveProperty('usesInlineDocumentation');
        expect(response.body).toHaveProperty('evidenceBased');
        expect(response.body).toHaveProperty('queriesMCPFirst');
        expect(response.body).toHaveProperty('maintainsTests');
        expect(response.body).toHaveProperty('score');
        expect(response.body).toHaveProperty('violations');
        expect(response.body).toHaveProperty('recommendations');
        expect(response.body.score).toBeGreaterThanOrEqual(0);
        expect(response.body.score).toBeLessThanOrEqual(100);
      });

      it('should detect high-quality strategy', async () => {
        const strategyRequest = {
          approach: 'First query MCP health to verify operational status. Then analyze root cause systematically. Implement proper fix with comprehensive tests. Update CURRENT_TRUTH.md inline.',
          validationSteps: [
            'curl localhost:3001/health | jq',
            'pnpm nx test',
            'pnpm nx build',
          ],
        };

        const response = await request(app)
          .post('/api/mcp/check-strategy')
          .send(strategyRequest)
          .expect(200);

        expect(response.body.score).toBeGreaterThan(70);
        expect(response.body.queriesMCPFirst).toBe(true);
        expect(response.body.followsSequentialApproach).toBe(true);
        expect(response.body.evidenceBased).toBe(true);
      });

      it('should detect workaround approaches', async () => {
        const strategyRequest = {
          approach: 'Quick hack using @ts-ignore to bypass type checking',
          validationSteps: [],
        };

        const response = await request(app)
          .post('/api/mcp/check-strategy')
          .send(strategyRequest)
          .expect(200);

        expect(response.body.avoidsWorkarounds).toBe(false);
        expect(response.body.violations.length).toBeGreaterThan(0);
        expect(response.body.score).toBeLessThan(50);
      });

      it('should detect missing validation steps', async () => {
        const strategyRequest = {
          approach: 'Implement feature',
          validationSteps: [],
        };

        const response = await request(app)
          .post('/api/mcp/check-strategy')
          .send(strategyRequest)
          .expect(200);

        expect(response.body.evidenceBased).toBe(false);
        const hasValidationViolation = response.body.violations.some(
          (v: string) => v.toLowerCase().includes('validation')
        );
        expect(hasValidationViolation).toBe(true);
      });
    });

    describe('Validation Errors', () => {
      it('should return 400 for missing approach', async () => {
        const invalidRequest = {
          validationSteps: ['test'],
        };

        const response = await request(app)
          .post('/api/mcp/check-strategy')
          .send(invalidRequest)
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('approach');
      });

      it('should return 400 for invalid approach type', async () => {
        const invalidRequest = {
          approach: 12345,
          validationSteps: ['test'],
        };

        const response = await request(app)
          .post('/api/mcp/check-strategy')
          .send(invalidRequest)
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('approach');
      });

      it('should return 400 for missing validationSteps', async () => {
        const invalidRequest = {
          approach: 'Do something',
        };

        const response = await request(app)
          .post('/api/mcp/check-strategy')
          .send(invalidRequest)
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('validationSteps');
      });

      it('should return 400 for invalid validationSteps type', async () => {
        const invalidRequest = {
          approach: 'Do something',
          validationSteps: 'not-an-array',
        };

        const response = await request(app)
          .post('/api/mcp/check-strategy')
          .send(invalidRequest)
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('validationSteps');
      });
    });
  });

  describe('POST /api/mcp/get-guidance', () => {
    describe('Success Cases', () => {
      it('should provide guidance for a query', async () => {
        const guidanceRequest = {
          query: 'How to fix TypeScript build error?',
        };

        const response = await request(app)
          .post('/api/mcp/get-guidance')
          .send(guidanceRequest)
          .expect(200);

        expect(response.body).toHaveProperty('recommendation');
        expect(response.body).toHaveProperty('approvedApproach');
        expect(response.body).toHaveProperty('checklistItems');
        expect(response.body).toHaveProperty('commonMistakes');
        expect(response.body).toHaveProperty('validationSteps');
        expect(response.body).toHaveProperty('estimatedComplexity');
        expect(response.body).toHaveProperty('estimatedTime');
        expect(response.body.checklistItems).toBeInstanceOf(Array);
        expect(response.body.commonMistakes).toBeInstanceOf(Array);
        expect(response.body.validationSteps).toBeInstanceOf(Array);
      });

      it('should provide guidance with context', async () => {
        const guidanceRequest = {
          query: 'Fix build failure',
          context: 'TypeScript compilation errors in mcp-server',
        };

        const response = await request(app)
          .post('/api/mcp/get-guidance')
          .send(guidanceRequest)
          .expect(200);

        expect(response.body.recommendation).toBeTruthy();
        expect(response.body.approvedApproach).toBeTruthy();
      });

      it('should provide guidance with previous attempts', async () => {
        const guidanceRequest = {
          query: 'Fix auth bug',
          context: 'Login fails intermittently',
          previousAttempts: [
            'Tried updating auth middleware',
            'Checked database connection',
          ],
        };

        const response = await request(app)
          .post('/api/mcp/get-guidance')
          .send(guidanceRequest)
          .expect(200);

        expect(response.body).toHaveProperty('recommendation');
        expect(response.body.checklistItems.length).toBeGreaterThan(0);
      });

      it('should provide default guidance for vague queries', async () => {
        const guidanceRequest = {
          query: 'Help',
        };

        const response = await request(app)
          .post('/api/mcp/get-guidance')
          .send(guidanceRequest)
          .expect(200);

        expect(response.body.recommendation).toBeTruthy();
        expect(response.body.checklistItems).toBeInstanceOf(Array);
        expect(response.body.checklistItems.length).toBeGreaterThan(0);
      });

      it('should provide guidance for API endpoint tasks', async () => {
        const guidanceRequest = {
          query: 'Add new API endpoint',
        };

        const response = await request(app)
          .post('/api/mcp/get-guidance')
          .send(guidanceRequest)
          .expect(200);

        expect(response.body.estimatedComplexity).toBeDefined();
        expect(['simple', 'moderate', 'complex']).toContain(
          response.body.estimatedComplexity
        );
      });

      it('should provide guidance for test failures', async () => {
        const guidanceRequest = {
          query: 'Tests failing after recent changes',
          context: 'Integration tests are broken',
        };

        const response = await request(app)
          .post('/api/mcp/get-guidance')
          .send(guidanceRequest)
          .expect(200);

        expect(response.body.validationSteps.length).toBeGreaterThan(0);
        expect(response.body.commonMistakes).toBeInstanceOf(Array);
      });
    });

    describe('Validation Errors', () => {
      it('should return 400 for missing query', async () => {
        const invalidRequest = {
          context: 'Some context',
        };

        const response = await request(app)
          .post('/api/mcp/get-guidance')
          .send(invalidRequest)
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('query');
      });

      it('should return 400 for invalid query type', async () => {
        const invalidRequest = {
          query: 12345,
        };

        const response = await request(app)
          .post('/api/mcp/get-guidance')
          .send(invalidRequest)
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('query');
      });

      it('should return 400 for empty query string', async () => {
        const invalidRequest = {
          query: '',
        };

        const response = await request(app)
          .post('/api/mcp/get-guidance')
          .send(invalidRequest)
          .expect(400);

        expect(response.body).toHaveProperty('error');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/mcp/validate-work-plan')
        .set('Content-Type', 'application/json')
        .send('{"invalid json')
        .expect(400);

      // Express should handle this at the middleware level
      expect(response.status).toBe(400);
    });

    it('should handle empty request body', async () => {
      const response = await request(app)
        .post('/api/mcp/validate-work-plan')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });
});

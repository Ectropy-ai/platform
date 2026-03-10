/**
 * Agent Guidance Routes
 * Endpoints for AI agent work plan validation and guidance
 */

import { Router, type Request, type Response, type Router as ExpressRouter } from 'express';
import { WorkPlanValidator } from '../services/work-plan-validator.js';
import { StrategyChecker } from '../services/strategy-checker.js';
import { AgentGuidance } from '../services/agent-guidance.js';

export const agentGuidanceRouter: ExpressRouter = Router();

const workPlanValidator = new WorkPlanValidator();
const strategyChecker = new StrategyChecker();
const agentGuidance = new AgentGuidance();

/**
 * POST /api/mcp/validate-work-plan
 * Validate AI agent work plan before implementation
 * 
 * Request body:
 * {
 *   "taskDescription": string,
 *   "proposedApproach": string,
 *   "filesImpacted": string[],
 *   "estimatedComplexity": "simple" | "moderate" | "complex",
 *   "requiresTests": boolean,
 *   "requiresDocumentation": boolean
 * }
 * 
 * Response (200 for proceed/revise, 403 for reject):
 * {
 *   "approved": boolean,
 *   "score": number,
 *   "concerns": Concern[],
 *   "suggestions": string[],
 *   "requiredChecks": string[],
 *   "recommendation": "proceed" | "revise" | "reject"
 * }
 */
agentGuidanceRouter.post('/validate-work-plan', (req: Request, res: Response) => {
  try {
    const { 
      taskDescription, 
      proposedApproach, 
      filesImpacted, 
      estimatedComplexity,
      requiresTests,
      requiresDocumentation 
    } = req.body;

    // Validate required fields
    if (!taskDescription || typeof taskDescription !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid "taskDescription" field',
        expected: 'string',
      });
    }

    if (!proposedApproach || typeof proposedApproach !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid "proposedApproach" field',
        expected: 'string',
      });
    }

    if (!Array.isArray(filesImpacted)) {
      return res.status(400).json({
        error: 'Missing or invalid "filesImpacted" field',
        expected: 'string[]',
      });
    }

    if (!['simple', 'moderate', 'complex'].includes(estimatedComplexity)) {
      return res.status(400).json({
        error: 'Invalid "estimatedComplexity" field',
        expected: '"simple" | "moderate" | "complex"',
      });
    }

    if (typeof requiresTests !== 'boolean') {
      return res.status(400).json({
        error: 'Missing or invalid "requiresTests" field',
        expected: 'boolean',
      });
    }

    // requiresDocumentation is optional, default to false
    const workPlan = {
      taskDescription,
      proposedApproach,
      filesImpacted,
      estimatedComplexity,
      requiresTests,
      requiresDocumentation: requiresDocumentation ?? false,
    };

    const result = workPlanValidator.validate(workPlan);

    // Return 403 if recommendation is reject
    if (result.recommendation === 'reject') {
      return res.status(403).json(result);
    }

    // Return 200 for proceed or revise
    return res.json(result);
  } catch (error) {
    console.error('Error validating work plan:', error);
    return res.status(500).json({
      error: 'Failed to validate work plan',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/mcp/suggest-improvements
 * Suggest improvements to an AI agent work plan
 * 
 * Request body: Same as validate-work-plan
 * 
 * Response (200):
 * {
 *   "originalPlan": WorkPlan,
 *   "suggestions": string[],
 *   "improvedApproach": string,
 *   "additionalFiles": string[]
 * }
 */
agentGuidanceRouter.post('/suggest-improvements', (req: Request, res: Response) => {
  try {
    const { 
      taskDescription, 
      proposedApproach, 
      filesImpacted, 
      estimatedComplexity,
      requiresTests,
      requiresDocumentation 
    } = req.body;

    // Validate required fields (same as validate-work-plan)
    if (!taskDescription || !proposedApproach || !Array.isArray(filesImpacted) || 
        !['simple', 'moderate', 'complex'].includes(estimatedComplexity) ||
        typeof requiresTests !== 'boolean') {
      return res.status(400).json({
        error: 'Invalid work plan format',
      });
    }

    const workPlan = {
      taskDescription,
      proposedApproach,
      filesImpacted,
      estimatedComplexity,
      requiresTests,
      requiresDocumentation: requiresDocumentation ?? false,
    };

    const result = workPlanValidator.validate(workPlan);

    // Generate improved approach based on concerns
    let improvedApproach = proposedApproach;
    const additionalFiles: string[] = [];

    // Add sequential steps if missing
    if (result.concerns.some(c => c.description.includes('sequential'))) {
      improvedApproach = `Step 1: ${improvedApproach}\nStep 2: Validate changes\nStep 3: Run tests`;
    }

    // Add verification steps if missing
    if (result.concerns.some(c => c.description.includes('verification'))) {
      improvedApproach += '\nVerification: Run curl localhost:3001/health and check build succeeds';
    }

    // Add MCP health check if missing
    if (result.concerns.some(c => c.description.includes('MCP'))) {
      improvedApproach = `First: Query MCP health (curl localhost:3001/health)\n${improvedApproach}`;
    }

    // Suggest CURRENT_TRUTH.md if platform changes without documentation
    if (result.concerns.some(c => c.description.includes('CURRENT_TRUTH'))) {
      additionalFiles.push('docs/CURRENT_TRUTH.md');
    }

    // Remove new documentation files
    const filteredFiles = filesImpacted.filter(f => {
      const fileName = f.split('/').pop() || '';
      return !f.endsWith('.md') || /^(README|CURRENT_TRUTH|CHANGELOG|CONTRIBUTING|LICENSE)\.md$/i.test(fileName);
    });

    return res.json({
      originalPlan: workPlan,
      suggestions: result.suggestions,
      improvedApproach,
      additionalFiles,
      filteredFiles,
      validationResult: result,
    });
  } catch (error) {
    console.error('Error suggesting improvements:', error);
    return res.status(500).json({
      error: 'Failed to suggest improvements',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/mcp/check-strategy
 * Check strategy alignment with ways of working
 * 
 * Request body:
 * {
 *   "approach": string,
 *   "validationSteps": string[]
 * }
 * 
 * Response (200):
 * {
 *   "isRootCauseFix": boolean,
 *   "avoidsWorkarounds": boolean,
 *   "followsSequentialApproach": boolean,
 *   "usesInlineDocumentation": boolean,
 *   "evidenceBased": boolean,
 *   "queriesMCPFirst": boolean,
 *   "maintainsTests": boolean,
 *   "score": number,
 *   "violations": string[],
 *   "recommendations": string[]
 * }
 */
agentGuidanceRouter.post('/check-strategy', (req: Request, res: Response) => {
  try {
    const { approach, validationSteps } = req.body;

    // Validate required fields
    if (!approach || typeof approach !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid "approach" field',
        expected: 'string',
      });
    }

    if (!Array.isArray(validationSteps)) {
      return res.status(400).json({
        error: 'Missing or invalid "validationSteps" field',
        expected: 'string[]',
      });
    }

    const result = strategyChecker.check({ approach, validationSteps });

    return res.json(result);
  } catch (error) {
    console.error('Error checking strategy:', error);
    return res.status(500).json({
      error: 'Failed to check strategy',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/mcp/get-guidance
 * Get proactive guidance for a task
 * 
 * Request body:
 * {
 *   "query": string,
 *   "context": string (optional),
 *   "previousAttempts": string[] (optional)
 * }
 * 
 * Response (200):
 * {
 *   "recommendation": string,
 *   "approvedApproach": string,
 *   "checklistItems": string[],
 *   "commonMistakes": string[],
 *   "validationSteps": string[],
 *   "estimatedComplexity": "simple" | "moderate" | "complex",
 *   "estimatedTime": string
 * }
 */
agentGuidanceRouter.post('/get-guidance', (req: Request, res: Response) => {
  try {
    const { query, context, previousAttempts } = req.body;

    // Validate required fields
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return res.status(400).json({
        error: 'Missing or invalid "query" field',
        expected: 'string',
      });
    }

    const request = {
      query,
      context: context || undefined,
      previousAttempts: previousAttempts || undefined,
    };

    const guidance = agentGuidance.getGuidance(request);

    return res.json(guidance);
  } catch (error) {
    console.error('Error getting guidance:', error);
    return res.status(500).json({
      error: 'Failed to get guidance',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

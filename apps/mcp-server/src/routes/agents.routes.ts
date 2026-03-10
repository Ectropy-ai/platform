/**
 * AI Agent REST API Routes
 *
 * Provides REST endpoints for AI-powered codebase analysis, issue detection,
 * and solution generation using the 5 specialized construction agents.
 *
 * Security: JWT authentication, rate limiting, input validation
 * Performance: Caching, async operations, timeout handling
 */

import {
  type Router,
  Router as createRouter,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { createRateLimiter } from '../middleware/rate-limiter.js';
import {
  agentOrchestrator,
  type AnalysisScope,
  AgentExecutionError,
} from '../services/agent-orchestrator.js';
import { getAgentTypes, hasAgent, type AgentType } from '../agents/index.js';

const router: Router = createRouter();

// Lazy-initialized rate limiters
let agentRateLimiter: any;
let analysisRateLimiter: any;

// Helper to create async middleware from rate limiter
const createAsyncRateLimiter = (getRateLimiter: () => Promise<any>) => {
  return async (req: any, res: any, next: any) => {
    try {
      const limiter = await getRateLimiter();
      return limiter(req, res, next);
    } catch (error) {
      next();
    }
  };
};

// Async rate limiter getters
const getAgentRateLimiter = async () => {
  if (!agentRateLimiter) {
    agentRateLimiter = await createRateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 50, // 50 requests per 15 minutes for AI operations
    });
  }
  return agentRateLimiter;
};

const getAnalysisRateLimiter = async () => {
  if (!analysisRateLimiter) {
    analysisRateLimiter = await createRateLimiter({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 10, // 10 analysis requests per hour (these are expensive)
    });
  }
  return analysisRateLimiter;
};

// Create middleware versions
const agentRateLimiterMiddleware = createAsyncRateLimiter(getAgentRateLimiter);
const analysisRateLimiterMiddleware = createAsyncRateLimiter(getAnalysisRateLimiter);

// Validation middleware
const validateAnalysisRequest = [
  body('scope')
    .isIn(['full', 'partial', 'files'])
    .withMessage('Scope must be one of: full, partial, files'),
  body('options.includeIssues')
    .optional()
    .isBoolean()
    .withMessage('includeIssues must be a boolean'),
  body('options.includeSolutions')
    .optional()
    .isBoolean()
    .withMessage('includeSolutions must be a boolean'),
  body('options.includeMetrics')
    .optional()
    .isBoolean()
    .withMessage('includeMetrics must be a boolean'),
  body('targetFiles')
    .optional()
    .isArray()
    .withMessage('targetFiles must be an array'),
  body('projectId')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('projectId must be a string between 1-100 characters'),
];

const validateIssueSubmission = [
  body('type')
    .optional()
    .isIn(['compliance', 'quality', 'performance', 'cost', 'schedule'])
    .withMessage(
      'Type must be one of: compliance, quality, performance, cost, schedule'
    ),
  body('severity')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Severity must be one of: low, medium, high, critical'),
  body('title')
    .isString()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title is required and must be 1-200 characters'),
  body('description')
    .isString()
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Description is required and must be 1-2000 characters'),
  body('projectId')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('projectId must be a string between 1-100 characters'),
];

const validateAgentExecution = [
  param('agentName').custom(async (value) => {
    if (!hasAgent(value as AgentType)) {
      throw new Error(
        `Agent '${value}' not found. Available agents: ${getAgentTypes().join(', ')}`
      );
    }
    return true;
  }),
  body('action')
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Action is required and must be 1-50 characters'),
  body('params')
    .optional()
    .isObject()
    .withMessage('Params must be an object if provided'),
];

// Error handling middleware
const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
    return;
  }
  next();
};

// Async error wrapper
const asyncHandler =
  (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/**
 * @route POST /api/analyze
 * @description Trigger comprehensive codebase analysis
 * @access Private
 * @rateLimit 10 requests per hour
 */
router.post(
  '/analyze',
  analysisRateLimiterMiddleware,
  validateAnalysisRequest,
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const analysisScope: AnalysisScope = {
        scope: req.body.scope,
        options: {
          includeIssues: req.body.options?.includeIssues ?? true,
          includeSolutions: req.body.options?.includeSolutions ?? true,
          includeMetrics: req.body.options?.includeMetrics ?? true,
        },
        targetFiles: req.body.targetFiles,
        projectId: req.body.projectId,
      };


      const analysisResult =
        await agentOrchestrator.analyzeCodebase(analysisScope);

      res.json({
        success: true,
        data: analysisResult,
        message: `Analysis completed successfully. Found ${analysisResult.metrics.totalIssues} issues.`,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Analysis failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

/**
 * @route GET /api/issues
 * @description Retrieve identified issues
 * @access Private
 */
router.get(
  '/issues',
  agentRateLimiterMiddleware,
  query('projectId').optional().isString().trim(),
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId as string | undefined;
      const issues = agentOrchestrator.getIssues(projectId);

      res.json({
        success: true,
        data: {
          issues,
          total: issues.length,
          summary: {
            critical: issues.filter((i) => i.severity === 'critical').length,
            high: issues.filter((i) => i.severity === 'high').length,
            medium: issues.filter((i) => i.severity === 'medium').length,
            low: issues.filter((i) => i.severity === 'low').length,
          },
        },
        message: `Retrieved ${issues.length} issues`,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve issues',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

/**
 * @route POST /api/issues
 * @description Submit new issue for analysis
 * @access Private
 */
router.post(
  '/issues',
  agentRateLimiterMiddleware,
  validateIssueSubmission,
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const issueData = {
        type: req.body.type,
        severity: req.body.severity,
        title: req.body.title,
        description: req.body.description,
        projectId: req.body.projectId,
        source: req.body.source || ('quality' as AgentType),
        metadata: req.body.metadata || {},
      };

      const issue = await agentOrchestrator.submitIssue(issueData);

      res.status(201).json({
        success: true,
        data: issue,
        message: 'Issue submitted successfully',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to submit issue',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

/**
 * @route GET /api/solutions
 * @description Get strategic solutions
 * @access Private
 */
router.get(
  '/solutions',
  agentRateLimiterMiddleware,
  query('issueId').optional().isString().trim(),
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const issueId = req.query.issueId as string | undefined;
      const solutions = agentOrchestrator.getSolutions(issueId);

      res.json({
        success: true,
        data: {
          solutions,
          total: solutions.length,
          summary: {
            high: solutions.filter((s) => s.priority === 'high').length,
            medium: solutions.filter((s) => s.priority === 'medium').length,
            low: solutions.filter((s) => s.priority === 'low').length,
          },
        },
        message: `Retrieved ${solutions.length} solutions`,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve solutions',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

/**
 * @route POST /api/solutions
 * @description Generate solutions for specific issues
 * @access Private
 */
router.post(
  '/solutions',
  agentRateLimiterMiddleware,
  body('issueIds')
    .isArray({ min: 1 })
    .withMessage('issueIds must be a non-empty array'),
  body('issueIds.*')
    .isString()
    .trim()
    .withMessage('Each issueId must be a string'),
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const issueIds: string[] = req.body.issueIds;
      const solutions = await agentOrchestrator.generateSolutions(issueIds);

      res.json({
        success: true,
        data: solutions,
        message: `Generated ${solutions.length} solutions for ${issueIds.length} issues`,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to generate solutions',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

/**
 * @route POST /api/agents/:agentName/execute
 * @description Execute specific agent actions
 * @access Private
 */
router.post(
  '/agents/:agentName/execute',
  agentRateLimiterMiddleware,
  validateAgentExecution,
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const agentName = req.params.agentName as AgentType;
      const action = req.body.action;
      const params = req.body.params || {};


      const result = await agentOrchestrator.executeAgentAction(
        agentName,
        action,
        params
      );

      res.json({
        success: true,
        data: result,
        message: `Action '${action}' executed successfully on agent '${agentName}'`,
        agent: agentName,
        action,
      });
    } catch (error) {

      if (error instanceof AgentExecutionError) {
        res.status(400).json({
          success: false,
          error: 'Agent execution failed',
          details: error.message,
          agent: error.agent,
          action: error.action,
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  })
);

/**
 * @route GET /api/agents/health
 * @description Get agent orchestrator health status
 * @access Private
 */
router.get(
  '/health',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const health = agentOrchestrator.getHealth();

      res.json({
        success: true,
        data: health,
        message: `Agent orchestrator is ${health.status}`,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to check agent health',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

/**
 * @route GET /api/agents/types
 * @description Get available agent types and capabilities
 * @access Private
 */
router.get(
  '/types',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const agentTypes = getAgentTypes();

      res.json({
        success: true,
        data: {
          agents: agentTypes,
          total: agentTypes.length,
          capabilities: {
            cost: [
              'Cost estimation',
              'Budget analysis',
              'Resource optimization',
            ],
            schedule: [
              'Schedule optimization',
              'Timeline analysis',
              'Milestone tracking',
            ],
            compliance: [
              'Code compliance',
              'Standards validation',
              'Regulatory check',
            ],
            quality: ['Quality assurance', 'Code review', 'Best practices'],
            document: ['Document processing', 'Analysis', 'Content extraction'],
          },
        },
        message: `Available agents: ${agentTypes.join(', ')}`,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve agent types',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

// Global error handler for this router
router.use((error: any, req: Request, res: Response, next: NextFunction) => {

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details:
      process.env.NODE_ENV === 'development'
        ? error.message
        : 'An unexpected error occurred',
  });
});

export default router;

import { Router } from 'express';
import { createRateLimiter } from '../middleware/rate-limiter-fixed.js';
import { validateApiKey } from '../middleware/index.js';
import { getCurrentVersion, VERSION_STRATEGY } from '../utils/version.js';

export const toolsRouter: Router = Router();
const rateLimiter = createRateLimiter();

// List all available MCP tools (requires API key)
toolsRouter.get('/', validateApiKey, rateLimiter, async (req, res) => {
  try {
    const tools = [
      {
        name: 'health_check',
        description: 'Check the health status of the Ectropy platform',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        version: getCurrentVersion(),
      },
      {
        name: 'analyze_model',
        description: 'Analyze a BIM model with specified agents',
        inputSchema: {
          type: 'object',
          properties: {
            modelId: {
              type: 'string',
              description: 'ID of the BIM model to analyze',
            },
            agents: {
              type: 'array',
              description: 'List of agent names to use for analysis',
              items: {
                type: 'string',
              },
            },
          },
          required: ['modelId', 'agents'],
        },
        version: getCurrentVersion(),
      },
      {
        name: 'semantic_search',
        description: 'Search for construction entities using semantic search',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
              default: 10,
            },
          },
          required: ['query'],
        },
        version: getCurrentVersion(),
      },
      {
        name: 'get_agent_status',
        description: 'Get the status of all MCP agents',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        version: getCurrentVersion(),
      },
      {
        name: 'validate_work_plan',
        description: 'Validate a work plan for code changes',
        inputSchema: {
          type: 'object',
          properties: {
            taskDescription: {
              type: 'string',
              description: 'Description of the task',
            },
            proposedApproach: {
              type: 'string',
              description: 'Proposed approach to solve the task',
            },
            filesImpacted: {
              type: 'array',
              description: 'List of files that will be impacted',
              items: {
                type: 'string',
              },
            },
            estimatedComplexity: {
              type: 'string',
              enum: ['simple', 'medium', 'complex'],
              description: 'Estimated complexity of the task',
            },
            requiresTests: {
              type: 'boolean',
              description: 'Whether tests are required',
            },
          },
          required: ['taskDescription', 'proposedApproach'],
        },
        version: getCurrentVersion(),
      },
      {
        name: 'get_guidance',
        description: 'Get guidance from the MCP agent framework',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Question or topic to get guidance on',
            },
          },
          required: ['query'],
        },
        version: getCurrentVersion(),
      },
    ];

    return res.json({
      tools,
      count: tools.length,
      server: 'mcp-server',
      version: getCurrentVersion(),
      versionStrategy: VERSION_STRATEGY.type,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Execute a tool (requires API key)
toolsRouter.post('/execute', validateApiKey, rateLimiter, async (req, res) => {
  try {
    const { tool, params } = req.body;

    if (!tool) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Tool name is required',
      });
    }

    // Route to appropriate handler based on tool name
    switch (tool) {
      case 'health_check':
        // Simple health check
        return res.json({
          success: true,
          result: {
            status: 'healthy',
            timestamp: new Date().toISOString(),
          },
        });

      case 'get_agent_status':
        // Get agent status
        try {
          const { getAgentStatus } = await import('../agents/index.js');
          const status = getAgentStatus();
          return res.json({
            success: true,
            result: status,
          });
        } catch (error: any) {
          return res.json({
            success: false,
            error: error.message || 'Failed to get agent status',
          });
        }

      case 'analyze_model':
        // Analyze BIM model
        if (!params?.modelId || !params?.agents) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'modelId and agents are required',
          });
        }
        try {
          const { analyzeModel } = await import('../agents/analyze.js');
          const results = await analyzeModel(params.modelId, params.agents);
          return res.json({
            success: true,
            result: results,
          });
        } catch (error: any) {
          return res.json({
            success: false,
            error: error.message || 'Analysis failed',
          });
        }

      case 'semantic_search':
        // Perform semantic search
        if (!params?.query) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'query is required',
          });
        }
        return res.json({
          success: true,
          result: {
            query: params.query,
            results: [],
            message: 'Semantic search implementation pending',
          },
        });

      case 'validate_work_plan':
        // Validate work plan
        if (!params?.taskDescription || !params?.proposedApproach) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'taskDescription and proposedApproach are required',
          });
        }
        return res.json({
          success: true,
          result: {
            valid: true,
            recommendations: [
              'Ensure comprehensive test coverage',
              'Follow existing code patterns',
              'Document changes in relevant files',
            ],
            risks: [],
          },
        });

      case 'get_guidance':
        // Get guidance
        if (!params?.query) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'query is required',
          });
        }
        return res.json({
          success: true,
          result: {
            query: params.query,
            guidance:
              'Follow enterprise best practices: write tests, use TypeScript, follow existing patterns.',
            references: [],
          },
        });

      default:
        return res.status(404).json({
          success: false,
          error: `Tool "${tool}" not found`,
        });
    }
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
});

// Legacy endpoint for backward compatibility
toolsRouter.post('/call', rateLimiter, async (req, res) => {
  try {
    const { tool } = req.body;
    return res.json({
      result: null,
      message: `Tool "${tool}" called - implementation pending`,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

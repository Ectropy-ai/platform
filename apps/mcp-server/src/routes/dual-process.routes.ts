/**
 * Dual-Process Decision MCP Tools Router
 *
 * Express routes for the Dual-Process Decision Architecture MCP tools.
 * Engine 1 (Success Stack) provides fast pattern-matching from validated decisions.
 *
 * Endpoints:
 * - GET  /api/mcp/dual-process           - List all tools
 * - POST /api/mcp/dual-process/execute   - Execute a specific tool
 * - GET  /api/mcp/dual-process/:toolName - Get tool definition
 * - POST /api/mcp/dual-process/:toolName - Execute tool directly
 *
 * @version 1.0.0
 * @see .roadmap/features/dual-process-decision/FEATURE.json
 */

import { Router, type Request, type Response } from 'express';
import { createRateLimiter } from '../middleware/rate-limiter-fixed.js';
import {
  dualProcessTools,
  getDualProcessToolByName,
  getDualProcessToolNames,
} from '../services/dual-process-tools.js';
import { getCurrentVersion, VERSION_STRATEGY } from '../utils/version.js';

export const dualProcessRouter: Router = Router();
const rateLimiter = createRateLimiter();

/**
 * GET /api/mcp/dual-process
 * List all Dual-Process Decision tools with their definitions
 */
dualProcessRouter.get('/', rateLimiter, async (_req: Request, res: Response) => {
  try {
    const toolDefinitions = dualProcessTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      version: getCurrentVersion(),
    }));

    // Group tools by category
    const categorizedTools = {
      // Engine 1 (Success Stack) Tools
      successStack: toolDefinitions.filter((t) =>
        [
          'query_success_stack',
          'get_pattern_details',
          'compress_decision_pattern',
          'store_success_pattern',
          'decay_patterns',
          'validate_pattern_compression',
          'get_success_stack_statistics',
        ].includes(t.name)
      ),
      // SDI & Utility Tools
      sdiUtility: toolDefinitions.filter((t) =>
        ['compute_sdi', 'compute_eigenmode_similarity'].includes(t.name)
      ),
    };

    return res.json({
      success: true,
      category: 'Dual-Process Decision Tools',
      version: getCurrentVersion(),
      versionStrategy: VERSION_STRATEGY.type,
      count: dualProcessTools.length,
      tools: toolDefinitions,
      categorized: categorizedTools,
      server: 'mcp-server',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({
      success: false,
      error: 'TOOL_LIST_ERROR',
      message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/mcp/dual-process/names
 * Get just the tool names (lightweight endpoint)
 */
dualProcessRouter.get(
  '/names',
  rateLimiter,
  async (_req: Request, res: Response) => {
    try {
      return res.json({
        success: true,
        tools: getDualProcessToolNames(),
        count: getDualProcessToolNames().length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({
        success: false,
        error: 'TOOL_NAMES_ERROR',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/mcp/dual-process/:toolName
 * Get a specific tool's definition
 */
dualProcessRouter.get(
  '/:toolName',
  rateLimiter,
  async (req: Request, res: Response) => {
    try {
      const { toolName } = req.params;
      const tool = getDualProcessToolByName(toolName);

      if (!tool) {
        return res.status(404).json({
          success: false,
          error: 'TOOL_NOT_FOUND',
          message: `Tool "${toolName}" not found`,
          availableTools: getDualProcessToolNames(),
          timestamp: new Date().toISOString(),
        });
      }

      return res.json({
        success: true,
        tool: {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          version: getCurrentVersion(),
        },
        versionStrategy: VERSION_STRATEGY.type,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({
        success: false,
        error: 'TOOL_DEFINITION_ERROR',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/mcp/dual-process/execute
 * Execute a Dual-Process Decision tool
 *
 * Request body:
 * {
 *   "toolName": "query_success_stack",
 *   "args": { ... tool-specific arguments }
 * }
 */
dualProcessRouter.post(
  '/execute',
  rateLimiter,
  async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const { toolName, args } = req.body;

      // Validate request
      if (!toolName) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_TOOL_NAME',
          message: 'toolName is required in request body',
          timestamp: new Date().toISOString(),
        });
      }

      if (!args || typeof args !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'MISSING_ARGS',
          message: 'args object is required in request body',
          timestamp: new Date().toISOString(),
        });
      }

      // Find the tool
      const tool = getDualProcessToolByName(toolName);

      if (!tool) {
        return res.status(404).json({
          success: false,
          error: 'TOOL_NOT_FOUND',
          message: `Tool "${toolName}" not found`,
          availableTools: getDualProcessToolNames(),
          timestamp: new Date().toISOString(),
        });
      }

      // Execute the tool handler
      const result = await tool.handler(args);

      // Return the result with execution metadata
      return res.json({
        ...result,
        toolName,
        executionTime: Date.now() - startTime,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({
        success: false,
        error: {
          code: 'TOOL_EXECUTION_ERROR',
          message,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
);

/**
 * POST /api/mcp/dual-process/:toolName
 * Execute a specific Dual-Process Decision tool (alternative route)
 *
 * Request body contains tool arguments directly
 */
dualProcessRouter.post(
  '/:toolName',
  rateLimiter,
  async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const { toolName } = req.params;
      const args = req.body;

      // Find the tool
      const tool = getDualProcessToolByName(toolName);

      if (!tool) {
        return res.status(404).json({
          success: false,
          error: 'TOOL_NOT_FOUND',
          message: `Tool "${toolName}" not found`,
          availableTools: getDualProcessToolNames(),
          timestamp: new Date().toISOString(),
        });
      }

      // Execute the tool handler
      const result = await tool.handler(args);

      // Return the result with execution metadata
      return res.json({
        ...result,
        toolName,
        executionTime: Date.now() - startTime,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({
        success: false,
        error: {
          code: 'TOOL_EXECUTION_ERROR',
          message,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
);

export default dualProcessRouter;

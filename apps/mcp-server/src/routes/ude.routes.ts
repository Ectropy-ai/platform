/**
 * Unified Decision Engine MCP Tools Router
 *
 * Express routes for the 6 UDE MCP tools that expose the
 * universal adapter layer to AI agents and API consumers.
 *
 * Endpoints:
 * - GET  /api/mcp/ude           - List all UDE tools
 * - GET  /api/mcp/ude/names     - List tool names (lightweight)
 * - GET  /api/mcp/ude/health    - Adapter health check
 * - POST /api/mcp/ude/execute   - Execute a specific tool
 * - GET  /api/mcp/ude/:toolName - Get tool definition
 * - POST /api/mcp/ude/:toolName - Execute tool directly
 *
 * @version 1.0.0
 * @see adapters/universal/context-adapter.interface.ts
 */

import { Router, type Request, type Response } from 'express';
import { createRateLimiter } from '../middleware/rate-limiter-fixed.js';
import {
  udeTools,
  getUdeToolByName,
  getUdeToolNames,
} from '../services/ude-tools.js';
import { ContextRegistry } from '../adapters/context-registry.js';
import { getCurrentVersion, VERSION_STRATEGY } from '../utils/version.js';

export const udeRouter: Router = Router();
const rateLimiter = createRateLimiter();

/**
 * GET /api/mcp/ude
 * List all UDE tools with their definitions
 */
udeRouter.get('/', rateLimiter, async (_req: Request, res: Response) => {
  try {
    const toolDefinitions = udeTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      version: getCurrentVersion(),
    }));

    const categorizedTools = {
      dataAccess: toolDefinitions.filter((t) =>
        ['read_current_truth', 'read_roadmap', 'read_decision_log'].includes(
          t.name
        )
      ),
      intelligence: toolDefinitions.filter((t) =>
        [
          'get_feature_status',
          'get_next_work',
          'get_health_assessment',
        ].includes(t.name)
      ),
    };

    return res.json({
      success: true,
      category: 'Unified Decision Engine Tools',
      version: getCurrentVersion(),
      versionStrategy: VERSION_STRATEGY.type,
      count: udeTools.length,
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
 * GET /api/mcp/ude/names
 * Get just the tool names (lightweight endpoint)
 */
udeRouter.get('/names', rateLimiter, async (_req: Request, res: Response) => {
  try {
    return res.json({
      success: true,
      tools: getUdeToolNames(),
      count: getUdeToolNames().length,
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
});

/**
 * GET /api/mcp/ude/health
 * Get adapter health status from the context registry
 */
udeRouter.get('/health', rateLimiter, async (_req: Request, res: Response) => {
  try {
    const registry = ContextRegistry.getInstance();
    const healthMap = await registry.healthCheckAll();
    const summary = registry.getSummary();

    const healthEntries: Record<string, unknown> = {};
    for (const [domainId, status] of healthMap.entries()) {
      healthEntries[domainId] = status;
    }

    return res.json({
      success: true,
      registry: summary,
      adapters: healthEntries,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({
      success: false,
      error: 'HEALTH_CHECK_ERROR',
      message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/mcp/ude/:toolName
 * Get a specific tool's definition
 */
udeRouter.get(
  '/:toolName',
  rateLimiter,
  async (req: Request, res: Response) => {
    try {
      const { toolName } = req.params;
      const tool = getUdeToolByName(toolName);

      if (!tool) {
        return res.status(404).json({
          success: false,
          error: 'TOOL_NOT_FOUND',
          message: `Tool "${toolName}" not found`,
          availableTools: getUdeToolNames(),
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
 * POST /api/mcp/ude/execute
 * Execute a UDE tool
 *
 * Request body:
 * {
 *   "toolName": "read_current_truth",
 *   "args": { ... tool-specific arguments }
 * }
 */
udeRouter.post('/execute', rateLimiter, async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { toolName, args } = req.body;

    if (!toolName) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_TOOL_NAME',
        message: 'toolName is required in request body',
        timestamp: new Date().toISOString(),
      });
    }

    const tool = getUdeToolByName(toolName);

    if (!tool) {
      return res.status(404).json({
        success: false,
        error: 'TOOL_NOT_FOUND',
        message: `Tool "${toolName}" not found`,
        availableTools: getUdeToolNames(),
        timestamp: new Date().toISOString(),
      });
    }

    const result = await tool.handler(args || {});

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
});

/**
 * POST /api/mcp/ude/:toolName
 * Execute a specific UDE tool (alternative route)
 *
 * Request body contains tool arguments directly
 */
udeRouter.post(
  '/:toolName',
  rateLimiter,
  async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const { toolName } = req.params;
      const args = req.body;

      const tool = getUdeToolByName(toolName);

      if (!tool) {
        return res.status(404).json({
          success: false,
          error: 'TOOL_NOT_FOUND',
          message: `Tool "${toolName}" not found`,
          availableTools: getUdeToolNames(),
          timestamp: new Date().toISOString(),
        });
      }

      const result = await tool.handler(args);

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

export default udeRouter;

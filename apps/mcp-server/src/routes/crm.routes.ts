/**
 * CRM Integration MCP Tools Router
 *
 * Express routes for the 6 CRM MCP tools that expose customer
 * pipeline, health, conversion, sync, and lifecycle management
 * to AI agents and API consumers.
 *
 * Endpoints:
 * - GET  /api/mcp/crm           - List all CRM tools
 * - GET  /api/mcp/crm/names     - List tool names (lightweight)
 * - GET  /api/mcp/crm/health    - CRM integration health check
 * - POST /api/mcp/crm/execute   - Execute a specific tool
 * - GET  /api/mcp/crm/:toolName - Get tool definition
 * - POST /api/mcp/crm/:toolName - Execute tool directly
 *
 * @version 1.0.0
 * @see services/crm-tools.ts
 */

import { Router, type Request, type Response } from 'express';
import { createRateLimiter } from '../middleware/rate-limiter-fixed.js';
import {
  crmTools,
  getCrmToolByName,
  getCrmToolNames,
} from '../services/crm-tools.js';
import { getCurrentVersion, VERSION_STRATEGY } from '../utils/version.js';

export const crmRouter: Router = Router();
const rateLimiter = createRateLimiter();

/**
 * GET /api/mcp/crm
 * List all CRM tools with their definitions
 */
crmRouter.get('/', rateLimiter, async (_req: Request, res: Response) => {
  try {
    const toolDefinitions = crmTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      version: getCurrentVersion(),
    }));

    const categorizedTools = {
      pipeline: toolDefinitions.filter((t) =>
        ['read_customer_pipeline', 'get_conversion_metrics'].includes(t.name)
      ),
      customerIntelligence: toolDefinitions.filter((t) =>
        ['get_customer_health', 'manage_customer_lifecycle'].includes(t.name)
      ),
      sync: toolDefinitions.filter((t) =>
        ['sync_customer_to_crm', 'query_crm_sync_status'].includes(t.name)
      ),
    };

    return res.json({
      success: true,
      category: 'CRM Integration Tools',
      version: getCurrentVersion(),
      versionStrategy: VERSION_STRATEGY.type,
      count: crmTools.length,
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
 * GET /api/mcp/crm/names
 * Get just the tool names (lightweight endpoint)
 */
crmRouter.get('/names', rateLimiter, async (_req: Request, res: Response) => {
  try {
    return res.json({
      success: true,
      tools: getCrmToolNames(),
      count: getCrmToolNames().length,
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
 * GET /api/mcp/crm/health
 * Get CRM integration health status
 */
crmRouter.get('/health', rateLimiter, async (_req: Request, res: Response) => {
  try {
    return res.json({
      success: true,
      status: 'operational',
      toolCount: crmTools.length,
      tools: getCrmToolNames(),
      integration: {
        crmProvider: 'mock',
        syncEnabled: true,
        lastSyncCheck: new Date().toISOString(),
      },
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
 * GET /api/mcp/crm/:toolName
 * Get a specific tool's definition
 */
crmRouter.get(
  '/:toolName',
  rateLimiter,
  async (req: Request, res: Response) => {
    try {
      const { toolName } = req.params;
      const tool = getCrmToolByName(toolName);

      if (!tool) {
        return res.status(404).json({
          success: false,
          error: 'TOOL_NOT_FOUND',
          message: `Tool "${toolName}" not found`,
          availableTools: getCrmToolNames(),
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
 * POST /api/mcp/crm/execute
 * Execute a CRM tool
 *
 * Request body:
 * {
 *   "toolName": "read_customer_pipeline",
 *   "args": { ... tool-specific arguments }
 * }
 */
crmRouter.post('/execute', rateLimiter, async (req: Request, res: Response) => {
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

    const tool = getCrmToolByName(toolName);

    if (!tool) {
      return res.status(404).json({
        success: false,
        error: 'TOOL_NOT_FOUND',
        message: `Tool "${toolName}" not found`,
        availableTools: getCrmToolNames(),
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
 * POST /api/mcp/crm/:toolName
 * Execute a specific CRM tool (alternative route)
 *
 * Request body contains tool arguments directly
 */
crmRouter.post(
  '/:toolName',
  rateLimiter,
  async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const { toolName } = req.params;
      const args = req.body;

      const tool = getCrmToolByName(toolName);

      if (!tool) {
        return res.status(404).json({
          success: false,
          error: 'TOOL_NOT_FOUND',
          message: `Tool "${toolName}" not found`,
          availableTools: getCrmToolNames(),
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

export default crmRouter;

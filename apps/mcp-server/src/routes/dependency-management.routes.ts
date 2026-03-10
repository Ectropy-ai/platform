/**
 * Dependency Management MCP Tools Router
 *
 * Express routes for the V3.1 Dependency Management MCP tools.
 * Provides DAG validation, date propagation, and dependency resolution.
 *
 * Endpoints:
 * - GET  /api/mcp/dependency           - List all tools
 * - POST /api/mcp/dependency/execute   - Execute a specific tool
 * - GET  /api/mcp/dependency/:toolName - Get tool definition
 * - POST /api/mcp/dependency/:toolName - Execute tool directly
 *
 * @version 1.0.0
 * @see ECTROPY_DEMO_STRATEGY_2026-01-29.md Section 3.2
 */

import { Router, type Request, type Response } from 'express';
import { createRateLimiter } from '../middleware/rate-limiter-fixed.js';
import {
  dependencyManagementTools,
  getDependencyToolByName,
  getDependencyToolNames,
} from '../services/dependency-management-tools.js';
import { getCurrentVersion, VERSION_STRATEGY } from '../utils/version.js';

export const dependencyManagementRouter: Router = Router();
const rateLimiter = createRateLimiter();

/**
 * GET /api/mcp/dependency
 * List all Dependency Management tools with their definitions
 */
dependencyManagementRouter.get('/', rateLimiter, async (_req: Request, res: Response) => {
  try {
    const toolDefinitions = dependencyManagementTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      version: getCurrentVersion(),
    }));

    return res.json({
      success: true,
      category: 'Dependency Management Tools (V3.1)',
      version: getCurrentVersion(),
      versionStrategy: VERSION_STRATEGY.type,
      count: dependencyManagementTools.length,
      tools: toolDefinitions,
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
 * GET /api/mcp/dependency/names
 * Get just the tool names (lightweight endpoint)
 */
dependencyManagementRouter.get(
  '/names',
  rateLimiter,
  async (_req: Request, res: Response) => {
    try {
      return res.json({
        success: true,
        tools: getDependencyToolNames(),
        count: getDependencyToolNames().length,
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
 * GET /api/mcp/dependency/:toolName
 * Get a specific tool's definition
 */
dependencyManagementRouter.get(
  '/:toolName',
  rateLimiter,
  async (req: Request, res: Response) => {
    try {
      const { toolName } = req.params;
      const tool = getDependencyToolByName(toolName);

      if (!tool) {
        return res.status(404).json({
          success: false,
          error: 'TOOL_NOT_FOUND',
          message: `Tool "${toolName}" not found`,
          availableTools: getDependencyToolNames(),
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
 * POST /api/mcp/dependency/execute
 * Execute a Dependency Management tool
 *
 * Request body:
 * {
 *   "toolName": "validate_dag",
 *   "args": { ... tool-specific arguments }
 * }
 */
dependencyManagementRouter.post(
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
      const tool = getDependencyToolByName(toolName);

      if (!tool) {
        return res.status(404).json({
          success: false,
          error: 'TOOL_NOT_FOUND',
          message: `Tool "${toolName}" not found`,
          availableTools: getDependencyToolNames(),
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
 * POST /api/mcp/dependency/:toolName
 * Execute a specific Dependency Management tool (alternative route)
 *
 * Request body contains tool arguments directly
 */
dependencyManagementRouter.post(
  '/:toolName',
  rateLimiter,
  async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const { toolName } = req.params;
      const args = req.body;

      // Find the tool
      const tool = getDependencyToolByName(toolName);

      if (!tool) {
        return res.status(404).json({
          success: false,
          error: 'TOOL_NOT_FOUND',
          message: `Tool "${toolName}" not found`,
          availableTools: getDependencyToolNames(),
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

export default dependencyManagementRouter;

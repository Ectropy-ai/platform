/**
 * PM Decision MCP Tools Router
 *
 * Express routes for the 21 PM Decision MCP tools (17 spec-aligned + 4 legacy).
 * Provides REST endpoints for AI agent invocation of construction
 * decision lifecycle tools.
 *
 * Endpoints:
 * - GET  /api/mcp/pm-tools           - List all PM tools
 * - POST /api/mcp/pm-tools/execute   - Execute a specific tool
 * - GET  /api/mcp/pm-tools/:toolName - Get tool definition
 * - POST /api/mcp/pm-tools/:toolName - Execute tool directly
 *
 * @version 2.0.0
 * @see .roadmap/features/decision-lifecycle/interfaces.json
 */

import { Router, type Request, type Response } from 'express';
import { createRateLimiter } from '../middleware/rate-limiter-fixed.js';
import {
  pmDecisionTools,
  getToolByName,
  getToolNames,
} from '../services/pm-decision-tools.js';
import { getCurrentVersion, VERSION_STRATEGY } from '../utils/version.js';

export const pmDecisionRouter: Router = Router();
const rateLimiter = createRateLimiter();

/**
 * GET /api/mcp/pm-tools
 * List all PM Decision tools with their definitions
 */
pmDecisionRouter.get('/', rateLimiter, async (_req: Request, res: Response) => {
  try {
    const toolDefinitions = pmDecisionTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      version: getCurrentVersion(),
    }));

    // Group tools by category for better organization
    // Categories align with pm-decision-tools.ts structure
    const categorizedTools = {
      // Decision Management (6)
      decisionManagement: toolDefinitions.filter((t) =>
        [
          'capture_decision',
          'route_decision',
          'approve_decision',
          'reject_decision',
          'escalate_decision',
          'query_decision_history',
        ].includes(t.name)
      ),
      // Authority & Graph (3)
      authorityGraph: toolDefinitions.filter((t) =>
        [
          'get_authority_graph',
          'find_decision_authority',
          'validate_authority_level',
        ].includes(t.name)
      ),
      // Voxel Operations (3) - includes M2: navigate_decision_surface
      voxelOperations: toolDefinitions.filter((t) =>
        [
          'attach_decision_to_voxel',
          'get_voxel_decisions',
          'navigate_decision_surface',
        ].includes(t.name)
      ),
      // Tolerance Management (2) - NEW M2 category
      toleranceManagement: toolDefinitions.filter((t) =>
        ['apply_tolerance_override', 'query_tolerance_overrides'].includes(
          t.name
        )
      ),
      // Consequence & Inspection (3) - includes M2: complete_inspection
      consequenceInspection: toolDefinitions.filter((t) =>
        [
          'track_consequence',
          'request_inspection',
          'complete_inspection',
        ].includes(t.name)
      ),
      // Legacy tools (4) - kept for backward compatibility
      legacy: toolDefinitions.filter((t) =>
        [
          'query_voxels_by_status',
          'link_consequence_to_decision',
          'query_consequences_by_voxel',
          'propose_schedule_change',
        ].includes(t.name)
      ),
    };

    return res.json({
      success: true,
      category: 'PM Decision Tools',
      version: getCurrentVersion(),
      versionStrategy: VERSION_STRATEGY.type,
      count: pmDecisionTools.length,
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
 * GET /api/mcp/pm-tools/names
 * Get just the tool names (lightweight endpoint)
 */
pmDecisionRouter.get(
  '/names',
  rateLimiter,
  async (_req: Request, res: Response) => {
    try {
      return res.json({
        success: true,
        tools: getToolNames(),
        count: getToolNames().length,
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
 * GET /api/mcp/pm-tools/:toolName
 * Get a specific tool's definition
 */
pmDecisionRouter.get(
  '/:toolName',
  rateLimiter,
  async (req: Request, res: Response) => {
    try {
      const { toolName } = req.params;
      const tool = getToolByName(toolName);

      if (!tool) {
        return res.status(404).json({
          success: false,
          error: 'TOOL_NOT_FOUND',
          message: `Tool "${toolName}" not found`,
          availableTools: getToolNames(),
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
 * POST /api/mcp/pm-tools/execute
 * Execute a PM Decision tool
 *
 * Request body:
 * {
 *   "toolName": "capture_decision",
 *   "args": { ... tool-specific arguments }
 * }
 */
pmDecisionRouter.post(
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
      const tool = getToolByName(toolName);

      if (!tool) {
        return res.status(404).json({
          success: false,
          error: 'TOOL_NOT_FOUND',
          message: `Tool "${toolName}" not found`,
          availableTools: getToolNames(),
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
 * POST /api/mcp/pm-tools/:toolName
 * Execute a specific PM Decision tool (alternative route)
 *
 * Request body contains tool arguments directly
 */
pmDecisionRouter.post(
  '/:toolName',
  rateLimiter,
  async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const { toolName } = req.params;
      const args = req.body;

      // Find the tool
      const tool = getToolByName(toolName);

      if (!tool) {
        return res.status(404).json({
          success: false,
          error: 'TOOL_NOT_FOUND',
          message: `Tool "${toolName}" not found`,
          availableTools: getToolNames(),
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

export default pmDecisionRouter;

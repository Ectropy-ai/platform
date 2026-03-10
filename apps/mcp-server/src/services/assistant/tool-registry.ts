/**
 * Tool Registry
 *
 * Consolidates all available MCP tools into Claude-compatible format.
 * Imports tools from PM Decision system and other services.
 *
 * @module assistant/tool-registry
 * @version 1.0.0
 */

import type { ClaudeTool } from './types.js';
import { pmDecisionTools } from '../pm-decision-tools.js';
import { udeTools as udeToolDefs } from '../ude-tools.js';
import { crmTools as crmToolDefs } from '../crm-tools.js';

/**
 * Convert MCP tool schema to Claude tool format.
 *
 * @param tool - MCP tool definition
 * @returns Claude-compatible tool definition
 */
function convertToClaudeTool(tool: {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}): ClaudeTool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object',
      properties: tool.inputSchema.properties || {},
      required: tool.inputSchema.required,
    },
  };
}

/**
 * Core platform tools (non-PM tools).
 */
const coreTools: ClaudeTool[] = [
  {
    name: 'get_project_status',
    description:
      'Get the current status of a project including active decisions, pending inspections, and recent activity.',
    input_schema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project identifier',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'search_decisions',
    description:
      'Search for decisions across a project by keyword, status, or date range.',
    input_schema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project identifier',
        },
        query: {
          type: 'string',
          description: 'Search query (matches title, description, or tags)',
        },
        status: {
          type: 'string',
          enum: ['draft', 'pending', 'approved', 'rejected', 'escalated'],
          description: 'Filter by decision status',
        },
        fromDate: {
          type: 'string',
          description: 'Start date for date range filter (ISO 8601)',
        },
        toDate: {
          type: 'string',
          description: 'End date for date range filter (ISO 8601)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 10)',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'get_user_pending_actions',
    description:
      'Get all pending actions for the current user including decisions awaiting approval, inspections to complete, and escalations.',
    input_schema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Filter to a specific project (optional)',
        },
        includeCompleted: {
          type: 'boolean',
          description: 'Include recently completed actions (default: false)',
        },
      },
    },
  },
];

/**
 * All PM Decision tools converted to Claude format.
 */
const pmTools: ClaudeTool[] = pmDecisionTools.map(convertToClaudeTool);

/**
 * All UDE tools converted to Claude format.
 */
const udeTools: ClaudeTool[] = udeToolDefs.map(convertToClaudeTool);

/**
 * All CRM tools converted to Claude format.
 */
const crmToolsClaude: ClaudeTool[] = crmToolDefs.map(convertToClaudeTool);

/**
 * Complete registry of all available tools.
 */
export const toolRegistry: ClaudeTool[] = [
  ...coreTools,
  ...pmTools,
  ...udeTools,
  ...crmToolsClaude,
];

/**
 * Get tools filtered by category.
 *
 * @param category - Tool category to filter by
 * @returns Filtered tools
 */
export function getToolsByCategory(
  category: 'core' | 'pm-decision' | 'ude' | 'crm' | 'all'
): ClaudeTool[] {
  switch (category) {
    case 'core':
      return coreTools;
    case 'pm-decision':
      return pmTools;
    case 'ude':
      return udeTools;
    case 'crm':
      return crmToolsClaude;
    case 'all':
    default:
      return toolRegistry;
  }
}

/**
 * Get a specific tool by name.
 *
 * @param name - Tool name
 * @returns Tool definition or undefined
 */
export function getTool(name: string): ClaudeTool | undefined {
  return toolRegistry.find((t) => t.name === name);
}

/**
 * Get tool names as a list.
 */
export function getToolNames(): string[] {
  return toolRegistry.map((t) => t.name);
}

/**
 * Summary of registered tools for logging/debugging.
 */
export function getToolRegistrySummary(): {
  total: number;
  core: number;
  pmDecision: number;
  ude: number;
  crm: number;
  names: string[];
} {
  return {
    total: toolRegistry.length,
    core: coreTools.length,
    pmDecision: pmTools.length,
    ude: udeTools.length,
    crm: crmToolsClaude.length,
    names: getToolNames(),
  };
}

/**
 * Tool Executor
 *
 * Executes MCP tools by name, bridging Claude's tool calls to the
 * actual tool handlers. Handles error wrapping and result formatting.
 *
 * @module assistant/tool-executor
 * @version 1.0.0
 */

import type {
  ToolExecutionContext,
  ToolExecutionResult,
  ToolCallResult,
} from './types.js';
import { pmDecisionTools, getToolByName } from '../pm-decision-tools.js';
import { getUdeToolByName, udeTools } from '../ude-tools.js';
import { getCrmToolByName, crmTools } from '../crm-tools.js';

/**
 * Execute a tool by name with the given input.
 *
 * @param toolName - Name of the tool to execute
 * @param input - Input parameters for the tool
 * @param context - Execution context (user, authority, project)
 * @returns Tool execution result
 */
export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const startTime = Date.now();

  try {
    // Check for PM Decision tools first
    const pmTool = getToolByName(toolName);
    if (pmTool) {
      // Inject projectId from context if not provided
      const enrichedInput = {
        ...input,
        projectId: input.projectId || context.projectId,
      };

      const result = await pmTool.handler(enrichedInput);

      return {
        success: result.success,
        data: result.success ? result.data : undefined,
        error: result.success ? undefined : result.error?.message,
        metadata: {
          ...result.metadata,
          toolCategory: 'pm-decision',
          executionTimeMs: Date.now() - startTime,
        },
      };
    }

    // Check for UDE tools
    const udeTool = getUdeToolByName(toolName);
    if (udeTool) {
      const result = await udeTool.handler(input);
      return {
        success: result.success,
        data: result.success ? result.data : undefined,
        error: result.success ? undefined : result.error?.message,
        metadata: {
          ...result.metadata,
          toolCategory: 'ude',
          executionTimeMs: Date.now() - startTime,
        },
      };
    }

    // Check for CRM tools
    const crmTool = getCrmToolByName(toolName);
    if (crmTool) {
      const result = await crmTool.handler(input);
      return {
        success: result.success,
        data: result.success ? result.data : undefined,
        error: result.success ? undefined : result.error?.message,
        metadata: {
          ...result.metadata,
          toolCategory: 'crm',
          executionTimeMs: Date.now() - startTime,
        },
      };
    }

    // Check for core tools
    const coreResult = await executeCoreToolhandle(toolName, input, context);
    if (coreResult) {
      return coreResult;
    }

    // Tool not found
    return {
      success: false,
      error: `Unknown tool: ${toolName}`,
      metadata: {
        executionTimeMs: Date.now() - startTime,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown error during tool execution',
      metadata: {
        executionTimeMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Execute a core platform tool.
 */
async function executeCoreToolhandle(
  toolName: string,
  input: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult | null> {
  switch (toolName) {
    case 'get_project_status':
      return executeGetProjectStatus(input, context);

    case 'search_decisions':
      return executeSearchDecisions(input, context);

    case 'get_user_pending_actions':
      return executeGetUserPendingActions(input, context);

    default:
      return null;
  }
}

/**
 * Get project status implementation.
 */
async function executeGetProjectStatus(
  input: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const projectId = (input.projectId as string) || context.projectId;

  if (!projectId) {
    return {
      success: false,
      error: 'Project ID is required',
    };
  }

  // Use the query_decision_history tool to get stats
  const historyTool = getToolByName('query_decision_history');
  if (!historyTool) {
    return {
      success: false,
      error: 'Unable to retrieve project status',
    };
  }

  const result = await historyTool.handler({ projectId, limit: 100 });

  if (!result.success) {
    return {
      success: false,
      error: result.error?.message || 'Failed to get project decisions',
    };
  }

  const decisions = result.data as Array<{
    status: string;
    createdAt: string;
    title: string;
  }>;

  // Calculate statistics
  const statusCounts: Record<string, number> = {};
  for (const d of decisions) {
    statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
  }

  const recentDecisions = decisions
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, 5)
    .map((d) => ({ title: d.title, status: d.status, createdAt: d.createdAt }));

  return {
    success: true,
    data: {
      projectId,
      totalDecisions: decisions.length,
      statusBreakdown: statusCounts,
      pendingCount: statusCounts['PENDING'] || 0,
      approvedCount: statusCounts['APPROVED'] || 0,
      rejectedCount: statusCounts['REJECTED'] || 0,
      recentActivity: recentDecisions,
    },
  };
}

/**
 * Search decisions implementation.
 */
async function executeSearchDecisions(
  input: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const projectId = (input.projectId as string) || context.projectId;

  if (!projectId) {
    return {
      success: false,
      error: 'Project ID is required',
    };
  }

  const historyTool = getToolByName('query_decision_history');
  if (!historyTool) {
    return {
      success: false,
      error: 'Search tool unavailable',
    };
  }

  const result = await historyTool.handler({
    projectId,
    status: input.status,
    fromDate: input.fromDate,
    toDate: input.toDate,
    limit: (input.limit as number) || 10,
  });

  if (!result.success) {
    return {
      success: false,
      error: result.error?.message || 'Search failed',
    };
  }

  let decisions = result.data as Array<{ title: string; description?: string }>;

  // Filter by query if provided
  const query = input.query as string | undefined;
  if (query) {
    const searchTerms = query.toLowerCase().split(/\s+/);
    decisions = decisions.filter((d) => {
      const text = `${d.title} ${d.description || ''}`.toLowerCase();
      return searchTerms.some((term) => text.includes(term));
    });
  }

  return {
    success: true,
    data: {
      results: decisions,
      count: decisions.length,
      query: query || null,
    },
  };
}

/**
 * Get user pending actions implementation.
 */
async function executeGetUserPendingActions(
  input: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const projectId = (input.projectId as string) || context.projectId;

  // Query pending decisions
  const historyTool = getToolByName('query_decision_history');
  if (!historyTool) {
    return {
      success: false,
      error: 'Unable to retrieve pending actions',
    };
  }

  const params: Record<string, unknown> = {
    status: 'PENDING',
    limit: 50,
  };

  if (projectId) {
    params.projectId = projectId;
  }

  // Note: In a real implementation, we'd filter by user authority
  // For now, we show all pending items the user could potentially act on
  const result = await historyTool.handler(params);

  if (!result.success) {
    return {
      success: false,
      error: result.error?.message || 'Failed to get pending actions',
    };
  }

  const decisions = result.data as Array<{
    decisionId: string;
    title: string;
    authorityLevel: { required: number };
    createdAt: string;
  }>;

  // Filter by user authority level
  const actionableDecisions = decisions.filter(
    (d) => d.authorityLevel.required <= context.userAuthority
  );

  return {
    success: true,
    data: {
      pendingApprovals: actionableDecisions.map((d) => ({
        decisionId: d.decisionId,
        title: d.title,
        requiredAuthority: d.authorityLevel.required,
        createdAt: d.createdAt,
      })),
      totalPending: actionableDecisions.length,
      userAuthority: context.userAuthority,
    },
  };
}

/**
 * Execute multiple tools and collect results.
 *
 * @param toolCalls - Array of tool calls to execute
 * @param context - Execution context
 * @returns Array of tool call results
 */
export async function executeToolCalls(
  toolCalls: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
  }>,
  context: ToolExecutionContext
): Promise<ToolCallResult[]> {
  const results: ToolCallResult[] = [];

  for (const call of toolCalls) {
    const startTime = Date.now();
    const result = await executeTool(call.name, call.input, context);

    results.push({
      toolName: call.name,
      input: call.input,
      output: result.success ? result.data : { error: result.error },
      success: result.success,
      error: result.error,
      durationMs: Date.now() - startTime,
    });
  }

  return results;
}

/**
 * Get list of all available tool names.
 */
export function getAvailableToolNames(): string[] {
  const pmToolNames = pmDecisionTools.map((t) => t.name);
  const udeToolNames = udeTools.map((t) => t.name);
  const crmToolNames = crmTools.map((t) => t.name);
  const coreToolNames = [
    'get_project_status',
    'search_decisions',
    'get_user_pending_actions',
  ];
  return [...coreToolNames, ...pmToolNames, ...udeToolNames, ...crmToolNames];
}

/**
 * Unified Decision Engine MCP Tools
 *
 * 6 agent-facing tools that expose the Universal Decision Engine
 * through the MCP tool protocol. These tools use the PlatformContextAdapter
 * (via the ContextRegistry) to read .roadmap/ canonical data and return
 * it in universal format.
 *
 * Tools:
 *  1. read_current_truth    - Platform state nodes from current-truth.json
 *  2. read_roadmap          - Work units and containers from roadmap.json
 *  3. read_decision_log     - Decisions from decision-log.json
 *  4. get_feature_status    - Single work unit or state node by ID
 *  5. get_next_work         - Prioritized work recommendations
 *  6. get_health_assessment - 12-metric eigenmode health assessment
 *
 * @module services/ude-tools
 * @version 1.0.0
 * @see adapters/universal/context-adapter.interface.ts
 */

import { ContextRegistry } from '../adapters/context-registry.js';
import type { IContextAdapter } from '../adapters/universal/context-adapter.interface.js';
import type { MCPToolDefinition } from './pm-decision-tools.js';
import type { PMToolResult } from '../types/pm.types.js';

// ============================================================================
// Adapter Access & Utilities
// ============================================================================

/**
 * Get the platform adapter from the registry.
 * Falls back to 'platform' domain ID.
 */
function getAdapter(domainId: string = 'platform'): IContextAdapter {
  const registry = ContextRegistry.getInstance();
  return registry.getAdapter(domainId);
}

/**
 * Build metadata with timing.
 */
function meta(startTime: number): PMToolResult<unknown>['metadata'] {
  return {
    duration: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// Tool 1: read_current_truth
// ============================================================================

const readCurrentTruthTool: MCPToolDefinition = {
  name: 'read_current_truth',
  description:
    'Read the current platform state from the ground truth graph. Returns state nodes with their status, relationships, and metadata. Filter by node type, status, or phase.',
  inputSchema: {
    type: 'object',
    required: [],
    properties: {
      nodeType: {
        type: 'array',
        description:
          'Filter by node type(s) (e.g., "feature", "infrastructure", "deliverable")',
        items: { type: 'string' },
      },
      status: {
        type: 'array',
        description:
          'Filter by status(es): planned, active, completed, blocked, on-hold, cancelled, failed',
        items: { type: 'string' },
      },
      phase: {
        type: 'string',
        description: 'Filter by phase (e.g., "phase-5b")',
      },
      nodeId: {
        type: 'string',
        description:
          'Get a specific node by ID. If provided, other filters are ignored.',
      },
    },
  },
  handler: async (args): Promise<PMToolResult<unknown>> => {
    const startTime = Date.now();
    try {
      const adapter = getAdapter(args.domainId as string);

      // Single node lookup
      if (args.nodeId) {
        const node = await adapter.getStateNode(args.nodeId as string);
        if (!node) {
          return {
            success: false,
            error: {
              code: 'NODE_NOT_FOUND',
              message: `State node "${args.nodeId}" not found`,
            },
            metadata: meta(startTime),
          };
        }
        return {
          success: true,
          data: node,
          metadata: meta(startTime),
        };
      }

      // Filtered list
      const nodes = await adapter.getStateNodes({
        nodeType: args.nodeType as string[] | undefined,
        status: args.status as any,
        phase: args.phase as string | undefined,
      });

      return {
        success: true,
        data: {
          nodes,
          count: nodes.length,
          domain: adapter.getDomainContext(),
        },
        metadata: meta(startTime),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'READ_CURRENT_TRUTH_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: meta(startTime),
      };
    }
  },
};

// ============================================================================
// Tool 2: read_roadmap
// ============================================================================

const readRoadmapTool: MCPToolDefinition = {
  name: 'read_roadmap',
  description:
    'Read the project roadmap including work units (deliverables) and containers (quarters/phases). Filter by status, container, or owner.',
  inputSchema: {
    type: 'object',
    required: [],
    properties: {
      status: {
        type: 'array',
        description:
          'Filter work units by status: planned, active, completed, blocked, on-hold, cancelled',
        items: { type: 'string' },
      },
      containerId: {
        type: 'string',
        description:
          'Filter work units by container (quarter) ID (e.g., "q1_2026")',
      },
      owner: {
        type: 'string',
        description: 'Filter work units by owner',
      },
      includeContainers: {
        type: 'boolean',
        description:
          'Include container (quarter/phase) details in response (default: true)',
      },
      activeOnly: {
        type: 'boolean',
        description:
          'Shorthand: only return the active container and its work units (default: false)',
      },
    },
  },
  handler: async (args): Promise<PMToolResult<unknown>> => {
    const startTime = Date.now();
    try {
      const adapter = getAdapter(args.domainId as string);
      const includeContainers = (args.includeContainers as boolean) ?? true;
      const activeOnly = (args.activeOnly as boolean) ?? false;

      if (activeOnly) {
        const activeContainer = await adapter.getActiveContainer();
        const workUnits = activeContainer
          ? await adapter.getWorkUnits({ containerId: activeContainer.id })
          : [];

        return {
          success: true,
          data: {
            activeContainer,
            workUnits,
            workUnitCount: workUnits.length,
            domain: adapter.getDomainContext(),
          },
          metadata: meta(startTime),
        };
      }

      const workUnits = await adapter.getWorkUnits({
        status: args.status as any,
        containerId: args.containerId as string | undefined,
        owner: args.owner as string | undefined,
      });

      const result: Record<string, unknown> = {
        workUnits,
        workUnitCount: workUnits.length,
        domain: adapter.getDomainContext(),
      };

      if (includeContainers) {
        const containers = await adapter.getContainers();
        result.containers = containers;
        result.containerCount = containers.length;
      }

      return {
        success: true,
        data: result,
        metadata: meta(startTime),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'READ_ROADMAP_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: meta(startTime),
      };
    }
  },
};

// ============================================================================
// Tool 3: read_decision_log
// ============================================================================

const readDecisionLogTool: MCPToolDefinition = {
  name: 'read_decision_log',
  description:
    'Read the decision log. Returns architectural, governance, and technical decisions. Filter by status, category, impact level, or tags.',
  inputSchema: {
    type: 'object',
    required: [],
    properties: {
      status: {
        type: 'array',
        description:
          'Filter by status: planned, active, completed, blocked, on-hold, cancelled',
        items: { type: 'string' },
      },
      category: {
        type: 'string',
        description:
          'Filter by category (e.g., "governance", "technical", "architecture")',
      },
      impact: {
        type: 'array',
        description: 'Filter by impact level: low, medium, high, critical',
        items: { type: 'string' },
      },
      tags: {
        type: 'array',
        description: 'Filter by tags',
        items: { type: 'string' },
      },
      decisionId: {
        type: 'string',
        description:
          'Get a specific decision by ID. If provided, other filters are ignored.',
      },
    },
  },
  handler: async (args): Promise<PMToolResult<unknown>> => {
    const startTime = Date.now();
    try {
      const adapter = getAdapter(args.domainId as string);

      // Single decision lookup
      if (args.decisionId) {
        const decision = await adapter.getDecision(args.decisionId as string);
        if (!decision) {
          return {
            success: false,
            error: {
              code: 'DECISION_NOT_FOUND',
              message: `Decision "${args.decisionId}" not found`,
            },
            metadata: meta(startTime),
          };
        }
        return {
          success: true,
          data: decision,
          metadata: meta(startTime),
        };
      }

      // Filtered list
      const decisions = await adapter.getDecisions({
        status: args.status as any,
        category: args.category as string | undefined,
        impact: args.impact as any,
        tags: args.tags as string[] | undefined,
      });

      return {
        success: true,
        data: {
          decisions,
          count: decisions.length,
          domain: adapter.getDomainContext(),
        },
        metadata: meta(startTime),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'READ_DECISION_LOG_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: meta(startTime),
      };
    }
  },
};

// ============================================================================
// Tool 4: get_feature_status
// ============================================================================

const getFeatureStatusTool: MCPToolDefinition = {
  name: 'get_feature_status',
  description:
    'Get the status of a specific feature, deliverable, or work unit by ID. Searches both work units (roadmap) and state nodes (current truth). Returns the entity with its dependencies and related decisions.',
  inputSchema: {
    type: 'object',
    required: ['id'],
    properties: {
      id: {
        type: 'string',
        description:
          'The feature/deliverable/node ID to look up (e.g., "p5b-d21", "mcp-server-feature")',
      },
      includeDependencies: {
        type: 'boolean',
        description: 'Include dependency graph for this entity (default: true)',
      },
      includeDecisions: {
        type: 'boolean',
        description:
          'Include related decisions for this entity (default: true)',
      },
    },
  },
  handler: async (args): Promise<PMToolResult<unknown>> => {
    const startTime = Date.now();
    try {
      const adapter = getAdapter(args.domainId as string);
      const id = args.id as string;
      const includeDeps = (args.includeDependencies as boolean) ?? true;
      const includeDecisions = (args.includeDecisions as boolean) ?? true;

      // Try work unit first, then state node
      const workUnit = await adapter.getWorkUnit(id);
      const stateNode = await adapter.getStateNode(id);

      if (!workUnit && !stateNode) {
        return {
          success: false,
          error: {
            code: 'ENTITY_NOT_FOUND',
            message: `No work unit or state node found with ID "${id}"`,
          },
          metadata: meta(startTime),
        };
      }

      const result: Record<string, unknown> = {
        domain: adapter.getDomainContext(),
      };

      if (workUnit) {
        result.workUnit = workUnit;
        result.entityType = 'workUnit';
      }

      if (stateNode) {
        result.stateNode = stateNode;
        if (!workUnit) {
          result.entityType = 'stateNode';
        } else {
          result.entityType = 'both';
        }
      }

      if (includeDeps) {
        const dependencies = await adapter.getDependencies(id);
        result.dependencies = dependencies;
        result.dependencyCount = dependencies.length;
      }

      if (includeDecisions) {
        const allDecisions = await adapter.getDecisions();
        const related = allDecisions.filter(
          (d) =>
            d.impactedWorkUnitIds.includes(id) ||
            d.relatedDecisionIds.includes(id)
        );
        result.relatedDecisions = related;
        result.relatedDecisionCount = related.length;
      }

      return {
        success: true,
        data: result,
        metadata: meta(startTime),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'GET_FEATURE_STATUS_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: meta(startTime),
      };
    }
  },
};

// ============================================================================
// Tool 5: get_next_work
// ============================================================================

const getNextWorkTool: MCPToolDefinition = {
  name: 'get_next_work',
  description:
    'Get prioritized work recommendations based on current progress, blockers, decision context, and health metrics. Returns the most actionable work units ranked by priority.',
  inputSchema: {
    type: 'object',
    required: [],
    properties: {
      limit: {
        type: 'number',
        description:
          'Maximum number of recommendations to return (default: 5, max: 20)',
      },
    },
  },
  handler: async (args): Promise<PMToolResult<unknown>> => {
    const startTime = Date.now();
    try {
      const adapter = getAdapter(args.domainId as string);
      const limit = Math.min((args.limit as number) ?? 5, 20);

      const recommendations = await adapter.getWorkRecommendations(limit);

      return {
        success: true,
        data: {
          recommendations,
          count: recommendations.length,
          domain: adapter.getDomainContext(),
        },
        metadata: meta(startTime),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'GET_NEXT_WORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: meta(startTime),
      };
    }
  },
};

// ============================================================================
// Tool 6: get_health_assessment
// ============================================================================

const getHealthAssessmentTool: MCPToolDefinition = {
  name: 'get_health_assessment',
  description:
    'Compute the 12-metric eigenmode health assessment for the platform. Returns individual metrics (codebase health, test coverage, technical debt, etc.), overall score, eigenmode vector, and trend data.',
  inputSchema: {
    type: 'object',
    required: [],
    properties: {
      metricId: {
        type: 'string',
        description:
          'Get a single metric by ID instead of full assessment. IDs: codebase_health, test_coverage, technical_debt, dependency_freshness, ci_stability, deployment_frequency, documentation_coverage, api_stability, performance_regression, security_posture, team_velocity, feature_completion',
      },
      includeAuthority: {
        type: 'boolean',
        description:
          'Include the authority cascade configuration in response (default: false)',
      },
    },
  },
  handler: async (args): Promise<PMToolResult<unknown>> => {
    const startTime = Date.now();
    try {
      const adapter = getAdapter(args.domainId as string);

      // Single metric
      if (args.metricId) {
        const metric = await adapter.computeMetric(args.metricId as string);
        if (!metric) {
          return {
            success: false,
            error: {
              code: 'METRIC_NOT_FOUND',
              message: `Metric "${args.metricId}" not found`,
            },
            metadata: meta(startTime),
          };
        }
        return {
          success: true,
          data: metric,
          metadata: meta(startTime),
        };
      }

      // Full assessment
      const assessment = await adapter.computeHealthAssessment();

      const result: Record<string, unknown> = {
        assessment,
        domain: adapter.getDomainContext(),
      };

      if (args.includeAuthority) {
        result.authorityCascade = await adapter.getAuthorityCascade();
      }

      return {
        success: true,
        data: result,
        metadata: meta(startTime),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'HEALTH_ASSESSMENT_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: meta(startTime),
      };
    }
  },
};

// ============================================================================
// Tool Registry
// ============================================================================

/**
 * All 6 UDE MCP tool definitions.
 */
export const udeTools: MCPToolDefinition[] = [
  readCurrentTruthTool,
  readRoadmapTool,
  // readDecisionLogTool removed — reads .roadmap/decision-log.json (platform
  // architecture decisions), NOT construction PM decisions. SEPPA must use
  // query_decision_history (PostgreSQL pm_decisions table) for all project
  // decision queries. Per DEC-007: platform governance tools belong in
  // MCP-ECTROPY-BUSINESS, not MCP-CONSTRUCTION (SEPPA).
  getFeatureStatusTool,
  getNextWorkTool,
  getHealthAssessmentTool,
];

/**
 * Find a UDE tool by name.
 */
export function getUdeToolByName(name: string): MCPToolDefinition | undefined {
  return udeTools.find((tool) => tool.name === name);
}

/**
 * Get all UDE tool names.
 */
export function getUdeToolNames(): string[] {
  return udeTools.map((tool) => tool.name);
}

/**
 * Register all UDE tools with a server.
 */
export function registerUdeTools(server: {
  registerTool: (_tool: MCPToolDefinition) => void;
}): void {
  for (const tool of udeTools) {
    server.registerTool(tool);
  }
}

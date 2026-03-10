/**
 * Dual-Process Decision MCP Tools - DP-M3/M4
 *
 * MCP tool definitions and handlers for the Dual-Process Decision Architecture.
 * Engine 1 (Success Stack) provides fast pattern-matching from validated decisions.
 * Engine 2 (Possibility Space) provides deliberate option generation and SDI projection.
 *
 * Engine 1 Tools:
 * - query_success_stack: Query patterns from the Success Stack
 * - get_pattern_details: Get details of a specific success pattern
 * - compress_decision_pattern: Compress a decision into a reusable pattern
 * - store_success_pattern: Store a new success pattern
 * - decay_patterns: Apply temporal decay to all patterns
 *
 * Engine 2 Tools:
 * - generate_options: Generate and evaluate options from the Possibility Space
 * - project_sdi_impact: Project SDI impact of a proposed action
 * - rank_actions_by_sdi: Rank multiple actions by their SDI impact
 * - get_options_summary: Get summary statistics of generated options
 *
 * Utility Tools:
 * - compute_sdi: Compute Systemic Decision Intelligence metrics
 * - compute_eigenmode_similarity: Compare eigenmode vectors
 *
 * @see .roadmap/features/dual-process-decision/FEATURE.json
 * @version 2.0.0
 */

import type {
  SuccessPattern,
  EigenmodeVector,
  Engine1Output,
  Engine2Output,
  QuerySuccessStackInput,
  DecisionEvent,
  SuccessPatternURN,
  SDICalculationResult,
  SDIComponents,
  MediationDecision,
  DecisionTrigger,
  ExplorationBudget,
} from '../types/dual-process.types.js';

import {
  querySuccessStack,
  getPatternDetails,
  storePattern,
  removePattern,
  updatePattern,
  decayAllPatterns,
  getStoreStatistics,
  type StoreResult,
  type UpdateResult,
  type DecayResult,
} from './success-stack.service.js';

import {
  compressDecision,
  validateForCompression,
  type CompressionResult,
} from './pattern-compression.service.js';

import {
  computeCosineSimilarity,
  computeEuclideanDistance,
  areVectorsSimilar,
  findMostSimilarVector,
} from './eigenmode-similarity.service.js';

import {
  mediateDecision,
  type MediationInput,
} from './usf-mediator.service.js';

import {
  calculateExplorationBudget,
  type ExplorationBudgetInput,
} from './exploration-budget.service.js';

import {
  calculateSDI,
  computeSDIFromComponents,
  classifySDI,
  type SDICalculationInput,
} from './sdi-calculator.service.js';

import {
  projectSDI,
  projectMultipleActions,
  rankActionsBySDIImpact,
  type ProposedAction,
  type SDIProjectionResult,
  type ProjectSDIInput,
} from './sdi-projector.service.js';

import {
  generateOptions,
  findBestOption,
  filterByRiskLevel,
  getOptionsSummary,
  type GenerateOptionsInput,
  type GenerateOptionsOutput,
  type DecisionContext,
  type Option,
} from './possibility-space.service.js';

// ============================================================================
// Tool Result Type
// ============================================================================

/**
 * Standard tool result type
 */
export interface DualProcessToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  metadata: {
    duration: number;
    timestamp: string;
    toolName: string;
  };
}

// ============================================================================
// MCP Tool Definition Type
// ============================================================================

/**
 * MCP Tool Definition interface
 */
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    required?: string[];
    properties: Record<string, unknown>;
  };
  handler: (args: Record<string, unknown>) => Promise<DualProcessToolResult>;
}

// ============================================================================
// Query Success Stack Tool
// ============================================================================

const querySuccessStackTool: MCPToolDefinition = {
  name: 'query_success_stack',
  description:
    'Query the Success Stack (Engine 1) for patterns matching a given context. Returns applicable patterns ranked by relevance with confidence scores.',
  inputSchema: {
    type: 'object',
    required: ['projectId', 'contextSignature'],
    properties: {
      projectId: {
        type: 'string',
        description: 'Project identifier',
      },
      contextSignature: {
        type: 'array',
        items: { type: 'number' },
        minItems: 12,
        maxItems: 12,
        description: '12-element eigenmode vector from EFAS decomposition',
      },
      actionType: {
        type: 'string',
        description: 'Filter by specific action type (optional)',
      },
      similarityThreshold: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        default: 0.85,
        description: 'Minimum similarity threshold (0-1)',
      },
      maxResults: {
        type: 'number',
        minimum: 1,
        maximum: 100,
        default: 10,
        description: 'Maximum number of results to return',
      },
      includeGlobalPatterns: {
        type: 'boolean',
        default: true,
        description: 'Include patterns from global success pool',
      },
    },
  },
  handler: async (args): Promise<DualProcessToolResult<Engine1Output>> => {
    const startTime = Date.now();
    try {
      const input: QuerySuccessStackInput = {
        projectId: args.projectId as string,
        contextSignature: args.contextSignature as EigenmodeVector,
        actionType: args.actionType as string | undefined,
        similarityThreshold: args.similarityThreshold as number | undefined,
        maxResults: args.maxResults as number | undefined,
        includeGlobalPatterns: args.includeGlobalPatterns as boolean | undefined,
      };

      const result = await querySuccessStack(input);

      return {
        success: true,
        data: result,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'query_success_stack',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: {
          code: 'QUERY_SUCCESS_STACK_ERROR',
          message,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'query_success_stack',
        },
      };
    }
  },
};

// ============================================================================
// Get Pattern Details Tool
// ============================================================================

const getPatternDetailsTool: MCPToolDefinition = {
  name: 'get_pattern_details',
  description:
    'Get detailed information about a specific success pattern by its URN',
  inputSchema: {
    type: 'object',
    required: ['patternUrn'],
    properties: {
      patternUrn: {
        type: 'string',
        pattern: '^urn:luhtech:[^:]+:success-pattern:.*$',
        description: 'Success pattern URN',
      },
      includeSourceDecisions: {
        type: 'boolean',
        default: false,
        description: 'Include list of source decisions that formed this pattern',
      },
    },
  },
  handler: async (args): Promise<DualProcessToolResult<SuccessPattern | null>> => {
    const startTime = Date.now();
    try {
      const patternUrn = args.patternUrn as SuccessPatternURN;
      const includeSourceDecisions = args.includeSourceDecisions as boolean;

      const pattern = getPatternDetails(patternUrn, { includeSourceDecisions });

      return {
        success: true,
        data: pattern || null,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'get_pattern_details',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: {
          code: 'GET_PATTERN_DETAILS_ERROR',
          message,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'get_pattern_details',
        },
      };
    }
  },
};

// ============================================================================
// Compress Decision Pattern Tool
// ============================================================================

const compressDecisionPatternTool: MCPToolDefinition = {
  name: 'compress_decision_pattern',
  description:
    'Compress a decision into the Success Stack as a reusable pattern. Validates through four gates (succeeded, replicable, generalizable, significant) and either creates a new pattern or merges with existing similar patterns.',
  inputSchema: {
    type: 'object',
    required: ['decision'],
    properties: {
      decision: {
        type: 'object',
        description: 'Decision event to compress',
        properties: {
          $id: { type: 'string', description: 'Decision event URN' },
          projectId: { type: 'string' },
          contextSignature: {
            type: 'array',
            items: { type: 'number' },
            minItems: 12,
            maxItems: 12,
          },
          trigger: {
            type: 'object',
            properties: {
              type: { type: 'string' },
            },
          },
          outcome: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              actualVsProjected: { type: 'number' },
              completedAt: { type: 'string' },
            },
          },
          action: {
            type: 'object',
            properties: {
              actionType: { type: 'string' },
              parameters: { type: 'object' },
            },
          },
        },
      },
      existingPatterns: {
        type: 'array',
        items: { type: 'object' },
        description: 'Existing patterns to check for merge potential',
      },
      similarityThreshold: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        default: 0.85,
        description: 'Threshold for pattern similarity matching',
      },
    },
  },
  handler: async (args): Promise<DualProcessToolResult<CompressionResult>> => {
    const startTime = Date.now();
    try {
      const decision = args.decision as unknown as DecisionEvent;
      const existingPatterns = (args.existingPatterns as SuccessPattern[]) || [];
      const similarityThreshold = (args.similarityThreshold as number) || 0.85;

      const result = compressDecision(decision, existingPatterns, {
        config: { similarityThreshold },
      });

      return {
        success: true,
        data: result,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'compress_decision_pattern',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: {
          code: 'COMPRESS_DECISION_ERROR',
          message,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'compress_decision_pattern',
        },
      };
    }
  },
};

// ============================================================================
// Store Success Pattern Tool
// ============================================================================

const storeSuccessPatternTool: MCPToolDefinition = {
  name: 'store_success_pattern',
  description: 'Store a new success pattern in the Success Stack',
  inputSchema: {
    type: 'object',
    required: ['pattern'],
    properties: {
      pattern: {
        type: 'object',
        description: 'Success pattern to store',
        properties: {
          $id: { type: 'string', description: 'Pattern URN' },
          contextSignature: {
            type: 'array',
            items: { type: 'number' },
            minItems: 12,
            maxItems: 12,
          },
          actionType: { type: 'string' },
          actionTemplate: { type: 'object' },
          outcomeProfile: { type: 'object' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          frequency: { type: 'number', minimum: 0 },
          projectId: { type: 'string' },
          isGlobal: { type: 'boolean', default: false },
        },
      },
    },
  },
  handler: async (args): Promise<DualProcessToolResult<StoreResult>> => {
    const startTime = Date.now();
    try {
      const pattern = args.pattern as SuccessPattern;

      const result = storePattern(pattern);

      return {
        success: result.success,
        data: result,
        error: result.success
          ? undefined
          : {
              code: 'STORE_PATTERN_ERROR',
              message: result.error || 'Failed to store pattern',
            },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'store_success_pattern',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: {
          code: 'STORE_PATTERN_ERROR',
          message,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'store_success_pattern',
        },
      };
    }
  },
};

// ============================================================================
// Decay Patterns Tool
// ============================================================================

const decayPatternsTool: MCPToolDefinition = {
  name: 'decay_patterns',
  description:
    'Apply temporal decay to all patterns in the Success Stack. Uses exponential decay with 180-day half-life. Optionally prunes patterns that fall below the confidence threshold.',
  inputSchema: {
    type: 'object',
    properties: {
      pruneThreshold: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        default: 0.1,
        description: 'Confidence threshold below which patterns are removed',
      },
    },
  },
  handler: async (args): Promise<DualProcessToolResult<DecayResult>> => {
    const startTime = Date.now();
    try {
      const pruneThreshold = args.pruneThreshold as number | undefined;

      const result = decayAllPatterns({ pruneThreshold });

      return {
        success: true,
        data: result,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'decay_patterns',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: {
          code: 'DECAY_PATTERNS_ERROR',
          message,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'decay_patterns',
        },
      };
    }
  },
};

// ============================================================================
// Compute SDI Tool
// ============================================================================

const computeSDITool: MCPToolDefinition = {
  name: 'compute_sdi',
  description:
    'Compute Solution Density Index (SDI) for a project. SDI measures the density of viable decision paths in the current project state.',
  inputSchema: {
    type: 'object',
    required: ['projectId', 'components'],
    properties: {
      projectId: {
        type: 'string',
        description: 'Project identifier',
      },
      components: {
        type: 'object',
        description: 'SDI components for calculation',
        properties: {
          viablePathCount: { type: 'number', minimum: 0, description: 'Number of viable paths' },
          constraintCount: { type: 'number', minimum: 0, description: 'Number of active constraints' },
          resourceSlackRatio: { type: 'number', minimum: 0, maximum: 1, description: 'Ratio of slack resources' },
          eigenmodeStability: { type: 'number', minimum: 0, maximum: 1, description: 'Stability of eigenmodes' },
        },
        required: ['viablePathCount', 'constraintCount', 'resourceSlackRatio', 'eigenmodeStability'],
      },
      includeComponents: {
        type: 'boolean',
        default: true,
        description: 'Include component breakdown in result',
      },
      includeThresholds: {
        type: 'boolean',
        default: true,
        description: 'Include threshold information in result',
      },
    },
  },
  handler: async (args): Promise<DualProcessToolResult<SDICalculationResult>> => {
    const startTime = Date.now();
    try {
      const projectId = args.projectId as string;
      const components = args.components as SDIComponents;
      const includeComponents = args.includeComponents as boolean | undefined;
      const includeThresholds = args.includeThresholds as boolean | undefined;

      const input: SDICalculationInput = {
        projectId,
        components,
        includeComponents,
        includeThresholds,
      };

      const result = await calculateSDI(input);

      return {
        success: true,
        data: result,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'compute_sdi',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: {
          code: 'COMPUTE_SDI_ERROR',
          message,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'compute_sdi',
        },
      };
    }
  },
};

// ============================================================================
// Validate Pattern Compression Tool
// ============================================================================

const validatePatternCompressionTool: MCPToolDefinition = {
  name: 'validate_pattern_compression',
  description:
    'Validate whether a decision passes the four compression gates (succeeded, replicable, generalizable, significant) without actually compressing it.',
  inputSchema: {
    type: 'object',
    required: ['decision'],
    properties: {
      decision: {
        type: 'object',
        description: 'Decision event to validate',
      },
    },
  },
  handler: async (args): Promise<DualProcessToolResult<{ gates: { succeeded: boolean; replicable: boolean; generalizable: boolean; significant: boolean }; passesAll: boolean }>> => {
    const startTime = Date.now();
    try {
      const decision = args.decision as unknown as DecisionEvent;

      const gates = validateForCompression(decision);
      const passesAll = gates.succeeded && gates.replicable && gates.generalizable && gates.significant;

      return {
        success: true,
        data: {
          gates,
          passesAll,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'validate_pattern_compression',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: {
          code: 'VALIDATE_COMPRESSION_ERROR',
          message,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'validate_pattern_compression',
        },
      };
    }
  },
};

// ============================================================================
// Get Store Statistics Tool
// ============================================================================

const getStoreStatisticsTool: MCPToolDefinition = {
  name: 'get_success_stack_statistics',
  description:
    'Get statistics about the Success Stack pattern store',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (): Promise<DualProcessToolResult<ReturnType<typeof getStoreStatistics>>> => {
    const startTime = Date.now();
    try {
      const stats = getStoreStatistics();

      return {
        success: true,
        data: stats,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'get_success_stack_statistics',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: {
          code: 'GET_STATISTICS_ERROR',
          message,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'get_success_stack_statistics',
        },
      };
    }
  },
};

// ============================================================================
// Compute Similarity Tool
// ============================================================================

const computeSimilarityTool: MCPToolDefinition = {
  name: 'compute_eigenmode_similarity',
  description:
    'Compute cosine similarity between two eigenmode vectors',
  inputSchema: {
    type: 'object',
    required: ['vector1', 'vector2'],
    properties: {
      vector1: {
        type: 'array',
        items: { type: 'number' },
        minItems: 12,
        maxItems: 12,
        description: 'First eigenmode vector',
      },
      vector2: {
        type: 'array',
        items: { type: 'number' },
        minItems: 12,
        maxItems: 12,
        description: 'Second eigenmode vector',
      },
    },
  },
  handler: async (args): Promise<DualProcessToolResult<{ similarity: number; distance: number; isSimilar: boolean }>> => {
    const startTime = Date.now();
    try {
      const vector1 = args.vector1 as EigenmodeVector;
      const vector2 = args.vector2 as EigenmodeVector;

      const similarity = computeCosineSimilarity(vector1, vector2);
      const distance = computeEuclideanDistance(vector1, vector2);
      const isSimilar = areVectorsSimilar(vector1, vector2, 0.85);

      return {
        success: true,
        data: {
          similarity,
          distance,
          isSimilar,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'compute_eigenmode_similarity',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: {
          code: 'COMPUTE_SIMILARITY_ERROR',
          message,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'compute_eigenmode_similarity',
        },
      };
    }
  },
};

// ============================================================================
// Generate Options Tool (Engine 2)
// ============================================================================

const generateOptionsTool: MCPToolDefinition = {
  name: 'generate_options',
  description:
    'Generate and evaluate viable options from the Possibility Space (Engine 2). Returns options ranked by SDI impact with risk profiles and exploration values.',
  inputSchema: {
    type: 'object',
    required: ['projectId', 'currentComponents', 'decisionContext'],
    properties: {
      projectId: {
        type: 'string',
        description: 'Project identifier',
      },
      zoneId: {
        type: 'string',
        description: 'Zone identifier (optional)',
      },
      currentComponents: {
        type: 'object',
        description: 'Current SDI components',
        properties: {
          financialHealth: { type: 'number', minimum: 0, maximum: 1 },
          schedulePerformance: { type: 'number', minimum: 0, maximum: 1 },
          scopeStability: { type: 'number', minimum: 0, maximum: 1 },
          qualityMetrics: { type: 'number', minimum: 0, maximum: 1 },
          riskExposure: { type: 'number', minimum: 0, maximum: 1 },
          resourceUtilization: { type: 'number', minimum: 0, maximum: 1 },
          stakeholderSatisfaction: { type: 'number', minimum: 0, maximum: 1 },
          teamMorale: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
      decisionContext: {
        type: 'object',
        description: 'Decision context for option generation',
        properties: {
          triggerType: {
            type: 'string',
            enum: ['scheduled', 'exception', 'opportunity', 'escalation'],
          },
          constraints: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                type: { type: 'string' },
                description: { type: 'string' },
                severity: { type: 'string', enum: ['soft', 'hard'] },
                value: { type: 'number' },
              },
            },
          },
          resources: {
            type: 'object',
            properties: {
              laborHoursAvailable: { type: 'number' },
              budgetRemaining: { type: 'number' },
            },
          },
          urgency: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
      computationDepth: {
        type: 'number',
        minimum: 1,
        maximum: 10,
        default: 3,
        description: 'Computation depth (1-10)',
      },
      maxOptions: {
        type: 'number',
        minimum: 1,
        maximum: 50,
        default: 10,
        description: 'Maximum options to return',
      },
      includeRiskProfiles: {
        type: 'boolean',
        default: true,
        description: 'Include risk profile analysis',
      },
      existingPatterns: {
        type: 'array',
        items: { type: 'object' },
        description: 'Existing patterns for novelty detection',
      },
    },
  },
  handler: async (args): Promise<DualProcessToolResult<GenerateOptionsOutput>> => {
    const startTime = Date.now();
    try {
      const input: GenerateOptionsInput = {
        projectId: args.projectId as string,
        zoneId: args.zoneId as string | undefined,
        currentComponents: args.currentComponents as SDIComponents,
        decisionContext: args.decisionContext as DecisionContext,
        computationDepth: args.computationDepth as number | undefined,
        maxOptions: args.maxOptions as number | undefined,
        includeRiskProfiles: args.includeRiskProfiles as boolean | undefined,
        existingPatterns: args.existingPatterns as SuccessPattern[] | undefined,
      };

      const result = generateOptions(input);

      // Convert Maps to plain objects for JSON serialization
      const serializedResult = {
        ...result,
        sdiProjections: Object.fromEntries(result.sdiProjections),
        explorationValue: Object.fromEntries(result.explorationValue),
        riskProfiles: result.riskProfiles
          ? Object.fromEntries(result.riskProfiles)
          : undefined,
      };

      return {
        success: true,
        data: serializedResult as unknown as GenerateOptionsOutput,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'generate_options',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: {
          code: 'GENERATE_OPTIONS_ERROR',
          message,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'generate_options',
        },
      };
    }
  },
};

// ============================================================================
// Project SDI Impact Tool (Engine 2)
// ============================================================================

const projectSDIImpactTool: MCPToolDefinition = {
  name: 'project_sdi_impact',
  description:
    'Project the SDI impact of a proposed action. Returns projected SDI, confidence interval, and threshold crossing detection.',
  inputSchema: {
    type: 'object',
    required: ['projectId', 'currentComponents', 'proposedAction'],
    properties: {
      projectId: {
        type: 'string',
        description: 'Project identifier',
      },
      currentComponents: {
        type: 'object',
        description: 'Current SDI components',
      },
      proposedAction: {
        type: 'object',
        description: 'Proposed action to evaluate',
        properties: {
          actionType: { type: 'string' },
          parameters: { type: 'object' },
          targetUrn: { type: 'string' },
          estimatedCost: { type: 'number' },
          estimatedDuration: { type: 'number' },
        },
      },
      horizon: {
        type: 'number',
        minimum: 1,
        maximum: 365,
        default: 7,
        description: 'Projection horizon in days',
      },
      includeConfidence: {
        type: 'boolean',
        default: true,
        description: 'Include confidence interval',
      },
      includeCascading: {
        type: 'boolean',
        default: false,
        description: 'Include cascading effects analysis',
      },
      zoneId: {
        type: 'string',
        description: 'Zone identifier for cascading effects',
      },
      zoneDependencies: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            sourceZone: { type: 'string' },
            targetZone: { type: 'string' },
            impactWeight: { type: 'number' },
          },
        },
        description: 'Zone dependencies for cascading effects',
      },
    },
  },
  handler: async (args): Promise<DualProcessToolResult<SDIProjectionResult>> => {
    const startTime = Date.now();
    try {
      const input: ProjectSDIInput = {
        projectId: args.projectId as string,
        currentComponents: args.currentComponents as SDIComponents,
        proposedAction: args.proposedAction as ProposedAction,
        horizon: args.horizon as number | undefined,
        includeConfidence: args.includeConfidence as boolean | undefined,
        includeCascading: args.includeCascading as boolean | undefined,
        zoneId: args.zoneId as string | undefined,
        zoneDependencies: args.zoneDependencies as ProjectSDIInput['zoneDependencies'],
      };

      const result = projectSDI(input);

      return {
        success: true,
        data: result,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'project_sdi_impact',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: {
          code: 'PROJECT_SDI_ERROR',
          message,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'project_sdi_impact',
        },
      };
    }
  },
};

// ============================================================================
// Rank Actions by SDI Tool (Engine 2)
// ============================================================================

const rankActionsBySDITool: MCPToolDefinition = {
  name: 'rank_actions_by_sdi',
  description:
    'Rank multiple proposed actions by their projected SDI impact. Returns actions sorted from best to worst SDI outcome.',
  inputSchema: {
    type: 'object',
    required: ['projectId', 'currentComponents', 'actions'],
    properties: {
      projectId: {
        type: 'string',
        description: 'Project identifier',
      },
      currentComponents: {
        type: 'object',
        description: 'Current SDI components',
      },
      actions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            actionType: { type: 'string' },
            parameters: { type: 'object' },
          },
        },
        description: 'Actions to rank',
      },
      horizon: {
        type: 'number',
        minimum: 1,
        maximum: 365,
        default: 7,
        description: 'Projection horizon in days',
      },
      topN: {
        type: 'number',
        minimum: 1,
        default: 5,
        description: 'Number of top actions to return',
      },
    },
  },
  handler: async (args): Promise<DualProcessToolResult<Array<{ actionId: string; projection: SDIProjectionResult; rank: number }>>> => {
    const startTime = Date.now();
    try {
      const projectId = args.projectId as string;
      const currentComponents = args.currentComponents as SDIComponents;
      const actions = args.actions as ProposedAction[];
      const horizon = (args.horizon as number) || 7;
      const topN = (args.topN as number) || 5;

      // First project SDI for all actions
      const projections = projectMultipleActions(
        projectId,
        currentComponents,
        actions,
        { horizon }
      );

      // Then rank them
      const ranked = rankActionsBySDIImpact(projections, 'maximize');

      // Return top N results
      const topResults = ranked.slice(0, topN);

      return {
        success: true,
        data: topResults,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'rank_actions_by_sdi',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: {
          code: 'RANK_ACTIONS_ERROR',
          message,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'rank_actions_by_sdi',
        },
      };
    }
  },
};

// ============================================================================
// Get Options Summary Tool (Engine 2)
// ============================================================================

const getOptionsSummaryTool: MCPToolDefinition = {
  name: 'get_options_summary',
  description:
    'Get summary statistics for a set of generated options, including counts, averages, and risk distribution.',
  inputSchema: {
    type: 'object',
    required: ['options'],
    properties: {
      options: {
        type: 'array',
        items: {
          type: 'object',
        },
        description: 'Options to summarize',
      },
    },
  },
  handler: async (args): Promise<DualProcessToolResult<ReturnType<typeof getOptionsSummary>>> => {
    const startTime = Date.now();
    try {
      const options = args.options as Option[];

      const summary = getOptionsSummary(options);

      return {
        success: true,
        data: summary,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'get_options_summary',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: {
          code: 'GET_SUMMARY_ERROR',
          message,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'get_options_summary',
        },
      };
    }
  },
};

// ============================================================================
// Find Best Option Tool (Engine 2)
// ============================================================================

const findBestOptionTool: MCPToolDefinition = {
  name: 'find_best_option',
  description:
    'Find the best option from a set of generated options based on specified criteria (sdi, feasibility, exploration, or balanced).',
  inputSchema: {
    type: 'object',
    required: ['options'],
    properties: {
      options: {
        type: 'array',
        items: {
          type: 'object',
        },
        description: 'Options to evaluate',
      },
      criteria: {
        type: 'string',
        enum: ['sdi', 'feasibility', 'exploration', 'balanced'],
        default: 'balanced',
        description: 'Selection criteria',
      },
    },
  },
  handler: async (args): Promise<DualProcessToolResult<Option | undefined>> => {
    const startTime = Date.now();
    try {
      const options = args.options as Option[];
      const criteria = (args.criteria as 'sdi' | 'feasibility' | 'exploration' | 'balanced') || 'balanced';

      const best = findBestOption(options, criteria);

      return {
        success: true,
        data: best,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'find_best_option',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: {
          code: 'FIND_BEST_OPTION_ERROR',
          message,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'find_best_option',
        },
      };
    }
  },
};

// ============================================================================
// Filter By Risk Level Tool (Engine 2)
// ============================================================================

const filterByRiskLevelTool: MCPToolDefinition = {
  name: 'filter_by_risk_level',
  description:
    'Filter options by maximum acceptable risk level. Returns only options at or below the specified risk threshold.',
  inputSchema: {
    type: 'object',
    required: ['options', 'maxRisk'],
    properties: {
      options: {
        type: 'array',
        items: {
          type: 'object',
        },
        description: 'Options to filter',
      },
      maxRisk: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical'],
        description: 'Maximum acceptable risk level',
      },
    },
  },
  handler: async (args): Promise<DualProcessToolResult<Option[]>> => {
    const startTime = Date.now();
    try {
      const options = args.options as Option[];
      const maxRisk = args.maxRisk as 'low' | 'medium' | 'high' | 'critical';

      const filtered = filterByRiskLevel(options, maxRisk);

      return {
        success: true,
        data: filtered,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'filter_by_risk_level',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: {
          code: 'FILTER_RISK_ERROR',
          message,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'filter_by_risk_level',
        },
      };
    }
  },
};

// ============================================================================
// Mediate Decision Tool (USF Mediator)
// ============================================================================

const mediateDecisionTool: MCPToolDefinition = {
  name: 'mediate_decision',
  description:
    'Arbitrate between Engine 1 (Success Stack) and Engine 2 (Possibility Space) to make a decision. Implements the 5 decision paths based on SDI, confidence, and exploration budget: CRISIS_MODE, HIGH_CONFIDENCE_MATCH, PROMISING_EXPLORATION, NO_PATTERNS, DEFAULT_BLEND. Requires pre-computed engine outputs from query_success_stack and generate_options.',
  inputSchema: {
    type: 'object',
    required: ['projectId', 'trigger', 'actorId', 'components', 'eigenmodeContext', 'engine1Output', 'engine2Output'],
    properties: {
      projectId: {
        type: 'string',
        description: 'Project identifier',
      },
      zoneId: {
        type: 'string',
        description: 'Zone identifier (optional)',
      },
      trigger: {
        type: 'object',
        description: 'Decision trigger context',
        properties: {
          type: {
            type: 'string',
            enum: ['SCHEDULED', 'EXCEPTION', 'OPPORTUNITY', 'ESCALATION'],
            description: 'Trigger type',
          },
          source: {
            type: 'string',
            description: 'What triggered it (entity URN or event)',
          },
          urgency: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Urgency level (0-1)',
          },
          deadline: {
            type: 'string',
            description: 'ISO 8601 deadline timestamp',
          },
          context: {
            type: 'object',
            description: 'Additional context data',
          },
        },
        required: ['type', 'source', 'urgency'],
      },
      actorId: {
        type: 'string',
        description: 'Actor making the decision',
      },
      components: {
        type: 'object',
        description: 'SDI components for calculation',
        properties: {
          viablePathCount: { type: 'number', minimum: 0 },
          constraintCount: { type: 'number', minimum: 0 },
          resourceSlackRatio: { type: 'number', minimum: 0, maximum: 1 },
          eigenmodeStability: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['viablePathCount', 'constraintCount', 'resourceSlackRatio', 'eigenmodeStability'],
      },
      eigenmodeContext: {
        type: 'array',
        items: { type: 'number' },
        minItems: 12,
        maxItems: 12,
        description: '12-element eigenmode vector from EFAS decomposition',
      },
      engine1Output: {
        type: 'object',
        description: 'Output from query_success_stack tool',
      },
      engine2Output: {
        type: 'object',
        description: 'Output from generate_options tool',
      },
      forceEngine: {
        type: 'string',
        enum: ['engine1', 'engine2'],
        description: 'Force use of a specific engine (optional)',
      },
      dryRun: {
        type: 'boolean',
        default: false,
        description: 'Dry run without persisting decision',
      },
    },
  },
  handler: async (args): Promise<DualProcessToolResult<MediationDecision>> => {
    const startTime = Date.now();
    try {
      const input: MediationInput = {
        projectId: args.projectId as string,
        zoneId: args.zoneId as string | undefined,
        trigger: args.trigger as DecisionTrigger,
        actorId: args.actorId as string,
        components: args.components as SDIComponents,
        eigenmodeContext: args.eigenmodeContext as EigenmodeVector,
        engine1Output: args.engine1Output as Engine1Output,
        engine2Output: args.engine2Output as Engine2Output,
        forceEngine: args.forceEngine as 'engine1' | 'engine2' | undefined,
        dryRun: args.dryRun as boolean | undefined,
      };

      const result = await mediateDecision(input);

      return {
        success: true,
        data: result,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'mediate_decision',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: {
          code: 'MEDIATE_DECISION_ERROR',
          message,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'mediate_decision',
        },
      };
    }
  },
};

// ============================================================================
// Calculate Exploration Budget Tool
// ============================================================================

const calculateExplorationBudgetTool: MCPToolDefinition = {
  name: 'calculate_exploration_budget',
  description:
    'Calculate the exploration budget based on SDI, stability, and resources. Determines how much exploration (Engine 2) vs exploitation (Engine 1) to use. Formula: budget = (sdiFactor * 0.4) + (stabilityFactor * 0.35) + (resourceFactor * 0.25)',
  inputSchema: {
    type: 'object',
    required: ['sdiValue', 'eigenmodeStability', 'resourceSlackRatio'],
    properties: {
      sdiValue: {
        type: 'number',
        minimum: 0,
        description: 'Current SDI value',
      },
      eigenmodeStability: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Eigenmode stability (0-1)',
      },
      resourceSlackRatio: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Resource slack ratio (0-1)',
      },
      weights: {
        type: 'object',
        description: 'Custom weights for budget calculation (optional)',
        properties: {
          sdi: { type: 'number', minimum: 0, maximum: 1 },
          stability: { type: 'number', minimum: 0, maximum: 1 },
          resources: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
  },
  handler: async (args): Promise<DualProcessToolResult<ExplorationBudget>> => {
    const startTime = Date.now();
    try {
      const input: ExplorationBudgetInput = {
        sdiValue: args.sdiValue as number,
        eigenmodeStability: args.eigenmodeStability as number,
        resourceSlackRatio: args.resourceSlackRatio as number,
        weights: args.weights as ExplorationBudgetInput['weights'],
      };

      const result = calculateExplorationBudget(input);

      return {
        success: true,
        data: result,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'calculate_exploration_budget',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: {
          code: 'EXPLORATION_BUDGET_ERROR',
          message,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'calculate_exploration_budget',
        },
      };
    }
  },
};

// ============================================================================
// Tool Registry
// ============================================================================

/**
 * All Dual-Process Decision MCP tools
 */
export const dualProcessTools: MCPToolDefinition[] = [
  // Engine 1 (Success Stack) Tools
  querySuccessStackTool,
  getPatternDetailsTool,
  compressDecisionPatternTool,
  storeSuccessPatternTool,
  decayPatternsTool,
  validatePatternCompressionTool,
  getStoreStatisticsTool,
  // Engine 2 (Possibility Space) Tools
  generateOptionsTool,
  projectSDIImpactTool,
  rankActionsBySDITool,
  getOptionsSummaryTool,
  findBestOptionTool,
  filterByRiskLevelTool,
  // Mediation Tools (V3.1)
  mediateDecisionTool,
  calculateExplorationBudgetTool,
  // Utility Tools
  computeSDITool,
  computeSimilarityTool,
];

/**
 * Get a tool by name
 */
export function getDualProcessToolByName(name: string): MCPToolDefinition | undefined {
  return dualProcessTools.find((tool) => tool.name === name);
}

/**
 * Get all tool names
 */
export function getDualProcessToolNames(): string[] {
  return dualProcessTools.map((tool) => tool.name);
}

/**
 * Register all Dual-Process tools with an MCP server
 */
export function registerDualProcessTools(server: {
  registerTool: (tool: MCPToolDefinition) => void;
}): void {
  for (const tool of dualProcessTools) {
    server.registerTool(tool);
  }
}

export default dualProcessTools;

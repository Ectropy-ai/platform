/**
 * SDI (Solution Density Index) MCP Tools
 *
 * MCP tool definitions and handlers for the Solution Density Index calculation.
 * Enables AI agents to calculate and query SDI for dual-process decision making.
 *
 * Tools Implemented (2 total):
 * - calculate_sdi: Calculate SDI for a project/zone with optional components
 * - get_sdi_thresholds: Get SDI threshold configuration for a project
 *
 * @see .roadmap/features/dual-process-decision/interfaces.json
 * @see .roadmap/features/dual-process-decision/FEATURE.json
 * @version 1.0.0
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { DATA_CONFIG } from '../config/data-paths.config.js';

import {
  SDIClassification,
  DEFAULT_DUAL_PROCESS_CONFIG,
  type SDICalculationResult,
  type SDIComponents,
  type SDIThresholds,
  type SDISnapshot,
  type SDISnapshotURN,
  type CalculateSDIInput,
  type CalculateSDIOutput,
  type GetSDIThresholdsInput,
  type GetSDIThresholdsOutput,
} from '../types/dual-process.types.js';

import {
  calculateSDI,
  getSDIThresholds,
  computeSDIFromComponents,
  classifySDI,
  computeShannonEntropy,
  computeExplorationBudget,
  validateSDIComponents,
} from './sdi-calculator.service.js';

// ============================================================================
// Storage Helpers
// ============================================================================

function getRepoRoot(): string {
  return DATA_CONFIG.paths.repoRoot;
}

function getProjectDataDir(projectId: string): string {
  return join(getRepoRoot(), '.roadmap', 'projects', projectId);
}

function getSDISnapshotsPath(projectId: string): string {
  return join(getProjectDataDir(projectId), 'sdi-snapshots.json');
}

function ensureProjectDir(projectId: string): void {
  const dir = getProjectDataDir(projectId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ============================================================================
// SDI Snapshots Collection
// ============================================================================

/**
 * SDI Snapshots collection structure
 */
export interface SDISnapshotsCollection {
  $schema: string;
  $id: string;
  schemaVersion: string;
  meta: {
    projectId: string;
    sourceOfTruth: string;
    lastUpdated: string;
    totalSnapshots: number;
  };
  indexes: {
    byClassification: Record<string, string[]>;
    byZone: Record<string, string[]>;
  };
  snapshots: SDISnapshot[];
}

/**
 * SDI tool result wrapper
 */
export interface SDIToolResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    executionTimeMs: number;
    timestamp: string;
  };
}

// ============================================================================
// Collection Loaders/Savers
// ============================================================================

function loadSDISnapshots(projectId: string): SDISnapshotsCollection {
  const path = getSDISnapshotsPath(projectId);

  if (!existsSync(path)) {
    const initial: SDISnapshotsCollection = {
      $schema: 'https://luhtech.dev/schemas/decision/sdi-snapshots-collection.json',
      $id: `urn:luhtech:${projectId}:file:sdi-snapshots`,
      schemaVersion: '3.0.0',
      meta: {
        projectId,
        sourceOfTruth: `.roadmap/projects/${projectId}/sdi-snapshots.json`,
        lastUpdated: new Date().toISOString(),
        totalSnapshots: 0,
      },
      indexes: {
        byClassification: {},
        byZone: {},
      },
      snapshots: [],
    };
    ensureProjectDir(projectId);
    writeFileSync(path, JSON.stringify(initial, null, 2));
    return initial;
  }

  return JSON.parse(readFileSync(path, 'utf-8'));
}

function saveSDISnapshots(projectId: string, collection: SDISnapshotsCollection): void {
  const path = getSDISnapshotsPath(projectId);
  collection.meta.lastUpdated = new Date().toISOString();
  collection.meta.totalSnapshots = collection.snapshots.length;

  // Rebuild indexes
  const byClassification: Record<string, string[]> = {};
  const byZone: Record<string, string[]> = {};

  for (const snapshot of collection.snapshots) {
    const classification = snapshot.classification;
    if (!byClassification[classification]) {
      byClassification[classification] = [];
    }
    byClassification[classification].push(snapshot.$id);

    if (snapshot.zoneId) {
      if (!byZone[snapshot.zoneId]) {
        byZone[snapshot.zoneId] = [];
      }
      byZone[snapshot.zoneId].push(snapshot.$id);
    }
  }

  collection.indexes = { byClassification, byZone };
  writeFileSync(path, JSON.stringify(collection, null, 2));
}

// ============================================================================
// ID Generation
// ============================================================================

let sdiSnapshotIdCounter = 0;

function generateSDISnapshotId(): string {
  sdiSnapshotIdCounter++;
  const year = new Date().getFullYear();
  return `SDI-${year}-${String(sdiSnapshotIdCounter).padStart(4, '0')}`;
}

function buildSDISnapshotURN(projectId: string, snapshotId: string): SDISnapshotURN {
  return `urn:luhtech:${projectId}:sdi-snapshot:${snapshotId}` as SDISnapshotURN;
}

export function setSDIIdCounter(value: number): void {
  sdiSnapshotIdCounter = value;
}

// ============================================================================
// MCP Tool: calculate_sdi
// ============================================================================

/**
 * Calculate SDI for a project/zone
 *
 * This tool calculates the Solution Density Index for the current project state.
 * It can use provided components or fetch them from project data.
 *
 * @param input - Tool input parameters
 * @returns SDI calculation result with classification and exploration budget
 */
export async function tool_calculate_sdi(
  input: CalculateSDIInput & { components?: SDIComponents; saveSnapshot?: boolean }
): Promise<SDIToolResult<CalculateSDIOutput>> {
  const startTime = performance.now();

  try {
    const { projectId, zoneId, includeComponents, includeThresholds, components, saveSnapshot } = input;

    // Validate project ID
    if (!projectId || typeof projectId !== 'string') {
      return {
        success: false,
        error: 'Invalid projectId: must be a non-empty string',
      };
    }

    // Get or compute components
    let sdiComponents: SDIComponents;

    if (components) {
      // Validate provided components
      if (!validateSDIComponents(components)) {
        return {
          success: false,
          error: 'Invalid SDI components: values must be non-negative and ratios must be in [0,1]',
        };
      }
      sdiComponents = components;
    } else {
      // In a real implementation, this would fetch components from project data
      // For now, return an error if no components provided
      return {
        success: false,
        error: 'SDI components must be provided. In future versions, components can be computed from project data.',
      };
    }

    // Calculate SDI
    const result = await calculateSDI({
      projectId,
      zoneId,
      components: sdiComponents,
      includeComponents: includeComponents ?? true,
      includeThresholds: includeThresholds ?? true,
    });

    // Optionally save snapshot
    if (saveSnapshot) {
      const collection = loadSDISnapshots(projectId);
      const snapshotId = generateSDISnapshotId();

      const snapshot: SDISnapshot = {
        $id: buildSDISnapshotURN(projectId, snapshotId),
        projectId,
        zoneId,
        sdiValue: result.sdiValue,
        sdiLog: result.sdiLog,
        shannonEntropy: result.shannonEntropy,
        classification: result.classification,
        components: sdiComponents,
        timestamp: result.timestamp,
        graphMetadata: {
          inEdges: [],
          outEdges: [],
        },
      };

      collection.snapshots.push(snapshot);
      saveSDISnapshots(projectId, collection);
    }

    const executionTimeMs = performance.now() - startTime;

    return {
      success: true,
      data: result,
      metadata: {
        executionTimeMs,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error calculating SDI',
      metadata: {
        executionTimeMs: performance.now() - startTime,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

// ============================================================================
// MCP Tool: get_sdi_thresholds
// ============================================================================

/**
 * Get SDI thresholds for a project
 *
 * Returns the SDI threshold configuration, either project-specific or defaults.
 *
 * @param input - Tool input parameters
 * @returns SDI thresholds configuration
 */
export async function tool_get_sdi_thresholds(
  input: GetSDIThresholdsInput
): Promise<SDIToolResult<GetSDIThresholdsOutput>> {
  const startTime = performance.now();

  try {
    const { projectId } = input;

    // Validate project ID
    if (!projectId || typeof projectId !== 'string') {
      return {
        success: false,
        error: 'Invalid projectId: must be a non-empty string',
      };
    }

    const thresholds = await getSDIThresholds(projectId);

    const executionTimeMs = performance.now() - startTime;

    return {
      success: true,
      data: thresholds,
      metadata: {
        executionTimeMs,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error getting SDI thresholds',
      metadata: {
        executionTimeMs: performance.now() - startTime,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

// ============================================================================
// MCP Tool: query_sdi_history
// ============================================================================

/**
 * Query SDI snapshot history
 */
export interface QuerySDIHistoryInput {
  projectId: string;
  zoneId?: string;
  classification?: SDIClassification;
  limit?: number;
  since?: string; // ISO 8601 timestamp
}

export interface QuerySDIHistoryOutput {
  snapshots: SDISnapshot[];
  total: number;
  hasMore: boolean;
}

/**
 * Query historical SDI snapshots
 *
 * @param input - Query parameters
 * @returns Matching SDI snapshots
 */
export async function tool_query_sdi_history(
  input: QuerySDIHistoryInput
): Promise<SDIToolResult<QuerySDIHistoryOutput>> {
  const startTime = performance.now();

  try {
    const { projectId, zoneId, classification, limit = 50, since } = input;

    // Validate project ID
    if (!projectId || typeof projectId !== 'string') {
      return {
        success: false,
        error: 'Invalid projectId: must be a non-empty string',
      };
    }

    const collection = loadSDISnapshots(projectId);
    let snapshots = [...collection.snapshots];

    // Filter by zone
    if (zoneId) {
      snapshots = snapshots.filter((s) => s.zoneId === zoneId);
    }

    // Filter by classification
    if (classification) {
      snapshots = snapshots.filter((s) => s.classification === classification);
    }

    // Filter by timestamp
    if (since) {
      const sinceDate = new Date(since).getTime();
      snapshots = snapshots.filter((s) => new Date(s.timestamp).getTime() >= sinceDate);
    }

    // Sort by timestamp descending (most recent first)
    snapshots.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit
    const total = snapshots.length;
    const hasMore = total > limit;
    snapshots = snapshots.slice(0, limit);

    const executionTimeMs = performance.now() - startTime;

    return {
      success: true,
      data: {
        snapshots,
        total,
        hasMore,
      },
      metadata: {
        executionTimeMs,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error querying SDI history',
      metadata: {
        executionTimeMs: performance.now() - startTime,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

// ============================================================================
// MCP Tool: get_exploration_budget
// ============================================================================

/**
 * Get exploration budget for current state
 */
export interface GetExplorationBudgetInput {
  projectId: string;
  zoneId?: string;
  sdiValue: number;
  eigenmodeStability: number;
  resourceSlackRatio: number;
  includeBreakdown?: boolean;
}

/**
 * Calculate exploration budget from current state
 *
 * @param input - Budget calculation parameters
 * @returns Exploration budget with optional breakdown
 */
export async function tool_get_exploration_budget(
  input: GetExplorationBudgetInput
): Promise<SDIToolResult<import('../types/dual-process.types.js').ExplorationBudget>> {
  const startTime = performance.now();

  try {
    const { projectId, sdiValue, eigenmodeStability, resourceSlackRatio } = input;

    // Validate inputs
    if (!projectId || typeof projectId !== 'string') {
      return {
        success: false,
        error: 'Invalid projectId: must be a non-empty string',
      };
    }

    if (typeof sdiValue !== 'number' || sdiValue < 0) {
      return {
        success: false,
        error: 'Invalid sdiValue: must be a non-negative number',
      };
    }

    if (typeof eigenmodeStability !== 'number' || eigenmodeStability < 0 || eigenmodeStability > 1) {
      return {
        success: false,
        error: 'Invalid eigenmodeStability: must be a number between 0 and 1',
      };
    }

    if (typeof resourceSlackRatio !== 'number' || resourceSlackRatio < 0 || resourceSlackRatio > 1) {
      return {
        success: false,
        error: 'Invalid resourceSlackRatio: must be a number between 0 and 1',
      };
    }

    const thresholds = await getSDIThresholds(projectId);

    const budget = computeExplorationBudget({
      sdiValue,
      eigenmodeStability,
      resourceSlackRatio,
      thresholds,
    });

    const executionTimeMs = performance.now() - startTime;

    return {
      success: true,
      data: budget,
      metadata: {
        executionTimeMs,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error calculating exploration budget',
      metadata: {
        executionTimeMs: performance.now() - startTime,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

// ============================================================================
// Tool Definitions for MCP Registration
// ============================================================================

/**
 * MCP tool definitions for SDI tools
 */
export const SDI_TOOL_DEFINITIONS = [
  {
    name: 'calculate_sdi',
    description: 'Calculate Solution Density Index for current project/zone context. SDI measures the density of viable decision paths, enabling calibration of exploration vs exploitation.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project identifier',
        },
        zoneId: {
          type: 'string',
          description: 'Optional takt zone for localized SDI',
        },
        components: {
          type: 'object',
          properties: {
            viablePathCount: { type: 'integer', description: 'Number of constraint-satisfying paths' },
            constraintCount: { type: 'integer', description: 'Number of active constraints' },
            resourceSlackRatio: { type: 'number', minimum: 0, maximum: 1, description: 'Available slack (0-1)' },
            eigenmodeStability: { type: 'number', minimum: 0, maximum: 1, description: 'Eigenmode stability (0-1)' },
          },
          required: ['viablePathCount', 'constraintCount', 'resourceSlackRatio', 'eigenmodeStability'],
        },
        includeComponents: {
          type: 'boolean',
          default: true,
          description: 'Include component breakdown in response',
        },
        includeThresholds: {
          type: 'boolean',
          default: true,
          description: 'Include threshold values in response',
        },
        saveSnapshot: {
          type: 'boolean',
          default: false,
          description: 'Save SDI calculation as snapshot',
        },
      },
      required: ['projectId', 'components'],
    },
  },
  {
    name: 'get_sdi_thresholds',
    description: 'Retrieve project-specific SDI thresholds for classification (critical, warning, healthy, abundant).',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project identifier',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'query_sdi_history',
    description: 'Query historical SDI snapshots for trend analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project identifier',
        },
        zoneId: {
          type: 'string',
          description: 'Filter by zone',
        },
        classification: {
          type: 'string',
          enum: ['CRITICAL', 'WARNING', 'HEALTHY', 'ABUNDANT'],
          description: 'Filter by classification',
        },
        limit: {
          type: 'integer',
          default: 50,
          minimum: 1,
          maximum: 1000,
          description: 'Maximum snapshots to return',
        },
        since: {
          type: 'string',
          format: 'date-time',
          description: 'Filter snapshots since timestamp',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'get_exploration_budget',
    description: 'Calculate exploration budget based on current state (SDI, stability, resources).',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project identifier',
        },
        zoneId: {
          type: 'string',
          description: 'Optional zone',
        },
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
        includeBreakdown: {
          type: 'boolean',
          default: true,
          description: 'Include factor breakdown',
        },
      },
      required: ['projectId', 'sdiValue', 'eigenmodeStability', 'resourceSlackRatio'],
    },
  },
];

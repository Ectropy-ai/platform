/**
 * Dependency Management MCP Tools - V3.1
 *
 * MCP tool definitions and handlers for milestone and decision dependency management.
 * Implements DAG (Directed Acyclic Graph) validation and date propagation.
 *
 * Tools Implemented (3 total):
 * - validate_dag: Validate acyclic graph for milestones/decisions
 * - propagate_date_change: Cascade changes from LEAD to DERIVED milestones
 * - resolve_dependencies: Full predecessor/successor tree resolution
 *
 * @see .roadmap/features/dual-process-decision/FEATURE.json
 * @see ECTROPY_DEMO_STRATEGY_2026-01-29.md Section 3.2
 * @version 1.0.0
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { DATA_CONFIG } from '../config/data-paths.config.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Node in the dependency graph
 */
export interface DependencyNode {
  id: string;
  $id?: string; // URN identifier
  name: string;
  classification: 'LEAD' | 'DERIVED' | 'EXTERNAL' | 'FLEXIBLE';
  status: string;
  targetDate?: string;
  completionDate?: string;
  dependencies: string[]; // predecessor IDs
  dependents?: string[]; // successor IDs (computed)
}

/**
 * Dependency graph structure
 */
export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: Array<{ from: string; to: string }>;
}

/**
 * DAG validation result
 */
export interface DAGValidationResult {
  isValid: boolean;
  hasNoCycles: boolean;
  cycles: string[][];
  orphanNodes: string[];
  isolatedNodes: string[];
  totalNodes: number;
  totalEdges: number;
  maxDepth: number;
  criticalPath: string[];
  warnings: string[];
}

/**
 * Date propagation result
 */
export interface DatePropagationResult {
  success: boolean;
  sourceNode: string;
  newDate: string;
  propagatedNodes: Array<{
    nodeId: string;
    previousDate: string;
    newDate: string;
    reason: string;
  }>;
  skippedNodes: Array<{
    nodeId: string;
    reason: string;
  }>;
  warnings: string[];
}

/**
 * Dependency resolution result
 */
export interface DependencyResolutionResult {
  nodeId: string;
  predecessors: Array<{
    id: string;
    name: string;
    classification: string;
    status: string;
    depth: number;
  }>;
  successors: Array<{
    id: string;
    name: string;
    classification: string;
    status: string;
    depth: number;
  }>;
  criticalPredecessors: string[];
  blockingPredecessors: string[];
  dependentCount: number;
  impactRadius: number;
}

/**
 * Tool result wrapper
 */
export interface DependencyToolResult<T = unknown> {
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
  handler: (args: Record<string, unknown>) => Promise<DependencyToolResult>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Load milestone data from roadmap files
 */
function loadMilestones(): DependencyNode[] {
  const roadmapPath = DATA_CONFIG.files.roadmap;

  if (!existsSync(roadmapPath)) {
    throw new Error(`Roadmap file not found: ${roadmapPath}`);
  }

  const data = readFileSync(roadmapPath, 'utf-8');
  const roadmap = JSON.parse(data);

  const milestones: DependencyNode[] = [];

  // Extract milestones from phases
  if (roadmap.phases && Array.isArray(roadmap.phases)) {
    for (const phase of roadmap.phases) {
      if (phase.milestones && Array.isArray(phase.milestones)) {
        for (const milestone of phase.milestones) {
          milestones.push({
            id: milestone.id,
            $id: milestone.$id,
            name: milestone.name || milestone.title,
            classification: milestone.classification || 'FLEXIBLE',
            status: milestone.status,
            targetDate: milestone.targetDate,
            completionDate: milestone.completionDate,
            dependencies: milestone.dependencies || [],
          });
        }
      }
      // Also check for deliverables as milestones
      if (phase.deliverables && Array.isArray(phase.deliverables)) {
        for (const deliverable of phase.deliverables) {
          milestones.push({
            id: deliverable.id,
            $id: deliverable.$id,
            name: deliverable.name || deliverable.title,
            classification: deliverable.classification || 'DERIVED',
            status: deliverable.status,
            targetDate: deliverable.targetDate,
            completionDate: deliverable.completionDate,
            dependencies: deliverable.dependencies || [],
          });
        }
      }
    }
  }

  return milestones;
}

/**
 * Build dependency graph from nodes
 */
function buildGraph(nodes: DependencyNode[]): DependencyGraph {
  const nodeMap = new Map<string, DependencyNode>();
  const edges: Array<{ from: string; to: string }> = [];

  // First pass: add all nodes
  for (const node of nodes) {
    nodeMap.set(node.id, { ...node, dependents: [] });
  }

  // Second pass: build edges and dependents
  for (const node of nodes) {
    for (const depId of node.dependencies) {
      edges.push({ from: depId, to: node.id });
      const depNode = nodeMap.get(depId);
      if (depNode) {
        depNode.dependents = depNode.dependents || [];
        depNode.dependents.push(node.id);
      }
    }
  }

  return { nodes: nodeMap, edges };
}

/**
 * Detect cycles in the graph using DFS
 */
function detectCycles(graph: DependencyGraph): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    const node = graph.nodes.get(nodeId);
    if (node) {
      for (const depId of node.dependencies) {
        if (!visited.has(depId)) {
          if (dfs(depId)) {
            return true;
          }
        } else if (recursionStack.has(depId)) {
          // Found a cycle
          const cycleStart = path.indexOf(depId);
          const cycle = path.slice(cycleStart);
          cycle.push(depId); // Close the cycle
          cycles.push(cycle);
        }
      }
    }

    path.pop();
    recursionStack.delete(nodeId);
    return false;
  }

  for (const nodeId of graph.nodes.keys()) {
    if (!visited.has(nodeId)) {
      dfs(nodeId);
    }
  }

  return cycles;
}

/**
 * Find orphan nodes (nodes with dependencies that don't exist)
 */
function findOrphanNodes(graph: DependencyGraph): string[] {
  const orphans: string[] = [];

  for (const [nodeId, node] of graph.nodes) {
    for (const depId of node.dependencies) {
      if (!graph.nodes.has(depId)) {
        orphans.push(`${nodeId} -> ${depId} (missing)`);
      }
    }
  }

  return orphans;
}

/**
 * Find isolated nodes (no dependencies and no dependents)
 */
function findIsolatedNodes(graph: DependencyGraph): string[] {
  const isolated: string[] = [];

  for (const [nodeId, node] of graph.nodes) {
    if (node.dependencies.length === 0 && (!node.dependents || node.dependents.length === 0)) {
      isolated.push(nodeId);
    }
  }

  return isolated;
}

/**
 * Calculate max depth using BFS
 */
function calculateMaxDepth(graph: DependencyGraph): number {
  const depths = new Map<string, number>();

  // Find root nodes (no dependencies)
  const roots: string[] = [];
  for (const [nodeId, node] of graph.nodes) {
    if (node.dependencies.length === 0) {
      roots.push(nodeId);
      depths.set(nodeId, 0);
    }
  }

  // BFS to calculate depths
  const queue = [...roots];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const node = graph.nodes.get(nodeId);
    const currentDepth = depths.get(nodeId) || 0;

    if (node?.dependents) {
      for (const depId of node.dependents) {
        const existingDepth = depths.get(depId) || 0;
        const newDepth = currentDepth + 1;
        if (newDepth > existingDepth) {
          depths.set(depId, newDepth);
        }
        queue.push(depId);
      }
    }
  }

  return Math.max(0, ...depths.values());
}

/**
 * Find critical path (longest path through the graph)
 */
function findCriticalPath(graph: DependencyGraph): string[] {
  const depths = new Map<string, number>();
  const predecessors = new Map<string, string>();

  // Find root nodes
  const roots: string[] = [];
  for (const [nodeId, node] of graph.nodes) {
    if (node.dependencies.length === 0) {
      roots.push(nodeId);
      depths.set(nodeId, 0);
    }
  }

  // Topological sort with depth tracking
  const queue = [...roots];
  let maxDepthNode = roots[0];
  let maxDepth = 0;

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const node = graph.nodes.get(nodeId);
    const currentDepth = depths.get(nodeId) || 0;

    if (currentDepth > maxDepth) {
      maxDepth = currentDepth;
      maxDepthNode = nodeId;
    }

    if (node?.dependents) {
      for (const depId of node.dependents) {
        const existingDepth = depths.get(depId) || 0;
        const newDepth = currentDepth + 1;
        if (newDepth > existingDepth) {
          depths.set(depId, newDepth);
          predecessors.set(depId, nodeId);
        }
        queue.push(depId);
      }
    }
  }

  // Reconstruct path
  const path: string[] = [];
  let current = maxDepthNode;
  while (current) {
    path.unshift(current);
    current = predecessors.get(current) || '';
  }

  return path;
}

/**
 * Propagate date changes through DERIVED nodes
 */
function propagateDates(
  graph: DependencyGraph,
  sourceNodeId: string,
  newDate: string,
  dryRun: boolean = true
): DatePropagationResult {
  const sourceNode = graph.nodes.get(sourceNodeId);
  if (!sourceNode) {
    return {
      success: false,
      sourceNode: sourceNodeId,
      newDate,
      propagatedNodes: [],
      skippedNodes: [{ nodeId: sourceNodeId, reason: 'Node not found' }],
      warnings: [`Source node ${sourceNodeId} not found`],
    };
  }

  const propagatedNodes: DatePropagationResult['propagatedNodes'] = [];
  const skippedNodes: DatePropagationResult['skippedNodes'] = [];
  const warnings: string[] = [];
  const visited = new Set<string>();

  // BFS to propagate dates
  const queue: Array<{ nodeId: string; baseDate: string }> = [];

  // Start with dependents of source node
  if (sourceNode.dependents) {
    for (const depId of sourceNode.dependents) {
      queue.push({ nodeId: depId, baseDate: newDate });
    }
  }

  while (queue.length > 0) {
    const { nodeId, baseDate } = queue.shift()!;
    if (visited.has(nodeId)) {continue;}
    visited.add(nodeId);

    const node = graph.nodes.get(nodeId);
    if (!node) {
      skippedNodes.push({ nodeId, reason: 'Node not found' });
      continue;
    }

    // Only propagate to DERIVED nodes
    if (node.classification !== 'DERIVED') {
      skippedNodes.push({ nodeId, reason: `Classification is ${node.classification}, not DERIVED` });
      continue;
    }

    // Skip completed nodes
    if (node.status === 'complete' || node.status === 'completed') {
      skippedNodes.push({ nodeId, reason: 'Node already completed' });
      continue;
    }

    // Calculate new date (add 1 day buffer after predecessor)
    const previousDate = node.targetDate || '';
    const baseDateObj = new Date(baseDate);
    baseDateObj.setDate(baseDateObj.getDate() + 1);
    const calculatedNewDate = baseDateObj.toISOString().split('T')[0];

    // Only update if new date is later than current
    if (!previousDate || new Date(calculatedNewDate) > new Date(previousDate)) {
      propagatedNodes.push({
        nodeId,
        previousDate,
        newDate: calculatedNewDate,
        reason: `Cascaded from predecessor completing on ${baseDate}`,
      });

      // Update in graph if not dry run
      if (!dryRun) {
        node.targetDate = calculatedNewDate;
      }

      // Continue propagation to dependents
      if (node.dependents) {
        for (const depId of node.dependents) {
          queue.push({ nodeId: depId, baseDate: calculatedNewDate });
        }
      }
    } else {
      skippedNodes.push({ nodeId, reason: `Current date ${previousDate} is already later than ${calculatedNewDate}` });
    }
  }

  return {
    success: true,
    sourceNode: sourceNodeId,
    newDate,
    propagatedNodes,
    skippedNodes,
    warnings,
  };
}

/**
 * Resolve full dependency tree for a node
 */
function resolveDependencies(
  graph: DependencyGraph,
  nodeId: string,
  maxDepth: number = 10
): DependencyResolutionResult {
  const node = graph.nodes.get(nodeId);
  if (!node) {
    return {
      nodeId,
      predecessors: [],
      successors: [],
      criticalPredecessors: [],
      blockingPredecessors: [],
      dependentCount: 0,
      impactRadius: 0,
    };
  }

  const predecessors: DependencyResolutionResult['predecessors'] = [];
  const successors: DependencyResolutionResult['successors'] = [];
  const criticalPredecessors: string[] = [];
  const blockingPredecessors: string[] = [];

  // BFS for predecessors
  const predQueue: Array<{ id: string; depth: number }> = [];
  const predVisited = new Set<string>();

  for (const depId of node.dependencies) {
    predQueue.push({ id: depId, depth: 1 });
  }

  while (predQueue.length > 0) {
    const { id, depth } = predQueue.shift()!;
    if (predVisited.has(id) || depth > maxDepth) {continue;}
    predVisited.add(id);

    const predNode = graph.nodes.get(id);
    if (predNode) {
      predecessors.push({
        id,
        name: predNode.name,
        classification: predNode.classification,
        status: predNode.status,
        depth,
      });

      // Check for blocking predecessors (not complete)
      if (predNode.status !== 'complete' && predNode.status !== 'completed') {
        blockingPredecessors.push(id);
      }

      // Check for critical predecessors (LEAD classification)
      if (predNode.classification === 'LEAD') {
        criticalPredecessors.push(id);
      }

      // Continue BFS
      for (const subDepId of predNode.dependencies) {
        predQueue.push({ id: subDepId, depth: depth + 1 });
      }
    }
  }

  // BFS for successors
  const succQueue: Array<{ id: string; depth: number }> = [];
  const succVisited = new Set<string>();

  if (node.dependents) {
    for (const depId of node.dependents) {
      succQueue.push({ id: depId, depth: 1 });
    }
  }

  while (succQueue.length > 0) {
    const { id, depth } = succQueue.shift()!;
    if (succVisited.has(id) || depth > maxDepth) {continue;}
    succVisited.add(id);

    const succNode = graph.nodes.get(id);
    if (succNode) {
      successors.push({
        id,
        name: succNode.name,
        classification: succNode.classification,
        status: succNode.status,
        depth,
      });

      // Continue BFS
      if (succNode.dependents) {
        for (const subDepId of succNode.dependents) {
          succQueue.push({ id: subDepId, depth: depth + 1 });
        }
      }
    }
  }

  return {
    nodeId,
    predecessors,
    successors,
    criticalPredecessors,
    blockingPredecessors,
    dependentCount: successors.length,
    impactRadius: Math.max(
      predecessors.length > 0 ? Math.max(...predecessors.map(p => p.depth)) : 0,
      successors.length > 0 ? Math.max(...successors.map(s => s.depth)) : 0
    ),
  };
}

// ============================================================================
// MCP Tool Definitions
// ============================================================================

/**
 * Validate DAG Tool
 */
const validateDAGTool: MCPToolDefinition = {
  name: 'validate_dag',
  description:
    'Validate that the milestone/decision dependency graph is a valid Directed Acyclic Graph (DAG). Detects cycles, orphan nodes, and computes critical path metrics.',
  inputSchema: {
    type: 'object',
    properties: {
      includeWarnings: {
        type: 'boolean',
        default: true,
        description: 'Include warnings for potential issues',
      },
      includeCriticalPath: {
        type: 'boolean',
        default: true,
        description: 'Compute and include critical path',
      },
    },
  },
  handler: async (args): Promise<DependencyToolResult<DAGValidationResult>> => {
    const startTime = Date.now();
    try {
      const includeWarnings = args.includeWarnings !== false;
      const includeCriticalPath = args.includeCriticalPath !== false;

      // Load milestones and build graph
      const milestones = loadMilestones();
      const graph = buildGraph(milestones);

      // Detect cycles
      const cycles = detectCycles(graph);

      // Find orphan and isolated nodes
      const orphanNodes = findOrphanNodes(graph);
      const isolatedNodes = findIsolatedNodes(graph);

      // Calculate metrics
      const maxDepth = calculateMaxDepth(graph);
      const criticalPath = includeCriticalPath ? findCriticalPath(graph) : [];

      // Generate warnings
      const warnings: string[] = [];
      if (includeWarnings) {
        if (cycles.length > 0) {
          warnings.push(`Found ${cycles.length} cycle(s) in the dependency graph`);
        }
        if (orphanNodes.length > 0) {
          warnings.push(`Found ${orphanNodes.length} orphan dependency reference(s)`);
        }
        if (isolatedNodes.length > 5) {
          warnings.push(`Found ${isolatedNodes.length} isolated nodes (no connections)`);
        }
      }

      const result: DAGValidationResult = {
        isValid: cycles.length === 0 && orphanNodes.length === 0,
        hasNoCycles: cycles.length === 0,
        cycles,
        orphanNodes,
        isolatedNodes,
        totalNodes: graph.nodes.size,
        totalEdges: graph.edges.length,
        maxDepth,
        criticalPath,
        warnings,
      };

      return {
        success: true,
        data: result,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'validate_dag',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: {
          code: 'VALIDATE_DAG_ERROR',
          message,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'validate_dag',
        },
      };
    }
  },
};

/**
 * Propagate Date Change Tool
 */
const propagateDateChangeTool: MCPToolDefinition = {
  name: 'propagate_date_change',
  description:
    'Cascade date changes from a LEAD milestone to DERIVED milestones. Automatically adjusts dependent milestone dates when a predecessor date changes.',
  inputSchema: {
    type: 'object',
    required: ['nodeId', 'newDate'],
    properties: {
      nodeId: {
        type: 'string',
        description: 'ID of the milestone to update',
      },
      newDate: {
        type: 'string',
        format: 'date',
        description: 'New target date (ISO 8601 format)',
      },
      dryRun: {
        type: 'boolean',
        default: true,
        description: 'If true, only simulate changes without persisting',
      },
    },
  },
  handler: async (args): Promise<DependencyToolResult<DatePropagationResult>> => {
    const startTime = Date.now();
    try {
      const nodeId = args.nodeId as string;
      const newDate = args.newDate as string;
      const dryRun = args.dryRun !== false;

      // Load milestones and build graph
      const milestones = loadMilestones();
      const graph = buildGraph(milestones);

      // Propagate dates
      const result = propagateDates(graph, nodeId, newDate, dryRun);

      return {
        success: result.success,
        data: result,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'propagate_date_change',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: {
          code: 'PROPAGATE_DATE_ERROR',
          message,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'propagate_date_change',
        },
      };
    }
  },
};

/**
 * Resolve Dependencies Tool
 */
const resolveDependenciesTool: MCPToolDefinition = {
  name: 'resolve_dependencies',
  description:
    'Resolve the full predecessor/successor dependency tree for a milestone or decision. Returns blocking predecessors, critical path nodes, and impact radius.',
  inputSchema: {
    type: 'object',
    required: ['nodeId'],
    properties: {
      nodeId: {
        type: 'string',
        description: 'ID of the milestone/decision to resolve',
      },
      maxDepth: {
        type: 'number',
        minimum: 1,
        maximum: 50,
        default: 10,
        description: 'Maximum depth for traversal',
      },
    },
  },
  handler: async (args): Promise<DependencyToolResult<DependencyResolutionResult>> => {
    const startTime = Date.now();
    try {
      const nodeId = args.nodeId as string;
      const maxDepth = (args.maxDepth as number) || 10;

      // Load milestones and build graph
      const milestones = loadMilestones();
      const graph = buildGraph(milestones);

      // Resolve dependencies
      const result = resolveDependencies(graph, nodeId, maxDepth);

      return {
        success: true,
        data: result,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'resolve_dependencies',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: {
          code: 'RESOLVE_DEPENDENCIES_ERROR',
          message,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName: 'resolve_dependencies',
        },
      };
    }
  },
};

// ============================================================================
// Tool Registry
// ============================================================================

/**
 * All Dependency Management MCP tools
 */
export const dependencyManagementTools: MCPToolDefinition[] = [
  validateDAGTool,
  propagateDateChangeTool,
  resolveDependenciesTool,
];

/**
 * Get a tool by name
 */
export function getDependencyToolByName(name: string): MCPToolDefinition | undefined {
  return dependencyManagementTools.find((tool) => tool.name === name);
}

/**
 * Get all tool names
 */
export function getDependencyToolNames(): string[] {
  return dependencyManagementTools.map((tool) => tool.name);
}

/**
 * Register all Dependency Management tools with an MCP server
 */
export function registerDependencyTools(server: {
  registerTool: (tool: MCPToolDefinition) => void;
}): void {
  for (const tool of dependencyManagementTools) {
    server.registerTool(tool);
  }
}

export default dependencyManagementTools;

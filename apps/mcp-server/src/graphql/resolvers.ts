/**
 * GraphQL Resolvers for Ectropy Documentation
 *
 * Resolves queries using enterprise DataSource abstraction layer.
 * Supports both file-based and future database implementations.
 *
 * Data Sources:
 * - Decision Log (decisions, votes, governance)
 * - Infrastructure Catalog (servers, services, ports, workflows)
 * - Current Truth (project nodes, deliverables, phases)
 * - Operational Runbooks (deployment, migration, operational procedures)
 */

import { createFileDataSource } from '../services/file-data-source.service.js';
import type { DataSource } from '../services/data-source.interface.js';
import { runbookResolvers } from '../resolvers/runbook.resolvers.js';

// Type definitions for our JSON data structures
interface Decision {
  decisionId: string;
  timestamp: string;
  title: string;
  context: string;
  alternatives: any[];
  decision: string;
  rationale: string;
  status: string;
  category: string;
  impact: string;
  approvedBy: string[];
  implementedDate?: string;
  votes: string[];
  deliverables: string[];
  services: string[];
  infrastructure: string[];
  evidence: string[];
  documentation: string[];
  relatedDecisions: string[];
  supersedes?: string;
  supersededBy?: string;
}

interface Server {
  serverId: string;
  name: string;
  services: string[];
  ports: number[];
  specs?: { cpu?: string; memory?: string; storage?: string; bandwidth?: string };
  [key: string]: any;
}

interface Service {
  serviceId: string;
  name: string;
  ports: number[];
  secrets: string[];
  dependencies: string[];
  servers: string[];
  [key: string]: any;
}

interface Port {
  number: number;
  service?: string;
  [key: string]: any;
}

interface Secret {
  secretId: string;
  usedBy: string[];
  [key: string]: any;
}

interface Workflow {
  workflowId: string;
  services: string[];
  secrets: string[];
  [key: string]: any;
}

/**
 * GraphQL context type with optional injected DataSource and Prisma client
 */
export interface GraphQLContext {
  dataSource?: DataSource;
  prisma?: any;
}

// ============================================================================
// Data Source (Singleton Fallback + Context Injection)
// ============================================================================

// Singleton fallback for when no DataSource is injected via context
let fallbackDataSource: DataSource | null = null;

function getDataSource(context?: GraphQLContext): DataSource {
  // Prefer context-injected DataSource (from PrismaDataSource in FULL mode)
  if (context?.dataSource) {
    return context.dataSource;
  }
  // Fallback to singleton FileDataSource
  if (!fallbackDataSource) {
    fallbackDataSource = createFileDataSource();
    console.log('📦 GraphQL: FileDataSource fallback initialized');
  }
  return fallbackDataSource;
}

// Clear cache (useful for testing or hot reload)
export function clearCache() {
  const ds = getDataSource();
  ds.clearCache();
  console.log('🗑️  GraphQL: DataSource cache cleared');
}

/**
 * Set the shared DataSource for resolvers that don't receive context.
 * Called during startup to inject PrismaDataSource.
 */
export function setSharedDataSource(ds: DataSource) {
  fallbackDataSource = ds;
  console.log('📦 GraphQL: Shared DataSource set');
}

// ============================================================================
// GraphQL Resolvers
// ============================================================================

export const resolvers = {
  Query: {
    // =========================================================================
    // DECISION QUERIES
    // =========================================================================

    decisions: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const ds = getDataSource(ctx);
      return ds.getDecisions();
    },

    decision: async (_: unknown, { decisionId }: { decisionId: string }, ctx: GraphQLContext) => {
      const ds = getDataSource(ctx);
      return ds.getDecision(decisionId);
    },

    decisionsByStatus: async (_: unknown, { status }: { status: string }, ctx: GraphQLContext) => {
      const ds = getDataSource(ctx);
      return ds.getDecisions({ status: status as any });
    },

    decisionsByCategory: async (
      _: unknown,
      { category }: { category: string },
      ctx: GraphQLContext
    ) => {
      const ds = getDataSource(ctx);
      return ds.getDecisions({ category });
    },

    decisionsByImpact: async (_: unknown, { impact }: { impact: string }, ctx: GraphQLContext) => {
      const ds = getDataSource(ctx);
      return ds.getDecisions({ impact: impact as any });
    },

    decisionsForDeliverable: async (
      _: unknown,
      { deliverableId }: { deliverableId: string },
      ctx: GraphQLContext
    ) => {
      const ds = getDataSource(ctx);
      const allDecisions = await ds.getDecisions();
      return allDecisions.filter((d: any) =>
        d.impactedDeliverables?.includes(deliverableId)
      );
    },

    decisionsForService: async (
      _: unknown,
      { serviceId }: { serviceId: string },
      ctx: GraphQLContext
    ) => {
      const ds = getDataSource(ctx);
      const allDecisions = await ds.getDecisions();
      return allDecisions.filter((d: any) =>
        d.impactedServices?.includes(serviceId)
      );
    },

    // =========================================================================
    // INFRASTRUCTURE QUERIES
    // =========================================================================

    servers: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const ds = getDataSource(ctx);
      return ds.getServers();
    },

    server: async (_: unknown, { serverId }: { serverId: string }, ctx: GraphQLContext) => {
      const ds = getDataSource(ctx);
      return ds.getServer(serverId);
    },

    services: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const ds = getDataSource(ctx);
      return ds.getServices();
    },

    service: async (_: unknown, { serviceId }: { serviceId: string }, ctx: GraphQLContext) => {
      const ds = getDataSource(ctx);
      return ds.getService(serviceId);
    },

    servicesByType: async (_: unknown, { type }: { type: string }, ctx: GraphQLContext) => {
      const ds = getDataSource(ctx);
      return ds.getServices({ type });
    },

    serviceDependencies: async (
      _: unknown,
      { serviceId }: { serviceId: string },
      ctx: GraphQLContext
    ) => {
      const ds = getDataSource(ctx);
      return ds.getServiceDependencies(serviceId);
    },

    workflows: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const ds = getDataSource(ctx);
      return ds.getWorkflows();
    },

    workflow: async (_: unknown, { workflowId }: { workflowId: string }, ctx: GraphQLContext) => {
      const ds = getDataSource(ctx);
      return ds.getWorkflow(workflowId);
    },

    // =========================================================================
    // CURRENT TRUTH / NODE QUERIES
    // =========================================================================

    nodes: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const ds = getDataSource(ctx);
      return ds.getNodes();
    },

    node: async (_: unknown, { nodeId }: { nodeId: string }, ctx: GraphQLContext) => {
      const ds = getDataSource(ctx);
      return ds.getNode(nodeId);
    },

    nodesByType: async (_: unknown, { nodeType }: { nodeType: string }, ctx: GraphQLContext) => {
      const ds = getDataSource(ctx);
      return ds.getNodes({ nodeType: nodeType as any });
    },

    nodesByStatus: async (_: unknown, { status }: { status: string }, ctx: GraphQLContext) => {
      const ds = getDataSource(ctx);
      return ds.getNodes({ status: status as any });
    },

    nodesByPhase: async (_: unknown, { phase }: { phase: string }, ctx: GraphQLContext) => {
      const ds = getDataSource(ctx);
      return ds.getNodes({ phase });
    },

    blockers: async (_: unknown, { nodeId }: { nodeId: string }, ctx: GraphQLContext) => {
      const ds = getDataSource(ctx);
      return ds.getNodeBlockers(nodeId);
    },

    // =========================================================================
    // ROADMAP QUERIES
    // =========================================================================

    phases: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const ds = getDataSource(ctx);
      return ds.getPhases();
    },

    phase: async (_: unknown, { phaseId }: { phaseId: string }, ctx: GraphQLContext) => {
      const ds = getDataSource(ctx);
      return ds.getPhase(phaseId);
    },

    currentPhase: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const ds = getDataSource(ctx);
      return ds.getCurrentPhase();
    },

    deliverable: async (
      _: unknown,
      { deliverableId }: { deliverableId: string },
      ctx: GraphQLContext
    ) => {
      const ds = getDataSource(ctx);
      return ds.getDeliverable(deliverableId);
    },
  },

  // ===========================================================================
  // NESTED RESOLVERS (Relationship Traversal)
  // ===========================================================================

  Decision: {
    // Normalize category: data uses hyphens (api-design) but GraphQL enums require underscores (api_design)
    category: (parent: Decision) => {
      return parent.category?.replace(/-/g, '_') ?? parent.category;
    },

    relatedDecisions: async (parent: Decision) => {
      const ds = getDataSource();
      return ds.getRelatedDecisions(parent.decisionId);
    },

    supersedes: async (parent: Decision) => {
      if (!parent.supersedes) {
        return null;
      }
      const ds = getDataSource();
      const decisions = await ds.getSupersedesDecisions(parent.decisionId);
      return decisions[0] || null;
    },

    supersededBy: async (parent: Decision) => {
      if (!parent.supersededBy) {
        return null;
      }
      const ds = getDataSource();
      const decisions = await ds.getSupersededDecisions(parent.decisionId);
      return decisions[0] || null;
    },
  },

  Server: {
    // Map environment from the V2→V1 transformation (carried from parent env)
    environment: (parent: any) => parent.environment || 'unknown',

    // Map specs to GraphQL ServerResources type
    resources: (parent: any) =>
      parent.specs
        ? {
            cpu: parent.specs.cpu || null,
            memory: parent.specs.memory || null,
            storage: parent.specs.storage || null,
            bandwidth: parent.specs.bandwidth || null,
          }
        : null,

    services: async (parent: Server) => {
      const ds = getDataSource();
      const allServices = await ds.getServices();
      return allServices.filter((s: any) =>
        parent.services.includes(s.serviceId)
      );
    },

    ports: async (parent: any) => {
      if (!parent.ports || !Array.isArray(parent.ports)) {
        return [];
      }
      const ds = getDataSource();
      const allPorts = await ds.getPorts();
      return allPorts.filter((p: any) => parent.ports.includes(p.number));
    },
  },

  Service: {
    ports: async (parent: Service) => {
      const ds = getDataSource();
      const allPorts = await ds.getPorts();
      return allPorts.filter((p: any) => parent.ports.includes(p.number));
    },

    secrets: async (_parent: Service) => {
      // Note: Secrets not yet in DataSource interface - returns empty
      return [];
    },

    dependencies: async (parent: Service) => {
      const ds = getDataSource();
      return ds.getServiceDependencies(parent.serviceId);
    },

    servers: async (parent: Service) => {
      const ds = getDataSource();
      const allServers = await ds.getServers();
      return allServers.filter((s: any) =>
        parent.servers?.includes(s.serverId)
      );
    },
  },

  Port: {
    service: async (parent: Port) => {
      if (!parent.service) {
        return null;
      }
      const ds = getDataSource();
      return ds.getService(parent.service);
    },
  },

  Secret: {
    usedBy: async (parent: Secret) => {
      const ds = getDataSource();
      const allServices = await ds.getServices();
      return allServices.filter((s: any) =>
        parent.usedBy.includes(s.serviceId)
      );
    },
  },

  Workflow: {
    secrets: async (_parent: Workflow) => {
      // Note: Secrets not yet in DataSource interface - returns empty
      return [];
    },

    services: async (parent: Workflow) => {
      const ds = getDataSource();
      const allServices = await ds.getServices();
      return allServices.filter((s: any) =>
        parent.services.includes(s.serviceId)
      );
    },
  },

  Node: {
    // Normalize content: raw nodes use varied structures (content.context/approach/outcome vs content.summary/problem/solution)
    content: (parent: any) => ({
      summary:
        parent.content?.summary ||
        parent.content?.context ||
        parent.summary ||
        parent.description ||
        '',
      problem: parent.content?.problem || null,
      solution: parent.content?.solution || parent.content?.approach || null,
      impact: parent.content?.impact || null,
      filesModified: parent.content?.filesModified || [],
      evidence: parent.content?.evidence || parent.evidence || [],
    }),
    // Normalize metadata
    metadata: (parent: any) => ({
      author: parent.metadata?.author || parent.owner || null,
      phase: parent.metadata?.phase || parent.phase || null,
      priority: parent.metadata?.priority || null,
      tags: parent.metadata?.tags || parent.tags || [],
      estimatedEffort: parent.metadata?.estimatedEffort || null,
    }),
    // Normalize relationships: many nodes lack a relationships field
    relationships: (parent: any) => ({
      relatedNodes:
        parent.relationships?.relatedTo ||
        parent.relatedNodes ||
        parent.dependencies ||
        [],
      relatedDecisions:
        parent.relationships?.relatedDecisions || parent.relatedDecisions || [],
      blockedBy: parent.relationships?.blockedBy || [],
      blocks: parent.relationships?.blocks || [],
    }),
    // Normalize nodeType: some nodes use "type" instead of "nodeType"
    nodeType: (parent: any) => parent.nodeType || parent.type || 'unknown',
    // Normalize timestamp
    timestamp: (parent: any) => parent.timestamp || parent.createdAt || '',
  },

  Phase: {
    deliverables: async (parent: any) => {
      const ds = getDataSource();
      return ds.getDeliverables({ phaseId: parent.phaseId });
    },
  },

  Deliverable: {
    phase: async (parent: any) => {
      const ds = getDataSource();
      return ds.getPhase(parent.phaseId);
    },

    dependencies: async (parent: any) => {
      // Deliverables in roadmap.json don't carry explicit dependency IDs;
      // return empty array until dependency mapping is added to the data.
      return [];
    },

    decisions: async (parent: any) => {
      const ds = getDataSource();
      const allDecisions = await ds.getDecisions();
      return allDecisions.filter((d: any) =>
        d.impactedDeliverables?.includes(parent.deliverableId)
      );
    },
  },

  NodeRelationships: {
    relatedNodes: async (parent: { relatedNodes: string[] }) => {
      const ds = getDataSource();
      const allNodes = await ds.getNodes();
      return allNodes.filter((n: any) =>
        parent.relatedNodes.includes(n.nodeId)
      );
    },

    relatedDecisions: async (parent: { relatedDecisions: string[] }) => {
      const ds = getDataSource();
      const allDecisions = await ds.getDecisions();
      return allDecisions.filter((d: any) =>
        parent.relatedDecisions.includes(d.decisionId)
      );
    },

    blockedBy: async (parent: { blockedBy: string[] }) => {
      const ds = getDataSource();
      const allNodes = await ds.getNodes();
      return allNodes.filter((n: any) => parent.blockedBy.includes(n.nodeId));
    },

    blocks: async (parent: { blocks: string[] }) => {
      const ds = getDataSource();
      const allNodes = await ds.getNodes();
      return allNodes.filter((n: any) => parent.blocks.includes(n.nodeId));
    },
  },
};

// ============================================================================
// ENTERPRISE PATTERN: Merge resolvers explicitly instead of spread operator
// Prevents Query field overwriting and provides type safety
// ============================================================================

// Merge Query resolvers from runbook module
if (runbookResolvers.Query) {
  resolvers.Query = {
    ...resolvers.Query,
    ...runbookResolvers.Query,
  };
}

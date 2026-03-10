/**
 * GraphQL Mutation Resolvers for Roadmap Data Operations
 *
 * Implements CRUD operations for roadmap entities using Prisma.
 * Each resolver follows the pattern: (parent, args, context) where
 * context provides { dataSource, prisma }.
 *
 * Prisma model names:
 * - stateNode, documentationDecision, roadmapPhase
 * - roadmapDeliverableDb, roadmapFeature, infraService, platformState
 *
 * URN format: urn:luhtech:ectropy:{type}:{id}
 *
 * @module graphql/roadmap-mutations.resolvers
 * @version 1.0.0
 */

import type { DataSource } from '../services/data-source.interface.js';

// ============================================================================
// Types
// ============================================================================

export interface MutationContext {
  dataSource?: DataSource;
  prisma?: any;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generate a URN identifier for a new entity.
 * Pattern: urn:luhtech:ectropy:{type}:{id}
 */
function generateUrn(type: string, id: string): string {
  return `urn:luhtech:ectropy:${type}:${id}`;
}

/**
 * Generate a unique ID for a new entity.
 * Pattern: {type}-{timestamp}
 */
function generateId(type: string): string {
  return `${type}-${Date.now()}`;
}

// ============================================================================
// Mutation Resolvers
// ============================================================================

export const roadmapMutationResolvers = {
  Mutation: {
    // =========================================================================
    // STATE NODE MUTATIONS
    // =========================================================================

    createStateNode: async (
      _parent: unknown,
      { input }: { input: any },
      context: MutationContext
    ) => {
      const prisma = context.prisma as any;
      const nodeId = generateId('node');
      const urn = generateUrn('node', nodeId);
      const now = new Date().toISOString();

      const created = await prisma.stateNode.create({
        data: {
          nodeId,
          urn,
          title: input.title,
          nodeType: input.nodeType,
          status: 'active',
          phase: input.phase || null,
          path: input.path || null,
          description: input.description || null,
          owner: input.owner || null,
          tags: input.tags || [],
          evidence: input.evidence || [],
          createdAt: now,
          lastModified: now,
        },
      });

      return {
        nodeId: created.nodeId,
        timestamp: created.createdAt,
        title: created.title,
        nodeType: created.nodeType,
        status: created.status,
        content: {
          summary: created.description || '',
          problem: null,
          solution: null,
          impact: null,
          filesModified: [],
          evidence: created.evidence || [],
        },
        metadata: {
          author: created.owner || null,
          phase: created.phase || null,
          priority: null,
          tags: created.tags || [],
          estimatedEffort: null,
        },
        relationships: {
          relatedNodes: [],
          relatedDecisions: [],
          blockedBy: [],
          blocks: [],
        },
      };
    },

    updateStateNode: async (
      _parent: unknown,
      { nodeId, input }: { nodeId: string; input: any },
      context: MutationContext
    ) => {
      const prisma = context.prisma as any;
      const now = new Date().toISOString();

      const updateData: Record<string, any> = {
        lastModified: now,
      };

      if (input.title !== undefined) updateData.title = input.title;
      if (input.status !== undefined) updateData.status = input.status;
      if (input.phase !== undefined) updateData.phase = input.phase;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.owner !== undefined) updateData.owner = input.owner;
      if (input.tags !== undefined) updateData.tags = input.tags;

      const updated = await prisma.stateNode.update({
        where: { nodeId },
        data: updateData,
      });

      return {
        nodeId: updated.nodeId,
        timestamp: updated.createdAt,
        title: updated.title,
        nodeType: updated.nodeType,
        status: updated.status,
        content: {
          summary: updated.description || '',
          problem: null,
          solution: null,
          impact: null,
          filesModified: [],
          evidence: updated.evidence || [],
        },
        metadata: {
          author: updated.owner || null,
          phase: updated.phase || null,
          priority: null,
          tags: updated.tags || [],
          estimatedEffort: null,
        },
        relationships: {
          relatedNodes: [],
          relatedDecisions: [],
          blockedBy: [],
          blocks: [],
        },
      };
    },

    deleteStateNode: async (
      _parent: unknown,
      { nodeId }: { nodeId: string },
      context: MutationContext
    ) => {
      const prisma = context.prisma as any;

      try {
        await prisma.stateNode.delete({
          where: { nodeId },
        });
        return true;
      } catch (error: any) {
        console.error(`Failed to delete state node ${nodeId}:`, error.message);
        return false;
      }
    },

    // =========================================================================
    // DOCUMENTATION DECISION MUTATIONS
    // =========================================================================

    createDocDecision: async (
      _parent: unknown,
      { input }: { input: any },
      context: MutationContext
    ) => {
      const prisma = context.prisma as any;
      const decisionId = generateId('decision');
      const urn = generateUrn('decision', decisionId);
      const now = new Date().toISOString();

      const created = await prisma.documentationDecision.create({
        data: {
          decisionId,
          urn,
          title: input.title,
          status: 'proposed',
          category: input.category,
          impact: input.impact,
          context: input.context || null,
          decision: input.decision || null,
          consequences: input.consequences || null,
          proposedBy: input.proposedBy || null,
          proposedDate: now,
          tags: input.tags || [],
          evidence: [],
        },
      });

      return {
        decisionId: created.decisionId,
        title: created.title,
        status: created.status,
        category: created.category,
        impact: created.impact,
        proposedBy: created.proposedBy,
        proposedDate: created.proposedDate,
        context: created.context,
        decision: created.decision,
        consequences: created.consequences,
        evidence: created.evidence || [],
        tags: created.tags || [],
      };
    },

    updateDocDecision: async (
      _parent: unknown,
      { decisionId, input }: { decisionId: string; input: any },
      context: MutationContext
    ) => {
      const prisma = context.prisma as any;

      const updateData: Record<string, any> = {};

      if (input.title !== undefined) updateData.title = input.title;
      if (input.status !== undefined) updateData.status = input.status;
      if (input.category !== undefined) updateData.category = input.category;
      if (input.impact !== undefined) updateData.impact = input.impact;
      if (input.context !== undefined) updateData.context = input.context;
      if (input.decision !== undefined) updateData.decision = input.decision;
      if (input.consequences !== undefined) updateData.consequences = input.consequences;
      if (input.implementationNotes !== undefined) updateData.implementationNotes = input.implementationNotes;
      if (input.tags !== undefined) updateData.tags = input.tags;

      const updated = await prisma.documentationDecision.update({
        where: { decisionId },
        data: updateData,
      });

      return {
        decisionId: updated.decisionId,
        title: updated.title,
        status: updated.status,
        category: updated.category,
        impact: updated.impact,
        proposedBy: updated.proposedBy,
        proposedDate: updated.proposedDate,
        context: updated.context,
        decision: updated.decision,
        consequences: updated.consequences,
        evidence: updated.evidence || [],
        tags: updated.tags || [],
      };
    },

    // =========================================================================
    // ROADMAP MUTATIONS
    // =========================================================================

    updatePhaseStatus: async (
      _parent: unknown,
      { phaseId, status }: { phaseId: string; status: string },
      context: MutationContext
    ) => {
      const prisma = context.prisma as any;

      const updated = await prisma.roadmapPhase.update({
        where: { phaseId },
        data: { status },
      });

      return {
        phaseId: updated.phaseId,
        name: updated.name,
        status: updated.status,
        startDate: updated.startDate || null,
        targetDate: updated.targetDate || null,
        completionDate: updated.completionDate || null,
        deliverables: [],
      };
    },

    updateDeliverableStatus: async (
      _parent: unknown,
      { deliverableId, status, completedDate }: { deliverableId: string; status: string; completedDate?: string },
      context: MutationContext
    ) => {
      const prisma = context.prisma as any;

      const updateData: Record<string, any> = { status };
      if (completedDate !== undefined) {
        updateData.completedDate = completedDate;
      }

      const updated = await prisma.roadmapDeliverableDb.update({
        where: { deliverableId },
        data: updateData,
      });

      // Fetch the parent phase for the nested Phase relationship
      const phase = await prisma.roadmapPhase.findUnique({
        where: { phaseId: updated.phaseId },
      });

      return {
        deliverableId: updated.deliverableId,
        title: updated.title,
        description: updated.description || '',
        status: updated.status,
        assignedTo: updated.assignedTo || null,
        phase: phase
          ? {
              phaseId: phase.phaseId,
              name: phase.name,
              status: phase.status,
              startDate: phase.startDate || null,
              targetDate: phase.targetDate || null,
              completionDate: phase.completionDate || null,
              deliverables: [],
            }
          : null,
        dependencies: [],
        decisions: [],
      };
    },

    createFeature: async (
      _parent: unknown,
      { input }: { input: any },
      context: MutationContext
    ) => {
      const prisma = context.prisma as any;
      const featureId = generateId('feature');
      const urn = generateUrn('feature', featureId);

      const created = await prisma.roadmapFeature.create({
        data: {
          featureId,
          urn,
          name: input.name,
          category: input.category || null,
          status: input.status || 'planned',
          priority: input.priority || null,
          phase: input.phase || null,
          dependencies: input.dependencies || [],
          description: input.description || null,
        },
      });

      return {
        featureId: created.featureId,
        name: created.name,
        category: created.category,
        status: created.status,
        priority: created.priority,
        phase: created.phase,
        dependencies: created.dependencies || [],
        description: created.description,
      };
    },

    updateFeature: async (
      _parent: unknown,
      { featureId, input }: { featureId: string; input: any },
      context: MutationContext
    ) => {
      const prisma = context.prisma as any;

      const updateData: Record<string, any> = {};

      if (input.name !== undefined) updateData.name = input.name;
      if (input.category !== undefined) updateData.category = input.category;
      if (input.status !== undefined) updateData.status = input.status;
      if (input.priority !== undefined) updateData.priority = input.priority;
      if (input.phase !== undefined) updateData.phase = input.phase;
      if (input.description !== undefined) updateData.description = input.description;

      const updated = await prisma.roadmapFeature.update({
        where: { featureId },
        data: updateData,
      });

      return {
        featureId: updated.featureId,
        name: updated.name,
        category: updated.category,
        status: updated.status,
        priority: updated.priority,
        phase: updated.phase,
        dependencies: updated.dependencies || [],
        description: updated.description,
      };
    },

    // =========================================================================
    // INFRASTRUCTURE MUTATIONS
    // =========================================================================

    updateServiceStatus: async (
      _parent: unknown,
      { serviceId, status }: { serviceId: string; status: string },
      context: MutationContext
    ) => {
      const prisma = context.prisma as any;

      const updated = await prisma.infraService.update({
        where: { serviceId },
        data: { status },
      });

      return {
        serviceId: updated.serviceId,
        name: updated.name,
        type: updated.type || null,
        status: updated.status,
        port: updated.port || null,
      };
    },

    // =========================================================================
    // PLATFORM STATE MUTATIONS
    // =========================================================================

    updatePlatformState: async (
      _parent: unknown,
      { input }: { input: any },
      context: MutationContext
    ) => {
      const prisma = context.prisma as any;

      const updateData: Record<string, any> = {};

      if (input.health !== undefined) updateData.health = input.health;
      if (input.phase !== undefined) updateData.phase = input.phase;
      if (input.completedDeliverables !== undefined) updateData.completedDeliverables = input.completedDeliverables;
      if (input.totalDeliverables !== undefined) updateData.totalDeliverables = input.totalDeliverables;
      if (input.productionReadinessScore !== undefined) updateData.productionReadinessScore = input.productionReadinessScore;
      if (input.typeSafetyScore !== undefined) updateData.typeSafetyScore = input.typeSafetyScore;

      // Platform state is a singleton -- upsert with a fixed ID
      const platformStateId = 'platform-state-singleton';

      const updated = await prisma.platformState.upsert({
        where: { id: platformStateId },
        update: updateData,
        create: {
          id: platformStateId,
          health: input.health || 'unknown',
          phase: input.phase || null,
          completedDeliverables: input.completedDeliverables || 0,
          totalDeliverables: input.totalDeliverables || 0,
          productionReadinessScore: input.productionReadinessScore || 0,
          typeSafetyScore: input.typeSafetyScore || 0,
        },
      });

      return {
        health: updated.health,
        phase: updated.phase,
        completedDeliverables: updated.completedDeliverables,
        totalDeliverables: updated.totalDeliverables,
        productionReadinessScore: updated.productionReadinessScore,
        typeSafetyScore: updated.typeSafetyScore,
      };
    },

    // =========================================================================
    // BULK OPERATIONS
    // =========================================================================

    syncFromFiles: async (
      _parent: unknown,
      _args: unknown,
      _context: MutationContext
    ) => {
      console.log('[roadmap-mutations] syncFromFiles: Initiating sync from .roadmap/ JSON files');

      // Actual sync would invoke the migration script (migrate-roadmap-to-db.ts).
      // For now, return a success placeholder indicating the operation is recognized.
      return {
        success: true,
        entitiesSynced: 0,
        errors: ['Sync not yet wired to migration script -- invoke migrate-roadmap-to-db.ts directly'],
      };
    },

    exportToFiles: async (
      _parent: unknown,
      _args: unknown,
      _context: MutationContext
    ) => {
      console.log('[roadmap-mutations] exportToFiles: Initiating export to .roadmap/ JSON files');

      // Actual export would call an export script to write DB state back to JSON.
      // For now, return a success placeholder indicating the operation is recognized.
      return {
        success: true,
        filesExported: [],
        errors: ['Export not yet wired to export script -- invoke export script directly'],
      };
    },
  },
};

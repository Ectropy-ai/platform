/**
 * Decision GraphQL Resolvers
 *
 * Resolvers for PM Decision queries and mutations.
 * Integrates with Prisma for database operations.
 *
 * @module graphql/decision/decision.resolvers
 * @version 1.0.0
 */

import { PubSub } from 'graphql-subscriptions';
import { v4 as uuidv4 } from 'uuid';
import { GraphQLError } from 'graphql';

// PubSub for subscriptions
const pubsub = new PubSub();

// Subscription event names
const DECISION_UPDATED = 'DECISION_UPDATED';
const DECISION_CREATED = 'DECISION_CREATED';
const DECISION_APPROVED = 'DECISION_APPROVED';
const ACKNOWLEDGMENT_RECEIVED = 'ACKNOWLEDGMENT_RECEIVED';

// Types
interface Context {
  prisma: any;
  user?: {
    id: string;
    tenantId?: string;
    isPlatformAdmin?: boolean;
  };
}

interface DecisionFilterInput {
  status?: string;
  type?: string;
  authorityLevel?: string;
  projectId?: string;
  voxelId?: string;
  createdById?: string;
  dateFrom?: Date;
  dateTo?: Date;
  searchTerm?: string;
}

interface PaginationInput {
  page?: number;
  limit?: number;
}

/**
 * Generate decision URN
 */
function generateDecisionUrn(projectId: string): string {
  const year = new Date().getFullYear();
  const sequence = Math.floor(Math.random() * 9999)
    .toString()
    .padStart(4, '0');
  return `urn:ectropy:decision:${projectId}:DEC-${year}-${sequence}`;
}

/**
 * Build Prisma where clause from filter input
 */
function buildWhereClause(filter: DecisionFilterInput | undefined) {
  if (!filter) {return {};}

  const where: any = {};

  if (filter.status) {where.status = filter.status;}
  if (filter.type) {where.type = filter.type;}
  if (filter.authorityLevel) {where.authority_level = filter.authorityLevel;}
  if (filter.projectId) {where.project_id = filter.projectId;}
  if (filter.createdById) {where.created_by_id = filter.createdById;}

  if (filter.dateFrom || filter.dateTo) {
    where.created_at = {};
    if (filter.dateFrom) {where.created_at.gte = filter.dateFrom;}
    if (filter.dateTo) {where.created_at.lte = filter.dateTo;}
  }

  if (filter.searchTerm) {
    where.OR = [
      { title: { contains: filter.searchTerm, mode: 'insensitive' } },
      { description: { contains: filter.searchTerm, mode: 'insensitive' } },
    ];
  }

  if (filter.voxelId) {
    where.voxel_attachments = {
      some: { voxel_id: filter.voxelId },
    };
  }

  return where;
}

/**
 * Decision Resolvers
 */
export const decisionResolvers = {
  // ===========================================================================
  // Queries
  // ===========================================================================
  Query: {
    /**
     * Get single decision by ID or URN
     */
    pmDecision: async (
      _: any,
      { id, urn }: { id?: string; urn?: string },
      { prisma }: Context
    ) => {
      if (!id && !urn) {
        throw new GraphQLError('Either id or urn must be provided');
      }

      const where = id ? { id } : { urn };
      return prisma.pMDecision.findUnique({
        where,
        include: {
          project: true,
          created_by: true,
          approved_by: true,
          voxel_attachments: { include: { voxel: true } },
          consequences: true,
          schedule_proposals: true,
          acknowledgments: { include: { acknowledged_by: true } },
          inspections: true,
          decision_events: true,
        },
      });
    },

    /**
     * List decisions with filtering and pagination
     */
    pmDecisions: async (
      _: any,
      {
        filter,
        pagination = { page: 1, limit: 20 },
        orderBy = 'created_at',
        orderDir = 'desc',
      }: {
        filter?: DecisionFilterInput;
        pagination?: PaginationInput;
        orderBy?: string;
        orderDir?: string;
      },
      { prisma }: Context
    ) => {
      const where = buildWhereClause(filter);
      const page = pagination.page || 1;
      const limit = Math.min(pagination.limit || 20, 100);
      const skip = (page - 1) * limit;

      const [nodes, totalCount] = await Promise.all([
        prisma.pMDecision.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [orderBy]: orderDir },
          include: {
            project: true,
            created_by: true,
            approved_by: true,
          },
        }),
        prisma.pMDecision.count({ where }),
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      return {
        nodes,
        totalCount,
        pageInfo: {
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
          currentPage: page,
          totalPages,
        },
      };
    },

    /**
     * Get pending decisions for approval
     */
    pendingDecisions: async (
      _: any,
      { pagination = { page: 1, limit: 20 } }: { pagination?: PaginationInput },
      { prisma, user }: Context
    ) => {
      const where = { status: 'PENDING' };
      const page = pagination.page || 1;
      const limit = Math.min(pagination.limit || 20, 100);
      const skip = (page - 1) * limit;

      const [nodes, totalCount] = await Promise.all([
        prisma.pMDecision.findMany({
          where,
          skip,
          take: limit,
          orderBy: { created_at: 'desc' },
          include: {
            project: true,
            created_by: true,
          },
        }),
        prisma.pMDecision.count({ where }),
      ]);

      return {
        nodes,
        totalCount,
        pageInfo: {
          hasNextPage: page < Math.ceil(totalCount / limit),
          hasPreviousPage: page > 1,
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
        },
      };
    },

    /**
     * Get decision history (supersession chain)
     */
    decisionHistory: async (
      _: any,
      { decisionId }: { decisionId: string },
      { prisma }: Context
    ) => {
      const history: any[] = [];
      let currentId = decisionId;

      while (currentId) {
        const decision = await prisma.pMDecision.findUnique({
          where: { id: currentId },
          include: { supersedes: true },
        });

        if (!decision) {break;}
        history.push(decision);
        currentId = decision.supersedes_id;
      }

      return history;
    },

    /**
     * Get decisions requiring acknowledgment
     */
    unacknowledgedDecisions: async (
      _: any,
      {
        participantId,
        pagination = { page: 1, limit: 20 },
      }: { participantId: string; pagination?: PaginationInput },
      { prisma }: Context
    ) => {
      const page = pagination.page || 1;
      const limit = Math.min(pagination.limit || 20, 100);
      const skip = (page - 1) * limit;

      // Find decisions that don't have an acknowledgment from this participant
      const acknowledgedDecisionIds = await prisma.acknowledgment.findMany({
        where: { acknowledged_by_id: participantId },
        select: { decision_id: true },
      });

      const acknowledgedIds = acknowledgedDecisionIds.map(
        (a: any) => a.decision_id
      );

      const where = {
        status: 'APPROVED',
        id: { notIn: acknowledgedIds },
      };

      const [nodes, totalCount] = await Promise.all([
        prisma.pMDecision.findMany({
          where,
          skip,
          take: limit,
          orderBy: { approval_date: 'desc' },
        }),
        prisma.pMDecision.count({ where }),
      ]);

      return {
        nodes,
        totalCount,
        pageInfo: {
          hasNextPage: page < Math.ceil(totalCount / limit),
          hasPreviousPage: page > 1,
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
        },
      };
    },

    /**
     * Get authority requirements for a decision type
     */
    authorityRequirements: async (
      _: any,
      {
        type,
        costImpact,
        scheduleImpact,
      }: { type: string; costImpact?: number; scheduleImpact?: number },
      { prisma }: Context
    ) => {
      // Default authority requirements based on decision type
      const typeRequirements: Record<
        string,
        { level: string; timeout: number; inspection: boolean }
      > = {
        FIELD: { level: 'FIELD', timeout: 24, inspection: false },
        TECHNICAL: { level: 'SUPER', timeout: 48, inspection: true },
        SCHEDULE: { level: 'PM', timeout: 72, inspection: false },
        BUDGET: { level: 'PM', timeout: 72, inspection: false },
        DESIGN: { level: 'DESIGN', timeout: 96, inspection: true },
        REGULATORY: { level: 'REGULATORY', timeout: 168, inspection: true },
        SAFETY: { level: 'SUPER', timeout: 24, inspection: true },
      };

      const req = typeRequirements[type] || typeRequirements.FIELD;

      // Escalate based on impact
      let minimumLevel = req.level;
      if ((costImpact && costImpact > 50000) || (scheduleImpact && scheduleImpact > 14)) {
        minimumLevel = 'EXEC';
      } else if ((costImpact && costImpact > 10000) || (scheduleImpact && scheduleImpact > 7)) {
        minimumLevel = 'PM';
      }

      const escalationPath = ['FIELD', 'FOREMAN', 'SUPER', 'PM', 'EXEC', 'DESIGN', 'REGULATORY'];
      const levelIndex = escalationPath.indexOf(minimumLevel);
      const path = escalationPath.slice(levelIndex);

      return {
        minimumLevel,
        escalationPath: path,
        timeoutHours: req.timeout,
        requiresInspection: req.inspection,
      };
    },
  },

  // ===========================================================================
  // Mutations
  // ===========================================================================
  Mutation: {
    /**
     * Capture (create) a new decision
     */
    captureDecision: async (
      _: any,
      { input }: { input: any },
      { prisma, user }: Context
    ) => {
      try {
        const urn = generateDecisionUrn(input.projectId);

        const decision = await prisma.pMDecision.create({
          data: {
            id: uuidv4(),
            urn,
            project_id: input.projectId,
            type: input.type,
            title: input.title,
            description: input.description,
            justification: input.justification,
            status: 'PENDING',
            authority_level: input.authorityLevel,
            urgency: input.urgency || 'STANDARD',
            impact_categories: input.impactCategories,
            cost_impact: input.costImpact,
            schedule_impact: input.scheduleImpact,
            created_by_id: user?.id,
            tags: input.tags,
            attachments: input.attachments,
            metadata: input.metadata,
          },
          include: {
            project: true,
            created_by: true,
          },
        });

        // Attach to voxel if specified
        if (input.voxelId) {
          await prisma.voxelDecisionAttachment.create({
            data: {
              id: uuidv4(),
              voxel_id: input.voxelId,
              decision_id: decision.id,
              attachment_type: 'PRIMARY',
            },
          });
        }

        // Publish subscription event
        pubsub.publish(DECISION_CREATED, {
          decisionCreated: decision,
          projectId: input.projectId,
        });

        return { success: true, decision };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          validationErrors: [],
        };
      }
    },

    /**
     * Approve a decision
     */
    approveDecision: async (
      _: any,
      { input }: { input: { decisionId: string; comment?: string; conditions?: string[] } },
      { prisma, user }: Context
    ) => {
      try {
        const decision = await prisma.pMDecision.update({
          where: { id: input.decisionId },
          data: {
            status: 'APPROVED',
            approved_by_id: user?.id,
            approval_date: new Date(),
            metadata: {
              approvalComment: input.comment,
              approvalConditions: input.conditions,
            },
          },
          include: {
            project: true,
            created_by: true,
            approved_by: true,
          },
        });

        pubsub.publish(DECISION_APPROVED, {
          decisionApproved: decision,
          projectId: decision.project_id,
        });

        pubsub.publish(DECISION_UPDATED, {
          decisionUpdated: decision,
          projectId: decision.project_id,
        });

        return { success: true, decision };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    /**
     * Reject a decision
     */
    rejectDecision: async (
      _: any,
      { input }: { input: { decisionId: string; reason: string; suggestedAlternative?: string } },
      { prisma, user }: Context
    ) => {
      try {
        const decision = await prisma.pMDecision.update({
          where: { id: input.decisionId },
          data: {
            status: 'REJECTED',
            rejection_reason: input.reason,
            metadata: {
              suggestedAlternative: input.suggestedAlternative,
              rejectedBy: user?.id,
              rejectedAt: new Date(),
            },
          },
          include: { project: true },
        });

        pubsub.publish(DECISION_UPDATED, {
          decisionUpdated: decision,
          projectId: decision.project_id,
        });

        return { success: true, decision };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    /**
     * Escalate a decision to higher authority
     */
    escalateDecision: async (
      _: any,
      { input }: { input: { decisionId: string; targetAuthorityLevel: string; reason: string; urgency?: string } },
      { prisma, user }: Context
    ) => {
      try {
        // Create new escalated decision
        const original = await prisma.pMDecision.findUnique({
          where: { id: input.decisionId },
        });

        if (!original) {
          return { success: false, error: 'Decision not found' };
        }

        const escalatedUrn = generateDecisionUrn(original.project_id);

        const escalated = await prisma.pMDecision.create({
          data: {
            id: uuidv4(),
            urn: escalatedUrn,
            project_id: original.project_id,
            type: original.type,
            title: `[ESCALATED] ${original.title}`,
            description: original.description,
            justification: `${original.justification}\n\nEscalation reason: ${input.reason}`,
            status: 'PENDING',
            authority_level: input.targetAuthorityLevel,
            urgency: input.urgency || original.urgency,
            impact_categories: original.impact_categories,
            cost_impact: original.cost_impact,
            schedule_impact: original.schedule_impact,
            supersedes_id: original.id,
            created_by_id: user?.id,
          },
          include: { project: true },
        });

        // Mark original as escalated
        await prisma.pMDecision.update({
          where: { id: input.decisionId },
          data: {
            status: 'ESCALATED',
            escalated_to_id: escalated.id,
          },
        });

        pubsub.publish(DECISION_UPDATED, {
          decisionUpdated: escalated,
          projectId: escalated.project_id,
        });

        return { success: true, decision: escalated };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    /**
     * Attach decision to voxel
     */
    attachDecisionToVoxel: async (
      _: any,
      { input }: { input: { decisionId: string; voxelId: string; attachmentType?: string; notes?: string } },
      { prisma }: Context
    ) => {
      try {
        await prisma.voxelDecisionAttachment.create({
          data: {
            id: uuidv4(),
            voxel_id: input.voxelId,
            decision_id: input.decisionId,
            attachment_type: input.attachmentType || 'RELATED',
            notes: input.notes,
          },
        });

        const decision = await prisma.pMDecision.findUnique({
          where: { id: input.decisionId },
          include: {
            voxel_attachments: { include: { voxel: true } },
          },
        });

        return { success: true, decision };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    /**
     * Detach decision from voxel
     */
    detachDecisionFromVoxel: async (
      _: any,
      { decisionId, voxelId }: { decisionId: string; voxelId: string },
      { prisma }: Context
    ) => {
      try {
        await prisma.voxelDecisionAttachment.deleteMany({
          where: {
            decision_id: decisionId,
            voxel_id: voxelId,
          },
        });

        const decision = await prisma.pMDecision.findUnique({
          where: { id: decisionId },
        });

        return { success: true, decision };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    /**
     * Acknowledge a decision
     */
    acknowledgeDecision: async (
      _: any,
      { input }: { input: any },
      { prisma }: Context
    ) => {
      try {
        const urn = `urn:ectropy:acknowledgment:${uuidv4().slice(0, 8)}`;

        const acknowledgment = await prisma.acknowledgment.create({
          data: {
            id: uuidv4(),
            urn,
            decision_id: input.decisionId,
            acknowledged_by_id: input.acknowledgedById,
            acknowledged_at: input.timestamp || new Date(),
            latitude: input.latitude,
            longitude: input.longitude,
            signature: input.signature,
            notes: input.notes,
            verified: false,
          },
          include: {
            decision: true,
            acknowledged_by: true,
          },
        });

        pubsub.publish(ACKNOWLEDGMENT_RECEIVED, {
          acknowledgmentReceived: acknowledgment,
          decisionId: input.decisionId,
        });

        return { success: true, acknowledgment };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    /**
     * Verify an acknowledgment
     */
    verifyAcknowledgment: async (
      _: any,
      { acknowledgmentId }: { acknowledgmentId: string },
      { prisma }: Context
    ) => {
      try {
        const acknowledgment = await prisma.acknowledgment.update({
          where: { id: acknowledgmentId },
          data: {
            verified: true,
            verified_at: new Date(),
          },
          include: {
            decision: true,
            acknowledged_by: true,
          },
        });

        return { success: true, acknowledgment };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    /**
     * Create tolerance override
     */
    createToleranceOverride: async (
      _: any,
      { input }: { input: any },
      { prisma, user }: Context
    ) => {
      try {
        const urn = `urn:ectropy:tolerance:${uuidv4().slice(0, 8)}`;

        const toleranceOverride = await prisma.toleranceOverride.create({
          data: {
            id: uuidv4(),
            urn,
            voxel_id: input.voxelId,
            decision_id: input.decisionId,
            override_type: input.overrideType,
            original_value: input.originalValue,
            new_value: input.newValue,
            unit: input.unit,
            justification: input.justification,
            approved_by_id: user?.id,
            valid_until: input.validUntil,
          },
          include: {
            voxel: true,
            decision: true,
            approved_by: true,
          },
        });

        return { success: true, toleranceOverride };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    /**
     * Revoke tolerance override
     */
    revokeToleranceOverride: async (
      _: any,
      { overrideId, reason }: { overrideId: string; reason: string },
      { prisma }: Context
    ) => {
      try {
        const toleranceOverride = await prisma.toleranceOverride.update({
          where: { id: overrideId },
          data: {
            revoked_at: new Date(),
            revocation_reason: reason,
          },
          include: {
            voxel: true,
            decision: true,
          },
        });

        return { success: true, toleranceOverride };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  // ===========================================================================
  // Subscriptions
  // ===========================================================================
  Subscription: {
    decisionUpdated: {
      subscribe: (_: any, { projectId }: { projectId: string }) => {
        return pubsub.asyncIterableIterator([DECISION_UPDATED]);
      },
      resolve: (payload: any) => payload.decisionUpdated,
    },
    decisionCreated: {
      subscribe: (_: any, { projectId }: { projectId: string }) => {
        return pubsub.asyncIterableIterator([DECISION_CREATED]);
      },
      resolve: (payload: any) => payload.decisionCreated,
    },
    decisionApproved: {
      subscribe: (_: any, { projectId }: { projectId: string }) => {
        return pubsub.asyncIterableIterator([DECISION_APPROVED]);
      },
      resolve: (payload: any) => payload.decisionApproved,
    },
    acknowledgmentReceived: {
      subscribe: (_: any, { decisionId }: { decisionId: string }) => {
        return pubsub.asyncIterableIterator([ACKNOWLEDGMENT_RECEIVED]);
      },
      resolve: (payload: any) => payload.acknowledgmentReceived,
    },
  },

  // ===========================================================================
  // Field Resolvers
  // ===========================================================================
  PMDecision: {
    project: (parent: any, _: any, { prisma }: Context) => {
      if (parent.project) {return parent.project;}
      return prisma.project.findUnique({ where: { id: parent.project_id } });
    },
    createdBy: (parent: any, _: any, { prisma }: Context) => {
      if (parent.created_by) {return parent.created_by;}
      if (!parent.created_by_id) {return null;}
      return prisma.participant.findUnique({ where: { id: parent.created_by_id } });
    },
    approvedBy: (parent: any, _: any, { prisma }: Context) => {
      if (parent.approved_by) {return parent.approved_by;}
      if (!parent.approved_by_id) {return null;}
      return prisma.participant.findUnique({ where: { id: parent.approved_by_id } });
    },
    voxelAttachments: (parent: any, _: any, { prisma }: Context) => {
      if (parent.voxel_attachments) {return parent.voxel_attachments;}
      return prisma.voxelDecisionAttachment.findMany({
        where: { decision_id: parent.id },
        include: { voxel: true },
      });
    },
    consequences: (parent: any, _: any, { prisma }: Context) => {
      if (parent.consequences) {return parent.consequences;}
      return prisma.consequence.findMany({ where: { decision_id: parent.id } });
    },
    scheduleProposals: (parent: any, _: any, { prisma }: Context) => {
      if (parent.schedule_proposals) {return parent.schedule_proposals;}
      return prisma.scheduleProposal.findMany({ where: { decision_id: parent.id } });
    },
    acknowledgments: (parent: any, _: any, { prisma }: Context) => {
      if (parent.acknowledgments) {return parent.acknowledgments;}
      return prisma.acknowledgment.findMany({
        where: { decision_id: parent.id },
        include: { acknowledged_by: true },
      });
    },
    inspections: (parent: any, _: any, { prisma }: Context) => {
      if (parent.inspections) {return parent.inspections;}
      return prisma.inspection.findMany({ where: { decision_id: parent.id } });
    },
    decisionEvents: (parent: any, _: any, { prisma }: Context) => {
      if (parent.decision_events) {return parent.decision_events;}
      return prisma.decisionEvent.findMany({ where: { decision_id: parent.id } });
    },
    escalatedTo: (parent: any, _: any, { prisma }: Context) => {
      if (!parent.escalated_to_id) {return null;}
      return prisma.pMDecision.findUnique({ where: { id: parent.escalated_to_id } });
    },
    supersedes: (parent: any, _: any, { prisma }: Context) => {
      if (!parent.supersedes_id) {return null;}
      return prisma.pMDecision.findUnique({ where: { id: parent.supersedes_id } });
    },
    supersededBy: (parent: any, _: any, { prisma }: Context) => {
      return prisma.pMDecision.findFirst({ where: { supersedes_id: parent.id } });
    },
  },
};

export default decisionResolvers;

/**
 * Decision Lifecycle Combined Resolvers
 *
 * Merges all Decision Lifecycle resolvers into a single export.
 *
 * @module graphql/decision-lifecycle.resolvers
 * @version 1.0.0
 */

import { GraphQLScalarType, Kind } from 'graphql';
import { decisionResolvers } from './decision/decision.resolvers.js';
import { voxelResolvers } from './voxel/voxel.resolvers.js';

// ==============================================================================
// Custom Scalars
// ==============================================================================

const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'DateTime scalar type',
  serialize(value: any) {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  },
  parseValue(value: any) {
    if (typeof value === 'string') {
      return new Date(value);
    }
    return value;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    return null;
  },
});

const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'JSON scalar type',
  serialize(value: any) {
    return value;
  },
  parseValue(value: any) {
    return value;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      try {
        return JSON.parse(ast.value);
      } catch {
        return ast.value;
      }
    }
    if (ast.kind === Kind.OBJECT) {
      return ast;
    }
    return null;
  },
});

// ==============================================================================
// Inspection Resolvers (Inline for now)
// ==============================================================================

const inspectionResolvers = {
  Query: {
    inspection: async (_: any, { id, urn }: any, { prisma }: any) => {
      const where = id ? { id } : { urn };
      return prisma.inspection.findUnique({
        where,
        include: {
          project: true,
          voxel: true,
          decision: true,
          requested_by: true,
          inspector: true,
        },
      });
    },

    inspections: async (
      _: any,
      { filter, pagination = { page: 1, limit: 20 } }: any,
      { prisma }: any
    ) => {
      const where: any = {};
      if (filter?.projectId) {where.project_id = filter.projectId;}
      if (filter?.type) {where.type = filter.type;}
      if (filter?.status) {where.status = filter.status;}
      if (filter?.inspectorId) {where.inspector_id = filter.inspectorId;}

      const page = pagination.page || 1;
      const limit = Math.min(pagination.limit || 20, 100);
      const skip = (page - 1) * limit;

      const [nodes, totalCount] = await Promise.all([
        prisma.inspection.findMany({ where, skip, take: limit }),
        prisma.inspection.count({ where }),
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

    upcomingInspections: async (
      _: any,
      { projectId, days = 7 }: any,
      { prisma }: any
    ) => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);

      return prisma.inspection.findMany({
        where: {
          project_id: projectId,
          status: 'SCHEDULED',
          scheduled_date: { lte: futureDate, gte: new Date() },
        },
        orderBy: { scheduled_date: 'asc' },
      });
    },

    overdueInspections: async (_: any, { projectId }: any, { prisma }: any) => {
      return prisma.inspection.findMany({
        where: {
          project_id: projectId,
          status: 'SCHEDULED',
          scheduled_date: { lt: new Date() },
        },
        orderBy: { scheduled_date: 'asc' },
      });
    },
  },

  Mutation: {
    requestInspection: async (_: any, { input }: any, { prisma }: any) => {
      try {
        const { v4: uuidv4 } = await import('uuid');
        const urn = `urn:ectropy:inspection:INSP-${Date.now()}`;

        const inspection = await prisma.inspection.create({
          data: {
            id: uuidv4(),
            urn,
            project_id: input.projectId,
            voxel_id: input.voxelId,
            decision_id: input.decisionId,
            type: input.type,
            status: 'SCHEDULED',
            priority: input.priority || 'MEDIUM',
            title: input.title,
            description: input.description,
            scheduled_date: input.scheduledDate,
            requested_by_id: input.requestedById,
            inspector_id: input.inspectorId,
            checklist: input.checklist,
            attachments: input.attachments,
          },
          include: { project: true },
        });

        return { success: true, inspection };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    completeInspection: async (_: any, { input }: any, { prisma }: any) => {
      try {
        const inspection = await prisma.inspection.update({
          where: { id: input.inspectionId },
          data: {
            status: input.status,
            findings: input.findings,
            checklist_results: input.checklistResults,
            issues: input.issues,
            completed_at: input.completedAt || new Date(),
            attachments: input.attachments,
          },
          include: { project: true },
        });

        return { success: true, inspection };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },
};

// ==============================================================================
// Consequence Resolvers (Inline)
// ==============================================================================

const consequenceResolvers = {
  Query: {
    consequence: async (_: any, { id, urn }: any, { prisma }: any) => {
      const where = id ? { id } : { urn };
      return prisma.consequence.findUnique({
        where,
        include: { project: true, decision: true },
      });
    },

    consequences: async (
      _: any,
      { filter, pagination = { page: 1, limit: 20 } }: any,
      { prisma }: any
    ) => {
      const where: any = {};
      if (filter?.projectId) {where.project_id = filter.projectId;}
      if (filter?.decisionId) {where.decision_id = filter.decisionId;}
      if (filter?.type) {where.type = filter.type;}
      if (filter?.status) {where.status = filter.status;}

      const page = pagination.page || 1;
      const limit = Math.min(pagination.limit || 20, 100);
      const skip = (page - 1) * limit;

      const [nodes, totalCount] = await Promise.all([
        prisma.consequence.findMany({ where, skip, take: limit }),
        prisma.consequence.count({ where }),
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

    decisionConsequences: async (
      _: any,
      { decisionId }: any,
      { prisma }: any
    ) => {
      return prisma.consequence.findMany({
        where: { decision_id: decisionId },
        include: { decision: true },
      });
    },

    consequenceAnalytics: async (
      _: any,
      { projectId, dateFrom, dateTo }: any,
      { prisma }: any
    ) => {
      const where: any = { project_id: projectId };
      if (dateFrom || dateTo) {
        where.created_at = {};
        if (dateFrom) {where.created_at.gte = dateFrom;}
        if (dateTo) {where.created_at.lte = dateTo;}
      }

      const consequences = await prisma.consequence.findMany({ where });

      const byType = Object.entries(
        consequences.reduce((acc: any, c: any) => {
          acc[c.type] = (acc[c.type] || 0) + 1;
          return acc;
        }, {})
      ).map(([type, count]) => ({ type, count }));

      const bySeverity = Object.entries(
        consequences.reduce((acc: any, c: any) => {
          acc[c.severity] = (acc[c.severity] || 0) + 1;
          return acc;
        }, {})
      ).map(([severity, count]) => ({ severity, count }));

      return {
        totalConsequences: consequences.length,
        byType,
        bySeverity,
        totalCostImpact: consequences.reduce(
          (sum: number, c: any) => sum + (c.projected_impact?.costDelta || 0),
          0
        ),
        totalScheduleImpact: consequences.reduce(
          (sum: number, c: any) => sum + (c.projected_impact?.scheduleDelta || 0),
          0
        ),
      };
    },
  },

  Mutation: {
    createConsequence: async (_: any, { input }: any, { prisma }: any) => {
      try {
        const { v4: uuidv4 } = await import('uuid');
        const urn = `urn:ectropy:consequence:CONSQ-${Date.now()}`;

        const consequence = await prisma.consequence.create({
          data: {
            id: uuidv4(),
            urn,
            project_id: input.projectId,
            decision_id: input.decisionId,
            type: input.type,
            status: 'PROJECTED',
            severity: input.severity,
            description: input.description,
            projected_impact: input.projectedImpact,
            mitigation_strategy: input.mitigationStrategy,
            metadata: input.metadata,
          },
          include: { decision: true },
        });

        return { success: true, consequence };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    confirmConsequence: async (
      _: any,
      { consequenceId, actualImpact }: any,
      { prisma }: any
    ) => {
      try {
        const consequence = await prisma.consequence.update({
          where: { id: consequenceId },
          data: {
            status: 'CONFIRMED',
            actual_impact: actualImpact,
          },
        });
        return { success: true, consequence };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },
};

// ==============================================================================
// Schedule Resolvers (Inline)
// ==============================================================================

const scheduleResolvers = {
  Query: {
    scheduleProposal: async (_: any, { id, urn }: any, { prisma }: any) => {
      const where = id ? { id } : { urn };
      return prisma.scheduleProposal.findUnique({
        where,
        include: { project: true, decision: true, submitted_by: true },
      });
    },

    scheduleProposals: async (
      _: any,
      { filter, pagination = { page: 1, limit: 20 } }: any,
      { prisma }: any
    ) => {
      const where: any = {};
      if (filter?.projectId) {where.project_id = filter.projectId;}
      if (filter?.status) {where.status = filter.status;}
      if (filter?.type) {where.type = filter.type;}

      const page = pagination.page || 1;
      const limit = Math.min(pagination.limit || 20, 100);
      const skip = (page - 1) * limit;

      const [nodes, totalCount] = await Promise.all([
        prisma.scheduleProposal.findMany({ where, skip, take: limit }),
        prisma.scheduleProposal.count({ where }),
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

    pendingScheduleProposals: async (
      _: any,
      { projectId, pagination = { page: 1, limit: 20 } }: any,
      { prisma }: any
    ) => {
      const where = { project_id: projectId, status: 'SUBMITTED' };
      const page = pagination.page || 1;
      const limit = Math.min(pagination.limit || 20, 100);
      const skip = (page - 1) * limit;

      const [nodes, totalCount] = await Promise.all([
        prisma.scheduleProposal.findMany({ where, skip, take: limit }),
        prisma.scheduleProposal.count({ where }),
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
  },

  Mutation: {
    createScheduleProposal: async (_: any, { input }: any, { prisma }: any) => {
      try {
        const { v4: uuidv4 } = await import('uuid');
        const urn = `urn:ectropy:proposal:PROP-${Date.now()}`;

        const proposal = await prisma.scheduleProposal.create({
          data: {
            id: uuidv4(),
            urn,
            project_id: input.projectId,
            decision_id: input.decisionId,
            type: input.type,
            status: 'DRAFT',
            title: input.title,
            description: input.description,
            justification: input.justification,
            submitted_by_id: input.submittedById,
            proposed_changes: input.proposedChanges,
            affected_activities: input.affectedActivities,
            cost_impact: input.costImpact,
            schedule_impact: input.scheduleImpact,
            attachments: input.attachments,
          },
          include: { project: true, submitted_by: true },
        });

        return { success: true, proposal };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    submitScheduleProposal: async (
      _: any,
      { proposalId }: any,
      { prisma }: any
    ) => {
      try {
        const proposal = await prisma.scheduleProposal.update({
          where: { id: proposalId },
          data: {
            status: 'SUBMITTED',
            submitted_at: new Date(),
          },
        });
        return { success: true, proposal };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    reviewScheduleProposal: async (
      _: any,
      { input }: any,
      { prisma, user }: any
    ) => {
      try {
        const proposal = await prisma.scheduleProposal.update({
          where: { id: input.proposalId },
          data: {
            status: input.approved ? 'APPROVED' : 'REJECTED',
            reviewed_by_id: user?.id,
            reviewed_at: new Date(),
            review_notes: input.reviewNotes,
            approval_conditions: input.conditions,
          },
        });
        return { success: true, proposal };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },
};

// ==============================================================================
// Authority Resolvers (Inline)
// ==============================================================================

const authorityResolvers = {
  Query: {
    participant: async (_: any, { id, urn }: any, { prisma }: any) => {
      const where = id ? { id } : { urn };
      return prisma.participant.findUnique({
        where,
        include: { project: true, user: true },
      });
    },

    participants: async (
      _: any,
      { filter, pagination = { page: 1, limit: 20 } }: any,
      { prisma }: any
    ) => {
      const where: any = {};
      if (filter?.projectId) {where.project_id = filter.projectId;}
      if (filter?.role) {where.role = filter.role;}
      if (filter?.authorityLevel) {where.authority_level = filter.authorityLevel;}
      if (filter?.status) {where.status = filter.status;}

      const page = pagination.page || 1;
      const limit = Math.min(pagination.limit || 20, 100);
      const skip = (page - 1) * limit;

      const [nodes, totalCount] = await Promise.all([
        prisma.participant.findMany({ where, skip, take: limit }),
        prisma.participant.count({ where }),
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

    authorityGraph: async (_: any, { projectId }: any, { prisma }: any) => {
      const participants = await prisma.participant.findMany({
        where: { project_id: projectId, status: 'ACTIVE' },
        include: { user: true },
      });

      const levels = [
        { level: 'FIELD', name: 'Field Worker', description: 'Field level decisions', defaultTimeoutHours: 24, canApproveTypes: ['FIELD'], requiresSecondApprover: false, escalationTarget: 'FOREMAN' },
        { level: 'FOREMAN', name: 'Foreman', description: 'Crew level decisions', defaultTimeoutHours: 24, canApproveTypes: ['FIELD', 'TECHNICAL'], requiresSecondApprover: false, escalationTarget: 'SUPER' },
        { level: 'SUPER', name: 'Superintendent', description: 'Site level decisions', defaultTimeoutHours: 48, canApproveTypes: ['FIELD', 'TECHNICAL', 'SAFETY'], requiresSecondApprover: false, escalationTarget: 'PM' },
        { level: 'PM', name: 'Project Manager', description: 'Project level decisions', defaultTimeoutHours: 72, canApproveTypes: ['FIELD', 'TECHNICAL', 'SCHEDULE', 'BUDGET'], requiresSecondApprover: false, escalationTarget: 'EXEC' },
        { level: 'EXEC', name: 'Executive', description: 'Executive level decisions', defaultTimeoutHours: 96, canApproveTypes: ['FIELD', 'TECHNICAL', 'SCHEDULE', 'BUDGET', 'DESIGN'], requiresSecondApprover: true, escalationTarget: 'DESIGN' },
        { level: 'DESIGN', name: 'Design Professional', description: 'Design decisions', defaultTimeoutHours: 168, canApproveTypes: ['DESIGN', 'TECHNICAL'], requiresSecondApprover: false, escalationTarget: 'REGULATORY' },
        { level: 'REGULATORY', name: 'Regulatory', description: 'Code official decisions', defaultTimeoutHours: 336, canApproveTypes: ['REGULATORY', 'SAFETY'], requiresSecondApprover: false, escalationTarget: null },
      ];

      const escalationPaths = levels.slice(0, -1).map((l, i) => ({
        fromLevel: l.level,
        toLevel: levels[i + 1].level,
        conditions: ['Timeout exceeded', 'Manual escalation'],
        timeoutHours: l.defaultTimeoutHours,
        autoEscalate: true,
      }));

      return {
        projectId,
        levels,
        participants,
        escalationPaths,
      };
    },

    findApprovers: async (
      _: any,
      { projectId, authorityLevel, decisionType }: any,
      { prisma }: any
    ) => {
      return prisma.participant.findMany({
        where: {
          project_id: projectId,
          authority_level: authorityLevel,
          status: 'ACTIVE',
          can_approve: true,
        },
      });
    },

    validateAuthority: async (
      _: any,
      { participantId, decisionType, costImpact, scheduleImpact }: any,
      { prisma }: any
    ) => {
      const participant = await prisma.participant.findUnique({
        where: { id: participantId },
      });

      if (!participant) {
        return {
          valid: false,
          requiredLevel: 'FIELD',
          currentLevel: 'FIELD',
          canProceed: false,
          escalationRequired: false,
          reason: 'Participant not found',
        };
      }

      // Determine required level based on type and impact
      const levelHierarchy = ['FIELD', 'FOREMAN', 'SUPER', 'PM', 'EXEC', 'DESIGN', 'REGULATORY'];
      let requiredLevel = 'FIELD';

      if (decisionType === 'REGULATORY') {requiredLevel = 'REGULATORY';}
      else if (decisionType === 'DESIGN') {requiredLevel = 'DESIGN';}
      else if (costImpact > 50000 || scheduleImpact > 14) {requiredLevel = 'EXEC';}
      else if (costImpact > 10000 || scheduleImpact > 7) {requiredLevel = 'PM';}
      else if (decisionType === 'SAFETY') {requiredLevel = 'SUPER';}
      else if (decisionType === 'TECHNICAL') {requiredLevel = 'FOREMAN';}

      const requiredIndex = levelHierarchy.indexOf(requiredLevel);
      const currentIndex = levelHierarchy.indexOf(participant.authority_level);

      const canProceed = currentIndex >= requiredIndex;

      return {
        valid: canProceed,
        requiredLevel,
        currentLevel: participant.authority_level,
        canProceed,
        escalationRequired: !canProceed,
        escalationTarget: !canProceed ? null : undefined,
        reason: canProceed
          ? 'Authority level sufficient'
          : `Requires ${requiredLevel} authority, participant has ${participant.authority_level}`,
      };
    },
  },

  Mutation: {
    createParticipant: async (_: any, { input }: any, { prisma }: any) => {
      try {
        const { v4: uuidv4 } = await import('uuid');
        const urn = `urn:ectropy:participant:${uuidv4().slice(0, 8)}`;

        const participant = await prisma.participant.create({
          data: {
            id: uuidv4(),
            urn,
            project_id: input.projectId,
            user_id: input.userId,
            name: input.name,
            email: input.email,
            phone: input.phone,
            role: input.role,
            authority_level: input.authorityLevel,
            status: 'ACTIVE',
            company: input.company,
            trade: input.trade,
            can_approve: input.canApprove ?? false,
            can_escalate: input.canEscalate ?? true,
            metadata: input.metadata,
          },
          include: { project: true },
        });

        return { success: true, participant };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    updateParticipant: async (_: any, { input }: any, { prisma }: any) => {
      try {
        const participant = await prisma.participant.update({
          where: { id: input.participantId },
          data: {
            name: input.name,
            email: input.email,
            phone: input.phone,
            role: input.role,
            authority_level: input.authorityLevel,
            status: input.status,
            can_approve: input.canApprove,
            can_escalate: input.canEscalate,
          },
        });
        return { success: true, participant };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },
};

// ==============================================================================
// Merge All Resolvers
// ==============================================================================

function mergeResolvers(...resolverArrays: any[]): any {
  const merged: any = {
    DateTime: DateTimeScalar,
    JSON: JSONScalar,
    Query: {},
    Mutation: {},
    Subscription: {},
  };

  for (const resolvers of resolverArrays) {
    if (resolvers.Query) {
      Object.assign(merged.Query, resolvers.Query);
    }
    if (resolvers.Mutation) {
      Object.assign(merged.Mutation, resolvers.Mutation);
    }
    if (resolvers.Subscription) {
      Object.assign(merged.Subscription, resolvers.Subscription);
    }

    // Copy type resolvers
    for (const key of Object.keys(resolvers)) {
      if (!['Query', 'Mutation', 'Subscription'].includes(key)) {
        merged[key] = resolvers[key];
      }
    }
  }

  return merged;
}

export const decisionLifecycleResolvers = mergeResolvers(
  decisionResolvers,
  voxelResolvers,
  inspectionResolvers,
  consequenceResolvers,
  scheduleResolvers,
  authorityResolvers
);

export default decisionLifecycleResolvers;

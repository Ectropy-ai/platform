/**
 * Voxel GraphQL Resolvers
 *
 * Resolvers for Voxel spatial queries and mutations.
 *
 * @module graphql/voxel/voxel.resolvers
 * @version 1.0.0
 */

import { PubSub } from 'graphql-subscriptions';
import { v4 as uuidv4 } from 'uuid';
import { GraphQLError } from 'graphql';

const pubsub = new PubSub();

const VOXEL_UPDATED = 'VOXEL_UPDATED';
const VOXEL_ALERT_CREATED = 'VOXEL_ALERT_CREATED';
const VOXEL_ALERT_RESOLVED = 'VOXEL_ALERT_RESOLVED';

interface Context {
  prisma: any;
  user?: { id: string; tenantId?: string };
}

/**
 * Generate voxel URN
 */
function generateVoxelUrn(projectId: string, type: string): string {
  const prefix = type === 'ZONE' ? 'ZONE' : 'VOX';
  const sequence = Math.floor(Math.random() * 999999)
    .toString()
    .padStart(6, '0');
  return `urn:ectropy:voxel:${projectId}:${prefix}-${sequence}`;
}

export const voxelResolvers = {
  Query: {
    voxel: async (
      _: any,
      { id, urn }: { id?: string; urn?: string },
      { prisma }: Context
    ) => {
      if (!id && !urn) {
        throw new GraphQLError('Either id or urn must be provided');
      }
      const where = id ? { id } : { urn };
      return prisma.voxel.findUnique({
        where,
        include: {
          project: true,
          parent: true,
          children: true,
          decision_attachments: { include: { decision: true } },
          alerts: true,
          tolerance_overrides: true,
          pre_approvals: true,
        },
      });
    },

    voxels: async (
      _: any,
      { filter, pagination = { page: 1, limit: 20 }, orderBy = 'created_at' }: any,
      { prisma }: Context
    ) => {
      const where: any = {};
      if (filter?.projectId) {where.project_id = filter.projectId;}
      if (filter?.type) {where.type = filter.type;}
      if (filter?.status) {where.status = filter.status;}
      if (filter?.parentId) {where.parent_id = filter.parentId;}
      if (filter?.hasActiveAlerts) {
        where.alerts = { some: { status: 'ACTIVE' } };
      }
      if (filter?.searchTerm) {
        where.name = { contains: filter.searchTerm, mode: 'insensitive' };
      }

      const page = pagination.page || 1;
      const limit = Math.min(pagination.limit || 20, 100);
      const skip = (page - 1) * limit;

      const [nodes, totalCount] = await Promise.all([
        prisma.voxel.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [orderBy]: 'desc' },
          include: { project: true },
        }),
        prisma.voxel.count({ where }),
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

    voxelTree: async (
      _: any,
      { projectId, rootId }: { projectId: string; rootId?: string },
      { prisma }: Context
    ) => {
      const where: any = { project_id: projectId };
      if (rootId) {
        where.parent_id = rootId;
      } else {
        where.parent_id = null;
      }

      return prisma.voxel.findMany({
        where,
        include: {
          children: {
            include: {
              children: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      });
    },

    voxelDecisionSurface: async (
      _: any,
      { voxelId, includeChildren }: { voxelId: string; includeChildren?: boolean },
      { prisma }: Context
    ) => {
      const voxel = await prisma.voxel.findUnique({
        where: { id: voxelId },
        include: {
          decision_attachments: {
            include: {
              decision: {
                include: { created_by: true, approved_by: true },
              },
            },
          },
          alerts: true,
          tolerance_overrides: true,
          pre_approvals: true,
          children: includeChildren,
        },
      });

      if (!voxel) {
        throw new GraphQLError('Voxel not found');
      }

      const decisions = voxel.decision_attachments.map((a: any) => a.decision);
      const pendingDecisions = decisions.filter((d: any) => d.status === 'PENDING');
      const approvedDecisions = decisions.filter((d: any) => d.status === 'APPROVED');

      return {
        voxel,
        decisions,
        pendingDecisions,
        approvedDecisions,
        alerts: voxel.alerts,
        toleranceOverrides: voxel.tolerance_overrides,
        preApprovals: voxel.pre_approvals,
        childSurfaces: [], // Would recursively build if includeChildren
        totalDecisionCount: decisions.length,
        pendingCount: pendingDecisions.length,
        alertCount: voxel.alerts.filter((a: any) => a.status === 'ACTIVE').length,
        hasActivePreApproval: voxel.pre_approvals.some(
          (p: any) => new Date(p.valid_until) > new Date()
        ),
      };
    },

    voxelsInBoundingBox: async (
      _: any,
      { projectId, boundingBox }: { projectId: string; boundingBox: any },
      { prisma }: Context
    ) => {
      // This would use spatial queries if using PostGIS
      // For now, filter by coordinates in application layer
      return prisma.voxel.findMany({
        where: {
          project_id: projectId,
          // coordinates filtering would go here
        },
      });
    },

    voxelsWithAlerts: async (
      _: any,
      { projectId, severity }: { projectId: string; severity?: string },
      { prisma }: Context
    ) => {
      const alertWhere: any = { status: 'ACTIVE' };
      if (severity) {alertWhere.severity = severity;}

      return prisma.voxel.findMany({
        where: {
          project_id: projectId,
          alerts: { some: alertWhere },
        },
        include: {
          alerts: { where: alertWhere },
        },
      });
    },

    activePreApprovals: async (
      _: any,
      { voxelId }: { voxelId: string },
      { prisma }: Context
    ) => {
      return prisma.preApproval.findMany({
        where: {
          voxel_id: voxelId,
          valid_until: { gt: new Date() },
        },
        include: { approved_by: true },
      });
    },
  },

  Mutation: {
    createVoxel: async (_: any, { input }: any, { prisma }: Context) => {
      try {
        const urn = generateVoxelUrn(input.projectId, input.type);

        const voxel = await prisma.voxel.create({
          data: {
            id: uuidv4(),
            urn,
            project_id: input.projectId,
            parent_id: input.parentId,
            type: input.type,
            name: input.name,
            description: input.description,
            status: 'PLANNED',
            coordinates: input.coordinates,
            bounding_box: input.boundingBox,
            ifc_guid: input.ifcGuid,
            metadata: input.metadata,
          },
          include: { project: true, parent: true },
        });

        return { success: true, voxel };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    updateVoxel: async (_: any, { input }: any, { prisma }: Context) => {
      try {
        const voxel = await prisma.voxel.update({
          where: { id: input.id },
          data: {
            name: input.name,
            description: input.description,
            status: input.status,
            coordinates: input.coordinates,
            bounding_box: input.boundingBox,
            metadata: input.metadata,
          },
          include: { project: true },
        });

        pubsub.publish(VOXEL_UPDATED, {
          voxelUpdated: voxel,
          projectId: voxel.project_id,
        });

        return { success: true, voxel };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    deleteVoxel: async (_: any, { id }: { id: string }, { prisma }: Context) => {
      try {
        const voxel = await prisma.voxel.delete({ where: { id } });
        return { success: true, voxel };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    setVoxelParent: async (
      _: any,
      { voxelId, parentId }: { voxelId: string; parentId?: string },
      { prisma }: Context
    ) => {
      try {
        const voxel = await prisma.voxel.update({
          where: { id: voxelId },
          data: { parent_id: parentId },
          include: { parent: true },
        });
        return { success: true, voxel };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    createVoxelAlert: async (_: any, { input }: any, { prisma }: Context) => {
      try {
        const urn = `urn:ectropy:alert:${uuidv4().slice(0, 8)}`;

        const alert = await prisma.voxelAlert.create({
          data: {
            id: uuidv4(),
            urn,
            voxel_id: input.voxelId,
            decision_id: input.decisionId,
            severity: input.severity,
            status: 'ACTIVE',
            title: input.title,
            message: input.message,
            action_required: input.actionRequired,
            expires_at: input.expiresAt,
          },
          include: { voxel: true, decision: true },
        });

        pubsub.publish(VOXEL_ALERT_CREATED, {
          voxelAlertCreated: alert,
          projectId: alert.voxel.project_id,
        });

        return { success: true, alert };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    acknowledgeVoxelAlert: async (
      _: any,
      { alertId }: { alertId: string },
      { prisma, user }: Context
    ) => {
      try {
        const alert = await prisma.voxelAlert.update({
          where: { id: alertId },
          data: {
            status: 'ACKNOWLEDGED',
            acknowledged_by_id: user?.id,
            acknowledged_at: new Date(),
          },
          include: { voxel: true },
        });
        return { success: true, alert };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    resolveVoxelAlert: async (
      _: any,
      { alertId, resolution }: { alertId: string; resolution?: string },
      { prisma }: Context
    ) => {
      try {
        const alert = await prisma.voxelAlert.update({
          where: { id: alertId },
          data: {
            status: 'RESOLVED',
            resolved_at: new Date(),
            resolution,
          },
          include: { voxel: true },
        });

        pubsub.publish(VOXEL_ALERT_RESOLVED, {
          voxelAlertResolved: alert,
          projectId: alert.voxel.project_id,
        });

        return { success: true, alert };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    dismissVoxelAlert: async (
      _: any,
      { alertId, reason }: { alertId: string; reason?: string },
      { prisma }: Context
    ) => {
      try {
        const alert = await prisma.voxelAlert.update({
          where: { id: alertId },
          data: {
            status: 'DISMISSED',
            dismissal_reason: reason,
          },
          include: { voxel: true },
        });
        return { success: true, alert };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    createPreApproval: async (_: any, { input }: any, { prisma }: Context) => {
      try {
        const urn = `urn:ectropy:preapproval:${uuidv4().slice(0, 8)}`;

        const preApproval = await prisma.preApproval.create({
          data: {
            id: uuidv4(),
            urn,
            voxel_id: input.voxelId,
            approved_by_id: input.approvedById,
            scope: input.scope,
            conditions: input.conditions,
            max_cost_impact: input.maxCostImpact,
            max_schedule_impact: input.maxScheduleImpact,
            valid_from: input.validFrom,
            valid_until: input.validUntil,
            usage_count: 0,
          },
          include: { voxel: true, approved_by: true },
        });

        return { success: true, preApproval };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    revokePreApproval: async (
      _: any,
      { preApprovalId, reason }: { preApprovalId: string; reason: string },
      { prisma }: Context
    ) => {
      try {
        const preApproval = await prisma.preApproval.update({
          where: { id: preApprovalId },
          data: {
            revoked_at: new Date(),
            revocation_reason: reason,
          },
          include: { voxel: true },
        });
        return { success: true, preApproval };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  Subscription: {
    voxelUpdated: {
      subscribe: (_: any, { projectId }: { projectId: string }) => {
        return pubsub.asyncIterableIterator([VOXEL_UPDATED]);
      },
      resolve: (payload: any) => payload.voxelUpdated,
    },
    voxelAlertCreated: {
      subscribe: (_: any, { projectId }: { projectId: string }) => {
        return pubsub.asyncIterableIterator([VOXEL_ALERT_CREATED]);
      },
      resolve: (payload: any) => payload.voxelAlertCreated,
    },
    voxelAlertResolved: {
      subscribe: (_: any, { projectId }: { projectId: string }) => {
        return pubsub.asyncIterableIterator([VOXEL_ALERT_RESOLVED]);
      },
      resolve: (payload: any) => payload.voxelAlertResolved,
    },
  },

  Voxel: {
    project: (parent: any, _: any, { prisma }: Context) => {
      if (parent.project) {return parent.project;}
      return prisma.project.findUnique({ where: { id: parent.project_id } });
    },
    parent: (parent: any, _: any, { prisma }: Context) => {
      if (parent.parent) {return parent.parent;}
      if (!parent.parent_id) {return null;}
      return prisma.voxel.findUnique({ where: { id: parent.parent_id } });
    },
    children: (parent: any, _: any, { prisma }: Context) => {
      if (parent.children) {return parent.children;}
      return prisma.voxel.findMany({ where: { parent_id: parent.id } });
    },
    decisionAttachments: (parent: any, _: any, { prisma }: Context) => {
      if (parent.decision_attachments) {return parent.decision_attachments;}
      return prisma.voxelDecisionAttachment.findMany({
        where: { voxel_id: parent.id },
        include: { decision: true },
      });
    },
    decisions: async (parent: any, _: any, { prisma }: Context) => {
      const attachments = await prisma.voxelDecisionAttachment.findMany({
        where: { voxel_id: parent.id },
        include: { decision: true },
      });
      return attachments.map((a: any) => a.decision);
    },
    decisionCount: async (parent: any, _: any, { prisma }: Context) => {
      return prisma.voxelDecisionAttachment.count({ where: { voxel_id: parent.id } });
    },
    activeDecisionCount: async (parent: any, _: any, { prisma }: Context) => {
      const attachments = await prisma.voxelDecisionAttachment.findMany({
        where: { voxel_id: parent.id },
        include: { decision: { select: { status: true } } },
      });
      return attachments.filter((a: any) =>
        ['PENDING', 'APPROVED'].includes(a.decision.status)
      ).length;
    },
    alerts: (parent: any, _: any, { prisma }: Context) => {
      if (parent.alerts) {return parent.alerts;}
      return prisma.voxelAlert.findMany({ where: { voxel_id: parent.id } });
    },
    activeAlerts: (parent: any, _: any, { prisma }: Context) => {
      return prisma.voxelAlert.findMany({
        where: { voxel_id: parent.id, status: 'ACTIVE' },
      });
    },
    toleranceOverrides: (parent: any, _: any, { prisma }: Context) => {
      if (parent.tolerance_overrides) {return parent.tolerance_overrides;}
      return prisma.toleranceOverride.findMany({ where: { voxel_id: parent.id } });
    },
    preApprovals: (parent: any, _: any, { prisma }: Context) => {
      if (parent.pre_approvals) {return parent.pre_approvals;}
      return prisma.preApproval.findMany({ where: { voxel_id: parent.id } });
    },
  },
};

export default voxelResolvers;

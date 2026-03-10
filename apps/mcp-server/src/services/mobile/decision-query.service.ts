/**
 * SMS Decision Query Service (DL-M5)
 *
 * Handles SMS-based decision queries, integrating with the phone agent
 * for natural language decision surface navigation and acknowledgments.
 *
 * @module services/mobile/decision-query.service
 * @version 1.0.0
 */

import { logger } from '../../../../../libs/shared/utils/src/logger.js';
import type {
  DecisionQueryIntent,
  DecisionQueryContext,
  DecisionQueryResult,
  MobileDecisionCard,
  MobileDecisionSurface,
} from './types.js';

// ==============================================================================
// Types
// ==============================================================================

interface PrismaClient {
  voxel: {
    findUnique: (args: any) => Promise<any>;
    findMany: (args: any) => Promise<any[]>;
  };
  voxelDecisionAttachment: {
    findMany: (args: any) => Promise<any[]>;
  };
  pMDecision: {
    findUnique: (args: any) => Promise<any>;
    findMany: (args: any) => Promise<any[]>;
  };
  participant: {
    findFirst: (args: any) => Promise<any>;
  };
  preApproval: {
    findMany: (args: any) => Promise<any[]>;
  };
  toleranceOverride: {
    findMany: (args: any) => Promise<any[]>;
  };
}

interface DecisionQueryServiceConfig {
  prisma?: PrismaClient;
  geofenceService?: {
    getActiveSession: (userId: string) => any;
    markDecisionViewed: (userId: string, decisionUrn: string) => void;
  };
  acknowledgmentService?: {
    processAcknowledgment: (request: any) => Promise<any>;
    getPendingAcknowledgments: (userId: string, projectId: string) => Promise<any[]>;
  };
}

/**
 * Intent patterns for classification
 */
const INTENT_PATTERNS: { pattern: RegExp; intent: DecisionQueryIntent }[] = [
  // Voxel/Zone decision queries
  { pattern: /(?:what|show|list|any)\s*(?:decisions?|approvals?)\s*(?:for|in|at)?\s*(?:zone|voxel|area)?\s*(.+)?/i, intent: 'query_voxel_decisions' },
  { pattern: /(?:decisions?|approvals?)\s*(?:in|for|at)\s+(?:my|this|current)\s+(?:zone|voxel|area|location)/i, intent: 'query_voxel_decisions' },
  { pattern: /(?:where|what)\s+am\s+i\s*\??\s*(?:decisions?)?/i, intent: 'query_voxel_decisions' },

  // Acknowledge decision
  { pattern: /(?:ack|acknowledge|confirm|accept)\s*(?:decision)?\s*(\w+-?\d*)?/i, intent: 'acknowledge_decision' },
  { pattern: /(?:i\s+)?(?:understand|got\s+it|okay|ok|yes)\s*(?:for)?\s*(\w+-?\d*)?/i, intent: 'acknowledge_decision' },

  // Request tolerance
  { pattern: /(?:request|need|want)\s*(?:a)?\s*tolerance\s*(?:override|change|variance)?/i, intent: 'request_tolerance' },
  { pattern: /(?:can\s+i|is\s+it\s+okay|allowed)\s*(?:to)?\s*(?:go|vary|deviate|change)/i, intent: 'request_tolerance' },

  // Check pre-approval
  { pattern: /(?:what|any|check)\s*(?:pre-?)?approvals?\s*(?:for|in|at)?/i, intent: 'check_preapproval' },
  { pattern: /(?:am\s+i|do\s+i\s+have)\s*(?:pre-?)?approved?\s*(?:for|to)?/i, intent: 'check_preapproval' },

  // Escalate decision
  { pattern: /(?:escalate|bump|send\s+up|forward)\s*(?:decision|this)?\s*(\w+-?\d*)?/i, intent: 'escalate_decision' },
  { pattern: /(?:need|want)\s*(?:a)?\s*(?:supervisor|manager|approval|higher)/i, intent: 'escalate_decision' },

  // View decision detail
  { pattern: /(?:show|tell|give)\s*(?:me)?\s*(?:more|details?|info)\s*(?:about|on|for)?\s*(?:decision)?\s*(\w+-?\d*)?/i, intent: 'view_decision_detail' },
  { pattern: /(?:decision|dec)\s*(\w+-?\d+)/i, intent: 'view_decision_detail' },
];

// ==============================================================================
// Decision Query Service Class
// ==============================================================================

export class DecisionQueryService {
  private prisma?: PrismaClient;
  private geofenceService?: DecisionQueryServiceConfig['geofenceService'];
  private acknowledgmentService?: DecisionQueryServiceConfig['acknowledgmentService'];

  constructor(config?: DecisionQueryServiceConfig) {
    this.prisma = config?.prisma;
    this.geofenceService = config?.geofenceService;
    this.acknowledgmentService = config?.acknowledgmentService;
  }

  // ===========================================================================
  // Query Processing
  // ===========================================================================

  /**
   * Process decision query from SMS
   */
  async processQuery(
    queryText: string,
    context: DecisionQueryContext
  ): Promise<DecisionQueryResult> {
    try {
      // Classify intent
      const { intent, entities } = this.classifyIntent(queryText);

      // Process based on intent
      switch (intent) {
        case 'query_voxel_decisions':
          return await this.handleVoxelDecisionQuery(context, entities);

        case 'acknowledge_decision':
          return await this.handleAcknowledgeDecision(context, entities);

        case 'request_tolerance':
          return await this.handleToleranceRequest(context, entities);

        case 'check_preapproval':
          return await this.handlePreApprovalCheck(context, entities);

        case 'escalate_decision':
          return await this.handleEscalation(context, entities);

        case 'view_decision_detail':
          return await this.handleDecisionDetail(context, entities);

        default:
          return this.buildUnknownIntentResponse(queryText);
      }
    } catch (error) {
      logger.error('Error processing decision query', { error, queryText, context });
      return {
        success: false,
        intent: 'query_voxel_decisions',
        response: 'Sorry, I encountered an error processing your request. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Classify intent from query text
   */
  private classifyIntent(queryText: string): {
    intent: DecisionQueryIntent;
    entities: Record<string, string>;
  } {
    const normalizedText = queryText.toLowerCase().trim();
    const entities: Record<string, string> = {};

    for (const { pattern, intent } of INTENT_PATTERNS) {
      const match = normalizedText.match(pattern);
      if (match) {
        // Extract entities from capture groups
        if (match[1]) {
          if (intent === 'view_decision_detail' || intent === 'acknowledge_decision' || intent === 'escalate_decision') {
            entities.decisionId = match[1].toUpperCase();
          } else if (intent === 'query_voxel_decisions') {
            entities.voxelName = match[1];
          }
        }
        return { intent, entities };
      }
    }

    // Default to voxel decision query
    return { intent: 'query_voxel_decisions', entities };
  }

  // ===========================================================================
  // Intent Handlers
  // ===========================================================================

  /**
   * Handle voxel decision query
   */
  private async handleVoxelDecisionQuery(
    context: DecisionQueryContext,
    entities: Record<string, string>
  ): Promise<DecisionQueryResult> {
    const { userId, projectId, currentVoxelId } = context;

    // Get current voxel from session or context
    let voxelId = currentVoxelId || entities.voxelName;

    // Try to get from active geofence session
    if (!voxelId && this.geofenceService) {
      const session = this.geofenceService.getActiveSession(userId);
      if (session) {
        voxelId = session.voxelId;
      }
    }

    if (!voxelId) {
      return {
        success: true,
        intent: 'query_voxel_decisions',
        response: "I don't know your current location. Please enter a zone name or voxel ID, or enable location services.",
        actionPrompt: 'Reply with zone name or tap here to enable location',
      };
    }

    // Get decision surface
    const surface = await this.getDecisionSurface(voxelId, userId);

    if (!surface) {
      return {
        success: true,
        intent: 'query_voxel_decisions',
        response: `No decision surface found for voxel ${voxelId}. You may have entered an untracked area.`,
      };
    }

    // Build response
    return this.buildDecisionSurfaceResponse(surface, context);
  }

  /**
   * Handle decision acknowledgment
   */
  private async handleAcknowledgeDecision(
    context: DecisionQueryContext,
    entities: Record<string, string>
  ): Promise<DecisionQueryResult> {
    const { userId, projectId, tenantId, pendingAcknowledgments } = context;

    // Determine which decision to acknowledge
    let decisionId = entities.decisionId;

    if (!decisionId) {
      // Check for pending acknowledgments
      if (pendingAcknowledgments && pendingAcknowledgments.length > 0) {
        // Acknowledge the first pending one
        decisionId = pendingAcknowledgments[0];
      } else {
        // Check service for pending
        if (this.acknowledgmentService) {
          const pending = await this.acknowledgmentService.getPendingAcknowledgments(userId, projectId);
          if (pending.length > 0) {
            decisionId = pending[0].decisionId;
          }
        }
      }
    }

    if (!decisionId) {
      return {
        success: true,
        intent: 'acknowledge_decision',
        response: 'No pending decisions to acknowledge. Reply with a decision ID to acknowledge a specific decision.',
      };
    }

    // Get decision details
    const decision = await this.getDecision(decisionId);
    if (!decision) {
      return {
        success: false,
        intent: 'acknowledge_decision',
        response: `Decision ${decisionId} not found. Please check the ID and try again.`,
        error: 'Decision not found',
      };
    }

    // Process acknowledgment if service available
    if (this.acknowledgmentService) {
      const result = await this.acknowledgmentService.processAcknowledgment({
        decisionId,
        decisionUrn: decision.urn,
        userId,
        voxelId: decision.voxel_id || context.currentVoxelId || '',
        projectId,
        tenantId,
        location: { userId, deviceId: 'sms', projectId, tenantId, timestamp: new Date().toISOString(), source: 'MANUAL' },
        deviceInfo: { deviceId: 'sms', platform: 'WEB' },
        timestamp: new Date().toISOString(),
      });

      if (result.success) {
        return {
          success: true,
          intent: 'acknowledge_decision',
          response: `Acknowledged: ${decision.title || decision.summary}\nRef: ${decision.urn}`,
          acknowledgmentRequired: false,
        };
      } else {
        return {
          success: false,
          intent: 'acknowledge_decision',
          response: `Could not acknowledge decision: ${result.error}`,
          error: result.error,
        };
      }
    }

    // Mark as viewed in geofence session
    if (this.geofenceService) {
      this.geofenceService.markDecisionViewed(userId, decision.urn);
    }

    return {
      success: true,
      intent: 'acknowledge_decision',
      response: `Viewed: ${decision.title || decision.summary}\nNote: Full acknowledgment requires mobile app.`,
    };
  }

  /**
   * Handle tolerance request
   */
  private async handleToleranceRequest(
    context: DecisionQueryContext,
    _entities: Record<string, string>
  ): Promise<DecisionQueryResult> {
    return {
      success: true,
      intent: 'request_tolerance',
      response: 'To request a tolerance override:\n1. Open the mobile app\n2. Navigate to the decision\n3. Tap "Request Tolerance"\n\nOr describe the variance needed and I\'ll help create the request.',
      actionPrompt: 'Describe the tolerance variance needed',
      deepLink: 'ectropy://tolerance/request',
    };
  }

  /**
   * Handle pre-approval check
   */
  private async handlePreApprovalCheck(
    context: DecisionQueryContext,
    _entities: Record<string, string>
  ): Promise<DecisionQueryResult> {
    const { currentVoxelId, userId } = context;

    // Get current voxel
    let voxelId = currentVoxelId;
    if (!voxelId && this.geofenceService) {
      const session = this.geofenceService.getActiveSession(userId);
      if (session) {
        voxelId = session.voxelId;
      }
    }

    if (!voxelId || !this.prisma) {
      return {
        success: true,
        intent: 'check_preapproval',
        response: 'Unable to check pre-approvals without current location. Please enable location services or specify a zone.',
      };
    }

    // Get pre-approvals for voxel
    const preApprovals = await this.prisma.preApproval.findMany({
      where: {
        voxel_id: voxelId,
        valid_until: { gt: new Date() },
        revoked_at: null,
      },
      include: { approved_by: true },
    });

    if (preApprovals.length === 0) {
      return {
        success: true,
        intent: 'check_preapproval',
        response: 'No active pre-approvals in your current zone. All work requires standard approval.',
      };
    }

    // Build response
    let response = `Active pre-approvals (${preApprovals.length}):\n`;
    for (const pa of preApprovals.slice(0, 3)) {
      const scope = Array.isArray(pa.scope) ? pa.scope.join(', ') : pa.scope;
      response += `- ${scope} (by ${pa.approved_by?.name || 'Unknown'})\n`;
      if (pa.conditions) {
        response += `  Conditions: ${pa.conditions}\n`;
      }
    }

    if (preApprovals.length > 3) {
      response += `\n...and ${preApprovals.length - 3} more. Open app for full list.`;
    }

    return {
      success: true,
      intent: 'check_preapproval',
      response,
      deepLink: `ectropy://voxel/${voxelId}/preapprovals`,
    };
  }

  /**
   * Handle decision escalation
   */
  private async handleEscalation(
    context: DecisionQueryContext,
    entities: Record<string, string>
  ): Promise<DecisionQueryResult> {
    const { userId, projectId, authorityLevel } = context;

    const decisionId = entities.decisionId;

    if (!decisionId) {
      return {
        success: true,
        intent: 'escalate_decision',
        response: 'Which decision would you like to escalate? Reply with the decision ID (e.g., DEC-123).',
        actionPrompt: 'Enter decision ID',
      };
    }

    // Get decision
    const decision = await this.getDecision(decisionId);
    if (!decision) {
      return {
        success: false,
        intent: 'escalate_decision',
        response: `Decision ${decisionId} not found.`,
        error: 'Decision not found',
      };
    }

    // Check if user can escalate
    if (decision.status !== 'PENDING') {
      return {
        success: false,
        intent: 'escalate_decision',
        response: `Cannot escalate ${decisionId}: Decision is already ${decision.status}.`,
        error: 'Invalid decision status',
      };
    }

    // For SMS, we prompt them to use the app or confirm
    return {
      success: true,
      intent: 'escalate_decision',
      response: `Escalate "${decision.title || decision.summary}" to ${this.getNextAuthorityLevel(authorityLevel)}?\nReply YES to confirm or open the app for more options.`,
      actionPrompt: 'Reply YES to escalate',
      deepLink: `ectropy://decision/${decisionId}/escalate`,
    };
  }

  /**
   * Handle decision detail view
   */
  private async handleDecisionDetail(
    context: DecisionQueryContext,
    entities: Record<string, string>
  ): Promise<DecisionQueryResult> {
    const { userId, lastViewedDecisions } = context;

    let decisionId = entities.decisionId;

    // If no ID specified, use last viewed
    if (!decisionId && lastViewedDecisions && lastViewedDecisions.length > 0) {
      decisionId = lastViewedDecisions[0];
    }

    if (!decisionId) {
      return {
        success: true,
        intent: 'view_decision_detail',
        response: 'Which decision would you like to view? Reply with the decision ID.',
        actionPrompt: 'Enter decision ID',
      };
    }

    // Get decision
    const decision = await this.getDecision(decisionId);
    if (!decision) {
      return {
        success: false,
        intent: 'view_decision_detail',
        response: `Decision ${decisionId} not found.`,
        error: 'Decision not found',
      };
    }

    // Mark as viewed
    if (this.geofenceService) {
      this.geofenceService.markDecisionViewed(userId, decision.urn);
    }

    // Build detail response
    let response = `Decision: ${decision.title || decision.summary}\n`;
    response += `Status: ${decision.status}\n`;
    response += `Type: ${decision.type}\n`;
    if (decision.cost_impact) {
      response += `Cost Impact: $${decision.cost_impact.toLocaleString()}\n`;
    }
    if (decision.schedule_impact) {
      response += `Schedule Impact: ${decision.schedule_impact} days\n`;
    }
    response += `Created: ${new Date(decision.created_at).toLocaleDateString()}\n`;
    response += `Ref: ${decision.urn}`;

    return {
      success: true,
      intent: 'view_decision_detail',
      response,
      decisions: [this.toMobileDecisionCard(decision)],
      deepLink: `ectropy://decision/${decisionId}`,
    };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Get decision surface for voxel
   */
  private async getDecisionSurface(
    voxelId: string,
    userId: string
  ): Promise<MobileDecisionSurface | null> {
    if (!this.prisma) {
      return null;
    }

    try {
      const voxel = await this.prisma.voxel.findUnique({
        where: { id: voxelId },
      });

      if (!voxel) {return null;}

      // Get decision attachments
      const attachments = await this.prisma.voxelDecisionAttachment.findMany({
        where: { voxel_id: voxelId },
        include: {
          decision: { include: { created_by: true, approved_by: true } },
        },
      });

      const decisions = attachments.map((a: any) => this.toMobileDecisionCard(a.decision));

      // Get tolerance overrides
      const overrides = await this.prisma.toleranceOverride.findMany({
        where: { voxel_id: voxelId },
        include: { approved_by: true },
      });

      // Get pre-approvals
      const preApprovals = await this.prisma.preApproval.findMany({
        where: {
          voxel_id: voxelId,
          valid_until: { gt: new Date() },
          revoked_at: null,
        },
        include: { approved_by: true },
      });

      return {
        voxelId: voxel.id,
        voxelUrn: voxel.urn,
        voxelName: voxel.name,
        projectId: voxel.project_id,
        decisions,
        pendingCount: decisions.filter(d => d.status === 'PENDING').length,
        approvedCount: decisions.filter(d => d.status === 'APPROVED').length,
        alerts: [], // Would load alerts
        toleranceOverrides: overrides.map((o: any) => ({
          overrideId: o.id,
          type: o.type,
          dimension: o.dimension || '',
          originalValue: o.original_value || '',
          overrideValue: o.override_value || '',
          unit: o.unit || '',
          justification: o.justification || '',
          approvedBy: o.approved_by?.name || 'Unknown',
          approvedAt: o.approved_at?.toISOString(),
        })),
        preApprovals: preApprovals.map((p: any) => ({
          preApprovalId: p.id,
          scope: Array.isArray(p.scope) ? p.scope : [p.scope],
          conditions: p.conditions || '',
          maxCostImpact: p.max_cost_impact,
          maxScheduleImpact: p.max_schedule_impact,
          approvedBy: p.approved_by?.name || 'Unknown',
          validFrom: p.valid_from?.toISOString(),
          validUntil: p.valid_until?.toISOString(),
          usageCount: p.usage_count || 0,
        })),
        requiresAcknowledgment: decisions.some(d => d.requiresAcknowledgment && !d.acknowledged),
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error getting decision surface', { error, voxelId });
      return null;
    }
  }

  /**
   * Get decision by ID
   */
  private async getDecision(decisionId: string): Promise<any> {
    if (!this.prisma) {return null;}

    return this.prisma.pMDecision.findUnique({
      where: { id: decisionId },
      include: { created_by: true, approved_by: true },
    });
  }

  /**
   * Convert decision to mobile card
   */
  private toMobileDecisionCard(decision: any): MobileDecisionCard {
    return {
      decisionId: decision.id,
      decisionUrn: decision.urn,
      title: decision.title || decision.summary,
      type: decision.type,
      status: decision.status,
      priority: decision.priority || 'MEDIUM',
      summary: decision.summary || '',
      createdBy: decision.created_by?.name || 'Unknown',
      createdAt: decision.created_at?.toISOString(),
      approvedBy: decision.approved_by?.name,
      approvedAt: decision.approved_at?.toISOString(),
      costImpact: decision.cost_impact,
      scheduleImpact: decision.schedule_impact,
      requiresAcknowledgment: false,
      acknowledged: false,
      attachmentCount: 0,
      commentCount: 0,
      canApprove: false,
      canEscalate: true,
    };
  }

  /**
   * Build decision surface response for SMS
   */
  private buildDecisionSurfaceResponse(
    surface: MobileDecisionSurface,
    context: DecisionQueryContext
  ): DecisionQueryResult {
    let response = `Zone: ${surface.voxelName}\n`;
    response += `Decisions: ${surface.decisions.length} (${surface.pendingCount} pending)\n`;

    if (surface.pendingCount > 0) {
      response += '\nPending:\n';
      for (const d of surface.decisions.filter(d => d.status === 'PENDING').slice(0, 3)) {
        response += `- ${d.title.substring(0, 40)}${d.title.length > 40 ? '...' : ''}\n`;
      }
    }

    if (surface.toleranceOverrides.length > 0) {
      response += `\nTolerances: ${surface.toleranceOverrides.length} active\n`;
    }

    if (surface.preApprovals.length > 0) {
      response += `Pre-approvals: ${surface.preApprovals.length} active\n`;
    }

    if (surface.requiresAcknowledgment) {
      response += '\nAcknowledgment required. Reply ACK to acknowledge.';
    }

    return {
      success: true,
      intent: 'query_voxel_decisions',
      response,
      decisions: surface.decisions,
      acknowledgmentRequired: surface.requiresAcknowledgment,
      deepLink: `ectropy://voxel/${surface.voxelId}/surface`,
    };
  }

  /**
   * Build unknown intent response
   */
  private buildUnknownIntentResponse(queryText: string): DecisionQueryResult {
    return {
      success: true,
      intent: 'query_voxel_decisions',
      response: `I can help with:\n- Decisions in zone (say "decisions")\n- Acknowledge decision (say "ack DEC-123")\n- Check pre-approvals (say "preapprovals")\n- View decision detail (say "show DEC-123")\n- Escalate (say "escalate DEC-123")`,
      actionPrompt: 'What would you like to do?',
    };
  }

  /**
   * Get next authority level name
   */
  private getNextAuthorityLevel(currentLevel: number): string {
    const levels = ['Foreman', 'Superintendent', 'Project Manager', 'Architect', 'Owner', 'Regulatory'];
    return levels[Math.min(currentLevel, levels.length - 1)] || 'Supervisor';
  }
}

// ==============================================================================
// Factory Function
// ==============================================================================

/**
 * Create decision query service instance
 */
export function createDecisionQueryService(
  config?: DecisionQueryServiceConfig
): DecisionQueryService {
  return new DecisionQueryService(config);
}

export default DecisionQueryService;

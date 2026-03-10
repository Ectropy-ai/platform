/**
 * Mobile Integration Services (DL-M5)
 *
 * Unified exports for mobile app integration services including
 * voxel geofence detection, notifications, acknowledgments, and SMS queries.
 *
 * @module services/mobile
 * @version 1.0.0
 */

// ==============================================================================
// Types
// ==============================================================================

export * from './types.js';

// ==============================================================================
// Services
// ==============================================================================

export { GeofenceService, createGeofenceService } from './geofence.service.js';
export { NotificationService, createNotificationService } from './notification.service.js';
export { AcknowledgmentService, createAcknowledgmentService } from './acknowledgment.service.js';
export { DecisionQueryService, createDecisionQueryService } from './decision-query.service.js';

// ==============================================================================
// Mobile Service Orchestrator
// ==============================================================================

import { GeofenceService, createGeofenceService } from './geofence.service.js';
import { NotificationService, createNotificationService } from './notification.service.js';
import { AcknowledgmentService, createAcknowledgmentService } from './acknowledgment.service.js';
import { DecisionQueryService, createDecisionQueryService } from './decision-query.service.js';
import type {
  GeofenceEvent,
  LocationUpdate,
  AcknowledgmentRequest,
  DecisionQueryContext,
  MobileServiceConfig,
  VoxelEntryDetection,
  Acknowledgment,
  DecisionQueryResult,
} from './types.js';

/**
 * Mobile Service Orchestrator
 *
 * Coordinates all mobile services and provides a unified API
 */
export class MobileServiceOrchestrator {
  public readonly geofence: GeofenceService;
  public readonly notification: NotificationService;
  public readonly acknowledgment: AcknowledgmentService;
  public readonly decisionQuery: DecisionQueryService;

  private prisma: any;
  private initialized: boolean = false;

  constructor(config: { prisma?: any; serviceConfig?: Partial<MobileServiceConfig> }) {
    this.prisma = config.prisma;

    // Create geofence service with entry/exit callbacks
    this.geofence = createGeofenceService({
      prisma: config.prisma,
      config: config.serviceConfig?.geofencing,
      onVoxelEntry: this.handleVoxelEntry.bind(this),
      onVoxelExit: this.handleVoxelExit.bind(this),
    });

    // Create notification service
    this.notification = createNotificationService({
      prisma: config.prisma,
      config: config.serviceConfig?.notifications,
    });

    // Create acknowledgment service with geofence integration
    this.acknowledgment = createAcknowledgmentService({
      prisma: config.prisma,
      config: config.serviceConfig?.acknowledgments,
      geofenceService: this.geofence,
    });

    // Create decision query service with integrations
    this.decisionQuery = createDecisionQueryService({
      prisma: config.prisma,
      geofenceService: this.geofence,
      acknowledgmentService: this.acknowledgment,
    });

    this.initialized = true;
  }

  /**
   * Process location update through geofence service
   */
  async processLocationUpdate(location: LocationUpdate): Promise<VoxelEntryDetection> {
    return this.geofence.processLocationUpdate(location);
  }

  /**
   * Process acknowledgment request
   */
  async processAcknowledgment(request: AcknowledgmentRequest): Promise<{
    success: boolean;
    acknowledgment?: Acknowledgment;
    error?: string;
  }> {
    return this.acknowledgment.processAcknowledgment(request);
  }

  /**
   * Process SMS decision query
   */
  async processDecisionQuery(
    queryText: string,
    context: DecisionQueryContext
  ): Promise<DecisionQueryResult> {
    return this.decisionQuery.processQuery(queryText, context);
  }

  /**
   * Get active voxel session for user
   */
  getActiveSession(userId: string) {
    return this.geofence.getActiveSession(userId);
  }

  /**
   * Get service statistics
   */
  getStatistics() {
    return {
      geofence: this.geofence.getStatistics(),
      notification: this.notification.getStatistics(),
      acknowledgment: this.acknowledgment.getStatistics(),
      initialized: this.initialized,
    };
  }

  /**
   * Handle voxel entry event (callback from geofence service)
   */
  private async handleVoxelEntry(event: GeofenceEvent): Promise<void> {
    // Send notification
    await this.notification.notifyVoxelEntry(event);
  }

  /**
   * Handle voxel exit event (callback from geofence service)
   */
  private async handleVoxelExit(event: GeofenceEvent): Promise<void> {
    // Cancel any pending acknowledgment reminders
    this.acknowledgment.cancelAllRemindersForUser(event.userId);
  }
}

/**
 * Create mobile service orchestrator
 */
export function createMobileOrchestrator(config: {
  prisma?: any;
  serviceConfig?: Partial<MobileServiceConfig>;
}): MobileServiceOrchestrator {
  return new MobileServiceOrchestrator(config);
}

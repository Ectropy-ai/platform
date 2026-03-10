/**
 * Acknowledgment Capture Service (DL-M5)
 *
 * Handles decision acknowledgment capture with location verification,
 * digital signatures, and audit trail management.
 *
 * @module services/mobile/acknowledgment.service
 * @version 1.0.0
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../../../../libs/shared/utils/src/logger.js';
import {
  DEFAULT_ACKNOWLEDGMENT_CONFIG,
  type Acknowledgment,
  type AcknowledgmentRequest,
  type AcknowledgmentType,
  type AcknowledgmentStatus,
  type AcknowledgmentConfig,
  type AcknowledgmentSignature,
  type LocationUpdate,
  type LocationVerification,
  type GeoCoordinate,
  type DeviceInfo,
} from './types.js';

// ==============================================================================
// Types
// ==============================================================================

interface PrismaClient {
  acknowledgment: {
    create: (args: any) => Promise<any>;
    findMany: (args: any) => Promise<any[]>;
    findFirst: (args: any) => Promise<any>;
    count: (args: any) => Promise<number>;
    update: (args: any) => Promise<any>;
  };
  pMDecision: {
    findUnique: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
  };
  voxel: {
    findUnique: (args: any) => Promise<any>;
  };
  participant: {
    findFirst: (args: any) => Promise<any>;
  };
}

interface AcknowledgmentServiceConfig {
  prisma?: PrismaClient;
  config?: Partial<AcknowledgmentConfig>;
  geofenceService?: {
    getActiveSession: (userId: string) => any;
    markDecisionAcknowledged: (userId: string, decisionUrn: string) => void;
  };
}

interface AcknowledgmentResult {
  success: boolean;
  acknowledgment?: Acknowledgment;
  error?: string;
  locationVerification?: LocationVerification;
}

interface PendingAcknowledgment {
  decisionId: string;
  decisionUrn: string;
  decisionTitle: string;
  voxelId: string;
  voxelName: string;
  requiredType: AcknowledgmentType;
  expiresAt: string;
  remindersSent: number;
}

// ==============================================================================
// Acknowledgment Service Class
// ==============================================================================

export class AcknowledgmentService {
  private config: AcknowledgmentConfig;
  private prisma?: PrismaClient;
  private geofenceService?: {
    getActiveSession: (userId: string) => any;
    markDecisionAcknowledged: (userId: string, decisionUrn: string) => void;
  };
  private pendingReminders: Map<string, NodeJS.Timeout>; // ackKey -> timeout

  constructor(serviceConfig?: AcknowledgmentServiceConfig) {
    this.config = { ...DEFAULT_ACKNOWLEDGMENT_CONFIG, ...serviceConfig?.config };
    this.prisma = serviceConfig?.prisma;
    this.geofenceService = serviceConfig?.geofenceService;
    this.pendingReminders = new Map();
  }

  // ===========================================================================
  // Acknowledgment Capture
  // ===========================================================================

  /**
   * Process acknowledgment request
   */
  async processAcknowledgment(request: AcknowledgmentRequest): Promise<AcknowledgmentResult> {
    const { decisionId, decisionUrn, userId, voxelId, projectId, tenantId, location, deviceInfo, signature, notes, timestamp } = request;

    try {
      // Validate decision exists
      const decision = await this.getDecision(decisionId);
      if (!decision) {
        return { success: false, error: 'Decision not found' };
      }

      // Check for duplicate acknowledgment
      const existing = await this.getExistingAcknowledgment(decisionId, userId);
      if (existing) {
        return { success: false, error: 'Decision already acknowledged', acknowledgment: existing };
      }

      // Verify location if required
      let locationVerification: LocationVerification | undefined;
      if (this.config.requireLocation) {
        locationVerification = await this.verifyLocation(location, voxelId);
        if (this.config.locationVerificationEnabled && !locationVerification.verified) {
          logger.warn('Location verification failed', { userId, voxelId, locationVerification });
          // Continue but flag the acknowledgment
        }
      }

      // Verify signature if required
      if (this.config.signatureRequired && !signature) {
        return { success: false, error: 'Signature required for acknowledgment' };
      }

      if (signature && !this.validateSignature(signature)) {
        return { success: false, error: 'Invalid signature' };
      }

      // Determine acknowledgment type
      const type = this.determineAcknowledgmentType(decision, signature);

      // Get participant ID if available
      const participant = await this.getParticipant(userId, projectId);

      // Create acknowledgment record
      const acknowledgment = await this.createAcknowledgment({
        decisionId,
        decisionUrn,
        userId,
        participantId: participant?.id,
        voxelId,
        projectId,
        tenantId,
        type,
        location,
        locationVerification,
        signature,
        notes,
        timestamp,
      });

      // Update decision if needed
      await this.updateDecisionAcknowledgment(decisionId, userId, type);

      // Update geofence session
      if (this.geofenceService) {
        this.geofenceService.markDecisionAcknowledged(userId, decisionUrn);
      }

      // Cancel any pending reminders
      this.cancelReminder(`${userId}:${decisionId}`);

      logger.info('Acknowledgment captured', {
        acknowledgmentId: acknowledgment.acknowledgmentId,
        decisionId,
        userId,
        type,
        locationVerified: locationVerification?.verified,
      });

      return {
        success: true,
        acknowledgment,
        locationVerification,
      };
    } catch (error) {
      logger.error('Error processing acknowledgment', { error, request });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create acknowledgment record
   */
  private async createAcknowledgment(data: {
    decisionId: string;
    decisionUrn: string;
    userId: string;
    participantId?: string;
    voxelId: string;
    projectId: string;
    tenantId: string;
    type: AcknowledgmentType;
    location: LocationUpdate;
    locationVerification?: LocationVerification;
    signature?: AcknowledgmentSignature;
    notes?: string;
    timestamp: string;
  }): Promise<Acknowledgment> {
    const acknowledgmentId = uuidv4();
    const now = new Date().toISOString();

    const acknowledgment: Acknowledgment = {
      acknowledgmentId,
      $id: `urn:luhtech:${data.tenantId}:acknowledgment:${acknowledgmentId}`,
      decisionId: data.decisionId,
      userId: data.userId,
      participantId: data.participantId,
      voxelId: data.voxelId,
      projectId: data.projectId,
      tenantId: data.tenantId,
      type: data.type,
      status: 'COMPLETED',
      location: data.location,
      locationVerified: data.locationVerification?.verified || false,
      locationVerificationDetails: data.locationVerification,
      signature: data.signature,
      notes: data.notes,
      acknowledgedAt: data.timestamp,
      createdAt: now,
      updatedAt: now,
    };

    // Persist to database if available
    if (this.prisma) {
      await this.prisma.acknowledgment.create({
        data: {
          id: acknowledgmentId,
          urn: acknowledgment.$id,
          decision_id: data.decisionId,
          user_id: data.userId,
          participant_id: data.participantId,
          voxel_id: data.voxelId,
          project_id: data.projectId,
          tenant_id: data.tenantId,
          type: data.type,
          status: 'COMPLETED',
          location_data: data.location as any,
          location_verified: acknowledgment.locationVerified,
          location_verification: data.locationVerification as any,
          signature_data: data.signature as any,
          notes: data.notes,
          acknowledged_at: new Date(data.timestamp),
        },
      });
    }

    return acknowledgment;
  }

  // ===========================================================================
  // Location Verification
  // ===========================================================================

  /**
   * Verify that location is within expected voxel
   */
  async verifyLocation(location: LocationUpdate, expectedVoxelId: string): Promise<LocationVerification> {
    // Get voxel coordinates
    const voxel = await this.getVoxel(expectedVoxelId);

    if (!voxel || !voxel.coordinates) {
      return {
        verified: false,
        expectedVoxelId,
        confidenceScore: 0,
        verificationMethod: location.source,
        verifiedAt: new Date().toISOString(),
        failureReason: 'Voxel coordinates not available',
      };
    }

    // Check if user is in geofence session for this voxel
    if (this.geofenceService) {
      const session = this.geofenceService.getActiveSession(location.userId);
      if (session && session.voxelId === expectedVoxelId) {
        return {
          verified: true,
          expectedVoxelId,
          actualVoxelId: session.voxelId,
          confidenceScore: 0.95,
          verificationMethod: location.source,
          verifiedAt: new Date().toISOString(),
        };
      }
    }

    // Calculate distance from voxel center
    const distance = this.calculateDistance(location, voxel.coordinates);

    const verified = distance <= this.config.maxDistanceFromVoxel;
    const confidenceScore = Math.max(0, 1 - distance / (this.config.maxDistanceFromVoxel * 2));

    return {
      verified,
      expectedVoxelId,
      actualVoxelId: verified ? expectedVoxelId : undefined,
      distance,
      confidenceScore,
      verificationMethod: location.source,
      verifiedAt: new Date().toISOString(),
      failureReason: verified ? undefined : `Distance ${distance.toFixed(1)}m exceeds maximum ${this.config.maxDistanceFromVoxel}m`,
    };
  }

  /**
   * Calculate distance between location and voxel center
   */
  private calculateDistance(location: LocationUpdate, voxelCoords: any): number {
    if (!location.gps) {
      // For non-GPS sources, assume within bounds if session active
      return 0;
    }

    const voxelLat = voxelCoords.lat || voxelCoords.latitude || 0;
    const voxelLon = voxelCoords.lng || voxelCoords.longitude || 0;

    return this.haversineDistance(
      location.gps.latitude,
      location.gps.longitude,
      voxelLat,
      voxelLon
    );
  }

  /**
   * Haversine distance calculation
   */
  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  // ===========================================================================
  // Signature Validation
  // ===========================================================================

  /**
   * Validate acknowledgment signature
   */
  private validateSignature(signature: AcknowledgmentSignature): boolean {
    // Check if signature type is allowed
    if (!this.config.allowedSignatureTypes.includes(signature.type)) {
      return false;
    }

    // Validate based on type
    switch (signature.type) {
      case 'DIGITAL':
        return !!(signature.data && signature.data.length > 0);
      case 'PIN':
        return signature.verified;
      case 'BIOMETRIC':
        return signature.verified && !!signature.biometricType;
      case 'FACE_ID':
        return signature.verified;
      default:
        return false;
    }
  }

  // ===========================================================================
  // Acknowledgment Type Determination
  // ===========================================================================

  /**
   * Determine acknowledgment type based on decision and signature
   */
  private determineAcknowledgmentType(
    decision: any,
    signature?: AcknowledgmentSignature
  ): AcknowledgmentType {
    // If signature provided, it's a signed acknowledgment
    if (signature && signature.verified) {
      return 'SIGNED';
    }

    // Check decision requirements
    if (decision.requires_signature) {
      return 'SIGNED';
    }

    // Default to understood for most decisions
    return 'UNDERSTOOD';
  }

  // ===========================================================================
  // Pending Acknowledgments
  // ===========================================================================

  /**
   * Get pending acknowledgments for user
   */
  async getPendingAcknowledgments(
    userId: string,
    projectId: string
  ): Promise<PendingAcknowledgment[]> {
    if (!this.prisma) {
      return [];
    }

    // Get voxel decision attachments that require acknowledgment
    // This would be implemented based on decision requirements
    // For now, return empty array
    return [];
  }

  /**
   * Get acknowledgment history for user
   */
  async getAcknowledgmentHistory(
    userId: string,
    options?: { projectId?: string; limit?: number; offset?: number }
  ): Promise<Acknowledgment[]> {
    if (!this.prisma) {
      return [];
    }

    try {
      const where: any = { user_id: userId };
      if (options?.projectId) {
        where.project_id = options.projectId;
      }

      const records = await this.prisma.acknowledgment.findMany({
        where,
        orderBy: { acknowledged_at: 'desc' },
        take: options?.limit || 50,
        skip: options?.offset || 0,
      });

      return records.map((r: any) => this.recordToAcknowledgment(r));
    } catch (error) {
      logger.error('Error getting acknowledgment history', { error, userId });
      return [];
    }
  }

  /**
   * Get acknowledgments for decision
   */
  async getDecisionAcknowledgments(decisionId: string): Promise<Acknowledgment[]> {
    if (!this.prisma) {
      return [];
    }

    try {
      const records = await this.prisma.acknowledgment.findMany({
        where: { decision_id: decisionId },
        orderBy: { acknowledged_at: 'desc' },
      });

      return records.map((r: any) => this.recordToAcknowledgment(r));
    } catch (error) {
      logger.error('Error getting decision acknowledgments', { error, decisionId });
      return [];
    }
  }

  // ===========================================================================
  // Reminder Management
  // ===========================================================================

  /**
   * Schedule acknowledgment reminder
   */
  scheduleReminder(
    userId: string,
    decisionId: string,
    callback: () => Promise<void>
  ): void {
    const key = `${userId}:${decisionId}`;

    // Cancel existing reminder
    this.cancelReminder(key);

    // Schedule new reminder
    const timeout = setTimeout(async () => {
      try {
        await callback();
      } catch (error) {
        logger.error('Error in reminder callback', { error, userId, decisionId });
      }
    }, this.config.reminderIntervalMinutes * 60 * 1000);

    this.pendingReminders.set(key, timeout);
  }

  /**
   * Cancel pending reminder
   */
  cancelReminder(key: string): void {
    const timeout = this.pendingReminders.get(key);
    if (timeout) {
      clearTimeout(timeout);
      this.pendingReminders.delete(key);
    }
  }

  /**
   * Cancel all reminders for user
   */
  cancelAllRemindersForUser(userId: string): void {
    for (const [key, timeout] of this.pendingReminders.entries()) {
      if (key.startsWith(`${userId}:`)) {
        clearTimeout(timeout);
        this.pendingReminders.delete(key);
      }
    }
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Get decision by ID
   */
  private async getDecision(decisionId: string): Promise<any> {
    if (!this.prisma) {
      return { id: decisionId };
    }

    return this.prisma.pMDecision.findUnique({
      where: { id: decisionId },
    });
  }

  /**
   * Get existing acknowledgment
   */
  private async getExistingAcknowledgment(
    decisionId: string,
    userId: string
  ): Promise<Acknowledgment | null> {
    if (!this.prisma) {
      return null;
    }

    const record = await this.prisma.acknowledgment.findFirst({
      where: {
        decision_id: decisionId,
        user_id: userId,
        status: 'COMPLETED',
      },
    });

    return record ? this.recordToAcknowledgment(record) : null;
  }

  /**
   * Get voxel by ID
   */
  private async getVoxel(voxelId: string): Promise<any> {
    if (!this.prisma) {
      return null;
    }

    return this.prisma.voxel.findUnique({
      where: { id: voxelId },
      select: { id: true, urn: true, name: true, coordinates: true, bounding_box: true },
    });
  }

  /**
   * Get participant for user in project
   */
  private async getParticipant(userId: string, projectId: string): Promise<any> {
    if (!this.prisma) {
      return null;
    }

    return this.prisma.participant.findFirst({
      where: { user_id: userId, project_id: projectId },
    });
  }

  /**
   * Update decision acknowledgment status
   */
  private async updateDecisionAcknowledgment(
    decisionId: string,
    userId: string,
    type: AcknowledgmentType
  ): Promise<void> {
    if (!this.prisma) {return;}

    // Update decision's acknowledgment tracking if needed
    // This depends on the decision model having acknowledgment fields
  }

  /**
   * Convert database record to Acknowledgment
   */
  private recordToAcknowledgment(record: any): Acknowledgment {
    return {
      acknowledgmentId: record.id,
      $id: record.urn,
      decisionId: record.decision_id,
      userId: record.user_id,
      participantId: record.participant_id,
      voxelId: record.voxel_id,
      projectId: record.project_id,
      tenantId: record.tenant_id,
      type: record.type,
      status: record.status,
      location: record.location_data,
      locationVerified: record.location_verified,
      locationVerificationDetails: record.location_verification,
      signature: record.signature_data,
      notes: record.notes,
      acknowledgedAt: record.acknowledged_at?.toISOString(),
      createdAt: record.created_at?.toISOString(),
      updatedAt: record.updated_at?.toISOString(),
    };
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get service statistics
   */
  getStatistics(): {
    pendingReminders: number;
    config: AcknowledgmentConfig;
  } {
    return {
      pendingReminders: this.pendingReminders.size,
      config: this.config,
    };
  }
}

// ==============================================================================
// Factory Function
// ==============================================================================

/**
 * Create acknowledgment service instance
 */
export function createAcknowledgmentService(
  config?: AcknowledgmentServiceConfig
): AcknowledgmentService {
  return new AcknowledgmentService(config);
}

export default AcknowledgmentService;

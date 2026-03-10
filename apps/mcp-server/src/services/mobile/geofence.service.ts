/**
 * Voxel Geofence Detection Service (DL-M5)
 *
 * Handles voxel entry/exit detection using GPS, UWB, and other location sources.
 * Manages worker location tracking and voxel session state.
 *
 * @module services/mobile/geofence.service
 * @version 1.0.0
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../../../../libs/shared/utils/src/logger.js';
import {
  DEFAULT_GEOFENCING_CONFIG,
  buildGeofenceEventUrn,
  buildVoxelSessionUrn,
  type LocationUpdate,
  type GeoCoordinate,
  type SpatialCoordinate,
  type VoxelGeofence,
  type GeofenceEvent,
  type GeofenceEventType,
  type GeofenceBoundary,
  type VoxelEntryDetection,
  type VoxelSession,
  type VoxelSessionStatus,
  type DeviceInfo,
  type GeofencingConfig,
} from './types.js';

// ==============================================================================
// Types
// ==============================================================================

interface PrismaClient {
  voxel: {
    findMany: (args: any) => Promise<any[]>;
    findUnique: (args: any) => Promise<any>;
  };
  voxelAlert: {
    count: (args: any) => Promise<number>;
  };
  preApproval: {
    count: (args: any) => Promise<number>;
  };
  toleranceOverride: {
    count: (args: any) => Promise<number>;
  };
}

interface GeofenceServiceConfig {
  prisma?: PrismaClient;
  config?: Partial<GeofencingConfig>;
  onVoxelEntry?: (event: GeofenceEvent) => Promise<void>;
  onVoxelExit?: (event: GeofenceEvent) => Promise<void>;
}

// ==============================================================================
// Geofence Service Class
// ==============================================================================

export class GeofenceService {
  private config: GeofencingConfig;
  private prisma?: PrismaClient;
  private geofenceCache: Map<string, VoxelGeofence[]>; // projectId -> geofences
  private activeSessions: Map<string, VoxelSession>; // userId -> session
  private pendingEntries: Map<string, { location: LocationUpdate; timestamp: number }>;
  private onVoxelEntry?: (event: GeofenceEvent) => Promise<void>;
  private onVoxelExit?: (event: GeofenceEvent) => Promise<void>;

  constructor(serviceConfig?: GeofenceServiceConfig) {
    this.config = { ...DEFAULT_GEOFENCING_CONFIG, ...serviceConfig?.config };
    this.prisma = serviceConfig?.prisma;
    this.geofenceCache = new Map();
    this.activeSessions = new Map();
    this.pendingEntries = new Map();
    this.onVoxelEntry = serviceConfig?.onVoxelEntry;
    this.onVoxelExit = serviceConfig?.onVoxelExit;
  }

  // ===========================================================================
  // Location Processing
  // ===========================================================================

  /**
   * Process location update and check for voxel entry/exit
   */
  async processLocationUpdate(location: LocationUpdate): Promise<VoxelEntryDetection> {
    const { userId, projectId, tenantId, deviceId } = location;

    // Check if location accuracy meets threshold
    if (!this.isLocationAccurate(location)) {
      return {
        detected: false,
        confidence: 0,
        locationSource: location.source,
      };
    }

    // Get or refresh geofences for project
    const geofences = await this.getGeofencesForProject(projectId);

    // Find matching geofence
    const matchedGeofence = this.findMatchingGeofence(location, geofences);

    // Get current session
    const currentSession = this.activeSessions.get(userId);

    // Detect entry/exit
    if (matchedGeofence && !currentSession) {
      // Potential entry - check dwell time
      return this.handlePotentialEntry(location, matchedGeofence);
    } else if (matchedGeofence && currentSession) {
      if (matchedGeofence.voxelId === currentSession.voxelId) {
        // Still in same voxel - update session
        this.updateSession(currentSession, location);
        return {
          detected: true,
          voxelId: matchedGeofence.voxelId,
          voxelUrn: matchedGeofence.voxelUrn,
          voxelName: matchedGeofence.name,
          confidence: this.calculateConfidence(location, matchedGeofence),
          entryTime: currentSession.entryTime,
          dwellDuration: this.calculateDwellDuration(currentSession.entryTime),
          locationSource: location.source,
          matchedGeofence,
        };
      } else {
        // Moved to different voxel - exit current, enter new
        await this.handleVoxelExit(currentSession, location);
        return this.handlePotentialEntry(location, matchedGeofence);
      }
    } else if (!matchedGeofence && currentSession) {
      // Potential exit - check if truly outside
      return this.handlePotentialExit(currentSession, location);
    }

    // No geofence match and no session
    return {
      detected: false,
      confidence: 0,
      locationSource: location.source,
    };
  }

  /**
   * Handle potential voxel entry (check dwell time)
   */
  private async handlePotentialEntry(
    location: LocationUpdate,
    geofence: VoxelGeofence
  ): Promise<VoxelEntryDetection> {
    const entryKey = `${location.userId}:${geofence.voxelId}`;
    const pendingEntry = this.pendingEntries.get(entryKey);
    const now = Date.now();

    if (!pendingEntry) {
      // Start tracking potential entry
      this.pendingEntries.set(entryKey, { location, timestamp: now });
      return {
        detected: false,
        voxelId: geofence.voxelId,
        voxelUrn: geofence.voxelUrn,
        voxelName: geofence.name,
        confidence: this.calculateConfidence(location, geofence),
        locationSource: location.source,
        matchedGeofence: geofence,
      };
    }

    // Check if dwell time threshold met
    const dwellTime = (now - pendingEntry.timestamp) / 1000;
    if (dwellTime >= this.config.dwellTimeThreshold) {
      // Confirmed entry
      this.pendingEntries.delete(entryKey);
      return this.confirmVoxelEntry(location, geofence);
    }

    // Still waiting for dwell time
    return {
      detected: false,
      voxelId: geofence.voxelId,
      voxelUrn: geofence.voxelUrn,
      voxelName: geofence.name,
      confidence: this.calculateConfidence(location, geofence),
      locationSource: location.source,
      matchedGeofence: geofence,
    };
  }

  /**
   * Confirm voxel entry and create session
   */
  private async confirmVoxelEntry(
    location: LocationUpdate,
    geofence: VoxelGeofence
  ): Promise<VoxelEntryDetection> {
    const { userId, projectId, tenantId, deviceId } = location;

    // Create session
    const session: VoxelSession = {
      sessionId: uuidv4(),
      userId,
      voxelId: geofence.voxelId,
      projectId,
      tenantId,
      entryTime: new Date().toISOString(),
      locationHistory: [location],
      decisionsViewed: [],
      acknowledgedDecisions: [],
      status: 'ACTIVE',
      deviceInfo: this.extractDeviceInfo(location),
    };

    this.activeSessions.set(userId, session);

    // Create geofence event
    const event: GeofenceEvent = {
      eventId: uuidv4(),
      voxelId: geofence.voxelId,
      userId,
      deviceId,
      projectId,
      tenantId,
      eventType: 'ENTER',
      location,
      confidence: this.calculateConfidence(location, geofence),
      triggeredAt: new Date().toISOString(),
      notificationSent: false,
      acknowledgmentRequired: await this.checkAcknowledgmentRequired(geofence.voxelId),
    };

    // Trigger callback
    if (this.onVoxelEntry) {
      try {
        await this.onVoxelEntry(event);
        event.notificationSent = true;
      } catch (error) {
        logger.error('Error in voxel entry callback', { error, event });
      }
    }

    logger.info('Voxel entry detected', {
      userId,
      voxelId: geofence.voxelId,
      voxelName: geofence.name,
      sessionId: session.sessionId,
    });

    return {
      detected: true,
      voxelId: geofence.voxelId,
      voxelUrn: geofence.voxelUrn,
      voxelName: geofence.name,
      confidence: event.confidence,
      entryTime: session.entryTime,
      locationSource: location.source,
      matchedGeofence: geofence,
    };
  }

  /**
   * Handle potential voxel exit
   */
  private async handlePotentialExit(
    session: VoxelSession,
    location: LocationUpdate
  ): Promise<VoxelEntryDetection> {
    const exitKey = `exit:${location.userId}:${session.voxelId}`;
    const pendingExit = this.pendingEntries.get(exitKey);
    const now = Date.now();

    if (!pendingExit) {
      // Start tracking potential exit
      this.pendingEntries.set(exitKey, { location, timestamp: now });
      return {
        detected: true,
        voxelId: session.voxelId,
        entryTime: session.entryTime,
        dwellDuration: this.calculateDwellDuration(session.entryTime),
        confidence: 0.5, // Lower confidence during potential exit
        locationSource: location.source,
      };
    }

    // Check if exit time threshold met
    const exitTime = (now - pendingExit.timestamp) / 1000;
    if (exitTime >= this.config.exitTimeThreshold) {
      // Confirmed exit
      this.pendingEntries.delete(exitKey);
      await this.handleVoxelExit(session, location);
      return {
        detected: false,
        voxelId: session.voxelId,
        exitTime: new Date().toISOString(),
        dwellDuration: this.calculateDwellDuration(session.entryTime),
        confidence: 1,
        locationSource: location.source,
      };
    }

    // Still waiting for exit confirmation
    return {
      detected: true,
      voxelId: session.voxelId,
      entryTime: session.entryTime,
      dwellDuration: this.calculateDwellDuration(session.entryTime),
      confidence: 0.5,
      locationSource: location.source,
    };
  }

  /**
   * Handle confirmed voxel exit
   */
  private async handleVoxelExit(
    session: VoxelSession,
    location: LocationUpdate
  ): Promise<void> {
    const { userId, projectId, tenantId, deviceId } = location;

    // Update session
    session.status = 'EXITED';
    session.exitTime = new Date().toISOString();
    session.dwellDuration = this.calculateDwellDuration(session.entryTime);

    // Remove from active sessions
    this.activeSessions.delete(userId);

    // Create exit event
    const event: GeofenceEvent = {
      eventId: uuidv4(),
      voxelId: session.voxelId,
      userId,
      deviceId,
      projectId,
      tenantId,
      eventType: 'EXIT',
      location,
      confidence: 1,
      triggeredAt: new Date().toISOString(),
      notificationSent: false,
      acknowledgmentRequired: false,
    };

    // Trigger callback
    if (this.onVoxelExit) {
      try {
        await this.onVoxelExit(event);
      } catch (error) {
        logger.error('Error in voxel exit callback', { error, event });
      }
    }

    logger.info('Voxel exit detected', {
      userId,
      voxelId: session.voxelId,
      sessionId: session.sessionId,
      dwellDuration: session.dwellDuration,
    });
  }

  // ===========================================================================
  // Geofence Management
  // ===========================================================================

  /**
   * Get geofences for a project (cached)
   */
  async getGeofencesForProject(projectId: string): Promise<VoxelGeofence[]> {
    // Check cache
    const cached = this.geofenceCache.get(projectId);
    if (cached) {
      return cached;
    }

    // Load from database
    const geofences = await this.loadGeofencesFromDatabase(projectId);
    this.geofenceCache.set(projectId, geofences);

    return geofences;
  }

  /**
   * Load geofences from database (voxels with coordinates)
   */
  private async loadGeofencesFromDatabase(projectId: string): Promise<VoxelGeofence[]> {
    if (!this.prisma) {
      return [];
    }

    try {
      const voxels = await this.prisma.voxel.findMany({
        where: {
          project_id: projectId,
          status: { in: ['PLANNED', 'IN_PROGRESS', 'COMPLETE'] },
          // Only include voxels with coordinates or bounding boxes
          OR: [
            { coordinates: { not: null } },
            { bounding_box: { not: null } },
          ],
        },
        select: {
          id: true,
          urn: true,
          name: true,
          type: true,
          coordinates: true,
          bounding_box: true,
        },
      });

      return voxels.map((v: any) => this.voxelToGeofence(v));
    } catch (error) {
      logger.error('Error loading geofences from database', { error, projectId });
      return [];
    }
  }

  /**
   * Convert voxel to geofence
   */
  private voxelToGeofence(voxel: any): VoxelGeofence {
    let boundary: GeofenceBoundary;

    if (voxel.bounding_box) {
      // Use bounding box for 3D spatial geofence
      const box = voxel.bounding_box;
      boundary = {
        shape: 'BOX',
        minCorner: box.min as SpatialCoordinate,
        maxCorner: box.max as SpatialCoordinate,
      };
    } else if (voxel.coordinates) {
      // Use coordinates as center with default radius
      const coords = voxel.coordinates;
      boundary = {
        shape: 'CIRCLE',
        center: {
          latitude: coords.lat || coords.latitude || 0,
          longitude: coords.lng || coords.longitude || 0,
        },
        radius: coords.radius || 10, // 10m default radius
      };
    } else {
      // Fallback empty boundary
      boundary = {
        shape: 'CIRCLE',
        center: { latitude: 0, longitude: 0 },
        radius: 10,
      };
    }

    return {
      voxelId: voxel.id,
      voxelUrn: voxel.urn,
      projectId: voxel.project_id,
      name: voxel.name,
      type: voxel.type || 'ZONE',
      boundary,
      bufferZone: 5, // 5m buffer
      dwellTime: this.config.dwellTimeThreshold,
      active: true,
      priority: 'NORMAL',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Refresh geofence cache for a project
   */
  async refreshGeofences(projectId: string): Promise<void> {
    this.geofenceCache.delete(projectId);
    await this.getGeofencesForProject(projectId);
  }

  /**
   * Clear all geofence caches
   */
  clearCache(): void {
    this.geofenceCache.clear();
  }

  // ===========================================================================
  // Geometry Calculations
  // ===========================================================================

  /**
   * Find matching geofence for location
   */
  private findMatchingGeofence(
    location: LocationUpdate,
    geofences: VoxelGeofence[]
  ): VoxelGeofence | undefined {
    // Filter active geofences
    const activeGeofences = geofences.filter(g => g.active);

    // Sort by priority (higher priority first)
    const priorityOrder = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
    activeGeofences.sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );

    // Find first matching geofence
    for (const geofence of activeGeofences) {
      if (this.isInsideGeofence(location, geofence)) {
        return geofence;
      }
    }

    return undefined;
  }

  /**
   * Check if location is inside geofence
   */
  private isInsideGeofence(location: LocationUpdate, geofence: VoxelGeofence): boolean {
    const { boundary } = geofence;

    if (boundary.shape === 'CIRCLE' && boundary.center && boundary.radius) {
      return this.isInsideCircle(location, boundary.center, boundary.radius);
    } else if (boundary.shape === 'BOX' && boundary.minCorner && boundary.maxCorner) {
      return this.isInsideBox(location, boundary.minCorner, boundary.maxCorner);
    } else if (boundary.shape === 'POLYGON' && boundary.vertices) {
      return this.isInsidePolygon(location, boundary.vertices);
    }

    return false;
  }

  /**
   * Check if location is inside circular geofence
   */
  private isInsideCircle(
    location: LocationUpdate,
    center: GeoCoordinate,
    radius: number
  ): boolean {
    if (!location.gps) {return false;}

    const distance = this.haversineDistance(
      location.gps.latitude,
      location.gps.longitude,
      center.latitude,
      center.longitude
    );

    return distance <= radius;
  }

  /**
   * Check if location is inside box geofence (3D)
   */
  private isInsideBox(
    location: LocationUpdate,
    min: SpatialCoordinate,
    max: SpatialCoordinate
  ): boolean {
    // For UWB/BIM coordinates
    if (location.uwb) {
      const { x, y, z } = location.uwb;
      return (
        x >= min.x && x <= max.x &&
        y >= min.y && y <= max.y &&
        z >= min.z && z <= max.z
      );
    }

    // For GPS, convert to local coordinates if possible
    // This is a simplified check - real implementation would use coordinate transformation
    return false;
  }

  /**
   * Check if location is inside polygon geofence
   */
  private isInsidePolygon(location: LocationUpdate, vertices: GeoCoordinate[]): boolean {
    if (!location.gps || vertices.length < 3) {return false;}

    const { latitude, longitude } = location.gps;
    let inside = false;

    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].longitude;
      const yi = vertices[i].latitude;
      const xj = vertices[j].longitude;
      const yj = vertices[j].latitude;

      const intersect =
        yi > latitude !== yj > latitude &&
        longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi;

      if (intersect) {inside = !inside;}
    }

    return inside;
  }

  /**
   * Calculate haversine distance between two points (meters)
   */
  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3; // Earth's radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) *
      Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Check if location accuracy meets threshold
   */
  private isLocationAccurate(location: LocationUpdate): boolean {
    if (!location.gps?.accuracy) {
      // UWB and other sources are assumed accurate
      return location.source !== 'GPS';
    }
    return location.gps.accuracy <= this.config.minAccuracy;
  }

  /**
   * Calculate confidence score for detection
   */
  private calculateConfidence(location: LocationUpdate, geofence: VoxelGeofence): number {
    let confidence = 1.0;

    // Reduce confidence based on location accuracy
    if (location.gps?.accuracy) {
      const accuracyFactor = Math.max(0, 1 - location.gps.accuracy / 50);
      confidence *= accuracyFactor;
    }

    // Boost confidence for UWB
    if (location.source === 'UWB') {
      confidence = Math.min(1, confidence * 1.2);
    }

    // Boost confidence for NFC/QR (direct identification)
    if (location.source === 'NFC' || location.source === 'QR_CODE') {
      confidence = 1.0;
    }

    return Math.round(confidence * 100) / 100;
  }

  /**
   * Calculate dwell duration in seconds
   */
  private calculateDwellDuration(entryTime: string): number {
    const entry = new Date(entryTime).getTime();
    const now = Date.now();
    return Math.floor((now - entry) / 1000);
  }

  /**
   * Check if acknowledgment is required for voxel
   */
  private async checkAcknowledgmentRequired(voxelId: string): Promise<boolean> {
    if (!this.prisma) {return false;}

    try {
      // Check if voxel has active alerts or pending decisions
      const [alertCount, preApprovalCount, overrideCount] = await Promise.all([
        this.prisma.voxelAlert.count({
          where: { voxel_id: voxelId, status: 'ACTIVE' },
        }),
        this.prisma.preApproval.count({
          where: { voxel_id: voxelId, valid_until: { gt: new Date() } },
        }),
        this.prisma.toleranceOverride.count({
          where: { voxel_id: voxelId },
        }),
      ]);

      return alertCount > 0 || preApprovalCount > 0 || overrideCount > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Update session with new location
   */
  private updateSession(session: VoxelSession, location: LocationUpdate): void {
    session.locationHistory.push(location);
    // Keep only last 100 locations
    if (session.locationHistory.length > 100) {
      session.locationHistory = session.locationHistory.slice(-100);
    }
  }

  /**
   * Extract device info from location update
   */
  private extractDeviceInfo(location: LocationUpdate): DeviceInfo {
    return {
      deviceId: location.deviceId,
      platform: 'ANDROID', // Would be extracted from actual device data
      hasUwb: location.source === 'UWB',
      hasNfc: location.source === 'NFC',
    };
  }

  // ===========================================================================
  // Session Management
  // ===========================================================================

  /**
   * Get active session for user
   */
  getActiveSession(userId: string): VoxelSession | undefined {
    return this.activeSessions.get(userId);
  }

  /**
   * Get all active sessions
   */
  getAllActiveSessions(): VoxelSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Get active sessions for project
   */
  getActiveSessionsForProject(projectId: string): VoxelSession[] {
    return Array.from(this.activeSessions.values()).filter(
      s => s.projectId === projectId
    );
  }

  /**
   * Get active sessions for voxel
   */
  getActiveSessionsForVoxel(voxelId: string): VoxelSession[] {
    return Array.from(this.activeSessions.values()).filter(
      s => s.voxelId === voxelId
    );
  }

  /**
   * Force end session for user
   */
  async forceEndSession(userId: string): Promise<void> {
    const session = this.activeSessions.get(userId);
    if (session) {
      session.status = 'EXITED';
      session.exitTime = new Date().toISOString();
      session.dwellDuration = this.calculateDwellDuration(session.entryTime);
      this.activeSessions.delete(userId);
      logger.info('Session force ended', { userId, sessionId: session.sessionId });
    }
  }

  /**
   * Mark decision as viewed in session
   */
  markDecisionViewed(userId: string, decisionUrn: string): void {
    const session = this.activeSessions.get(userId);
    if (session && !session.decisionsViewed.includes(decisionUrn)) {
      session.decisionsViewed.push(decisionUrn);
    }
  }

  /**
   * Mark decision as acknowledged in session
   */
  markDecisionAcknowledged(userId: string, decisionUrn: string): void {
    const session = this.activeSessions.get(userId);
    if (session) {
      if (!session.decisionsViewed.includes(decisionUrn)) {
        session.decisionsViewed.push(decisionUrn);
      }
      if (!session.acknowledgedDecisions.includes(decisionUrn)) {
        session.acknowledgedDecisions.push(decisionUrn);
      }
    }
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get service statistics
   */
  getStatistics(): {
    activeSessionCount: number;
    cachedProjectCount: number;
    pendingEntryCount: number;
    config: GeofencingConfig;
  } {
    return {
      activeSessionCount: this.activeSessions.size,
      cachedProjectCount: this.geofenceCache.size,
      pendingEntryCount: this.pendingEntries.size,
      config: this.config,
    };
  }
}

// ==============================================================================
// Factory Function
// ==============================================================================

/**
 * Create geofence service instance
 */
export function createGeofenceService(config?: GeofenceServiceConfig): GeofenceService {
  return new GeofenceService(config);
}

export default GeofenceService;

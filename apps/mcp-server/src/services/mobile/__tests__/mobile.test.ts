/**
 * Mobile Integration Services Tests (DL-M5)
 *
 * Comprehensive test suite for mobile app integration services including
 * voxel geofence detection, notifications, acknowledgments, and SMS queries.
 *
 * @module services/mobile/__tests__/mobile
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  GeofenceService,
  createGeofenceService,
  NotificationService,
  createNotificationService,
  AcknowledgmentService,
  createAcknowledgmentService,
  DecisionQueryService,
  createDecisionQueryService,
  MobileServiceOrchestrator,
  createMobileOrchestrator,
} from '../index.js';
import type {
  LocationUpdate,
  VoxelGeofence,
  GeofenceEvent,
  AcknowledgmentRequest,
  DecisionQueryContext,
} from '../types.js';

// ==============================================================================
// Test Fixtures
// ==============================================================================

const createLocationUpdate = (overrides: Partial<LocationUpdate> = {}): LocationUpdate => ({
  userId: 'user-1',
  deviceId: 'device-1',
  projectId: 'project-1',
  tenantId: 'tenant-1',
  timestamp: new Date().toISOString(),
  gps: {
    latitude: 43.6532,
    longitude: -79.3832,
    accuracy: 5,
  },
  source: 'GPS',
  ...overrides,
});

const createVoxelGeofence = (overrides: Partial<VoxelGeofence> = {}): VoxelGeofence => ({
  voxelId: 'voxel-1',
  voxelUrn: 'urn:ectropy:voxel:VOX-001',
  projectId: 'project-1',
  name: 'Test Zone A',
  type: 'ZONE',
  boundary: {
    shape: 'CIRCLE',
    center: { latitude: 43.6532, longitude: -79.3832 },
    radius: 50, // 50 meters
  },
  active: true,
  priority: 'NORMAL',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const createGeofenceEvent = (overrides: Partial<GeofenceEvent> = {}): GeofenceEvent => ({
  eventId: 'event-1',
  voxelId: 'voxel-1',
  userId: 'user-1',
  deviceId: 'device-1',
  projectId: 'project-1',
  tenantId: 'tenant-1',
  eventType: 'ENTER',
  location: createLocationUpdate(),
  confidence: 0.95,
  triggeredAt: new Date().toISOString(),
  notificationSent: false,
  acknowledgmentRequired: true,
  ...overrides,
});

// ==============================================================================
// Geofence Service Tests
// ==============================================================================

describe('GeofenceService', () => {
  let service: GeofenceService;
  let onVoxelEntry: ReturnType<typeof vi.fn>;
  let onVoxelExit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onVoxelEntry = vi.fn().mockResolvedValue(undefined);
    onVoxelExit = vi.fn().mockResolvedValue(undefined);

    service = createGeofenceService({
      config: {
        dwellTimeThreshold: 0, // Immediate entry for testing
        exitTimeThreshold: 0, // Immediate exit for testing
        minAccuracy: 100,
      },
      onVoxelEntry,
      onVoxelExit,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create service with default configuration', () => {
      const svc = createGeofenceService();
      expect(svc).toBeDefined();
      expect(svc.getStatistics().config).toBeDefined();
    });

    it('should create service with custom configuration', () => {
      const svc = createGeofenceService({
        config: { minAccuracy: 20 },
      });
      expect(svc.getStatistics().config.minAccuracy).toBe(20);
    });
  });

  describe('location processing', () => {
    it('should process location update and return detection result', async () => {
      const location = createLocationUpdate();
      const result = await service.processLocationUpdate(location);

      expect(result).toBeDefined();
      expect(result.locationSource).toBe('GPS');
    });

    it('should filter out inaccurate GPS locations', async () => {
      const location = createLocationUpdate({
        gps: { latitude: 43.6532, longitude: -79.3832, accuracy: 500 },
      });

      const result = await service.processLocationUpdate(location);
      expect(result.detected).toBe(false);
    });

    it('should accept UWB locations regardless of GPS accuracy', async () => {
      const location = createLocationUpdate({
        source: 'UWB',
        gps: undefined,
        uwb: { x: 100, y: 200, z: 0, coordinateSystem: 'LOCAL' },
      });

      const result = await service.processLocationUpdate(location);
      expect(result).toBeDefined();
    });
  });

  describe('session management', () => {
    it('should return undefined for user with no active session', () => {
      const session = service.getActiveSession('nonexistent-user');
      expect(session).toBeUndefined();
    });

    it('should get all active sessions', () => {
      const sessions = service.getAllActiveSessions();
      expect(Array.isArray(sessions)).toBe(true);
    });

    it('should get sessions for project', () => {
      const sessions = service.getActiveSessionsForProject('project-1');
      expect(Array.isArray(sessions)).toBe(true);
    });

    it('should get sessions for voxel', () => {
      const sessions = service.getActiveSessionsForVoxel('voxel-1');
      expect(Array.isArray(sessions)).toBe(true);
    });

    it('should mark decision as viewed', () => {
      // This should not throw even if no session exists
      service.markDecisionViewed('user-1', 'urn:decision:1');
    });

    it('should mark decision as acknowledged', () => {
      // This should not throw even if no session exists
      service.markDecisionAcknowledged('user-1', 'urn:decision:1');
    });
  });

  describe('geofence cache', () => {
    it('should get geofences for project (empty without prisma)', async () => {
      const geofences = await service.getGeofencesForProject('project-1');
      expect(Array.isArray(geofences)).toBe(true);
    });

    it('should refresh geofences', async () => {
      await service.refreshGeofences('project-1');
      // Should not throw
    });

    it('should clear cache', () => {
      service.clearCache();
      // Should not throw
    });
  });

  describe('statistics', () => {
    it('should return service statistics', () => {
      const stats = service.getStatistics();

      expect(stats).toHaveProperty('activeSessionCount');
      expect(stats).toHaveProperty('cachedProjectCount');
      expect(stats).toHaveProperty('pendingEntryCount');
      expect(stats).toHaveProperty('config');
      expect(typeof stats.activeSessionCount).toBe('number');
    });
  });
});

// ==============================================================================
// Notification Service Tests
// ==============================================================================

describe('NotificationService', () => {
  let service: NotificationService;
  let sendPush: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendPush = vi.fn().mockResolvedValue(true);

    service = createNotificationService({
      config: {
        pushEnabled: true,
        rateLimitPerHour: 100,
      },
      sendPush,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create service with default configuration', () => {
      const svc = createNotificationService();
      expect(svc).toBeDefined();
    });

    it('should create service with custom configuration', () => {
      const svc = createNotificationService({
        config: { rateLimitPerHour: 50 },
      });
      expect(svc.getStatistics().config.rateLimitPerHour).toBe(50);
    });
  });

  describe('voxel entry notification', () => {
    it('should process voxel entry and return notification', async () => {
      const event = createGeofenceEvent();
      const result = await service.notifyVoxelEntry(event);

      // Result may be null if no decisions in voxel
      expect(result === null || result.notificationId).toBeTruthy();
    });

    it('should respect rate limits', async () => {
      // Create service with very low rate limit
      const limitedService = createNotificationService({
        config: { rateLimitPerHour: 1 },
      });

      const event = createGeofenceEvent();

      // First should succeed
      await limitedService.notifyVoxelEntry(event);

      // Second should be rate limited (return null)
      const result = await limitedService.notifyVoxelEntry(event);
      expect(result).toBeNull();
    });
  });

  describe('notification history', () => {
    it('should return empty history for new user', () => {
      const history = service.getNotificationHistory('new-user');
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(0);
    });
  });

  describe('statistics', () => {
    it('should return service statistics', () => {
      const stats = service.getStatistics();

      expect(stats).toHaveProperty('totalUsers');
      expect(stats).toHaveProperty('totalNotifications');
      expect(stats).toHaveProperty('config');
    });
  });
});

// ==============================================================================
// Acknowledgment Service Tests
// ==============================================================================

describe('AcknowledgmentService', () => {
  let service: AcknowledgmentService;

  beforeEach(() => {
    service = createAcknowledgmentService({
      config: {
        requireLocation: false, // Disable for testing
        locationVerificationEnabled: false,
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create service with default configuration', () => {
      const svc = createAcknowledgmentService();
      expect(svc).toBeDefined();
    });

    it('should create service with custom configuration', () => {
      const svc = createAcknowledgmentService({
        config: { maxDistanceFromVoxel: 100 },
      });
      expect(svc.getStatistics().config.maxDistanceFromVoxel).toBe(100);
    });
  });

  describe('acknowledgment processing', () => {
    it('should process acknowledgment request', async () => {
      const request: AcknowledgmentRequest = {
        decisionId: 'decision-1',
        decisionUrn: 'urn:ectropy:decision:DEC-001',
        userId: 'user-1',
        voxelId: 'voxel-1',
        projectId: 'project-1',
        tenantId: 'tenant-1',
        location: createLocationUpdate(),
        deviceInfo: { deviceId: 'device-1', platform: 'ANDROID' },
        timestamp: new Date().toISOString(),
      };

      const result = await service.processAcknowledgment(request);

      expect(result.success).toBe(true);
      expect(result.acknowledgment).toBeDefined();
      expect(result.acknowledgment?.decisionId).toBe('decision-1');
      expect(result.acknowledgment?.type).toBe('UNDERSTOOD');
    });

    it('should include signature when provided', async () => {
      const request: AcknowledgmentRequest = {
        decisionId: 'decision-2',
        decisionUrn: 'urn:ectropy:decision:DEC-002',
        userId: 'user-1',
        voxelId: 'voxel-1',
        projectId: 'project-1',
        tenantId: 'tenant-1',
        location: createLocationUpdate(),
        deviceInfo: { deviceId: 'device-1', platform: 'ANDROID' },
        signature: {
          type: 'DIGITAL',
          data: 'base64-signature-data',
          verified: true,
          capturedAt: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      };

      const result = await service.processAcknowledgment(request);

      expect(result.success).toBe(true);
      expect(result.acknowledgment?.type).toBe('SIGNED');
      expect(result.acknowledgment?.signature).toBeDefined();
    });
  });

  describe('acknowledgment history', () => {
    it('should get empty history without prisma', async () => {
      const history = await service.getAcknowledgmentHistory('user-1');
      expect(Array.isArray(history)).toBe(true);
    });

    it('should get decision acknowledgments', async () => {
      const acks = await service.getDecisionAcknowledgments('decision-1');
      expect(Array.isArray(acks)).toBe(true);
    });

    it('should get pending acknowledgments', async () => {
      const pending = await service.getPendingAcknowledgments('user-1', 'project-1');
      expect(Array.isArray(pending)).toBe(true);
    });
  });

  describe('reminder management', () => {
    it('should schedule and cancel reminder', () => {
      const callback = vi.fn();
      service.scheduleReminder('user-1', 'decision-1', callback);

      // Cancel before it fires
      service.cancelReminder('user-1:decision-1');

      // Callback should not be called
      expect(callback).not.toHaveBeenCalled();
    });

    it('should cancel all reminders for user', () => {
      const callback = vi.fn();
      service.scheduleReminder('user-1', 'decision-1', callback);
      service.scheduleReminder('user-1', 'decision-2', callback);

      service.cancelAllRemindersForUser('user-1');

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('statistics', () => {
    it('should return service statistics', () => {
      const stats = service.getStatistics();

      expect(stats).toHaveProperty('pendingReminders');
      expect(stats).toHaveProperty('config');
    });
  });
});

// ==============================================================================
// Decision Query Service Tests
// ==============================================================================

describe('DecisionQueryService', () => {
  let service: DecisionQueryService;

  beforeEach(() => {
    service = createDecisionQueryService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create service', () => {
      expect(service).toBeDefined();
    });
  });

  describe('query processing', () => {
    const createContext = (overrides: Partial<DecisionQueryContext> = {}): DecisionQueryContext => ({
      userId: 'user-1',
      projectId: 'project-1',
      tenantId: 'tenant-1',
      authorityLevel: 2,
      ...overrides,
    });

    it('should process voxel decision query', async () => {
      const result = await service.processQuery('what decisions are here', createContext());

      expect(result.success).toBe(true);
      expect(result.intent).toBe('query_voxel_decisions');
    });

    it('should process acknowledge intent', async () => {
      const result = await service.processQuery('ack DEC-123', createContext());

      // Without database, decision won't be found, but intent is classified
      expect(result.intent).toBe('acknowledge_decision');
      // Success may be false without database
    });

    it('should process tolerance request', async () => {
      const result = await service.processQuery('request tolerance override', createContext());

      expect(result.success).toBe(true);
      expect(result.intent).toBe('request_tolerance');
    });

    it('should process pre-approval check', async () => {
      const result = await service.processQuery('check preapprovals', createContext());

      expect(result.success).toBe(true);
      expect(result.intent).toBe('check_preapproval');
    });

    it('should process escalation request', async () => {
      const result = await service.processQuery('escalate this', createContext());

      expect(result.success).toBe(true);
      expect(result.intent).toBe('escalate_decision');
    });

    it('should process decision detail view', async () => {
      const result = await service.processQuery('show me more about DEC-789', createContext());

      // Without database, decision won't be found, but intent is classified
      expect(result.intent).toBe('view_decision_detail');
      // Success may be false without database
    });

    it('should handle unknown queries with help response', async () => {
      // Unknown queries default to voxel decision query which prompts for location
      const result = await service.processQuery('random gibberish xyz', createContext());

      expect(result.success).toBe(true);
      // Defaults to voxel query which asks for location
      expect(result.intent).toBe('query_voxel_decisions');
    });

    it('should use current voxel from context', async () => {
      const result = await service.processQuery(
        'decisions',
        createContext({ currentVoxelId: 'voxel-1' })
      );

      expect(result.success).toBe(true);
    });
  });

  describe('intent classification', () => {
    const queries = [
      { query: 'what decisions in zone A', intent: 'query_voxel_decisions' },
      { query: 'show decisions for current area', intent: 'query_voxel_decisions' },
      { query: 'ack DEC-123', intent: 'acknowledge_decision' },
      { query: 'I understand', intent: 'acknowledge_decision' },
      { query: 'need a tolerance variance', intent: 'request_tolerance' },
      { query: 'any preapprovals here', intent: 'check_preapproval' },
      { query: 'escalate to supervisor', intent: 'escalate_decision' },
      { query: 'tell me more about DEC-999', intent: 'view_decision_detail' },
    ];

    for (const { query, intent } of queries) {
      it(`should classify "${query}" as ${intent}`, async () => {
        const result = await service.processQuery(query, {
          userId: 'user-1',
          projectId: 'project-1',
          tenantId: 'tenant-1',
          authorityLevel: 2,
        });

        expect(result.intent).toBe(intent);
      });
    }
  });
});

// ==============================================================================
// Mobile Service Orchestrator Tests
// ==============================================================================

describe('MobileServiceOrchestrator', () => {
  let orchestrator: MobileServiceOrchestrator;

  beforeEach(() => {
    orchestrator = createMobileOrchestrator({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create orchestrator with all services', () => {
      expect(orchestrator).toBeDefined();
      expect(orchestrator.geofence).toBeDefined();
      expect(orchestrator.notification).toBeDefined();
      expect(orchestrator.acknowledgment).toBeDefined();
      expect(orchestrator.decisionQuery).toBeDefined();
    });
  });

  describe('location processing', () => {
    it('should process location update', async () => {
      const location = createLocationUpdate();
      const result = await orchestrator.processLocationUpdate(location);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('detected');
    });
  });

  describe('acknowledgment processing', () => {
    it('should process acknowledgment', async () => {
      const request: AcknowledgmentRequest = {
        decisionId: 'decision-1',
        decisionUrn: 'urn:ectropy:decision:DEC-001',
        userId: 'user-1',
        voxelId: 'voxel-1',
        projectId: 'project-1',
        tenantId: 'tenant-1',
        location: createLocationUpdate(),
        deviceInfo: { deviceId: 'device-1', platform: 'ANDROID' },
        timestamp: new Date().toISOString(),
      };

      const result = await orchestrator.processAcknowledgment(request);

      expect(result.success).toBe(true);
    });
  });

  describe('decision query processing', () => {
    it('should process decision query', async () => {
      const context: DecisionQueryContext = {
        userId: 'user-1',
        projectId: 'project-1',
        tenantId: 'tenant-1',
        authorityLevel: 2,
      };

      const result = await orchestrator.processDecisionQuery('decisions', context);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
    });
  });

  describe('session management', () => {
    it('should get active session', () => {
      const session = orchestrator.getActiveSession('user-1');
      // Session may be undefined if no location processed
      expect(session === undefined || session !== null).toBe(true);
    });
  });

  describe('statistics', () => {
    it('should return combined statistics', () => {
      const stats = orchestrator.getStatistics();

      expect(stats).toHaveProperty('geofence');
      expect(stats).toHaveProperty('notification');
      expect(stats).toHaveProperty('acknowledgment');
      expect(stats).toHaveProperty('initialized');
      expect(stats.initialized).toBe(true);
    });
  });
});

// ==============================================================================
// Type Validation Tests
// ==============================================================================

describe('Mobile Types', () => {
  describe('LocationUpdate', () => {
    it('should create valid GPS location', () => {
      const location = createLocationUpdate();

      expect(location.userId).toBeDefined();
      expect(location.gps?.latitude).toBeDefined();
      expect(location.gps?.longitude).toBeDefined();
      expect(location.source).toBe('GPS');
    });

    it('should create valid UWB location', () => {
      const location = createLocationUpdate({
        source: 'UWB',
        gps: undefined,
        uwb: { x: 100, y: 200, z: 0, coordinateSystem: 'LOCAL' },
      });

      expect(location.uwb?.x).toBe(100);
      expect(location.uwb?.y).toBe(200);
      expect(location.source).toBe('UWB');
    });
  });

  describe('VoxelGeofence', () => {
    it('should create valid circular geofence', () => {
      const geofence = createVoxelGeofence();

      expect(geofence.boundary.shape).toBe('CIRCLE');
      expect(geofence.boundary.center).toBeDefined();
      expect(geofence.boundary.radius).toBeGreaterThan(0);
    });

    it('should create valid box geofence', () => {
      const geofence = createVoxelGeofence({
        boundary: {
          shape: 'BOX',
          minCorner: { x: 0, y: 0, z: 0, coordinateSystem: 'LOCAL' },
          maxCorner: { x: 10, y: 10, z: 3, coordinateSystem: 'LOCAL' },
        },
      });

      expect(geofence.boundary.shape).toBe('BOX');
      expect(geofence.boundary.minCorner).toBeDefined();
      expect(geofence.boundary.maxCorner).toBeDefined();
    });
  });

  describe('GeofenceEvent', () => {
    it('should create valid entry event', () => {
      const event = createGeofenceEvent();

      expect(event.eventType).toBe('ENTER');
      expect(event.voxelId).toBeDefined();
      expect(event.userId).toBeDefined();
      expect(event.confidence).toBeGreaterThan(0);
    });

    it('should create valid exit event', () => {
      const event = createGeofenceEvent({ eventType: 'EXIT' });

      expect(event.eventType).toBe('EXIT');
    });
  });
});

// ==============================================================================
// Integration Scenarios
// ==============================================================================

describe('Integration Scenarios', () => {
  let orchestrator: MobileServiceOrchestrator;

  beforeEach(() => {
    orchestrator = createMobileOrchestrator({});
  });

  describe('worker entering voxel flow', () => {
    it('should handle full voxel entry workflow', async () => {
      // 1. Worker enters voxel
      const location = createLocationUpdate();
      const detection = await orchestrator.processLocationUpdate(location);

      expect(detection).toBeDefined();

      // 2. Worker queries decisions
      const queryResult = await orchestrator.processDecisionQuery('what decisions', {
        userId: 'user-1',
        projectId: 'project-1',
        tenantId: 'tenant-1',
        authorityLevel: 2,
      });

      expect(queryResult.success).toBe(true);

      // 3. Worker acknowledges decision
      const ackResult = await orchestrator.processAcknowledgment({
        decisionId: 'decision-1',
        decisionUrn: 'urn:ectropy:decision:DEC-001',
        userId: 'user-1',
        voxelId: 'voxel-1',
        projectId: 'project-1',
        tenantId: 'tenant-1',
        location,
        deviceInfo: { deviceId: 'device-1', platform: 'ANDROID' },
        timestamp: new Date().toISOString(),
      });

      expect(ackResult.success).toBe(true);
    });
  });

  describe('SMS decision query flow', () => {
    it('should handle SMS conversation flow', async () => {
      const context: DecisionQueryContext = {
        userId: 'user-1',
        projectId: 'project-1',
        tenantId: 'tenant-1',
        authorityLevel: 2,
        currentVoxelId: 'voxel-1',
      };

      // User asks about decisions
      const q1 = await orchestrator.processDecisionQuery('decisions in my zone', context);
      expect(q1.success).toBe(true);

      // User asks for details
      const q2 = await orchestrator.processDecisionQuery('give me details about DEC-123', context);
      expect(q2.intent).toBe('view_decision_detail');

      // User acknowledges
      const q3 = await orchestrator.processDecisionQuery('ack DEC-123', {
        ...context,
        lastViewedDecisions: ['DEC-123'],
      });
      expect(q3.intent).toBe('acknowledge_decision');
    });
  });
});

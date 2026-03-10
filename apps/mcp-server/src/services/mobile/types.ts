/**
 * Mobile Integration Service Types (DL-M5)
 *
 * Type definitions for mobile app integration including voxel entry detection,
 * geofencing, worker location tracking, acknowledgment capture, and notifications.
 *
 * @module services/mobile/types
 * @version 1.0.0
 */

// ==============================================================================
// Location Types
// ==============================================================================

/**
 * Geographic coordinate with optional accuracy metadata
 */
export interface GeoCoordinate {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number; // meters
  altitudeAccuracy?: number;
  heading?: number; // degrees from north
  speed?: number; // m/s
}

/**
 * 3D coordinate for indoor positioning (UWB/BIM)
 */
export interface SpatialCoordinate {
  x: number;
  y: number;
  z: number;
  coordinateSystem: 'WGS84' | 'LOCAL' | 'IFC';
  referencePoint?: string; // IFC GUID or reference marker ID
}

/**
 * Worker location update payload
 */
export interface LocationUpdate {
  userId: string;
  deviceId: string;
  projectId: string;
  tenantId: string;
  timestamp: string;
  gps?: GeoCoordinate;
  uwb?: SpatialCoordinate;
  source: LocationSource;
  batteryLevel?: number;
  signalStrength?: number;
}

/**
 * Location data source
 */
export type LocationSource =
  | 'GPS'
  | 'UWB'
  | 'WIFI'
  | 'BLUETOOTH'
  | 'MANUAL'
  | 'NFC'
  | 'QR_CODE';

// ==============================================================================
// Geofence Types
// ==============================================================================

/**
 * Geofence shape types
 */
export type GeofenceShape = 'CIRCLE' | 'POLYGON' | 'BOX';

/**
 * Geofence boundary definition
 */
export interface GeofenceBoundary {
  shape: GeofenceShape;
  center?: GeoCoordinate; // For circle
  radius?: number; // meters, for circle
  vertices?: GeoCoordinate[]; // For polygon
  minCorner?: SpatialCoordinate; // For box (BIM)
  maxCorner?: SpatialCoordinate; // For box (BIM)
}

/**
 * Voxel geofence configuration
 */
export interface VoxelGeofence {
  voxelId: string;
  voxelUrn: string;
  projectId: string;
  name: string;
  type: VoxelGeofenceType;
  boundary: GeofenceBoundary;
  bufferZone?: number; // meters - trigger zone before actual boundary
  dwellTime?: number; // seconds - time to confirm entry
  active: boolean;
  priority: GeofencePriority;
  createdAt: string;
  updatedAt: string;
}

/**
 * Voxel geofence type
 */
export type VoxelGeofenceType =
  | 'ZONE'
  | 'ROOM'
  | 'FLOOR'
  | 'EQUIPMENT'
  | 'SAFETY_AREA'
  | 'WORK_AREA';

/**
 * Geofence priority for conflict resolution
 */
export type GeofencePriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

/**
 * Geofence event types
 */
export type GeofenceEventType = 'ENTER' | 'EXIT' | 'DWELL';

/**
 * Geofence event record
 */
export interface GeofenceEvent {
  eventId: string;
  $id?: string; // URN
  voxelId: string;
  userId: string;
  deviceId: string;
  projectId: string;
  tenantId: string;
  eventType: GeofenceEventType;
  location: LocationUpdate;
  confidence: number; // 0-1
  triggeredAt: string;
  processedAt?: string;
  notificationSent: boolean;
  acknowledgmentRequired: boolean;
}

// ==============================================================================
// Voxel Entry Detection Types
// ==============================================================================

/**
 * Voxel entry detection result
 */
export interface VoxelEntryDetection {
  detected: boolean;
  voxelId?: string;
  voxelUrn?: string;
  voxelName?: string;
  confidence: number;
  entryTime?: string;
  exitTime?: string;
  dwellDuration?: number; // seconds
  locationSource: LocationSource;
  matchedGeofence?: VoxelGeofence;
}

/**
 * Active voxel session (worker in voxel)
 */
export interface VoxelSession {
  sessionId: string;
  $id?: string;
  userId: string;
  voxelId: string;
  projectId: string;
  tenantId: string;
  entryTime: string;
  exitTime?: string;
  dwellDuration?: number;
  locationHistory: LocationUpdate[];
  decisionsViewed: string[]; // Decision URNs viewed
  acknowledgedDecisions: string[]; // Decision URNs acknowledged
  status: VoxelSessionStatus;
  deviceInfo: DeviceInfo;
}

/**
 * Voxel session status
 */
export type VoxelSessionStatus = 'ACTIVE' | 'EXITED' | 'EXPIRED' | 'SUSPENDED';

/**
 * Device information for mobile tracking
 */
export interface DeviceInfo {
  deviceId: string;
  platform: 'IOS' | 'ANDROID' | 'WEB';
  osVersion?: string;
  appVersion?: string;
  model?: string;
  manufacturer?: string;
  hasUwb?: boolean;
  hasNfc?: boolean;
}

// ==============================================================================
// Notification Types
// ==============================================================================

/**
 * Notification channel types
 */
export type NotificationChannel = 'PUSH' | 'SMS' | 'EMAIL' | 'IN_APP' | 'VOICE';

/**
 * Notification priority
 */
export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

/**
 * Notification payload for voxel entry
 */
export interface VoxelEntryNotification {
  notificationId: string;
  $id?: string;
  userId: string;
  projectId: string;
  tenantId: string;
  voxelId: string;
  voxelName: string;
  channel: NotificationChannel;
  priority: NotificationPriority;
  title: string;
  body: string;
  data: VoxelEntryNotificationData;
  actionRequired: boolean;
  expiresAt?: string;
  sentAt: string;
  deliveredAt?: string;
  readAt?: string;
  status: NotificationStatus;
}

/**
 * Notification delivery status
 */
export type NotificationStatus =
  | 'PENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'EXPIRED';

/**
 * Voxel entry notification data payload
 */
export interface VoxelEntryNotificationData {
  voxelId: string;
  voxelUrn: string;
  decisionCount: number;
  pendingDecisionCount: number;
  alertCount: number;
  hasActivePreApproval: boolean;
  toleranceOverrides: ToleranceOverrideSummary[];
  deepLink: string;
  requiresAcknowledgment: boolean;
}

/**
 * Tolerance override summary for notification
 */
export interface ToleranceOverrideSummary {
  overrideId: string;
  type: string;
  originalValue: string;
  overrideValue: string;
  approvedBy: string;
  approvedAt: string;
}

// ==============================================================================
// Acknowledgment Types
// ==============================================================================

/**
 * Acknowledgment request
 */
export interface AcknowledgmentRequest {
  decisionId: string;
  decisionUrn: string;
  userId: string;
  voxelId: string;
  projectId: string;
  tenantId: string;
  location: LocationUpdate;
  deviceInfo: DeviceInfo;
  signature?: AcknowledgmentSignature;
  notes?: string;
  timestamp: string;
}

/**
 * Acknowledgment signature (digital or biometric)
 */
export interface AcknowledgmentSignature {
  type: SignatureType;
  data?: string; // Base64 encoded signature image
  biometricType?: BiometricType;
  verified: boolean;
  capturedAt: string;
}

/**
 * Signature type
 */
export type SignatureType = 'DIGITAL' | 'BIOMETRIC' | 'PIN' | 'FACE_ID';

/**
 * Biometric type
 */
export type BiometricType = 'FINGERPRINT' | 'FACE' | 'IRIS';

/**
 * Acknowledgment record
 */
export interface Acknowledgment {
  acknowledgmentId: string;
  $id?: string; // URN
  decisionId: string;
  userId: string;
  participantId?: string;
  voxelId: string;
  projectId: string;
  tenantId: string;
  type: AcknowledgmentType;
  status: AcknowledgmentStatus;
  location: LocationUpdate;
  locationVerified: boolean;
  locationVerificationDetails?: LocationVerification;
  signature?: AcknowledgmentSignature;
  notes?: string;
  acknowledgedAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Acknowledgment type
 */
export type AcknowledgmentType =
  | 'VIEWED'
  | 'READ'
  | 'UNDERSTOOD'
  | 'ACCEPTED'
  | 'SIGNED';

/**
 * Acknowledgment status
 */
export type AcknowledgmentStatus =
  | 'PENDING'
  | 'COMPLETED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'SUPERSEDED';

/**
 * Location verification result
 */
export interface LocationVerification {
  verified: boolean;
  expectedVoxelId: string;
  actualVoxelId?: string;
  distance?: number; // meters from expected location
  confidenceScore: number; // 0-1
  verificationMethod: LocationSource;
  verifiedAt: string;
  failureReason?: string;
}

// ==============================================================================
// Decision Surface Types
// ==============================================================================

/**
 * Decision surface view for mobile display
 */
export interface MobileDecisionSurface {
  voxelId: string;
  voxelUrn: string;
  voxelName: string;
  projectId: string;
  decisions: MobileDecisionCard[];
  pendingCount: number;
  approvedCount: number;
  alerts: MobileAlert[];
  toleranceOverrides: MobileToleranceOverride[];
  preApprovals: MobilePreApproval[];
  requiresAcknowledgment: boolean;
  lastUpdated: string;
}

/**
 * Decision card for mobile display
 */
export interface MobileDecisionCard {
  decisionId: string;
  decisionUrn: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  summary: string;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  costImpact?: number;
  scheduleImpact?: number;
  requiresAcknowledgment: boolean;
  acknowledged: boolean;
  attachmentCount: number;
  commentCount: number;
  canApprove: boolean;
  canEscalate: boolean;
}

/**
 * Alert for mobile display
 */
export interface MobileAlert {
  alertId: string;
  severity: string;
  title: string;
  message: string;
  actionRequired: boolean;
  createdAt: string;
  expiresAt?: string;
}

/**
 * Tolerance override for mobile display
 */
export interface MobileToleranceOverride {
  overrideId: string;
  type: string;
  dimension: string;
  originalValue: string;
  overrideValue: string;
  unit: string;
  justification: string;
  approvedBy: string;
  approvedAt: string;
  validUntil?: string;
}

/**
 * Pre-approval for mobile display
 */
export interface MobilePreApproval {
  preApprovalId: string;
  scope: string[];
  conditions: string;
  maxCostImpact?: number;
  maxScheduleImpact?: number;
  approvedBy: string;
  validFrom: string;
  validUntil: string;
  usageCount: number;
}

// ==============================================================================
// SMS Decision Query Types
// ==============================================================================

/**
 * SMS decision query intent
 */
export type DecisionQueryIntent =
  | 'query_voxel_decisions'
  | 'acknowledge_decision'
  | 'request_tolerance'
  | 'check_preapproval'
  | 'escalate_decision'
  | 'view_decision_detail';

/**
 * SMS decision query context
 */
export interface DecisionQueryContext {
  userId: string;
  projectId: string;
  tenantId: string;
  authorityLevel: number;
  currentVoxelId?: string;
  lastViewedDecisions?: string[];
  pendingAcknowledgments?: string[];
}

/**
 * SMS decision query result
 */
export interface DecisionQueryResult {
  success: boolean;
  intent: DecisionQueryIntent;
  response: string;
  decisions?: MobileDecisionCard[];
  acknowledgmentRequired?: boolean;
  actionPrompt?: string;
  deepLink?: string;
  error?: string;
}

// ==============================================================================
// Offline Support Types
// ==============================================================================

/**
 * Offline sync status
 */
export interface OfflineSyncStatus {
  lastSyncAt?: string;
  pendingUploads: number;
  pendingDownloads: number;
  syncInProgress: boolean;
  lastError?: string;
  connectionStatus: ConnectionStatus;
}

/**
 * Connection status
 */
export type ConnectionStatus = 'ONLINE' | 'OFFLINE' | 'DEGRADED';

/**
 * Offline cache entry
 */
export interface OfflineCacheEntry<T> {
  key: string;
  data: T;
  cachedAt: string;
  expiresAt?: string;
  version: number;
  dirty: boolean;
  syncRequired: boolean;
}

/**
 * Pending offline action
 */
export interface PendingOfflineAction {
  actionId: string;
  type: OfflineActionType;
  payload: unknown;
  createdAt: string;
  retryCount: number;
  lastError?: string;
  priority: number;
}

/**
 * Offline action types
 */
export type OfflineActionType =
  | 'ACKNOWLEDGMENT'
  | 'LOCATION_UPDATE'
  | 'DECISION_VIEW'
  | 'EVIDENCE_CAPTURE'
  | 'STATUS_UPDATE';

// ==============================================================================
// Service Configuration Types
// ==============================================================================

/**
 * Mobile service configuration
 */
export interface MobileServiceConfig {
  geofencing: GeofencingConfig;
  notifications: NotificationConfig;
  acknowledgments: AcknowledgmentConfig;
  offline: OfflineConfig;
  tracking: TrackingConfig;
}

/**
 * Geofencing configuration
 */
export interface GeofencingConfig {
  enabled: boolean;
  minAccuracy: number; // meters
  dwellTimeThreshold: number; // seconds
  exitTimeThreshold: number; // seconds
  batchProcessingInterval: number; // milliseconds
  maxActiveGeofences: number;
  priorityOverrideEnabled: boolean;
}

/**
 * Notification configuration
 */
export interface NotificationConfig {
  pushEnabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  defaultChannel: NotificationChannel;
  quietHoursEnabled: boolean;
  quietHoursStart?: string; // HH:mm
  quietHoursEnd?: string; // HH:mm
  urgentBypassQuietHours: boolean;
  rateLimitPerHour: number;
  groupSimilarNotifications: boolean;
}

/**
 * Acknowledgment configuration
 */
export interface AcknowledgmentConfig {
  requireLocation: boolean;
  locationVerificationEnabled: boolean;
  maxDistanceFromVoxel: number; // meters
  signatureRequired: boolean;
  allowedSignatureTypes: SignatureType[];
  expirationHours: number;
  reminderIntervalMinutes: number;
  maxReminders: number;
}

/**
 * Offline configuration
 */
export interface OfflineConfig {
  enabled: boolean;
  maxCacheAge: number; // hours
  maxCacheSizeMb: number;
  syncOnReconnect: boolean;
  prioritizeAcknowledgments: boolean;
  maxPendingActions: number;
}

/**
 * Tracking configuration
 */
export interface TrackingConfig {
  locationUpdateInterval: number; // seconds
  backgroundTrackingEnabled: boolean;
  batteryOptimizationEnabled: boolean;
  highAccuracyMode: boolean;
  uwbEnabled: boolean;
  nfcEnabled: boolean;
}

// ==============================================================================
// URN Builders
// ==============================================================================

/**
 * Build geofence event URN
 */
export function buildGeofenceEventUrn(tenantId: string, eventId: string): string {
  return `urn:luhtech:${tenantId}:geofence-event:${eventId}`;
}

/**
 * Build voxel session URN
 */
export function buildVoxelSessionUrn(tenantId: string, sessionId: string): string {
  return `urn:luhtech:${tenantId}:voxel-session:${sessionId}`;
}

/**
 * Build acknowledgment URN
 */
export function buildAcknowledgmentUrn(tenantId: string, ackId: string): string {
  return `urn:luhtech:${tenantId}:acknowledgment:${ackId}`;
}

/**
 * Build notification URN
 */
export function buildNotificationUrn(tenantId: string, notifId: string): string {
  return `urn:luhtech:${tenantId}:notification:${notifId}`;
}

// ==============================================================================
// Default Configuration Values
// ==============================================================================

/**
 * Default geofencing configuration
 */
export const DEFAULT_GEOFENCING_CONFIG: GeofencingConfig = {
  enabled: true,
  minAccuracy: 10, // 10 meters
  dwellTimeThreshold: 5, // 5 seconds
  exitTimeThreshold: 30, // 30 seconds
  batchProcessingInterval: 1000, // 1 second
  maxActiveGeofences: 100,
  priorityOverrideEnabled: true,
};

/**
 * Default notification configuration
 */
export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  pushEnabled: true,
  smsEnabled: true,
  emailEnabled: false,
  defaultChannel: 'PUSH',
  quietHoursEnabled: false,
  urgentBypassQuietHours: true,
  rateLimitPerHour: 60,
  groupSimilarNotifications: true,
};

/**
 * Default acknowledgment configuration
 */
export const DEFAULT_ACKNOWLEDGMENT_CONFIG: AcknowledgmentConfig = {
  requireLocation: true,
  locationVerificationEnabled: true,
  maxDistanceFromVoxel: 50, // 50 meters
  signatureRequired: false,
  allowedSignatureTypes: ['DIGITAL', 'PIN', 'BIOMETRIC'],
  expirationHours: 24,
  reminderIntervalMinutes: 60,
  maxReminders: 3,
};

/**
 * Default offline configuration
 */
export const DEFAULT_OFFLINE_CONFIG: OfflineConfig = {
  enabled: true,
  maxCacheAge: 72, // 72 hours
  maxCacheSizeMb: 100,
  syncOnReconnect: true,
  prioritizeAcknowledgments: true,
  maxPendingActions: 100,
};

/**
 * Default tracking configuration
 */
export const DEFAULT_TRACKING_CONFIG: TrackingConfig = {
  locationUpdateInterval: 30, // 30 seconds
  backgroundTrackingEnabled: true,
  batteryOptimizationEnabled: true,
  highAccuracyMode: false,
  uwbEnabled: false,
  nfcEnabled: true,
};

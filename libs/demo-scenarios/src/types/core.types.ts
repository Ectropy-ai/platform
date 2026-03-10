/**
 * ============================================================================
 * ECTROPY DEMO SCENARIOS - CORE TYPES
 * ============================================================================
 * Enterprise-grade type definitions for synthetic demo data generation.
 *
 * Architecture follows IETF RFC 8174 key words for requirement levels.
 *
 * @module @ectropy/demo-scenarios/types
 * @version 1.0.0
 * @author Ectropy Team
 * ============================================================================
 */

// import type { v4 as uuidv4 } from 'uuid'; // Unused import

// ============================================================================
// TEMPORAL TYPES
// ============================================================================

/**
 * Scenario timeline position representing a specific moment in the demo.
 * Uses construction-industry standard week/day numbering.
 */
export interface TimelinePosition {
  /** Week number (1-indexed, construction standard) */
  week: number;
  /** Day within week (1-7, Monday=1) */
  day: number;
  /** Hour of day (0-23) */
  hour: number;
  /** Optional minute precision */
  minute?: number;
}

/**
 * Scenario duration specification
 */
export interface ScenarioDuration {
  /** Total weeks in scenario */
  weeks: number;
  /** Accelerated playback duration in minutes */
  acceleratedMinutes: number;
  /** Playback speed multiplier (1x = real-time) */
  defaultPlaybackSpeed: number;
  /** Optional human-readable description of scenario duration */
  description?: string;
}

// ============================================================================
// PERSONA TYPES
// ============================================================================

/**
 * Core persona role identifiers matching demo-accounts.json
 */
export type PersonaRole = 'architect' | 'engineer' | 'contractor' | 'owner';

/**
 * Extended role types for field workers and regulatory
 */
export type ExtendedRole =
  | PersonaRole
  | 'foreman'
  | 'superintendent'
  | 'pm'
  | 'inspector'
  | 'field_worker';

/**
 * Authority level mapping (0-6 cascade from seed-decision-lifecycle.ts)
 */
export type AuthorityLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Authority level names
 */
export type AuthorityLevelName =
  | 'FIELD'
  | 'FOREMAN'
  | 'SUPERINTENDENT'
  | 'PM'
  | 'ARCHITECT'
  | 'OWNER'
  | 'REGULATORY';

/**
 * Complete persona definition for scenario casting
 */
export interface Persona {
  /** Unique identifier */
  id: string;
  /** URN for graph references */
  urn?: string;
  /** Display name */
  name: string;
  /** Email address */
  email: string;
  /** Primary role */
  role: PersonaRole;
  /** Extended role for authority cascade */
  extendedRole?: ExtendedRole;
  /** Company/organization */
  company: string;
  /** Trade specialty (for field workers) */
  trade?: string;
  /** Authority level (0-6) */
  authorityLevel?: AuthorityLevel;
  /** Permission strings */
  permissions: string[];
  /** Dashboard URL */
  dashboardUrl?: string;
  /** Avatar URL or initials */
  avatar?: string;
  /** Behavioral traits for realistic generation */
  behaviorTraits?: PersonaBehavior;
  /** Optional behavior profile (legacy field for scenarios) */
  behaviorProfile?: {
    responseSpeed: number;
    thoroughness: number;
    escalationTendency: number;
    workingHours: { start: number; end: number };
    communicationStyle: string;
    decisionPatterns: string[];
  };
}

/**
 * Behavioral traits that influence how personas act in scenarios
 */
export interface PersonaBehavior {
  /** How quickly they respond (1-10, 10=immediate) */
  responseSpeed: number;
  /** How thorough their reviews are (1-10) */
  thoroughness: number;
  /** Likelihood to escalate vs. decide (0-1) */
  escalationTendency: number;
  /** Communication style */
  communicationStyle: 'formal' | 'casual' | 'technical' | 'brief';
  /** Working hours preference */
  workingHours: {
    start: number;
    end: number;
    timezone: string;
  };
  /** Likelihood to request changes (0-1) */
  changeRequestFrequency: number;
}

// ============================================================================
// BUILDING & PROJECT TYPES
// ============================================================================

/**
 * Building type categories matching demo-setup.service.ts
 */
export type BuildingType = 'house' | 'duplex' | 'office' | 'commercial';

/**
 * Project phase (construction lifecycle)
 */
export type ProjectPhase =
  | 'preconstruction'
  | 'sitework'
  | 'foundation'
  | 'structure'
  | 'rough_in'
  | 'finishes'
  | 'commissioning'
  | 'closeout';

/**
 * Building configuration for scenario
 */
export interface BuildingConfig {
  /** Building type */
  type: BuildingType;
  /** IFC file reference */
  ifcFile: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Approximate square footage */
  squareFeet: number;
  /** Number of floors/levels */
  levels: number;
  /** Primary systems present */
  systems: (
    | 'structural'
    | 'mechanical'
    | 'electrical'
    | 'plumbing'
    | 'fire_protection'
  )[];
  /** Estimated construction phases */
  phases: {
    phase: ProjectPhase;
    startWeek: number;
    endWeek: number;
  }[];
}

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Scenario event categories
 */
export type EventType =
  | 'decision'
  | 'inspection'
  | 'upload'
  | 'comment'
  | 'alert'
  | 'approval'
  | 'rejection'
  | 'escalation'
  | 'rfi'
  | 'submittal'
  | 'change_order'
  | 'schedule_update'
  | 'milestone'
  | 'notification'
  | 'meeting'
  | 'progress'
  | 'issue'
  | 'vote'
  | 'quality_check';

/**
 * Event priority levels
 */
export type EventPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * Actor type for events
 */
export type EventActor = PersonaRole | 'system' | 'regulatory';

/**
 * Base event interface
 */
export interface ScenarioEvent {
  /** Unique event ID */
  id: string;
  /** URN for graph references */
  urn: string;
  /** Timeline position */
  position: TimelinePosition;
  /** Event type */
  type: EventType;
  /** Actor initiating the event */
  actor: EventActor;
  /** Persona ID (legacy field, use actor instead) */
  persona?: string;
  /** Event priority */
  priority: EventPriority;
  /** Human-readable title */
  title: string;
  /** Detailed description */
  description: string;
  /** Affected voxel URNs */
  voxelRefs: string[];
  /** Related decision URNs */
  decisionRefs: string[];
  /** Event-specific payload */
  payload: EventPayload;
  /** Consequences triggered by this event */
  consequences: ConsequenceRef[];
  /** Follow-up events triggered */
  triggeredEvents: string[];
  /** Metadata for generation */
  metadata: EventMetadata;
  /** Optional event-specific data (flexible field for scenario-specific information) */
  data?: unknown;
}

/**
 * Event-specific payloads
 */
export type EventPayload =
  | DecisionEventPayload
  | InspectionEventPayload
  | RFIEventPayload
  | UploadEventPayload
  | CommentEventPayload
  | AlertEventPayload
  | ApprovalEventPayload
  | MilestoneEventPayload
  | MeetingEventPayload
  | ProgressEventPayload
  | IssueEventPayload
  | VoteEventPayload
  | QualityCheckEventPayload;

/**
 * Decision event payload
 */
export interface DecisionEventPayload {
  type: 'decision';
  decisionType: PMDecisionType;
  question: string;
  options: DecisionOption[];
  selectedOption?: string;
  authorityRequired: AuthorityLevel;
  budgetImpact?: number;
  scheduleImpact?: number;
}

/**
 * PM Decision types (from Prisma schema)
 */
export type PMDecisionType =
  | 'APPROVAL'
  | 'REJECTION'
  | 'ESCALATION'
  | 'INFORMATION'
  | 'DIRECTION'
  | 'CLARIFICATION'
  | 'MODIFICATION'
  | 'DEFERRAL';

/**
 * Decision option structure
 */
export interface DecisionOption {
  id: string;
  description: string;
  consequences: string[];
  estimatedCost: number;
  estimatedDelay: number;
  recommended?: boolean;
}

/**
 * Inspection event payload
 */
export interface InspectionEventPayload {
  type: 'inspection';
  inspectionType: InspectionType;
  scheduledDate: TimelinePosition;
  inspector?: string;
  requirements: string[];
  result?: 'passed' | 'failed' | 'conditional';
  deficiencies?: string[];
}

/**
 * Inspection types (from Prisma schema)
 */
export type InspectionType =
  | 'ROUGH_IN'
  | 'COVER_UP'
  | 'FINAL'
  | 'SAFETY'
  | 'QUALITY'
  | 'SPECIAL'
  | 'REGULATORY';

/**
 * RFI event payload
 */
export interface RFIEventPayload {
  type: 'rfi';
  rfiNumber: string;
  subject: string;
  question: string;
  requestor: PersonaRole;
  assignedTo: PersonaRole;
  dueDate: TimelinePosition;
  response?: string;
  status: 'open' | 'answered' | 'closed';
}

/**
 * Upload event payload
 */
export interface UploadEventPayload {
  type: 'upload';
  fileType: 'ifc' | 'pdf' | 'dwg' | 'image';
  fileName: string;
  fileSize: number;
  description: string;
  version?: string;
}

/**
 * Comment event payload
 */
export interface CommentEventPayload {
  type: 'comment';
  content: string;
  attachments?: string[];
  mentions?: PersonaRole[];
  threadId?: string;
}

/**
 * Alert event payload
 */
export interface AlertEventPayload {
  type: 'alert';
  alertType:
    | 'tolerance_variance'
    | 'schedule_risk'
    | 'cost_overrun'
    | 'safety_concern'
    | 'coordination_conflict';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  requiresAcknowledgment: boolean;
}

/**
 * Approval event payload
 */
export interface ApprovalEventPayload {
  type: 'approval';
  approvalType: 'decision' | 'change_order' | 'submittal' | 'inspection';
  approvedBy: EventActor;
  conditions?: string[];
  signature?: string;
}

/**
 * Milestone event payload
 */
export interface MilestoneEventPayload {
  type: 'milestone';
  milestoneName: string;
  phase: ProjectPhase;
  percentComplete: number;
  deliverables: string[];
}

/**
 * Meeting event payload
 */
export interface MeetingEventPayload {
  type: 'meeting';
  meetingType: 'coordination' | 'planning' | 'review' | 'safety';
  attendees: string[];
  agenda: string[];
  duration?: number;
  location?: string;
}

/**
 * Progress event payload
 */
export interface ProgressEventPayload {
  type: 'progress';
  workCompleted: string;
  percentComplete: number;
  phase: ProjectPhase;
  notes?: string;
}

/**
 * Issue event payload
 */
export interface IssueEventPayload {
  type: 'issue';
  issueType: 'coordination' | 'design' | 'schedule' | 'quality' | 'safety';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact?: string;
  resolution?: string;
}

/**
 * Vote event payload
 */
export interface VoteEventPayload {
  type: 'vote';
  subject: string;
  options: string[];
  voters: PersonaRole[];
  deadline: TimelinePosition;
  result?: string;
}

/**
 * Quality check event payload
 */
export interface QualityCheckEventPayload {
  type: 'quality_check';
  checkType: 'visual' | 'measurement' | 'testing' | 'documentation';
  criteria: string[];
  inspector: string;
  result?: 'passed' | 'failed' | 'conditional';
  findings?: string[];
}

/**
 * Event metadata for generation control
 */
export interface EventMetadata {
  /** Probability of this event occurring (0-1) */
  probability: number;
  /** Dependencies on prior events */
  dependencies: string[];
  /** Can be skipped in accelerated playback */
  skippable: boolean;
  /** Requires user interaction in demo */
  interactive: boolean;
  /** Visual emphasis level */
  emphasis: 'normal' | 'highlighted' | 'critical';
}

// ============================================================================
// CONSEQUENCE TYPES
// ============================================================================

/**
 * Consequence categories (from Prisma schema)
 */
export type ConsequenceCategory =
  | 'SCHEDULE_DELAY'
  | 'COST_INCREASE'
  | 'SAFETY_RISK'
  | 'QUALITY_IMPACT'
  | 'SCOPE_CHANGE'
  | 'REWORK_REQUIRED'
  | 'RESOURCE_CONFLICT'
  | 'PERMIT_REQUIRED'
  | 'DESIGN_CHANGE'
  | 'WARRANTY_IMPACT'
  | 'COORDINATION_CONFLICT'
  | 'TOLERANCE_VARIANCE'
  | 'MATERIAL_MISMATCH'
  | 'ACCESS_ISSUE'
  | 'REGULATORY_CONCERN';

/**
 * Consequence reference in events
 */
export interface ConsequenceRef {
  category: ConsequenceCategory;
  description: string;
  severity: 'low' | 'medium' | 'high';
  quantifiedImpact?: {
    cost?: number;
    days?: number;
    percentage?: number;
  };
}

// ============================================================================
// VOXEL TYPES
// ============================================================================

/**
 * Voxel status (from Prisma schema)
 */
export type VoxelStatus =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'ON_HOLD'
  | 'BLOCKED';

/**
 * Voxel definition for spatial reference
 */
export interface VoxelDefinition {
  /** Unique voxel ID */
  id: string;
  /** URN for graph references */
  urn: string;
  /** Status */
  status: VoxelStatus;
  /** 3D coordinates (center point) */
  coordinates: {
    x: number;
    y: number;
    z: number;
  };
  /** Bounding box */
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  /** Voxel resolution (meters) */
  resolution: number;
  /** Location metadata */
  location: {
    building: string;
    level: string;
    zone: string;
    gridReference: string;
  };
  /** Primary system */
  system?: string;
}

// ============================================================================
// SCENARIO TYPES
// ============================================================================

/**
 * Scenario complexity levels
 */
export type ScenarioComplexity = 'low' | 'medium' | 'high';

/**
 * Scenario focus areas
 */
export type ScenarioFocus =
  | 'workflow'
  | 'collaboration'
  | 'problem_resolution'
  | 'authority_cascade'
  | 'bim_integration'
  | 'cost_control'
  | 'schedule_management';

/**
 * Complete scenario definition
 */
export interface DemoScenario {
  /** Unique scenario ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Detailed description */
  description: string;
  /** Version string */
  version: string;
  /** Building type */
  buildingType: BuildingType;
  /** Building configuration (optional for flexible scenario definitions) */
  buildingConfig?: BuildingConfig;
  /** Duration specification */
  duration: ScenarioDuration;
  /** Complexity level */
  complexity: ScenarioComplexity;
  /** Primary focus areas (optional for flexible scenario definitions) */
  focusAreas?: ScenarioFocus[];
  /** Persona cast assignments */
  cast?: ScenarioCast;
  /** Timeline of events */
  timeline: ScenarioEvent[];
  /** Key milestones for navigation */
  milestones: ScenarioMilestone[];
  /** Seed data requirements (optional for flexible scenario definitions) */
  seedRequirements?: SeedRequirements;
  /** Demo talking points (optional for flexible scenario definitions) */
  talkingPoints?: TalkingPoint[];
  /** Metadata (optional for flexible scenario definitions) */
  metadata?: ScenarioMetadata;
  /** Author (legacy field, prefer metadata.author when metadata is present) */
  author?: string;
  /** Additional scenario-specific configuration */
  [key: string]: unknown;
}

/**
 * Scenario cast - persona assignments
 */
export interface ScenarioCast {
  architect: Persona;
  engineer: Persona;
  contractor: Persona;
  owner: Persona;
  /** Optional additional cast members */
  supporting?: Persona[];
}

/**
 * Scenario milestone for navigation
 */
export interface ScenarioMilestone {
  /** Milestone ID */
  id: string;
  /** Display name */
  name: string;
  /** Timeline position */
  position: TimelinePosition;
  /** Description for demo presenter */
  description: string;
  /** Events to highlight at this milestone */
  highlightedEvents?: string[];
  /** Demo presenter notes */
  presenterNotes: string[];
  /** Optional expected outcome for this milestone */
  expectedOutcome?: string;
}

/**
 * Seed data requirements for scenario
 */
export interface SeedRequirements {
  /** Number of voxels to generate */
  voxelCount: number;
  /** Number of construction elements */
  elementCount: number;
  /** Number of decisions */
  decisionCount: number;
  /** Required authority levels */
  authorityLevels: AuthorityLevel[];
  /** Speckle stream required */
  requiresSpeckle: boolean;
}

/**
 * Demo talking point for presenters
 */
export interface TalkingPoint {
  /** Timeline position */
  position: TimelinePosition;
  /** Topic */
  topic: string;
  /** Key points to mention */
  points: string[];
  /** Questions to ask audience */
  questions?: string[];
}

/**
 * Scenario metadata
 */
export interface ScenarioMetadata {
  /** Creation date */
  createdAt: string;
  /** Last updated */
  updatedAt: string;
  /** Author */
  author: string;
  /** Tags for categorization */
  tags: string[];
  /** Minimum Ectropy version required */
  minVersion: string;
  /** Tested status */
  tested: boolean;
  /** Production ready */
  productionReady: boolean;
}

// ============================================================================
// GENERATION TYPES
// ============================================================================

/**
 * Generation options for scenarios
 */
export interface GenerationOptions {
  /** Random seed for reproducibility */
  seed?: number;
  /** Start date for generated timestamps */
  startDate: Date;
  /** Project ID to use */
  projectId: string;
  /** Tenant ID for multi-tenant */
  tenantId?: string;
  /** Include Speckle integration */
  includeSpeckle: boolean;
  /** Variation parameters */
  variations?: {
    /** Add random delays (0-1) */
    delayVariance: number;
    /** Add random issues (0-1) */
    issueFrequency: number;
    /** Skip optional events (0-1) */
    skipProbability: number;
  };
}

/**
 * Generated scenario instance
 */
export interface ScenarioInstance {
  /** Instance ID */
  id: string;
  /** Source scenario ID */
  scenarioId: string;
  /** Generation options used */
  options: GenerationOptions;
  /** Generated at timestamp */
  generatedAt: string;
  /** Current playback position */
  currentPosition: TimelinePosition;
  /** Playback state */
  state: 'ready' | 'playing' | 'paused' | 'completed';
  /** Generated database records */
  generatedRecords: GeneratedRecords;
}

/**
 * Generated database records for insertion
 */
export interface GeneratedRecords {
  users: unknown[];
  projects: unknown[];
  participants: unknown[];
  voxels: unknown[];
  decisions: unknown[];
  inspections: unknown[];
  consequences: unknown[];
  decisionEvents: unknown[];
  alerts: unknown[];
  acknowledgments: unknown[];
}

// ============================================================================
// PLAYBACK TYPES
// ============================================================================

/**
 * Playback speed multipliers
 */
export type PlaybackSpeed = 1 | 2 | 5 | 10 | 50 | 100;

/**
 * Playback control commands
 */
export type PlaybackCommand =
  | 'play'
  | 'pause'
  | 'stop'
  | 'reset'
  | 'jumpTo'
  | 'setSpeed';

/**
 * Playback state
 */
export interface PlaybackState {
  /** Current instance */
  instanceId: string;
  /** Current position */
  position: TimelinePosition;
  /** Playback speed */
  speed: PlaybackSpeed;
  /** Is playing */
  isPlaying: boolean;
  /** Next scheduled event */
  nextEvent?: ScenarioEvent;
  /** Events executed */
  executedEvents: string[];
  /** Real-time started at */
  startedAt?: string;
  /** Elapsed real time (ms) */
  elapsedMs: number;
}

/**
 * Playback event for WebSocket updates
 */
export interface PlaybackUpdate {
  type:
    | 'event_executed'
    | 'position_changed'
    | 'state_changed'
    | 'milestone_reached';
  instanceId: string;
  timestamp: string;
  data: unknown;
}

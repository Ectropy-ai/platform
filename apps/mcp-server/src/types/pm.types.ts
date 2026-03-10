/**
 * PM Decision Types
 *
 * TypeScript interfaces derived from PM schemas in luh-tech-roadmap-template.
 * Follows V3 graph URN patterns for enterprise-grade data architecture.
 *
 * @see https://luhtech.dev/schemas/pm/
 * @version 3.0.0
 */

// ============================================================================
// URN Types
// ============================================================================

/**
 * PM-specific node types for URN construction
 */
export type PMNodeType =
  | 'pm-decision'
  | 'voxel'
  | 'consequence'
  | 'inspection'
  | 'schedule-proposal'
  | 'participant'
  | 'authority-level'
  | 'tolerance-override'
  | 'usf-profile'
  | 'usf-work-packet';

/**
 * Valid URN pattern for PM entities
 * Format: urn:luhtech:{projectId}:{nodeType}:{identifier}
 */
export type PMURN = `urn:luhtech:${string}:${PMNodeType}:${string}`;

// ============================================================================
// Authority Level Types
// ============================================================================

/**
 * Authority level enumeration (0-6)
 */
export enum AuthorityLevel {
  FIELD = 0,
  FOREMAN = 1,
  SUPERINTENDENT = 2,
  PM = 3,
  ARCHITECT = 4,
  OWNER = 5,
  REGULATORY = 6,
}

/**
 * Authority level thresholds for automatic routing
 */
export interface AuthorityThresholds {
  level: AuthorityLevel;
  name: string;
  title: string;
  budgetLimit: number; // USD
  varianceTolerance: string; // e.g., "1/8\""
  scheduleAuthority: string; // e.g., "4 hours"
  scheduleAuthorityHours: number;
  autoApprove: boolean;
  urn: PMURN;
  permissions: string[];
}

/**
 * Default authority thresholds (from graph-architecture.json)
 */
export const AUTHORITY_THRESHOLDS: AuthorityThresholds[] = [
  {
    level: 0,
    name: 'FIELD',
    title: 'Field Worker',
    budgetLimit: 0,
    varianceTolerance: '0"',
    scheduleAuthority: '0 days',
    scheduleAuthorityHours: 0,
    autoApprove: true,
    urn: 'urn:luhtech:ectropy:authority-level:pm-level-0',
    permissions: ['CAPTURE_DECISION'],
  },
  {
    level: 1,
    name: 'FOREMAN',
    title: 'Foreman',
    budgetLimit: 500,
    varianceTolerance: '1/8"',
    scheduleAuthority: '4 hours',
    scheduleAuthorityHours: 4,
    autoApprove: false,
    urn: 'urn:luhtech:ectropy:authority-level:pm-level-1',
    permissions: [
      'CAPTURE_DECISION',
      'APPROVE_DECISION',
      'REJECT_DECISION',
      'ESCALATE_DECISION',
    ],
  },
  {
    level: 2,
    name: 'SUPERINTENDENT',
    title: 'Superintendent',
    budgetLimit: 5000,
    varianceTolerance: '1/4"',
    scheduleAuthority: '1 day',
    scheduleAuthorityHours: 24,
    autoApprove: false,
    urn: 'urn:luhtech:ectropy:authority-level:pm-level-2',
    permissions: [
      'CAPTURE_DECISION',
      'APPROVE_DECISION',
      'REJECT_DECISION',
      'ESCALATE_DECISION',
      'CREATE_TOLERANCE_OVERRIDE',
      'MODIFY_SCHEDULE',
      'REQUEST_INSPECTION',
    ],
  },
  {
    level: 3,
    name: 'PM',
    title: 'Project Manager',
    budgetLimit: 50000,
    varianceTolerance: '1/2"',
    scheduleAuthority: '1 week',
    scheduleAuthorityHours: 168,
    autoApprove: false,
    urn: 'urn:luhtech:ectropy:authority-level:pm-level-3',
    permissions: [
      'CAPTURE_DECISION',
      'APPROVE_DECISION',
      'REJECT_DECISION',
      'ESCALATE_DECISION',
      'CREATE_TOLERANCE_OVERRIDE',
      'CREATE_PRE_APPROVAL',
      'MODIFY_SCHEDULE',
      'REQUEST_INSPECTION',
    ],
  },
  {
    level: 4,
    name: 'ARCHITECT',
    title: 'Architect/Engineer',
    budgetLimit: Infinity,
    varianceTolerance: 'visible',
    scheduleAuthority: '2 weeks',
    scheduleAuthorityHours: 336,
    autoApprove: false,
    urn: 'urn:luhtech:ectropy:authority-level:pm-level-4',
    permissions: [
      'APPROVE_DECISION',
      'REJECT_DECISION',
      'ESCALATE_DECISION',
      'APPROVE_DESIGN_CHANGE',
    ],
  },
  {
    level: 5,
    name: 'OWNER',
    title: 'Owner Representative',
    budgetLimit: Infinity,
    varianceTolerance: 'major',
    scheduleAuthority: '1 month',
    scheduleAuthorityHours: 720,
    autoApprove: false,
    urn: 'urn:luhtech:ectropy:authority-level:pm-level-5',
    permissions: ['APPROVE_DECISION', 'REJECT_DECISION', 'ESCALATE_DECISION'],
  },
  {
    level: 6,
    name: 'REGULATORY',
    title: 'Authority Having Jurisdiction',
    budgetLimit: Infinity,
    varianceTolerance: 'safety',
    scheduleAuthority: 'any',
    scheduleAuthorityHours: Infinity,
    autoApprove: false,
    urn: 'urn:luhtech:ectropy:authority-level:pm-level-6',
    permissions: [
      'APPROVE_DECISION',
      'REJECT_DECISION',
      'APPROVE_CODE_VARIANCE',
      'COMPLETE_INSPECTION',
    ],
  },
];

// ============================================================================
// Decision Types
// ============================================================================

/**
 * PM Decision type classification
 */
export type PMDecisionType =
  | 'APPROVAL'
  | 'REJECTION'
  | 'DEFERRAL'
  | 'ESCALATION'
  | 'PROPOSAL'
  | 'CONSEQUENCE';

/**
 * PM Decision lifecycle status
 */
export type PMDecisionStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUPERSEDED'
  | 'EXPIRED';

/**
 * PM Decision entity
 */
export interface PMDecision {
  /** URN identifier */
  $id: PMURN;
  /** Schema reference */
  $schema: 'https://luhtech.dev/schemas/pm/decision.schema.json';
  /** Schema version */
  schemaVersion: '3.0.0';
  /** Metadata block */
  meta: {
    projectId: string;
    sourceOfTruth: string;
    lastUpdated: string; // ISO 8601
    syncStatus?: {
      syncDirection: 'v3-is-source-of-truth' | 'bidirectional';
    };
  };
  /** Human-readable ID (e.g., DEC-2026-0001) */
  decisionId: string;
  /** Decision title */
  title: string;
  /** Detailed description */
  description?: string;
  /** Decision type */
  type: PMDecisionType;
  /** Lifecycle status */
  status: PMDecisionStatus;
  /** Authority level information */
  authorityLevel: {
    required: AuthorityLevel;
    current: AuthorityLevel;
    authorityRef?: PMURN;
  };
  /** Reference to attached voxel */
  voxelRef: PMURN;
  /** Voxel context for display */
  voxelContext?: {
    voxelId: string;
    coordinates?: { x: number; y: number; z: number };
    building?: string;
    level?: string;
    zone?: string;
    system?: string;
  };
  /** Budget impact */
  budgetImpact?: {
    estimated: number;
    actual?: number;
    currency: string;
    variance?: number;
  };
  /** Schedule impact */
  scheduleImpact?: {
    delayDays: number;
    affectedMilestones?: PMURN[];
    criticalPath?: boolean;
  };
  /** Participants */
  participants?: {
    requestedBy?: PMURN;
    approvedBy?: PMURN;
    rejectedBy?: PMURN;
    escalatedTo?: PMURN;
  };
  /** Evidence attachments */
  evidence?: Array<{
    type: 'photo' | 'document' | 'voice-note' | 'video' | 'measurement';
    uri: string;
    timestamp: string;
    capturedBy?: PMURN;
  }>;
  /** Related consequence URNs */
  consequences?: PMURN[];
  /** Related decision URNs */
  relatedDecisions?: PMURN[];
  /** Supersedes another decision */
  supersedes?: PMURN;
  /** Superseded by another decision */
  supersededBy?: PMURN;
  /** USF Impact - Universal Service Factors impact tracking (Phase 3) */
  usfImpact?: {
    /** Quality impact score (-1.0 to 1.0) */
    qualityImpact: number;
    /** Cost impact score (-1.0 to 1.0) */
    costImpact: number;
    /** Schedule/speed impact score (-1.0 to 1.0) */
    scheduleImpact: number;
    /** Composite impact score */
    compositeImpact: number;
    /** Explanation for the impact calculation */
    impactReason: string;
    /** Linked USF work packet URN if applicable */
    workPacketRef?: PMURN;
    /** Timestamp of impact calculation */
    calculatedAt: string;
  };
  /** Timestamps */
  createdAt: string;
  updatedAt: string;
  /** Graph metadata for traversal */
  graphMetadata: GraphMetadata;
}

// ============================================================================
// Voxel Types
// ============================================================================

/**
 * Voxel completion status
 */
export type VoxelStatus =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETE'
  | 'BLOCKED'
  | 'INSPECTION_REQUIRED';

/**
 * Voxel attachment type (from interfaces.json)
 */
export type VoxelAttachmentType =
  | 'PRIMARY'
  | 'AFFECTED'
  | 'ADJACENT'
  | 'DOWNSTREAM';

/**
 * Voxel entity - 3D spatial container
 */
export interface Voxel {
  /** URN identifier */
  $id: PMURN;
  /** Schema reference */
  $schema: 'https://luhtech.dev/schemas/pm/voxel.schema.json';
  /** Schema version */
  schemaVersion: '3.0.0';
  /** Human-readable ID (e.g., VOX-L2-MECH-047) */
  voxelId: string;
  /** 3D coordinates */
  coordinates: {
    x: number;
    y: number;
    z: number;
    resolution?: number; // Voxel size in meters
  };
  /** Physical location */
  location?: {
    building?: string;
    level?: string;
    zone?: string;
    system?: string;
    gridReference?: string;
    ifcGuid?: string;
  };
  /** Completion status */
  status: VoxelStatus;
  /** Materials in this voxel */
  materials?: Array<{
    materialId: string;
    name: string;
    quantity: number;
    unit: string;
    carbonCoefficient?: number; // kg CO2e per unit
  }>;
  /** Labor tracking */
  labor?: {
    estimatedHours: number;
    actualHours?: number;
    assignedTrade?: string;
    crew?: string[];
  };
  /** Attached decisions */
  decisions?: PMURN[];
  /** Adjacent voxels for navigation */
  adjacentVoxels?: PMURN[];
  /** Cost tracking */
  cost?: {
    estimated: number;
    actual?: number;
    currency: string;
  };
  /** Schedule tracking */
  schedule?: {
    plannedStart?: string;
    plannedEnd?: string;
    actualStart?: string;
    actualEnd?: string;
    isCriticalPath?: boolean;
  };
  /** Inspection status (Phase 3 USF Integration) */
  inspectionStatus?: {
    inspections?: PMURN[];
    roughInspection?: {
      status:
        | 'NOT_SCHEDULED'
        | 'SCHEDULED'
        | 'PASSED'
        | 'FAILED'
        | 'CONDITIONAL';
      date?: string;
      inspectionRef?: PMURN;
    };
    finalInspection?: {
      status:
        | 'NOT_SCHEDULED'
        | 'SCHEDULED'
        | 'PASSED'
        | 'FAILED'
        | 'CONDITIONAL';
      date?: string;
      inspectionRef?: PMURN;
    };
    readyForInspection?: boolean;
  };
  /** Linked USF work packet (Phase 3 USF Integration) */
  usfWorkPacketRef?: PMURN;
  /** Graph metadata */
  graphMetadata: GraphMetadata;
}

/**
 * Voxel alert for decision surface
 */
export interface VoxelAlert {
  alertId: string;
  voxelUrn: PMURN;
  decisionUrn: PMURN;
  alertType: 'DECISION_PENDING' | 'INSPECTION_REQUIRED' | 'TOLERANCE_EXCEEDED';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  createdAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: PMURN;
}

// ============================================================================
// Tolerance Override Types (NEW - from interfaces.json)
// ============================================================================

/**
 * Tolerance type for construction variances
 */
export type ToleranceType =
  | 'WALL_FLATNESS'
  | 'CEILING_HEIGHT'
  | 'FLOOR_LEVEL'
  | 'PROTRUSION'
  | 'GAP'
  | 'ALIGNMENT'
  | 'FINISH_QUALITY'
  | 'EQUIPMENT_CLEARANCE'
  | 'PIPE_SLOPE'
  | 'DUCT_SIZE';

/**
 * Tolerance value specification
 */
export interface ToleranceValue {
  value: number;
  unit: string; // e.g., "inches", "mm", "degrees"
  tolerance: number;
}

/**
 * Tolerance override entity - pre-approved variance
 */
export interface ToleranceOverride {
  $id: PMURN;
  $schema: 'https://luhtech.dev/schemas/pm/tolerance-override.schema.json';
  schemaVersion: '3.0.0';
  overrideId: string;
  toleranceType: ToleranceType;
  voxelRef: PMURN;
  standardValue: ToleranceValue;
  approvedValue: ToleranceValue;
  rationale: string;
  sourceDecision: PMURN;
  applicableTrades?: string[];
  expiresAt?: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  createdAt: string;
  updatedAt: string;
  graphMetadata: GraphMetadata;
}

/**
 * Tolerance overrides collection
 */
export interface ToleranceOverridesCollection {
  $schema: 'https://luhtech.dev/schemas/pm/tolerance-overrides-collection.json';
  $id: string;
  schemaVersion: '3.0.0';
  meta: {
    projectId: string;
    sourceOfTruth: string;
    lastUpdated: string;
    totalOverrides: number;
  };
  indexes: {
    byType: Record<ToleranceType, string[]>;
    byVoxel: Record<string, string[]>;
    byStatus: Record<string, string[]>;
  };
  overrides: ToleranceOverride[];
}

// ============================================================================
// Consequence Types
// ============================================================================

/**
 * Consequence category (expanded from interfaces.json)
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
 * Consequence severity
 */
export type ConsequenceSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Consequence status
 */
export type ConsequenceStatus =
  | 'IDENTIFIED'
  | 'ASSESSED'
  | 'MITIGATED'
  | 'ACCEPTED'
  | 'CLOSED';

/**
 * Consequence entity
 */
export interface Consequence {
  $id: PMURN;
  $schema: 'https://luhtech.dev/schemas/pm/consequence.schema.json';
  schemaVersion: '3.0.0';
  consequenceId: string;
  category: ConsequenceCategory;
  severity: ConsequenceSeverity;
  status: ConsequenceStatus;
  description: string;
  sourceDecision: PMURN;
  affectedVoxels?: PMURN[];
  budgetImpact?: {
    amount: number;
    currency: string;
    isConfirmed: boolean;
  };
  scheduleImpact?: {
    delayDays: number;
    affectedMilestones?: PMURN[];
  };
  mitigationPlan?: string;
  createdAt: string;
  updatedAt: string;
  graphMetadata: GraphMetadata;
}

// ============================================================================
// Inspection Types
// ============================================================================

/**
 * Inspection type
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
 * Inspection status
 */
export type InspectionStatus =
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'PASSED'
  | 'FAILED'
  | 'CONDITIONAL'
  | 'CANCELLED';

/**
 * Inspection outcome (from interfaces.json)
 */
export type InspectionOutcome = 'PASSED' | 'FAILED' | 'CONDITIONAL';

/**
 * Inspection finding
 */
export interface InspectionFinding {
  findingId: string;
  description: string;
  severity: 'MINOR' | 'MAJOR' | 'CRITICAL';
  location?: string;
  photo?: string;
  requiresCorrection: boolean;
  correctionDeadline?: string;
}

/**
 * Inspection entity
 */
export interface Inspection {
  $id: PMURN;
  $schema: 'https://luhtech.dev/schemas/pm/inspection.schema.json';
  schemaVersion: '3.0.0';
  inspectionId: string;
  type: InspectionType;
  status: InspectionStatus;
  outcome?: InspectionOutcome;
  voxelRef: PMURN;
  voxelRefs?: PMURN[]; // Multiple voxels for request_inspection
  decisionRef?: PMURN;
  decisionsToValidate?: PMURN[];
  decisionsValidated?: PMURN[];
  decisionsFailed?: PMURN[];
  scheduledDate?: string;
  completedDate?: string;
  inspector?: PMURN;
  findings?: string | InspectionFinding[];
  conditions?: string[];
  reinspectionRequired?: boolean;
  punchList?: Array<{
    item: string;
    status: 'open' | 'resolved';
    assignee?: PMURN;
  }>;
  evidence?: Array<{
    type: 'photo' | 'document' | 'video';
    uri: string;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
  graphMetadata: GraphMetadata;
}

// ============================================================================
// Schedule Proposal Types
// ============================================================================

/**
 * Schedule proposal status
 */
export type ScheduleProposalStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'IMPLEMENTED';

/**
 * Schedule proposal entity
 */
export interface ScheduleProposal {
  $id: PMURN;
  $schema: 'https://luhtech.dev/schemas/pm/schedule-proposal.schema.json';
  schemaVersion: '3.0.0';
  proposalId: string;
  status: ScheduleProposalStatus;
  sourceDecision: PMURN;
  proposedBy: PMURN;
  lookAheadDays: number;
  changes: Array<{
    activityId: string;
    activityName: string;
    originalStart?: string;
    proposedStart?: string;
    originalEnd?: string;
    proposedEnd?: string;
    reason: string;
  }>;
  impactAnalysis?: {
    criticalPathAffected: boolean;
    floatConsumed: number;
    resourceConflicts?: string[];
  };
  createdAt: string;
  updatedAt: string;
  graphMetadata: GraphMetadata;
}

// ============================================================================
// Participant Types
// ============================================================================

/**
 * Participant role
 */
export type ParticipantRole =
  | 'FIELD_WORKER'
  | 'FOREMAN'
  | 'SUPERINTENDENT'
  | 'PROJECT_MANAGER'
  | 'ARCHITECT'
  | 'ENGINEER'
  | 'OWNER_REP'
  | 'INSPECTOR'
  | 'SUBCONTRACTOR';

/**
 * Participant entity
 */
export interface Participant {
  $id: PMURN;
  $schema: 'https://luhtech.dev/schemas/pm/participant.schema.json';
  schemaVersion: '3.0.0';
  participantId: string;
  name: string;
  role: ParticipantRole;
  company?: string;
  email?: string;
  phone?: string;
  authorityLevel: AuthorityLevel;
  activeProjects?: PMURN[];
  createdAt: string;
  updatedAt: string;
  graphMetadata: GraphMetadata;
}

// ============================================================================
// Universal Service Factors (USF) Types
// ============================================================================

/**
 * USF Provider type classification
 */
export type USFProviderType =
  | 'human'
  | 'robot'
  | 'agent'
  | 'team'
  | 'subcontractor'
  | 'aggregate';

/**
 * USF Pricing tier
 */
export type USFPricingTier = 'economy' | 'standard' | 'premium' | 'expedited';

/**
 * USF Work packet status
 */
export type USFWorkPacketStatus =
  | 'planned'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'disputed';

/**
 * Universal Service Factors - normalized 0.0-1.0 scores
 */
export interface USFFactors {
  /** Quality score (Better) - defect rate, first-pass yield, rework hours */
  quality: number;
  /** Cost efficiency score (Cheaper) - actual cost vs market benchmark */
  cost: number;
  /** Speed score (Faster) - actual duration vs takt target */
  speed: number;
}

/**
 * USF Weights for composite calculation
 */
export interface USFWeights {
  quality: number; // Default: 0.4
  cost: number; // Default: 0.3
  speed: number; // Default: 0.3
}

/**
 * USF Confidence metrics
 */
export interface USFConfidence {
  score: number;
  sampleSize: number;
  variance: number;
  lastUpdated: string;
}

/**
 * USF Impact - tracks Universal Service Factor impact from decisions/events
 * Used by decisions, inspections, and voxel lifecycle events
 * @see Phase 3: Voxel Integration
 */
export interface USFImpact {
  /** Quality impact score (-1.0 to 1.0, negative = degradation) */
  qualityImpact: number;
  /** Cost impact score (-1.0 to 1.0, negative = over budget) */
  costImpact: number;
  /** Schedule/speed impact score (-1.0 to 1.0, negative = delay) */
  scheduleImpact: number;
  /** Composite impact using standard weights */
  compositeImpact: number;
  /** Human-readable explanation of impact */
  impactReason: string;
  /** Linked USF work packet if applicable */
  workPacketRef?: PMURN;
  /** Timestamp of impact calculation */
  calculatedAt: string;
}

/**
 * USF Profile entity - provider performance metrics
 */
export interface USFProfile {
  $id: PMURN;
  $schema: 'https://luhtech.dev/schemas/usf/usf-profile.schema.json';
  schemaVersion: '3.0.0';
  meta?: {
    projectId?: string;
    sourceOfTruth?: string;
    lastUpdated?: string;
  };
  profileId: string;
  providerId: string;
  providerType: USFProviderType;
  providerInfo?: {
    name?: string;
    company?: string;
    trade?: string;
    certifications?: string[];
    location?: string;
    contactRef?: PMURN;
  };
  factors: USFFactors;
  composite?: {
    score: number;
    weights: USFWeights;
  };
  confidence?: USFConfidence;
  pricingTier?: USFPricingTier;
  workTypes?: Array<{
    workType: string;
    proficiencyLevel?: 'apprentice' | 'journeyman' | 'master' | 'specialist';
    usfOverride?: Partial<USFFactors>;
  }>;
  history?: USFSnapshot[];
  activeContracts?: PMURN[];
  availability?: {
    status: 'available' | 'assigned' | 'unavailable' | 'limited';
    nextAvailable?: string;
    capacity?: number;
  };
  createdAt: string;
  updatedAt: string;
  graphMetadata: GraphMetadata;
}

/**
 * USF Snapshot for historical tracking
 */
export interface USFSnapshot {
  timestamp: string;
  factors: USFFactors;
  composite: number;
  sampleSize: number;
  triggeringWorkPacket?: PMURN;
}

/**
 * USF Work Packet entity - tracks work unit for USF measurement
 */
export interface USFWorkPacket {
  $id: PMURN;
  $schema: 'https://luhtech.dev/schemas/usf/usf-work-packet.schema.json';
  schemaVersion: '3.0.0';
  meta?: {
    projectId?: string;
    sourceOfTruth?: string;
    lastUpdated?: string;
  };
  workPacketId: string;
  projectId: string;
  sourceRef?: {
    type: 'wagon' | 'voxel' | 'voxel-cluster' | 'task' | 'milestone';
    urn: PMURN;
    externalId?: string;
  };
  description?: string;
  workType?: string;
  status: USFWorkPacketStatus;
  targets: {
    qualityTarget: number;
    budgetAmount?: number;
    budgetCurrency?: string;
    durationHours?: number;
    taktTime?: number;
    marketBenchmark?: number;
  };
  actuals?: {
    qualityScore?: number;
    defectCount?: number;
    reworkHours?: number;
    actualCost?: number;
    actualDurationHours?: number;
    actualTaktTime?: number;
    completedAt?: string;
  };
  usfResults?: USFFactors & { composite?: number };
  variance?: {
    qualityVariance?: number;
    costVariance?: number;
    costVariancePercent?: number;
    scheduleVariance?: number;
    scheduleVariancePercent?: number;
  };
  laborAllocation: USFLaborAllocation[];
  attribution?: USFAttribution[];
  pricingTier?: USFPricingTier;
  billing?: {
    baseRate?: number;
    tierMultiplier?: number;
    reputationMultiplier?: number;
    varianceAdjustment?: number;
    finalAmount?: number;
    status?: 'pending' | 'invoiced' | 'paid' | 'disputed';
    payApplicationRef?: PMURN;
  };
  inspectionRef?: PMURN;
  contractRef?: PMURN;
  contractThresholds?: {
    minimumQuality?: number;
    maximumCostVariance?: number;
    maximumScheduleVariance?: number;
    bonusTrigger?: number;
    bonusPercent?: number;
    penaltyTrigger?: number;
    penaltyPercent?: number;
  };
  voxelRefs?: PMURN[];
  evidence?: Array<{
    type:
      | 'photo'
      | 'document'
      | 'measurement'
      | 'inspection-report'
      | 'timesheet';
    uri: string;
    timestamp: string;
    description?: string;
  }>;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  graphMetadata: GraphMetadata;
}

/**
 * USF Labor allocation item
 */
export interface USFLaborAllocation {
  providerUrn: PMURN;
  allocationPercent: number;
  role?: string;
  plannedHours?: number;
}

/**
 * USF Attribution item for mixed labor
 */
export interface USFAttribution {
  providerUrn: PMURN;
  contributionPercent?: number;
  qualityContribution?: number;
  costContribution?: number;
  speedContribution?: number;
  notes?: string;
}

/**
 * USF Profiles collection file structure
 */
export interface USFProfilesCollection {
  $schema: 'https://luhtech.dev/schemas/usf/usf-profiles-collection.json';
  $id: string;
  schemaVersion: '3.0.0';
  meta: {
    projectId: string;
    sourceOfTruth: string;
    lastUpdated: string;
    totalProfiles: number;
  };
  indexes: {
    byProviderType: Record<USFProviderType, string[]>;
    byPricingTier: Record<USFPricingTier, string[]>;
    byTrade: Record<string, string[]>;
  };
  profiles: USFProfile[];
}

/**
 * USF Work Packets collection file structure
 */
export interface USFWorkPacketsCollection {
  $schema: 'https://luhtech.dev/schemas/usf/usf-work-packets-collection.json';
  $id: string;
  schemaVersion: '3.0.0';
  meta: {
    projectId: string;
    sourceOfTruth: string;
    lastUpdated: string;
    totalWorkPackets: number;
  };
  indexes: {
    byStatus: Record<USFWorkPacketStatus, string[]>;
    byWorkType: Record<string, string[]>;
    byProvider: Record<string, string[]>;
  };
  workPackets: USFWorkPacket[];
}

// ============================================================================
// Graph Types
// ============================================================================

/**
 * PM-specific edge types (from graph-architecture.json)
 */
export type PMEdgeType =
  | 'contains'
  | 'triggers'
  | 'proposes'
  | 'escalates-to'
  | 'validates'
  | 'authored-by'
  | 'approved-by'
  | 'affects'
  | 'adjacent-to'
  | 'depends-on'
  | 'supersedes'
  | 'references'
  | 'performs'
  | 'attributed-to'
  | 'rates'
  | 'derived-from'
  | 'tracks'
  | 'updates-profile'
  | 'bills-to'
  | 'covers-voxel';

/**
 * Graph edge for PM entities
 */
export interface PMEdge {
  from: PMURN;
  to: PMURN;
  type: PMEdgeType;
  weight?: number;
  label?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

/**
 * Graph metadata for bidirectional traversal
 */
export interface GraphMetadata {
  inEdges: PMURN[];
  outEdges: PMURN[];
  edges?: PMEdge[];
}

/**
 * Graph node for traversal results
 */
export interface GraphNode {
  urn: PMURN;
  nodeType: PMNodeType;
  label?: string;
  data?: unknown;
}

/**
 * Graph edge for traversal results
 */
export interface GraphEdge {
  from: PMURN;
  to: PMURN;
  type: PMEdgeType;
  label?: string;
}

// ============================================================================
// Collection Types (for storage)
// ============================================================================

/**
 * PM Decisions collection file structure
 */
export interface PMDecisionsCollection {
  $schema: 'https://luhtech.dev/schemas/pm/decisions-collection.json';
  $id: string;
  schemaVersion: '3.0.0';
  meta: {
    projectId: string;
    sourceOfTruth: string;
    lastUpdated: string;
    totalDecisions: number;
  };
  indexes: {
    byStatus: Record<PMDecisionStatus, string[]>;
    byVoxel: Record<string, string[]>;
    byAuthorityLevel: Record<string, string[]>;
  };
  decisions: PMDecision[];
}

/**
 * Voxels collection file structure
 */
export interface VoxelsCollection {
  $schema: 'https://luhtech.dev/schemas/pm/voxels-collection.json';
  $id: string;
  schemaVersion: '3.0.0';
  meta: {
    projectId: string;
    sourceOfTruth: string;
    lastUpdated: string;
    totalVoxels: number;
  };
  indexes: {
    byStatus: Record<VoxelStatus, string[]>;
    byLevel: Record<string, string[]>;
    byZone: Record<string, string[]>;
  };
  voxels: Voxel[];
}

/**
 * Consequences collection file structure
 */
export interface ConsequencesCollection {
  $schema: 'https://luhtech.dev/schemas/pm/consequences-collection.json';
  $id: string;
  schemaVersion: '3.0.0';
  meta: {
    projectId: string;
    sourceOfTruth: string;
    lastUpdated: string;
    totalConsequences: number;
  };
  indexes: {
    byStatus: Record<ConsequenceStatus, string[]>;
    byCategory: Record<ConsequenceCategory, string[]>;
    bySeverity: Record<ConsequenceSeverity, string[]>;
  };
  consequences: Consequence[];
}

/**
 * Inspections collection file structure
 */
export interface InspectionsCollection {
  $schema: 'https://luhtech.dev/schemas/pm/inspections-collection.json';
  $id: string;
  schemaVersion: '3.0.0';
  meta: {
    projectId: string;
    sourceOfTruth: string;
    lastUpdated: string;
    totalInspections: number;
  };
  indexes: {
    byStatus: Record<InspectionStatus, string[]>;
    byType: Record<InspectionType, string[]>;
    byVoxel: Record<string, string[]>;
  };
  inspections: Inspection[];
}

// ============================================================================
// Tool Input Types
// ============================================================================

/**
 * Input for capture_decision tool
 */
export interface CaptureDecisionInput {
  projectId: string;
  voxelId: string;
  title: string;
  type: PMDecisionType;
  description?: string;
  budgetImpact?: number;
  scheduleImpactHours?: number;
  varianceInches?: number;
  isSafetyIssue?: boolean;
  isDesignChange?: boolean;
  requestedBy?: string;
  evidence?: Array<{
    type: 'photo' | 'document' | 'voice-note' | 'video' | 'measurement';
    uri: string;
  }>;
}

/**
 * Input for route_decision tool
 */
export interface RouteDecisionInput {
  projectId: string;
  decisionId: string;
  targetAuthorityLevel?: AuthorityLevel;
  note?: string;
}

/**
 * Input for approve_decision tool
 */
export interface ApproveDecisionInput {
  projectId: string;
  decisionId: string;
  approverId: string;
  comment?: string;
  conditions?: string[];
}

/**
 * Input for reject_decision tool
 */
export interface RejectDecisionInput {
  projectId: string;
  decisionId: string;
  rejectorId: string;
  reason: string;
  alternativeAction?: string;
}

/**
 * Input for escalate_decision tool
 */
export interface EscalateDecisionInput {
  projectId: string;
  decisionId: string;
  escalatedBy: string;
  targetLevel?: AuthorityLevel;
  reason: string;
}

/**
 * Input for query_decision_history tool
 */
export interface QueryDecisionHistoryInput {
  projectId: string;
  voxelId?: string;
  status?: PMDecisionStatus | PMDecisionStatus[];
  type?: PMDecisionType | PMDecisionType[];
  authorityLevel?: AuthorityLevel | { min: number; max: number };
  dateRange?: {
    start: string;
    end: string;
  };
  fromDate?: string;
  toDate?: string;
  participantUrn?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'budgetImpact' | 'scheduleImpact';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Input for get_voxel_decisions tool
 */
export interface GetVoxelDecisionsInput {
  projectId: string;
  voxelId: string;
  includeAdjacent?: boolean;
  attachmentTypes?: VoxelAttachmentType[];
  status?: PMDecisionStatus | PMDecisionStatus[];
}

/**
 * Input for navigate_decision_surface tool (NEW)
 */
export interface NavigateDecisionSurfaceInput {
  projectId: string;
  startVoxelId: string;
  direction?: 'up' | 'down' | 'north' | 'south' | 'east' | 'west' | 'adjacent';
  maxDepth?: number;
  filterTrades?: string[];
}

/**
 * Input for attach_decision_to_voxel tool
 */
export interface AttachDecisionToVoxelInput {
  projectId: string;
  decisionId: string;
  voxelId: string;
  attachmentType: VoxelAttachmentType;
  affectedTrades?: string[];
  requiresAcknowledgment?: boolean;
}

/**
 * Input for apply_tolerance_override tool (NEW)
 */
export interface ApplyToleranceOverrideInput {
  projectId: string;
  voxelId: string;
  toleranceType: ToleranceType;
  standardValue: ToleranceValue;
  approvedValue: ToleranceValue;
  rationale: string;
  sourceDecisionId: string;
  applicableTrades?: string[];
  expiresAt?: string;
}

/**
 * Input for query_tolerance_overrides tool (NEW)
 */
export interface QueryToleranceOverridesInput {
  projectId: string;
  voxelId?: string;
  toleranceType?: ToleranceType;
  applicableTrade?: string;
  includeExpired?: boolean;
}

/**
 * Input for track_consequence tool
 */
export interface TrackConsequenceInput {
  projectId: string;
  decisionId: string;
  category: ConsequenceCategory;
  severity: ConsequenceSeverity;
  description: string;
  budgetAmount?: number;
  scheduleDelayDays?: number;
  affectedVoxelIds?: string[];
  mitigationPlan?: string;
  evidence?: Array<{
    type: 'photo' | 'document' | 'video';
    uri: string;
  }>;
}

/**
 * Input for request_inspection tool
 */
export interface RequestInspectionInput {
  projectId: string;
  voxelIds: string[];
  inspectionType: InspectionType;
  requestedDate?: string;
  decisionsToValidate?: string[];
  notes?: string;
  // Legacy single voxel support
  voxelId?: string;
  decisionId?: string;
  scheduledDate?: string;
}

/**
 * Input for complete_inspection tool (NEW)
 */
export interface CompleteInspectionInput {
  projectId: string;
  inspectionId: string;
  inspectorId: string;
  outcome: InspectionOutcome;
  findings: InspectionFinding[];
  decisionsValidated?: string[];
  decisionsFailed?: string[];
  evidence?: Array<{
    type: 'photo' | 'document' | 'video';
    uri: string;
  }>;
  conditions?: string[];
  reinspectionRequired?: boolean;
  /** USF Phase 3: Optional work packet URN for USF integration */
  workPacketUrn?: string;
}

/**
 * Input for propose_schedule_change tool
 */
export interface ProposeScheduleChangeInput {
  projectId: string;
  decisionId: string;
  proposerId: string;
  lookAheadDays: number;
  changes: Array<{
    activityId: string;
    activityName: string;
    proposedStart?: string;
    proposedEnd?: string;
    reason: string;
  }>;
}

/**
 * Input for query_voxels_by_status tool (legacy, kept for compatibility)
 */
export interface QueryVoxelsByStatusInput {
  projectId: string;
  status: VoxelStatus;
  level?: string;
  zone?: string;
}

// ============================================================================
// USF Tool Input Types
// ============================================================================

/**
 * Input for usf_get_provider_profile tool
 */
export interface USFGetProviderProfileInput {
  providerUrn: string;
  includeHistory?: boolean;
}

/**
 * Input for usf_create_work_packet tool
 */
export interface USFCreateWorkPacketInput {
  projectId: string;
  workPacketId?: string;
  sourceRef?: {
    type: 'wagon' | 'voxel' | 'voxel-cluster' | 'task' | 'milestone';
    urn: string;
    externalId?: string;
  };
  description?: string;
  workType?: string;
  laborAllocation: Array<{
    providerUrn: string;
    allocationPercent: number;
    role?: string;
    plannedHours?: number;
  }>;
  targets: {
    qualityTarget: number;
    budgetAmount?: number;
    durationHours?: number;
    taktTime?: number;
  };
  pricingTier?: USFPricingTier;
  contractRef?: string;
  voxelRefs?: string[];
}

/**
 * Input for usf_complete_work_packet tool
 */
export interface USFCompleteWorkPacketInput {
  workPacketUrn: string;
  actuals: {
    qualityScore?: number;
    defectCount?: number;
    reworkHours?: number;
    actualCost?: number;
    actualDurationHours?: number;
  };
  attribution?: Array<{
    providerUrn: string;
    qualityContribution?: number;
    costContribution?: number;
    speedContribution?: number;
  }>;
  inspectionRef?: string;
  evidence?: Array<{
    type:
      | 'photo'
      | 'document'
      | 'measurement'
      | 'inspection-report'
      | 'timesheet';
    uri: string;
    description?: string;
  }>;
}

/**
 * Input for usf_search_providers tool
 */
export interface USFSearchProvidersInput {
  providerTypes?: USFProviderType[];
  minQuality?: number;
  maxCost?: number;
  minSpeed?: number;
  trade?: string;
  availability?: {
    startDate: string;
    endDate: string;
  };
  location?: string;
  certifications?: string[];
  minConfidence?: number;
  limit?: number;
}

/**
 * Input for usf_compare_providers tool
 */
export interface USFCompareProvidersInput {
  providerUrns: string[];
  weightOverrides?: USFWeights;
}

/**
 * Input for usf_get_market_benchmarks tool
 */
export interface USFGetMarketBenchmarksInput {
  workType: string;
  region?: string;
}

/**
 * Input for usf_calculate_pricing tool
 */
export interface USFCalculatePricingInput {
  workPacketUrn: string;
  pricingTier?: USFPricingTier;
}

// ============================================================================
// Tool Output Types
// ============================================================================

/**
 * Standard tool result
 */
export interface PMToolResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: {
    duration: number;
    timestamp: string;
    /** USF Phase 4: Optional USF cost/schedule projection data */
    usfProjection?: unknown;
    /** USF Phase 4: Optional USF escalation analysis data */
    usfEscalation?: unknown;
    /** USF Phase 4: Allow arbitrary USF-related metadata */
    [key: string]: unknown;
  };
}

export type CaptureDecisionResult = PMToolResult<PMDecision>;
export type RouteDecisionResult = PMToolResult<PMDecision>;
export type ApproveDecisionResult = PMToolResult<PMDecision>;
export type RejectDecisionResult = PMToolResult<PMDecision>;
export type EscalateDecisionResult = PMToolResult<PMDecision>;
export type QueryDecisionHistoryResult = PMToolResult<{
  decisions: PMDecision[];
  total: number;
  limit: number;
  offset: number;
  facets?: {
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    byAuthority: Record<number, number>;
  };
}>;
export type GetVoxelDecisionsResult = PMToolResult<{
  voxel: Voxel;
  decisions: {
    primary: PMDecision[];
    affected: PMDecision[];
    adjacent: PMDecision[];
    downstream: PMDecision[];
  };
  decisionSurface?: unknown;
  toleranceOverrides?: ToleranceOverride[];
  activeAlerts?: VoxelAlert[];
}>;
export type NavigateDecisionSurfaceResult = PMToolResult<{
  path: Array<{ urn: PMURN; voxelId: string }>;
  decisions: PMDecision[];
  alerts: VoxelAlert[];
  graph: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
}>;
export type ApplyToleranceOverrideResult = PMToolResult<{
  override: ToleranceOverride;
  voxel: Voxel;
  alertsCreated: VoxelAlert[];
}>;
export type QueryToleranceOverridesResult = PMToolResult<{
  overrides: ToleranceOverride[];
  total: number;
  byType: Record<ToleranceType, number>;
}>;
export type TrackConsequenceResult = PMToolResult<{
  consequence: Consequence;
  graphEdges: GraphEdge[];
  affectedVoxels: Voxel[];
  escalationRequired: boolean;
}>;
export type RequestInspectionResult = PMToolResult<{
  inspection: Inspection;
  scheduledDate: string;
  assignedInspector?: string;
}>;
export type CompleteInspectionResult = PMToolResult<{
  inspection: Inspection;
  validatedDecisions: PMDecision[];
  failedDecisions: PMDecision[];
  consequencesCreated: Consequence[];
  decisionsTriggered: PMDecision[];
  graphEdges: GraphEdge[];
}>;
export type ProposeScheduleChangeResult = PMToolResult<ScheduleProposal>;
export type QueryVoxelsByStatusResult = PMToolResult<Voxel[]>;

// USF Tool Result Types
export type USFGetProviderProfileResult = PMToolResult<{
  profile: USFProfile;
  history?: USFSnapshot[];
}>;
export type USFCreateWorkPacketResult = PMToolResult<{
  workPacket: USFWorkPacket;
  profilesAffected: string[];
}>;
export type USFCompleteWorkPacketResult = PMToolResult<{
  workPacket: USFWorkPacket;
  usfResults: USFFactors & { composite: number };
  profilesUpdated: Array<{
    providerUrn: string;
    previousFactors: USFFactors;
    newFactors: USFFactors;
    delta: USFFactors;
  }>;
  billingAmount?: number;
  varianceReport: {
    qualityVariance: number;
    costVariance: number;
    scheduleVariance: number;
    bonusOrPenalty?: number;
  };
}>;
export type USFSearchProvidersResult = PMToolResult<{
  providers: USFProfile[];
  total: number;
  marketBenchmark?: USFFactors;
  recommendedTier?: USFPricingTier;
}>;
export type USFCompareProvidersResult = PMToolResult<{
  comparison: Array<{
    profile: USFProfile;
    rank: number;
    compositeScore: number;
    recommendation: string;
  }>;
  benchmarkComparison?: {
    aboveAverage: string[];
    belowAverage: string[];
  };
}>;
export type USFGetMarketBenchmarksResult = PMToolResult<{
  workType: string;
  region: string;
  benchmark: USFFactors;
  sampleSize: number;
  confidence: number;
  priceRange: {
    economy: { min: number; max: number };
    standard: { min: number; max: number };
    premium: { min: number; max: number };
    expedited: { min: number; max: number };
  };
}>;
export type USFCalculatePricingResult = PMToolResult<{
  workPacketUrn: string;
  baseRate: number;
  tierMultiplier: number;
  reputationMultiplier: number;
  projectedAmount: number;
  breakdown: {
    laborCost: number;
    qualityPremium: number;
    speedPremium: number;
    tierAdjustment: number;
  };
}>;

/**
 * Authority graph result
 */
export interface AuthorityGraphResult {
  levels: AuthorityThresholds[];
  escalationRules: Array<{
    id: string;
    trigger: string;
    description: string;
    thresholds?: Array<{
      minBudget?: number;
      maxBudget?: number | null;
      minHours?: number;
      maxHours?: number | null;
      requiredLevel: number;
    }>;
    requiredLevel?: number;
  }>;
  graphEdges?: GraphEdge[];
}

/**
 * Find decision authority result
 */
export interface FindDecisionAuthorityResult {
  requiredLevel: AuthorityLevel;
  requiredName: string;
  triggeringFactors: string[];
  escalationPath: AuthorityThresholds[];
}

/**
 * Validate authority result
 */
export interface ValidateAuthorityResult {
  canApprove: boolean;
  participantLevel: AuthorityLevel;
  requiredLevel: AuthorityLevel;
  gap: number;
  escalationRequired: boolean;
  suggestedApprover?: PMURN;
}

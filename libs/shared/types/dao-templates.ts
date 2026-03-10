/*
 * =============================================================================
 * DAO DATA SHARING TEMPLATE TYPES - FEDERATED CONSTRUCTION GOVERNANCE
 *
 * STATUS: ✅ COMPLETE - Phase 3 Implementation Ready
 * LAST UPDATED: July 8, 2025
 * INTEGRATION: Fully integrated with API Gateway, Database Schema, and Services
 * PURPOSE:
 * Type definitions for decentralized governance of data sharing between
 * construction stakeholders. Templates define access rules that can be
 * modified through DAO voting mechanisms.
 * CAPABILITIES:
 * - Stakeholder role-based data access definitions
 * - Manufacturer data tier governance
 * - Emergency access override mechanisms
 * - Template versioning with rollback support
 * - Blockchain governance integration
 * - Time-based access restrictions
 * - Project-specific overrides
 * - Compliance audit trails
 * GOVERNANCE WORKFLOW:
 * 1. Templates are proposed by stakeholders
 * 2. DAO voting period begins with defined quorum/threshold
 * 3. Stakeholders vote based on their assigned voting weights
 * 4. Approved templates become active access control rules
 * 5. Emergency access can override templates when needed
 * INTEGRATION POINTS:
 * - Used by DAOTemplateGovernanceService for proposal management
 * - Consumed by API Gateway for access control decisions
 * - Stored in PostgreSQL with audit trails
 * - Connected to manufacturer API integration
 */

/**
/**
 * BLOCKCHAIN DAO GOVERNANCE CONFIGURATION
 * Links templates to on-chain governance mechanisms for decentralized
 * decision-making across the federated construction platform.
 */
export interface DAOGovernance {
  /** Smart contract address for DAO */
  daoAddress: string;
  /** Current proposal ID if template is being voted on */
  proposalId?: string;
  /** Voting period details */
  votingPeriod?: {
    start: Date;
    end: Date;
    minimumQuorum: number; // Required participation %
    passingThreshold: number; // Required approval %
  };
  /** Voting weights by stakeholder type */
  votingWeights: Record<DAOStakeholderRole, number>;
}
/**
 * COMPLETE DATA SHARING TEMPLATE
 * Comprehensive access control template that governs how data flows
 * between different stakeholders in the construction ecosystem.
 * LIFECYCLE:
 * 1. Created as 'draft' by stakeholder
 * 2. Submitted as 'proposed' to DAO
 * 3. Becomes 'active' after successful vote
 * 4. Can be 'deprecated' when superseded
 */
export interface DataSharingTemplate {
  /** Unique template identifier */
  templateId: string;
  /** Human-readable template name */
  templateName: string;
  /** Template version for evolution tracking */
  version: string;
  /** Current governance status */
  governanceStatus: 'draft' | 'proposed' | 'active' | 'deprecated';
  /** DAO governance configuration */
  daoGovernance: DAOGovernance;
  /** Access rules by stakeholder role */
  stakeholderAccess: Record<DAOStakeholderRole, StakeholderDataAccess>;
  /** Manufacturer data access tiers */
  manufacturerDataTiers: ManufacturerDataTiers;
  /** Emergency access configuration */
  emergencyAccess: EmergencyAccess;
  /** Project-specific overrides */
  projectOverrides?: Record<string, Partial<StakeholderDataAccess>>;
  /** Template metadata */
  metadata: {
    createdBy: string;
    createdAt: Date;
    lastModified: Date;
    description: string;
    applicableRegions: string[]; // Geographic scope
    complianceStandards: string[]; // Regulatory compliance
  };
}

/**
 * DAO GOVERNANCE STAKEHOLDER ROLES
 * Role system specific to DAO governance and federated decision-making.
 * NOTE: For platform-wide stakeholder roles, use StakeholderRole from api.types.ts
 * which includes roles like 'admin', 'viewer', 'project_manager'
 */
export type DAOStakeholderRole =
  | 'owner' // Project owners, real estate developers
  | 'architect' // Building designers, architectural firms
  | 'engineer' // Structural, MEP, civil engineers
  | 'contractor' // General and specialized contractors
  | 'supplier' // Material and equipment suppliers
  | 'inspector' // Quality control, safety inspectors
  | 'regulator'; // Government agencies, compliance bodies

/**
 * Legacy type alias for backwards compatibility
 * @deprecated Use DAOStakeholderRole instead
 */
export type StakeholderRole = DAOStakeholderRole;

/**
 * DATA CATEGORIES IN CONSTRUCTION PLATFORM
 * Comprehensive categorization of all data types flowing through
 * the federated construction platform.
 */
export type DataCategory =
  // Product Information
  | 'specifications' // Technical specifications
  | 'performance' // Performance metrics
  | 'sustainability' // Environmental impact data
  | 'pricing' // Cost information
  | 'availability' // Supply chain status
  | 'installation' // Installation procedures
  | 'maintenance' // Maintenance requirements
  | 'compliance' // Regulatory compliance data
  // BIM/Technical Data
  | 'geometric' // 3D geometry, dimensions
  | 'material_properties' // Material characteristics
  | 'structural_data' // Load-bearing information
  | 'thermal_properties' // Insulation, thermal performance
  | 'fire_rating' // Fire safety ratings
  | 'acoustic_properties' // Sound insulation data
  // Business Data
  | 'cost_analysis' // Cost breakdowns
  | 'procurement_data' // Purchasing information
  | 'supplier_information' // Vendor details
  | 'quality_certifications' // Quality assurance data
  // Project Management Data
  | 'schedule_data' // Project scheduling and timeline data
  | 'progress_tracking' // Project progress information
  | 'resource_allocation' // Resource assignment data
  | 'risk_assessment' // Risk analysis data
  | 'change_orders' // Change order documentation
  | 'quality_control' // Quality control results
  | 'safety_reports' // Safety incident reports
  | 'inspection_data' // Inspection results and reports
  | 'warranty_information' // Warranty and guarantee data
  | 'commissioning_data'; // Commissioning and handover data

/**
 * OPERATIONS STAKEHOLDERS CAN PERFORM
 * Granular permission system for different types of data operations.
 */
export type DataOperation =
  | 'read' // View data
  | 'write' // Modify data
  | 'admin' // Full administrative access
  | 'export' // Download/export data
  | 'share' // Share with other stakeholders
  | 'audit'; // View audit trails

/**
 * STAKEHOLDER DATA ACCESS CONTROL
 * Defines what data categories and operations each stakeholder role
 * can access within the federated construction platform.
 * USAGE: Applied at API endpoint level to validate access requests
 */
export interface StakeholderDataAccess {
  /** Allowed data categories for this stakeholder role */
  dataCategories: DataCategory[];
  /** Operations this role can perform */
  operations: DataOperation[];
  /** Additional conditions for access (certifications, approvals, etc.) */
  conditions?: AccessCondition[];
  /** Time-based restrictions (business hours, project phases, etc.) */
  timeRestrictions?: TimeRestriction[];
}

/**
 * MANUFACTURER DATA TIER SYSTEM
 * Four-tier data access system for manufacturer product information:
 * - Public: Basic specs available to all authenticated users
 * - Technical: Detailed specs for architects/engineers
 * - Commercial: Pricing/procurement for owners/contractors
 * - Restricted: Sensitive data for owners only
 */
export interface ManufacturerDataTiers {
  /** Public specifications available to all authenticated users */
  public: DataCategory[];
  /** Technical data for architects and engineers */
  technical: DataCategory[];
  /** Commercial data for owners and contractors */
  commercial: DataCategory[];
  /** Restricted data for owners only */
  restricted: DataCategory[];
}

/**
 * EMERGENCY ACCESS OVERRIDE SYSTEM
 * Allows authorized stakeholders to bypass normal access controls
 * during emergency situations (safety issues, regulatory compliance, etc.)
 */
export interface EmergencyAccess {
  /** Roles that can invoke emergency access */
  authorizedRoles: DAOStakeholderRole[];
  /** Conditions that trigger emergency access */
  triggerConditions: string[];
  /** Audit requirements for emergency access */
  auditRequirements: string[];
  /** Time limit for emergency access (in hours) */
  timeLimit?: number;
}

/**
 * ACCESS CONDITIONS SYSTEM
 * Flexible condition system that allows templates to specify
 * additional requirements beyond basic role-based access.
 */
export interface AccessCondition {
  /** Type of condition */
  type: 'project_phase' | 'certification' | 'approval_status' | 'time_based';
  /** Condition parameters */
  parameters: Record<string, any>;
  /** Human-readable description */
  description: string;
}

/**
 * TIME-BASED ACCESS RESTRICTIONS
 * Allows templates to restrict access based on time of day,
 * days of week, or project timeline phases.
 */
export interface TimeRestriction {
  /** Days of week when access is allowed (0-6, 0=Sunday) */
  allowedDays?: number[];
  /** Time range when access is allowed */
  allowedHours?: {
    start: string; // HH:MM format
    end: string; // HH:MM format
  };
  /** Timezone for time restrictions */
  timezone: string;
}

/**
 * TEMPLATE PROPOSAL SYSTEM
 * Manages the lifecycle of template changes through the DAO
 * voting process, including proposal details and voting status.
 */
export interface TemplateProposal {
  /** Unique proposal identifier */
  proposalId: string;
  /** Template being proposed */
  template: DataSharingTemplate;
  /** Proposal details */
  proposalDetails: {
    title: string;
    rationale: string; // Why this change is needed
    impactAssessment: string; // Expected impact on stakeholders
  };
  /** Voting status */
  votingStatus: {
    votesFor: number;
    votesAgainst: number;
    abstentions: number;
    totalVotingPower: number; // Total possible votes
    currentQuorum: number; // Current participation %
  };
  /** Timeline */
  timeline: {
    submitted: Date;
    votingStarts: Date;
    votingEnds: Date;
    implementationDate?: Date; // When approved template takes effect
  };
}

/**
 * INDIVIDUAL VOTE RECORD
 * Tracks each stakeholder's vote on template proposals
 * for transparency and audit purposes.
 */
export interface TemplateVote {
  /** Voter address or identifier */
  voter: string;
  /** Stakeholder role of voter */
  role: DAOStakeholderRole;
  /** Vote decision */
  decision: 'for' | 'against' | 'abstain';
  /** Voting power used */
  votingPower: number;
  /** Vote timestamp */
  timestamp: Date;
  /** Optional comment explaining vote rationale */
  comment?: string;
}

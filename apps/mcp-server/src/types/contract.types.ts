/**
 * Contract Types - CO-M1
 *
 * Type definitions for Contract Onboarding system.
 * Transforms legal documents into operational project configurations.
 *
 * Supported Contract Families:
 * - AIA (American Institute of Architects)
 * - CCDC (Canadian Construction Documents Committee)
 * - ConsensusDOCS
 * - FIDIC (International)
 * - NEC (UK)
 *
 * @see .roadmap/features/contract-onboarding/FEATURE.json
 * @version 1.0.0
 */

import { AuthorityLevel } from './pm.types.js';

// ============================================================================
// URN Types
// ============================================================================

/**
 * Contract URN pattern: urn:luhtech:{tenant}:contract:CON-YYYY-NNNN
 */
export type ContractURN = `urn:luhtech:${string}:contract:CON-${string}-${string}`;

/**
 * Contract Party URN pattern: urn:luhtech:{tenant}:contract-party:PTY-YYYY-NNNN
 */
export type ContractPartyURN = `urn:luhtech:${string}:contract-party:PTY-${string}-${string}`;

/**
 * Contract Template URN pattern: urn:luhtech:ectropy:contract-template:{family}-{type}
 */
export type ContractTemplateURN = `urn:luhtech:ectropy:contract-template:${string}`;

// ============================================================================
// Contract Family & Types
// ============================================================================

/**
 * Contract document family
 */
export enum ContractFamily {
  AIA = 'AIA',
  CONSENSUSDOCS = 'ConsensusDOCS',
  CCDC = 'CCDC',
  FIDIC = 'FIDIC',
  NEC = 'NEC',
  CUSTOM = 'Custom',
}

/**
 * Contract type classification
 */
export enum ContractType {
  IPD_MULTI_PARTY = 'IPD-MultiParty',
  IPD_SPE = 'IPD-SPE',
  GMP = 'GMP',
  STIPULATED_SUM = 'StipulatedSum',
  COST_PLUS = 'CostPlus',
  DESIGN_BUILD = 'DesignBuild',
  CMAR = 'CMAR',
}

/**
 * Project delivery method
 */
export enum DeliveryMethod {
  IPD = 'IPD',
  DBB = 'DBB', // Design-Bid-Build
  DB = 'DB', // Design-Build
  CMAR = 'CMAR', // Construction Manager at Risk
  CM_ADVISOR = 'CMAdvisor',
  ALLIANCE = 'Alliance',
}

/**
 * Contract party role
 */
export enum ContractPartyRole {
  OWNER = 'Owner',
  ARCHITECT = 'Architect',
  CONTRACTOR = 'Contractor',
  KEY_PARTICIPANT = 'KeyParticipant',
  CONSULTANT = 'Consultant',
  DESIGN_BUILDER = 'DesignBuilder',
  CM_AT_RISK = 'CMAtRisk',
  SUBCONTRACTOR = 'Subcontractor',
}

// ============================================================================
// Contract Template Types
// ============================================================================

/**
 * Extraction rule for a specific field
 */
export interface ExtractionRule {
  /** Field path in output schema */
  fieldPath: string;

  /** Extraction method */
  method: 'regex' | 'llm' | 'pattern' | 'table' | 'date';

  /** Pattern or prompt for extraction (string or RegExp) */
  pattern?: string | RegExp;

  /** LLM prompt for complex extraction */
  llmPrompt?: string;

  /** Article/section hint for locating data */
  articleHint?: string[];

  /** Expected data type */
  dataType: 'string' | 'number' | 'date' | 'boolean' | 'array' | 'object';

  /** Is this field required */
  required: boolean;

  /** Default value if not found */
  defaultValue?: unknown;

  /** Validation regex or function name */
  validation?: string;

  /** Confidence threshold for automatic acceptance */
  confidenceThreshold: number;
}

/**
 * Authority role mapping from contract to 7-tier
 */
export interface AuthorityRoleMapping {
  /** Contract role (as written in document) */
  contractRole: string;

  /** Mapped Ectropy authority level */
  authorityLevel: AuthorityLevel;

  /** Participant role in project */
  participantRole?: ContractPartyRole;

  /** Default permissions */
  permissions?: string[];

  /** Can this role approve decisions */
  canApprove: boolean;

  /** Can this role escalate decisions */
  canEscalate?: boolean;

  /** Budget limit for this role (number or 'design' | 'project' | 'unlimited') */
  budgetLimit?: number | 'design' | 'project' | 'unlimited';
}

/**
 * Contract template for extraction
 */
export interface ContractTemplate {
  /** Template URN */
  urn: ContractTemplateURN;

  /** Contract family (AIA, CCDC, etc.) */
  family: ContractFamily;

  /** Specific contract number (C191-2009, A133-2019, CCDC 2-2020) */
  contractNumber: string;

  /** Contract type classification */
  contractType: ContractType;

  /** Delivery method */
  deliveryMethod: DeliveryMethod;

  /** Display name */
  displayName: string;

  /** Description */
  description: string;

  /** Version of this template */
  version: string;

  /** Document structure expectations */
  documentStructure: {
    /** Expected article/section headers */
    articles: Array<{
      number: string;
      title: string;
      purpose?: string;
      required?: boolean;
    }>;

    /** Expected exhibits */
    exhibits: Array<{
      id: string;
      title: string;
      required?: boolean;
    }> | string[];

    /** Key clauses to extract */
    keyClauses?: string[];
  };

  /** Extraction rules for each field */
  extractionRules: ExtractionRule[];

  /** Default authority role mappings */
  authorityMappings: AuthorityRoleMapping[];

  /** IPD-specific governance template (if applicable) */
  ipdGovernance?: {
    hasPMT: boolean;
    pmtName?: string;
    pmtVotingRule?: 'majority' | 'unanimous' | 'supermajority';
    pmtVotingDefault?: 'majority' | 'unanimous' | 'supermajority';
    pmtVotingThreshold?: number;
    pmtVotingWindow?: number; // hours
    hasPET: boolean;
    petName?: string;
    petVotingRule?: 'majority' | 'unanimous' | 'supermajority';
    petEscalationThreshold?: number;
    petEscalationTriggers?: string[];
    riskRewardSharing?: {
      owner: number;
      architect: number;
      constructor: number;
    };
  };

  /** Validation rules for extracted data */
  validationRules?: Array<{
    name: string;
    description: string;
    rule: string;
  }>;
}

// ============================================================================
// Extraction Types
// ============================================================================

/**
 * Confidence score for extracted data
 */
export interface ExtractionConfidence {
  /** Overall confidence (0-1) */
  overall: number;

  /** Per-field confidence */
  fields: Record<string, number>;

  /** Fields flagged for review */
  flaggedFields: string[];

  /** Reasons for flags */
  flagReasons: Record<string, string>;
}

/**
 * Source location in document
 */
export interface SourceLocation {
  /** Page number (1-indexed) */
  page: number;

  /** Article/section reference */
  article?: string;

  /** Paragraph or clause number */
  paragraph?: string;

  /** Character offset */
  charOffset?: number;

  /** Extracted text snippet */
  snippet: string;
}

/**
 * Extracted field with provenance
 */
export interface ExtractedField<T = unknown> {
  /** Extracted value */
  value: T;

  /** Confidence score (0-1) */
  confidence: number;

  /** Source location(s) */
  sources: SourceLocation[];

  /** Extraction method used */
  method: ExtractionRule['method'];

  /** Whether human review is needed */
  needsReview: boolean;

  /** Reason for review */
  reviewReason?: string;

  /** Suggested alternatives if ambiguous */
  alternatives?: T[];
}

/**
 * Contract party extracted from document
 */
export interface ExtractedParty {
  /** Party name */
  name: ExtractedField<string>;

  /** Party role */
  role: ExtractedField<ContractPartyRole>;

  /** Address */
  address?: ExtractedField<string>;

  /** Primary contact email */
  email?: ExtractedField<string>;

  /** Phone */
  phone?: ExtractedField<string>;

  /** IPD configuration (if applicable) */
  ipdConfig?: {
    pmtMember: ExtractedField<boolean>;
    petMember: ExtractedField<boolean>;
    votingWeight?: ExtractedField<number>;
    savingsShare?: ExtractedField<number>;
    atRiskAmount?: ExtractedField<number>;
  };

  /** Mapped authority level */
  mappedAuthorityLevel: AuthorityLevel;
}

/**
 * Financial terms extracted from contract
 */
export interface ExtractedFinancialTerms {
  /** Total contract value */
  contractValue?: ExtractedField<number>;

  /** IPD Target Cost */
  targetCost?: ExtractedField<number>;

  /** Guaranteed Maximum Price */
  gmp?: ExtractedField<number>;

  /** Contingency amount/percentage */
  contingency?: ExtractedField<number>;

  /** Currency */
  currency: ExtractedField<string>;

  /** Savings distribution (IPD) */
  savingsDistribution?: {
    ownerShare: ExtractedField<number>;
    designTeamShare: ExtractedField<number>;
    constructionTeamShare: ExtractedField<number>;
  };

  /** Overrun distribution */
  overrunDistribution?: {
    atRiskPool: ExtractedField<number>;
    ownerResponsibility: ExtractedField<number>;
  };
}

/**
 * Key dates extracted from contract
 */
export interface ExtractedDates {
  /** Contract execution date */
  executionDate?: ExtractedField<string>;

  /** Project commencement date */
  commencementDate?: ExtractedField<string>;

  /** Substantial completion date */
  substantialCompletion?: ExtractedField<string>;

  /** Final completion date */
  finalCompletion?: ExtractedField<string>;

  /** Warranty expiration */
  warrantyExpiration?: ExtractedField<string>;
}

/**
 * Governance structure extracted from contract
 */
export interface ExtractedGovernance {
  /** Has Project Management Team */
  hasPMT: ExtractedField<boolean>;

  /** Has Project Executive Team */
  hasPET: ExtractedField<boolean>;

  /** PMT voting rules */
  pmtVoting?: {
    quorum: ExtractedField<'majority' | 'unanimous' | 'supermajority'>;
    decisionThreshold: ExtractedField<number>;
    votingWindowHours: ExtractedField<number>;
  };

  /** PET escalation triggers */
  petEscalationTriggers?: ExtractedField<string[]>;
}

/**
 * Full extraction result from a contract
 */
export interface ContractExtractionResult {
  /** Extraction ID */
  extractionId: string;

  /** Source document info */
  sourceDocument: {
    filename: string;
    mimeType: string;
    pageCount: number;
    sha256Hash: string;
    storageUri?: string;
  };

  /** Template used for extraction */
  templateUsed: ContractTemplateURN;

  /** Contract identification */
  contractInfo: {
    family: ExtractedField<ContractFamily>;
    type: ExtractedField<ContractType>;
    deliveryMethod: ExtractedField<DeliveryMethod>;
    contractNumber?: ExtractedField<string>;
  };

  /** Extracted parties */
  parties: ExtractedParty[];

  /** Financial terms */
  financialTerms: ExtractedFinancialTerms;

  /** Key dates */
  dates: ExtractedDates;

  /** Governance structure */
  governance: ExtractedGovernance;

  /** Overall confidence */
  confidence: ExtractionConfidence;

  /** Items requiring human review */
  reviewItems: ReviewItem[];

  /** Extraction timestamps */
  timestamps: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };
}

// ============================================================================
// Authority Mapping Types
// ============================================================================

/**
 * Authority cascade configuration from contract
 */
export interface ContractAuthorityCascade {
  /** Contract URN */
  contractUrn: ContractURN;

  /** Level 0: Field workers */
  level0_FIELD: string[];

  /** Level 1: Foreman */
  level1_FOREMAN: string[];

  /** Level 2: Superintendent */
  level2_SUPERINTENDENT: string[];

  /** Level 3: Project Manager */
  level3_PM: string[];

  /** Level 4: Architect/Engineer */
  level4_ARCHITECT: string[];

  /** Level 5: Owner */
  level5_OWNER: string[];

  /** Level 6: Regulatory */
  level6_REGULATORY: string[];

  /** PMT authority (IPD) */
  pmtAuthority?: {
    budgetLimit: number;
    scheduleLimitDays: number;
    members: string[];
  };

  /** PET authority (IPD) */
  petAuthority?: {
    budgetLimit: 'unlimited' | number;
    scheduleLimitDays: 'unlimited' | number;
    members: string[];
  };
}

/**
 * Mapped participant from contract party
 */
export interface MappedParticipant {
  /** Contract party reference */
  contractPartyUrn: ContractPartyURN;

  /** Participant name */
  name: string;

  /** Email */
  email: string;

  /** Company */
  company: string;

  /** Authority level (0-6) */
  authorityLevel: AuthorityLevel;

  /** Role in project */
  role: ContractPartyRole;

  /** Permissions */
  permissions: string[];

  /** Can approve decisions */
  canApprove: boolean;

  /** Can escalate decisions */
  canEscalate: boolean;

  /** PMT member */
  isPMTMember: boolean;

  /** PET member */
  isPETMember: boolean;
}

// ============================================================================
// Project Configuration Types
// ============================================================================

/**
 * Project configuration generated from contract
 */
export interface ProjectConfiguration {
  /** Generated project URN */
  projectUrn: string;

  /** Contract that generated this config */
  sourceContractUrn: ContractURN;

  /** Tenant for multi-tenant */
  tenantConfig: {
    tenantId: string;
    tenantSlug: string;
    dataRegion: string;
    complianceFlags: string[];
  };

  /** Project basic info */
  projectInfo: {
    name: string;
    description?: string;
    status: 'planning' | 'active';
    totalBudget?: number;
    startDate?: string;
    expectedCompletion?: string;
  };

  /** Authority cascade */
  authorityCascade: ContractAuthorityCascade;

  /** Participants to create */
  participants: MappedParticipant[];

  /** Governance configuration */
  governance: {
    hasPMT: boolean;
    hasPET: boolean;
    pmtConfig?: {
      quorum: 'majority' | 'unanimous' | 'supermajority';
      decisionThreshold: number;
      votingWindowHours: number;
    };
    petConfig?: {
      escalationTriggers: string[];
    };
  };

  /** Initial voxel grid configuration (optional) */
  voxelGridConfig?: {
    unitSize: number;
    bounds: {
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
      minZ: number;
      maxZ: number;
    };
  };
}

/**
 * Project configuration result
 */
export interface ProjectConfigurationResult {
  /** Success status */
  success: boolean;

  /** Configuration applied */
  configuration: ProjectConfiguration;

  /** Created entities */
  created: {
    tenantId?: string;
    projectId: string;
    participantIds: string[];
    authorityLevelIds: number[];
  };

  /** Warnings */
  warnings: string[];

  /** Errors (if any) */
  errors: string[];

  /** Configuration timestamp */
  configuredAt: string;
}

// ============================================================================
// Parsing Types
// ============================================================================

/**
 * Document parsing input
 */
export interface ParseContractInput {
  /** Document content (base64 for binary, text for plain) */
  content: string;

  /** Document filename */
  filename: string;

  /** MIME type (optional - inferred from filename if not provided) */
  mimeType?: 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' | 'text/plain';

  /** Optional template override */
  templateUrn?: ContractTemplateURN;

  /** Tenant ID (for multi-tenant) */
  tenantId?: string;

  /** Skip LLM extraction (for testing) */
  skipLLM?: boolean;
}

/**
 * Document parsing result
 */
export interface ParseContractResult {
  /** Success status */
  success: boolean;

  /** Extraction result */
  extraction?: ContractExtractionResult;

  /** Suggested template if not provided */
  suggestedTemplate?: ContractTemplateURN;

  /** Template match confidence */
  templateConfidence?: number;

  /** Errors */
  errors: string[];

  /** Parsing duration */
  durationMs: number;
}

// ============================================================================
// Human Review Types
// ============================================================================

/**
 * Review item for human validation
 */
export interface ReviewItem {
  /** Unique ID */
  id: string;

  /** Field path */
  fieldPath: string;

  /** Current extracted value */
  currentValue: unknown;

  /** AI suggested value (if different) */
  suggestedValue?: unknown;

  /** Confidence score */
  confidence: number;

  /** Source locations */
  sources: SourceLocation[];

  /** Reason for review */
  reason: string;

  /** Review status */
  status: 'pending' | 'approved' | 'modified' | 'rejected';

  /** Modified value (if status is 'modified') */
  modifiedValue?: unknown;

  /** Reviewer info */
  reviewer?: {
    userId: string;
    name: string;
    reviewedAt: string;
  };
}

/**
 * Human review session
 */
export interface ReviewSession {
  /** Session ID */
  sessionId: string;

  /** Extraction ID */
  extractionId: string;

  /** Contract URN (if created) */
  contractUrn?: ContractURN;

  /** Review items */
  items: ReviewItem[];

  /** Total items */
  totalItems: number;

  /** Reviewed count */
  reviewedCount: number;

  /** Session status */
  status: 'in_progress' | 'completed' | 'cancelled';

  /** Created at */
  createdAt: string;

  /** Completed at */
  completedAt?: string;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Contract onboarding event types
 */
export const CONTRACT_EVENT_TYPES = {
  CONTRACT_UPLOADED: 'contract:uploaded',
  CONTRACT_PARSING_STARTED: 'contract:parsing:started',
  CONTRACT_PARSING_COMPLETED: 'contract:parsing:completed',
  CONTRACT_PARSING_FAILED: 'contract:parsing:failed',
  CONTRACT_REVIEW_STARTED: 'contract:review:started',
  CONTRACT_REVIEW_COMPLETED: 'contract:review:completed',
  CONTRACT_CONFIGURED: 'contract:configured',
  PROJECT_CREATED_FROM_CONTRACT: 'project:created-from-contract',
  AUTHORITY_CASCADE_CONFIGURED: 'authority:cascade:configured',
  PARTICIPANTS_CREATED: 'participants:created',
} as const;

export type ContractEventType = (typeof CONTRACT_EVENT_TYPES)[keyof typeof CONTRACT_EVENT_TYPES];

// ============================================================================
// Constants
// ============================================================================

/**
 * Default confidence thresholds
 */
export const CONFIDENCE_THRESHOLDS = {
  /** Auto-accept threshold */
  AUTO_ACCEPT: 0.95,

  /** Flag for review threshold */
  REVIEW_THRESHOLD: 0.7,

  /** Reject threshold */
  REJECT_THRESHOLD: 0.3,
} as const;

/**
 * Supported contract templates
 */
export const SUPPORTED_CONTRACTS = {
  'AIA-C191-2009': {
    family: ContractFamily.AIA,
    type: ContractType.IPD_MULTI_PARTY,
    deliveryMethod: DeliveryMethod.IPD,
    priority: 'HIGH',
  },
  'AIA-A133-2019': {
    family: ContractFamily.AIA,
    type: ContractType.GMP,
    deliveryMethod: DeliveryMethod.CMAR,
    priority: 'HIGH',
  },
  'AIA-A101-2017': {
    family: ContractFamily.AIA,
    type: ContractType.STIPULATED_SUM,
    deliveryMethod: DeliveryMethod.DBB,
    priority: 'MEDIUM',
  },
  'CCDC-2-2020': {
    family: ContractFamily.CCDC,
    type: ContractType.STIPULATED_SUM,
    deliveryMethod: DeliveryMethod.DBB,
    priority: 'HIGH', // Critical for Canadian pilot
  },
  'CCDC-5B': {
    family: ContractFamily.CCDC,
    type: ContractType.CMAR,
    deliveryMethod: DeliveryMethod.CMAR,
    priority: 'MEDIUM',
  },
  'ConsensusDOCS-300': {
    family: ContractFamily.CONSENSUSDOCS,
    type: ContractType.IPD_MULTI_PARTY,
    deliveryMethod: DeliveryMethod.IPD,
    priority: 'MEDIUM',
  },
} as const;

/**
 * Default authority mappings by contract party role
 */
export const DEFAULT_AUTHORITY_MAPPINGS: Record<ContractPartyRole, AuthorityLevel> = {
  [ContractPartyRole.OWNER]: AuthorityLevel.OWNER,
  [ContractPartyRole.ARCHITECT]: AuthorityLevel.ARCHITECT,
  [ContractPartyRole.CONTRACTOR]: AuthorityLevel.PM,
  [ContractPartyRole.KEY_PARTICIPANT]: AuthorityLevel.PM,
  [ContractPartyRole.CONSULTANT]: AuthorityLevel.ARCHITECT,
  [ContractPartyRole.DESIGN_BUILDER]: AuthorityLevel.PM,
  [ContractPartyRole.CM_AT_RISK]: AuthorityLevel.PM,
  [ContractPartyRole.SUBCONTRACTOR]: AuthorityLevel.SUPERINTENDENT,
};

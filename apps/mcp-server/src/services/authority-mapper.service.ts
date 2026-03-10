/**
 * Authority Mapper Service - CO-M3
 *
 * Maps contract party roles to the 7-tier authority cascade.
 * Bridges extracted contract data to project participant configuration.
 *
 * Authority Levels:
 * 0 - FIELD: Field workers, auto-approve small items
 * 1 - FOREMAN: Trade foreman, $500 budget
 * 2 - SUPERINTENDENT: Site superintendent, $5,000 budget
 * 3 - PM: Project Manager, $50,000 budget
 * 4 - ARCHITECT: Design authority, design changes
 * 5 - OWNER: Project owner, major decisions
 * 6 - REGULATORY: Code/safety authority
 *
 * @see .roadmap/features/contract-onboarding/FEATURE.json
 * @version 1.0.0
 */

import {
  ContractPartyRole,
  type ContractExtractionResult,
  type ExtractedParty,
  type ContractAuthorityCascade,
  type MappedParticipant,
  type ProjectConfiguration,
  type ContractURN,
  type ContractPartyURN,
  DEFAULT_AUTHORITY_MAPPINGS,
} from '../types/contract.types.js';

import { AuthorityLevel } from '../types/pm.types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Validation result for authority cascade
 */
export interface CascadeValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Authority conflict detection result
 */
export interface AuthorityConflictResult {
  hasConflicts: boolean;
  conflicts: Array<{
    level: AuthorityLevel;
    parties: string[];
    resolution?: string;
  }>;
}

/**
 * Escalation path definition
 */
export interface EscalationPath {
  fromLevel: AuthorityLevel;
  toLevel: AuthorityLevel | null;
  autoEscalateAfterHours?: number;
  conditions?: string[];
}

/**
 * PMT/PET authority configuration
 */
export interface TeamAuthorityConfig {
  budgetLimit: number | 'unlimited';
  scheduleLimitDays: number | 'unlimited';
  members: string[];
}

/**
 * IPD governance configuration
 */
export interface IPDGovernanceConfig {
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
}

/**
 * Tenant configuration options
 */
export interface TenantConfigOptions {
  isCanadian?: boolean;
  customRegion?: string;
  additionalCompliance?: string[];
}

/**
 * Project configuration options
 */
export interface ProjectConfigOptions {
  tenantId: string;
  tenantSlug: string;
  projectName: string;
  description?: string;
  customVoxelGrid?: {
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

// ============================================================================
// Authority Mapping
// ============================================================================

/**
 * Levels that can have multiple parties without conflict
 */
const MULTI_PARTY_LEVELS = [
  AuthorityLevel.FIELD,
  AuthorityLevel.FOREMAN,
  AuthorityLevel.SUPERINTENDENT,
  AuthorityLevel.PM,
];

/**
 * Map a contract party role to authority level
 *
 * @param role - Contract party role
 * @returns Authority level
 */
export function mapContractRoleToAuthority(role: ContractPartyRole): AuthorityLevel {
  return DEFAULT_AUTHORITY_MAPPINGS[role] ?? AuthorityLevel.PM;
}

/**
 * Map all parties to their authority levels
 *
 * @param parties - Extracted parties from contract
 * @returns Mapped authority information
 */
export function mapPartiesToAuthority(
  parties: ExtractedParty[]
): Array<{
  name: string;
  email: string;
  role: ContractPartyRole;
  authorityLevel: AuthorityLevel;
}> {
  return parties.map(party => ({
    name: party.name.value,
    email: party.email?.value ?? '',
    role: party.role.value,
    authorityLevel: party.mappedAuthorityLevel ?? mapContractRoleToAuthority(party.role.value),
  }));
}

/**
 * Build authority cascade from extracted parties
 *
 * @param parties - Extracted parties
 * @param contractUrn - Contract URN
 * @returns Authority cascade configuration
 */
export function buildAuthorityCascade(
  parties: ExtractedParty[],
  contractUrn: ContractURN
): ContractAuthorityCascade {
  const cascade: ContractAuthorityCascade = {
    contractUrn,
    level0_FIELD: [],
    level1_FOREMAN: [],
    level2_SUPERINTENDENT: [],
    level3_PM: [],
    level4_ARCHITECT: [],
    level5_OWNER: [],
    level6_REGULATORY: [],
  };

  for (const party of parties) {
    const level = party.mappedAuthorityLevel ?? mapContractRoleToAuthority(party.role.value);
    const name = party.name.value;

    switch (level) {
      case AuthorityLevel.FIELD:
        cascade.level0_FIELD.push(name);
        break;
      case AuthorityLevel.FOREMAN:
        cascade.level1_FOREMAN.push(name);
        break;
      case AuthorityLevel.SUPERINTENDENT:
        cascade.level2_SUPERINTENDENT.push(name);
        break;
      case AuthorityLevel.PM:
        cascade.level3_PM.push(name);
        break;
      case AuthorityLevel.ARCHITECT:
        cascade.level4_ARCHITECT.push(name);
        break;
      case AuthorityLevel.OWNER:
        cascade.level5_OWNER.push(name);
        break;
      case AuthorityLevel.REGULATORY:
        cascade.level6_REGULATORY.push(name);
        break;
    }
  }

  // Add PMT/PET configuration for IPD contracts
  const pmtMembers = identifyPMTMembers(parties);
  const petMembers = identifyPETMembers(parties);

  if (pmtMembers.length > 0) {
    cascade.pmtAuthority = {
      budgetLimit: 100000, // Default, can be overridden
      scheduleLimitDays: 30,
      members: pmtMembers.map(m => m.name.value),
    };
  }

  if (petMembers.length > 0) {
    cascade.petAuthority = {
      budgetLimit: 'unlimited',
      scheduleLimitDays: 'unlimited',
      members: petMembers.map(m => m.name.value),
    };
  }

  return cascade;
}

/**
 * Validate authority cascade
 *
 * @param cascade - Authority cascade to validate
 * @returns Validation result
 */
export function validateAuthorityCascade(
  cascade: ContractAuthorityCascade
): CascadeValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Must have at least one owner
  if (cascade.level5_OWNER.length === 0) {
    errors.push('Authority cascade must have at least one Owner');
  }

  // Warn if no architect
  if (cascade.level4_ARCHITECT.length === 0) {
    warnings.push('No Architect defined at level 4');
  }

  // Warn if no PM
  if (cascade.level3_PM.length === 0) {
    warnings.push('No Project Manager defined at level 3');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Participant Mapping
// ============================================================================

/**
 * Generate a contract party URN
 */
function generatePartyURN(index: number): ContractPartyURN {
  const year = new Date().getFullYear();
  const seq = String(index + 1).padStart(4, '0');
  return `urn:luhtech:ectropy:contract-party:PTY-${year}-${seq}` as ContractPartyURN;
}

/**
 * Map a single party to a participant
 *
 * @param party - Extracted party
 * @param partyUrn - Contract party URN
 * @returns Mapped participant
 */
export function mapPartyToParticipant(
  party: ExtractedParty,
  partyUrn: ContractPartyURN
): MappedParticipant {
  const authorityLevel = party.mappedAuthorityLevel ?? mapContractRoleToAuthority(party.role.value);

  // Determine permissions based on authority level
  const permissions: string[] = [];
  if (authorityLevel >= AuthorityLevel.PM) {
    permissions.push('approve_construction');
  }
  if (authorityLevel >= AuthorityLevel.ARCHITECT) {
    permissions.push('approve_design');
  }
  if (authorityLevel >= AuthorityLevel.OWNER) {
    permissions.push('approve_all');
  }
  permissions.push('view_own', 'escalate');

  return {
    contractPartyUrn: partyUrn,
    name: party.name.value,
    email: party.email?.value ?? '',
    company: party.name.value, // Company is often same as party name
    authorityLevel,
    role: party.role.value,
    permissions,
    canApprove: authorityLevel >= AuthorityLevel.SUPERINTENDENT,
    canEscalate: true,
    isPMTMember: party.ipdConfig?.pmtMember?.value ?? false,
    isPETMember: party.ipdConfig?.petMember?.value ?? false,
  };
}

/**
 * Map all parties to participants
 *
 * @param parties - Extracted parties
 * @returns Mapped participants
 */
export function mapAllPartiesToParticipants(parties: ExtractedParty[]): MappedParticipant[] {
  return parties.map((party, index) => {
    const partyUrn = generatePartyURN(index);
    return mapPartyToParticipant(party, partyUrn);
  });
}

/**
 * Resolve authority conflicts
 *
 * @param parties - Parties to check for conflicts
 * @returns Conflict result
 */
export function resolveAuthorityConflicts(parties: ExtractedParty[]): AuthorityConflictResult {
  const conflicts: AuthorityConflictResult['conflicts'] = [];

  // Group parties by authority level
  const byLevel = new Map<AuthorityLevel, ExtractedParty[]>();

  for (const party of parties) {
    const level = party.mappedAuthorityLevel ?? mapContractRoleToAuthority(party.role.value);

    if (!byLevel.has(level)) {
      byLevel.set(level, []);
    }
    byLevel.get(level)!.push(party);
  }

  // Check for conflicts at levels that should be unique
  for (const [level, levelParties] of byLevel) {
    // Owner level should typically have one party
    if (level === AuthorityLevel.OWNER && levelParties.length > 1) {
      conflicts.push({
        level,
        parties: levelParties.map(p => p.name.value),
        resolution: 'Multiple owners detected - verify contract structure',
      });
    }

    // Multi-party levels are OK
    if (MULTI_PARTY_LEVELS.includes(level)) {
      continue;
    }
  }

  return {
    hasConflicts: conflicts.length > 0,
    conflicts,
  };
}

// ============================================================================
// IPD Governance Mapping
// ============================================================================

/**
 * Identify PMT members from parties
 *
 * @param parties - Extracted parties
 * @returns Parties that are PMT members
 */
export function identifyPMTMembers(parties: ExtractedParty[]): ExtractedParty[] {
  return parties.filter(p => p.ipdConfig?.pmtMember?.value === true);
}

/**
 * Identify PET members from parties
 *
 * @param parties - Extracted parties
 * @returns Parties that are PET members
 */
export function identifyPETMembers(parties: ExtractedParty[]): ExtractedParty[] {
  return parties.filter(p => p.ipdConfig?.petMember?.value === true);
}

/**
 * Configure PMT authority
 *
 * @param parties - Extracted parties
 * @param config - PMT configuration overrides
 * @returns PMT authority configuration
 */
export function configurePMTAuthority(
  parties: ExtractedParty[],
  config: Partial<TeamAuthorityConfig>
): TeamAuthorityConfig {
  const pmtMembers = identifyPMTMembers(parties);

  return {
    budgetLimit: config.budgetLimit ?? 100000,
    scheduleLimitDays: config.scheduleLimitDays ?? 30,
    members: pmtMembers.map(m => m.name.value),
  };
}

/**
 * Configure PET authority
 *
 * @param parties - Extracted parties
 * @param config - PET configuration overrides
 * @returns PET authority configuration
 */
export function configurePETAuthority(
  parties: ExtractedParty[],
  config: Partial<TeamAuthorityConfig>
): TeamAuthorityConfig {
  const petMembers = identifyPETMembers(parties);

  return {
    budgetLimit: config.budgetLimit ?? 'unlimited',
    scheduleLimitDays: config.scheduleLimitDays ?? 'unlimited',
    members: petMembers.map(m => m.name.value),
  };
}

/**
 * Map complete IPD governance structure
 *
 * @param extraction - Contract extraction result
 * @returns IPD governance configuration
 */
export function mapIPDGovernance(extraction: ContractExtractionResult): IPDGovernanceConfig {
  const governance = extraction.governance;

  return {
    hasPMT: governance?.hasPMT?.value ?? false,
    hasPET: governance?.hasPET?.value ?? false,
    pmtConfig: governance?.pmtVoting
      ? {
          quorum: governance.pmtVoting.quorum?.value ?? 'majority',
          decisionThreshold: governance.pmtVoting.decisionThreshold?.value ?? 100000,
          votingWindowHours: governance.pmtVoting.votingWindowHours?.value ?? 72,
        }
      : undefined,
    petConfig: governance?.petEscalationTriggers
      ? {
          escalationTriggers: governance.petEscalationTriggers.value ?? [],
        }
      : undefined,
  };
}

// ============================================================================
// Project Configuration
// ============================================================================

/**
 * Get default tenant configuration
 *
 * @param options - Configuration options
 * @returns Default tenant config
 */
export function getDefaultTenantConfig(options: TenantConfigOptions = {}): {
  dataRegion: string;
  complianceFlags: string[];
} {
  const complianceFlags = ['SOC2'];

  if (options.isCanadian) {
    complianceFlags.push('PIPEDA');
    return {
      dataRegion: options.customRegion ?? 'ca-central-1',
      complianceFlags: [...complianceFlags, ...(options.additionalCompliance ?? [])],
    };
  }

  return {
    dataRegion: options.customRegion ?? 'us-west-2',
    complianceFlags: [...complianceFlags, ...(options.additionalCompliance ?? [])],
  };
}

/**
 * Build complete project configuration from extraction
 *
 * @param extraction - Contract extraction result
 * @param options - Project configuration options
 * @returns Project configuration
 */
export function buildProjectConfiguration(
  extraction: ContractExtractionResult,
  options: ProjectConfigOptions
): ProjectConfiguration {
  const parties = extraction.parties ?? [];

  // Build authority cascade
  const contractUrn = `urn:luhtech:${options.tenantSlug}:contract:CON-${
    new Date().getFullYear()
  }-0001` as ContractURN;
  const authorityCascade = buildAuthorityCascade(parties, contractUrn);

  // Map participants
  const participants = mapAllPartiesToParticipants(parties);

  // Map governance
  const ipdGovernance = mapIPDGovernance(extraction);

  // Determine if Canadian (for PIPEDA compliance)
  const isCanadian =
    extraction.contractInfo?.family?.value === 'CCDC' ||
    extraction.templateUsed?.includes('CCDC');

  const tenantDefaults = getDefaultTenantConfig({ isCanadian });

  // Build project URN
  const projectUrn = `urn:luhtech:${options.tenantSlug}:project:PRJ-${
    new Date().getFullYear()
  }-0001`;

  return {
    projectUrn,
    sourceContractUrn: contractUrn,
    tenantConfig: {
      tenantId: options.tenantId,
      tenantSlug: options.tenantSlug,
      dataRegion: tenantDefaults.dataRegion,
      complianceFlags: tenantDefaults.complianceFlags,
    },
    projectInfo: {
      name: options.projectName,
      description: options.description,
      status: 'planning',
      totalBudget:
        extraction.financialTerms?.targetCost?.value ??
        extraction.financialTerms?.contractValue?.value,
      startDate: extraction.dates?.commencementDate?.value,
      expectedCompletion: extraction.dates?.substantialCompletion?.value,
    },
    authorityCascade,
    participants,
    governance: ipdGovernance,
    voxelGridConfig: options.customVoxelGrid,
  };
}

/**
 * Validate project configuration
 *
 * @param config - Project configuration
 * @returns Validation result
 */
export function validateProjectConfiguration(
  config: ProjectConfiguration
): CascadeValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Must have participants
  if (!config.participants || config.participants.length === 0) {
    errors.push('Project must have at least one participant');
  }

  // Validate authority cascade
  const cascadeValidation = validateAuthorityCascade(config.authorityCascade);
  errors.push(...cascadeValidation.errors);
  warnings.push(...cascadeValidation.warnings);

  // Must have project name
  if (!config.projectInfo.name) {
    errors.push('Project must have a name');
  }

  // Check tenant config
  if (!config.tenantConfig.tenantId) {
    errors.push('Tenant ID is required');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Escalation Paths
// ============================================================================

/**
 * Build escalation paths for all authority levels
 *
 * @param cascade - Authority cascade
 * @returns Escalation paths
 */
export function buildEscalationPaths(cascade: ContractAuthorityCascade): EscalationPath[] {
  const paths: EscalationPath[] = [];

  for (let level = AuthorityLevel.FIELD; level <= AuthorityLevel.REGULATORY; level++) {
    const toLevel = level < AuthorityLevel.REGULATORY ? (level + 1) as AuthorityLevel : null;

    const path: EscalationPath = {
      fromLevel: level,
      toLevel,
    };

    // Set auto-escalation timeouts based on level
    switch (level) {
      case AuthorityLevel.FIELD:
        path.autoEscalateAfterHours = 2;
        break;
      case AuthorityLevel.FOREMAN:
        path.autoEscalateAfterHours = 4;
        break;
      case AuthorityLevel.SUPERINTENDENT:
        path.autoEscalateAfterHours = 24;
        break;
      case AuthorityLevel.PM:
        path.autoEscalateAfterHours = 48;
        break;
      case AuthorityLevel.ARCHITECT:
        path.autoEscalateAfterHours = 72;
        break;
      case AuthorityLevel.OWNER:
        path.autoEscalateAfterHours = 168; // 1 week
        break;
      case AuthorityLevel.REGULATORY:
        // No auto-escalation from regulatory
        break;
    }

    paths.push(path);
  }

  return paths;
}

/**
 * Get escalation path for a specific level
 *
 * @param cascade - Authority cascade
 * @param fromLevel - Starting authority level
 * @returns Next level or null
 */
export function getEscalationPathForLevel(
  cascade: ContractAuthorityCascade,
  fromLevel: AuthorityLevel
): AuthorityLevel | null {
  if (fromLevel >= AuthorityLevel.REGULATORY) {
    return null;
  }
  return (fromLevel + 1) as AuthorityLevel;
}

// ============================================================================
// Service Export
// ============================================================================

/**
 * Authority Mapper Service namespace
 */
export const AuthorityMapperService = {
  // Authority mapping
  mapContractRoleToAuthority,
  mapPartiesToAuthority,
  buildAuthorityCascade,
  validateAuthorityCascade,

  // Participant mapping
  mapPartyToParticipant,
  mapAllPartiesToParticipants,
  resolveAuthorityConflicts,

  // IPD governance
  identifyPMTMembers,
  identifyPETMembers,
  configurePMTAuthority,
  configurePETAuthority,
  mapIPDGovernance,

  // Project configuration
  getDefaultTenantConfig,
  buildProjectConfiguration,
  validateProjectConfiguration,

  // Escalation paths
  buildEscalationPaths,
  getEscalationPathForLevel,
};

export default AuthorityMapperService;

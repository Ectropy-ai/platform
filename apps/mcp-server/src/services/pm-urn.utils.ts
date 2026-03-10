/**
 * PM URN Utilities
 *
 * URN generation and validation for PM entities following the V3 graph pattern.
 *
 * URN Format: urn:luhtech:{projectId}:{nodeType}:{identifier}
 *
 * @see https://luhtech.dev/schemas/graph.json
 * @version 1.1.0
 */

import type {
  PMNodeType,
  PMURN,
  PMEdge,
  GraphMetadata,
} from '../types/pm.types.js';

// ============================================================================
// URN Pattern Constants
// ============================================================================

/**
 * URN regex pattern for PM entities
 */
export const PM_URN_PATTERN =
  /^urn:luhtech:[a-z][a-z0-9-]*:[a-z][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/;

/**
 * ID format patterns by node type
 */
export const ID_PATTERNS: Record<PMNodeType, RegExp> = {
  'pm-decision': /^dec-\d{4}-\d{4}$/i,
  voxel: /^vox-[a-z0-9-]+$/i,
  consequence: /^consq-\d{4}-\d{4}$/i,
  inspection: /^insp-\d{4}-\d{4}$/i,
  'schedule-proposal': /^prop-\d{4}-\d{4}$/i,
  participant: /^[a-z][a-z0-9-]*$/,
  'authority-level': /^pm-level-\d$/,
  'tolerance-override': /^tol-\d{4}-\d{4}$/i,
  'usf-profile': /^usfp-[a-z0-9-]+$/i,
  'usf-work-packet': /^usfwp-\d{4}-\d{4}$/i,
};

// ============================================================================
// ID Counters (in production, use database sequence)
// ============================================================================

/**
 * In-memory counters for ID generation.
 * In production, these should be replaced with database sequences.
 */
const idCounters: Map<string, number> = new Map();

/**
 * Get next sequential number for ID generation
 * Thread-safe in single-process Node.js
 *
 * @param type - Counter type key
 * @returns Next sequential number
 */
function getNextSequence(type: string): number {
  const current = idCounters.get(type) ?? 0;
  const next = current + 1;
  idCounters.set(type, next);
  return next;
}

/**
 * Reset ID counter (for testing)
 */
export function resetIdCounter(type: string): void {
  idCounters.set(type, 0);
}

/**
 * Reset all ID counters (for testing)
 */
export function resetAllIdCounters(): void {
  idCounters.clear();
}

/**
 * Set ID counter to specific value (for initialization from storage)
 */
export function setIdCounter(type: string, value: number): void {
  idCounters.set(type, value);
}

// ============================================================================
// ID Generation Functions
// ============================================================================

/**
 * Generate decision ID
 * Format: DEC-YYYY-NNNN
 *
 * @example
 * generateDecisionId() // "DEC-2026-0001"
 */
export function generateDecisionId(): string {
  const year = new Date().getFullYear();
  const seq = getNextSequence('decision');
  return `DEC-${year}-${seq.toString().padStart(4, '0')}`;
}

/**
 * Generate consequence ID
 * Format: CONSQ-YYYY-NNNN
 *
 * @example
 * generateConsequenceId() // "CONSQ-2026-0001"
 */
export function generateConsequenceId(): string {
  const year = new Date().getFullYear();
  const seq = getNextSequence('consequence');
  return `CONSQ-${year}-${seq.toString().padStart(4, '0')}`;
}

/**
 * Generate inspection ID
 * Format: INSP-YYYY-NNNN
 *
 * @example
 * generateInspectionId() // "INSP-2026-0001"
 */
export function generateInspectionId(): string {
  const year = new Date().getFullYear();
  const seq = getNextSequence('inspection');
  return `INSP-${year}-${seq.toString().padStart(4, '0')}`;
}

/**
 * Generate schedule proposal ID
 * Format: PROP-YYYY-NNNN
 *
 * @example
 * generateProposalId() // "PROP-2026-0001"
 */
export function generateProposalId(): string {
  const year = new Date().getFullYear();
  const seq = getNextSequence('proposal');
  return `PROP-${year}-${seq.toString().padStart(4, '0')}`;
}

/**
 * Generate tolerance override ID
 * Format: TOL-YYYY-NNNN
 *
 * @example
 * generateToleranceOverrideId() // "TOL-2026-0001"
 */
export function generateToleranceOverrideId(): string {
  const year = new Date().getFullYear();
  const seq = getNextSequence('tolerance-override');
  return `TOL-${year}-${seq.toString().padStart(4, '0')}`;
}

/**
 * Generate voxel ID
 * Format: VOX-{LEVEL}-{ZONE}-{SEQ}
 *
 * @param level - Building level (e.g., "L2")
 * @param zone - Zone identifier (e.g., "MECH")
 * @param sequence - Sequential number
 *
 * @example
 * generateVoxelId('L2', 'MECH', 47) // "VOX-L2-MECH-047"
 */
export function generateVoxelId(
  level: string,
  zone: string,
  sequence: number
): string {
  return `VOX-${level.toUpperCase()}-${zone.toUpperCase()}-${sequence.toString().padStart(3, '0')}`;
}

/**
 * Generate participant ID from name
 * Format: lowercase-slugified-name-role
 *
 * @param name - Full name of participant
 * @param role - Role for disambiguation
 *
 * @example
 * generateParticipantId('John Doe', 'PM') // "john-doe-pm"
 */
export function generateParticipantId(name: string, role: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug}-${role.toLowerCase()}`;
}

// ============================================================================
// URN Builder
// ============================================================================

/**
 * Build a PM URN from components
 *
 * @param projectId - Project identifier
 * @param nodeType - PM node type
 * @param identifier - Entity identifier
 * @returns Valid PM URN
 *
 * @throws Error if URN validation fails
 *
 * @example
 * buildURN('project-alpha', 'pm-decision', 'DEC-2026-0001')
 * // "urn:luhtech:project-alpha:pm-decision:dec-2026-0001"
 */
export function buildURN(
  projectId: string,
  nodeType: PMNodeType,
  identifier: string
): PMURN {
  const urn =
    `urn:luhtech:${projectId.toLowerCase()}:${nodeType}:${identifier.toLowerCase()}` as PMURN;

  // Validate the generated URN
  if (!validateURN(urn)) {
    throw new Error(`Invalid URN generated: ${urn}`);
  }

  return urn;
}

/**
 * Build a file URN for collections
 *
 * @param projectId - Project identifier
 * @param fileType - File type (e.g., "decisions", "voxels")
 *
 * @example
 * buildFileURN('project-alpha', 'decisions')
 * // "urn:luhtech:project-alpha:file:decisions"
 */
export function buildFileURN(projectId: string, fileType: string): string {
  return `urn:luhtech:${projectId.toLowerCase()}:file:${fileType.toLowerCase()}`;
}

/**
 * Build authority level URN
 *
 * @param ventureId - Venture identifier
 * @param level - Authority level number (0-6)
 */
export function buildAuthorityURN(ventureId: string, level: number): PMURN {
  return `urn:luhtech:${ventureId.toLowerCase()}:authority-level:pm-level-${level}` as PMURN;
}

// ============================================================================
// URN Parsing
// ============================================================================

/**
 * Parsed URN components
 */
export interface ParsedURN {
  projectId: string;
  nodeType: PMNodeType;
  identifier: string;
}

/**
 * Parse a PM URN into components
 *
 * @param urn - URN to parse
 * @returns Parsed components or null if invalid
 *
 * @example
 * parseURN('urn:luhtech:project-alpha:pm-decision:dec-2026-0001')
 * // { projectId: 'project-alpha', nodeType: 'pm-decision', identifier: 'dec-2026-0001' }
 */
export function parseURN(urn: string): ParsedURN | null {
  if (!validateURN(urn)) {
    return null;
  }

  const parts = urn.split(':');
  return {
    projectId: parts[2],
    nodeType: parts[3] as PMNodeType,
    identifier: parts[4],
  };
}

/**
 * Extract project ID from URN
 */
export function getProjectId(urn: string): string | null {
  const parsed = parseURN(urn);
  return parsed?.projectId ?? null;
}

/**
 * Extract node type from URN
 */
export function getNodeType(urn: string): PMNodeType | null {
  const parsed = parseURN(urn);
  return parsed?.nodeType ?? null;
}

/**
 * Extract identifier from URN
 */
export function getIdentifier(urn: string): string | null {
  const parsed = parseURN(urn);
  return parsed?.identifier ?? null;
}

// ============================================================================
// URN Validation
// ============================================================================

/**
 * Validate a URN string matches the pattern
 *
 * @param urn - URN to validate
 * @returns true if valid
 */
export function validateURN(urn: string): boolean {
  return PM_URN_PATTERN.test(urn);
}

/**
 * Validate a URN matches expected node type
 */
export function validateURNType(
  urn: string,
  expectedType: PMNodeType
): boolean {
  const parsed = parseURN(urn);
  return parsed?.nodeType === expectedType;
}

/**
 * Validate ID format for a specific node type
 */
export function validateIdFormat(id: string, nodeType: PMNodeType): boolean {
  const pattern = ID_PATTERNS[nodeType];
  return pattern?.test(id) ?? false;
}

/**
 * Validate an array of URNs
 */
export function validateURNs(urns: string[]): {
  valid: boolean;
  invalidUrns: string[];
} {
  const invalidUrns = urns.filter((urn) => !validateURN(urn));
  return {
    valid: invalidUrns.length === 0,
    invalidUrns,
  };
}

// ============================================================================
// Graph Metadata Helpers
// ============================================================================

/**
 * Create graph metadata block
 *
 * @param inEdges - URNs of nodes pointing TO this node
 * @param outEdges - URNs of nodes this node points TO
 * @param edges - Detailed edge definitions (optional)
 */
export function createGraphMetadata(
  inEdges: PMURN[] = [],
  outEdges: PMURN[] = [],
  edges?: PMEdge[]
): GraphMetadata {
  return {
    inEdges: [...new Set(inEdges)], // Deduplicate
    outEdges: [...new Set(outEdges)],
    ...(edges ? { edges } : {}),
  };
}

/**
 * Create an empty graph metadata block
 */
export function createEmptyGraphMetadata(): GraphMetadata {
  return {
    inEdges: [],
    outEdges: [],
  };
}

/**
 * Merge two graph metadata blocks
 */
export function mergeGraphMetadata(
  existing: GraphMetadata,
  additions: Partial<GraphMetadata>
): GraphMetadata {
  return {
    inEdges: [...new Set([...existing.inEdges, ...(additions.inEdges || [])])],
    outEdges: [
      ...new Set([...existing.outEdges, ...(additions.outEdges || [])]),
    ],
    edges: [...(existing.edges || []), ...(additions.edges || [])],
  };
}

/**
 * Add an inEdge to graph metadata (immutable)
 */
export function addInEdge(metadata: GraphMetadata, urn: PMURN): GraphMetadata {
  if (metadata.inEdges.includes(urn)) {
    return metadata; // Already exists
  }
  return {
    ...metadata,
    inEdges: [...metadata.inEdges, urn],
  };
}

/**
 * Add an outEdge to graph metadata (immutable)
 */
export function addOutEdge(metadata: GraphMetadata, urn: PMURN): GraphMetadata {
  if (metadata.outEdges.includes(urn)) {
    return metadata; // Already exists
  }
  return {
    ...metadata,
    outEdges: [...metadata.outEdges, urn],
  };
}

/**
 * Remove an inEdge from graph metadata (immutable)
 */
export function removeInEdge(
  metadata: GraphMetadata,
  urn: PMURN
): GraphMetadata {
  return {
    ...metadata,
    inEdges: metadata.inEdges.filter((e) => e !== urn),
  };
}

/**
 * Remove an outEdge from graph metadata (immutable)
 */
export function removeOutEdge(
  metadata: GraphMetadata,
  urn: PMURN
): GraphMetadata {
  return {
    ...metadata,
    outEdges: metadata.outEdges.filter((e) => e !== urn),
  };
}

/**
 * Add a detailed edge to graph metadata
 */
export function addEdge(metadata: GraphMetadata, edge: PMEdge): GraphMetadata {
  return {
    ...metadata,
    edges: [...(metadata.edges || []), edge],
  };
}

/**
 * Check if a URN exists in inEdges
 */
export function hasInEdge(metadata: GraphMetadata, urn: PMURN): boolean {
  return metadata.inEdges.includes(urn);
}

/**
 * Check if a URN exists in outEdges
 */
export function hasOutEdge(metadata: GraphMetadata, urn: PMURN): boolean {
  return metadata.outEdges.includes(urn);
}

// ============================================================================
// Utility Exports
// ============================================================================

export const PMURNUtils = {
  // ID Generation
  generateDecisionId,
  generateConsequenceId,
  generateInspectionId,
  generateProposalId,
  generateToleranceOverrideId,
  generateVoxelId,
  generateParticipantId,

  // URN Building
  buildURN,
  buildFileURN,
  buildAuthorityURN,

  // URN Parsing
  parseURN,
  getProjectId,
  getNodeType,
  getIdentifier,

  // Validation
  validateURN,
  validateURNType,
  validateIdFormat,
  validateURNs,

  // Graph Metadata
  createGraphMetadata,
  createEmptyGraphMetadata,
  mergeGraphMetadata,
  addInEdge,
  addOutEdge,
  removeInEdge,
  removeOutEdge,
  addEdge,
  hasInEdge,
  hasOutEdge,

  // Counter Management
  resetIdCounter,
  resetAllIdCounters,
  setIdCounter,
};

export default PMURNUtils;

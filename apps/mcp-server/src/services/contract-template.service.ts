/**
 * Contract Template Service - CO-M1
 *
 * Manages contract parsing templates for AIA, CCDC, ConsensusDOCS, and other
 * standard construction contract families. Provides template registration,
 * matching, and authority mapping functionality.
 *
 * Templates define:
 * - Document structure expectations (articles, exhibits)
 * - Extraction rules for automated data extraction
 * - Authority role mappings to 7-tier cascade
 * - IPD governance configurations (for multi-party contracts)
 *
 * @see .roadmap/features/contract-onboarding/FEATURE.json
 * @version 1.0.0
 */

import {
  ContractFamily,
  ContractType,
  DeliveryMethod,
  ContractPartyRole,
  type ContractTemplate,
  type ContractTemplateURN,
  type ExtractionRule,
  type AuthorityRoleMapping,
  DEFAULT_AUTHORITY_MAPPINGS,
} from '../types/contract.types.js';

import { AuthorityLevel } from '../types/pm.types.js';

// ============================================================================
// State Management
// ============================================================================

/**
 * Registered templates indexed by URN
 */
const templateRegistry: Map<ContractTemplateURN, ContractTemplate> = new Map();

// ============================================================================
// Template Registration Types
// ============================================================================

/**
 * Registration result
 */
export interface RegistrationResult {
  success: boolean;
  urn?: ContractTemplateURN;
  errors: string[];
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Match criteria for template lookup
 */
export interface TemplateMatchCriteria {
  contractNumber?: string;
  family?: ContractFamily;
  contractType?: ContractType;
  deliveryMethod?: DeliveryMethod;
}

/**
 * Match result
 */
export interface TemplateMatchResult {
  template?: ContractTemplate;
  confidence: number;
  candidates: ContractTemplate[];
}

/**
 * Contract type detection result
 */
export interface ContractTypeDetection {
  family: ContractFamily;
  contractType?: ContractType;
  deliveryMethod?: DeliveryMethod;
  contractNumber?: string;
  confidence: number;
  isIPD: boolean;
  indicators: string[];
}

/**
 * Template suggestion result
 */
export interface TemplateSuggestion {
  templateUrn?: ContractTemplateURN;
  confidence: number;
  reasoning: string[];
  alternatives: Array<{
    urn: ContractTemplateURN;
    confidence: number;
  }>;
}

/**
 * Parsed template URN
 */
export interface ParsedTemplateURN {
  family: ContractFamily;
  contractNumber: string;
}

// ============================================================================
// Template Management
// ============================================================================

/**
 * URN pattern for contract templates
 */
const TEMPLATE_URN_PATTERN = /^urn:luhtech:ectropy:contract-template:([A-Za-z]+)-(.+)$/;

/**
 * Get template by URN
 *
 * @param urn - Template URN
 * @returns Template or undefined
 */
export function getTemplate(urn: ContractTemplateURN): ContractTemplate | undefined {
  return templateRegistry.get(urn);
}

/**
 * Get all registered templates
 *
 * @returns Array of all templates
 */
export function getAllTemplates(): ContractTemplate[] {
  return Array.from(templateRegistry.values());
}

/**
 * Get templates by contract family
 *
 * @param family - Contract family (AIA, CCDC, etc.)
 * @returns Templates matching the family
 */
export function getTemplatesByFamily(family: ContractFamily): ContractTemplate[] {
  return getAllTemplates().filter(t => t.family === family);
}

/**
 * Register a contract template
 *
 * @param template - Template to register
 * @returns Registration result
 */
export function registerTemplate(template: ContractTemplate): RegistrationResult {
  const errors: string[] = [];

  // Validate URN format
  if (!TEMPLATE_URN_PATTERN.test(template.urn)) {
    errors.push('Invalid URN format');
  }

  // Validate required fields
  if (!template.family) {
    errors.push('Missing required field: family');
  }
  if (!template.contractNumber) {
    errors.push('Missing required field: contractNumber');
  }
  if (!template.contractType) {
    errors.push('Missing required field: contractType');
  }
  if (!template.deliveryMethod) {
    errors.push('Missing required field: deliveryMethod');
  }
  if (!template.displayName) {
    errors.push('Missing required field: displayName');
  }
  if (!template.documentStructure) {
    errors.push('Missing required field: documentStructure');
  }
  if (!template.extractionRules || template.extractionRules.length === 0) {
    errors.push('Template must have at least one extraction rule');
  }
  if (!template.authorityMappings || template.authorityMappings.length === 0) {
    errors.push('Template must have at least one authority mapping');
  }

  // Validate extraction rules if present
  if (template.extractionRules) {
    const rulesValidation = validateExtractionRules(template.extractionRules);
    if (!rulesValidation.valid) {
      errors.push(...rulesValidation.errors);
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Register template
  templateRegistry.set(template.urn, template);

  return {
    success: true,
    urn: template.urn,
    errors: [],
  };
}

/**
 * Validate a template
 *
 * @param template - Template to validate
 * @returns Validation result
 */
export function validateTemplate(template: ContractTemplate): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check extraction rules
  if (!template.extractionRules || template.extractionRules.length === 0) {
    errors.push('Template must have at least one extraction rule');
  } else {
    const rulesValidation = validateExtractionRules(template.extractionRules);
    errors.push(...rulesValidation.errors);
  }

  // Check authority mappings
  if (!template.authorityMappings || template.authorityMappings.length === 0) {
    errors.push('Template must have at least one authority mapping');
  }

  // Check document structure
  if (!template.documentStructure?.articles || template.documentStructure.articles.length === 0) {
    warnings.push('Template has no article structure defined');
  }

  // Check IPD governance if IPD type
  if (isIPDContractType(template.contractType) && !template.ipdGovernance) {
    warnings.push('IPD contract type but no IPD governance configured');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Clear all templates (for testing)
 */
export function clearTemplates(): void {
  templateRegistry.clear();
}

// ============================================================================
// Template Matching
// ============================================================================

/**
 * Contract family detection patterns
 */
const FAMILY_PATTERNS: Record<ContractFamily, RegExp[]> = {
  [ContractFamily.AIA]: [
    /\bAIA\b/i,
    /\bAmerican Institute of Architects\b/i,
    /\bA\d{3}-\d{4}\b/,
    /\bC\d{3}-\d{4}\b/,
    /\bB\d{3}-\d{4}\b/,
  ],
  [ContractFamily.CCDC]: [
    /\bCCDC\b/i,
    /\bCanadian Construction Documents Committee\b/i,
    /\bCCDC\s*\d+/i,
  ],
  [ContractFamily.CONSENSUSDOCS]: [
    /\bConsensusDOCS\b/i,
    /\bConsensus\s*DOCS\b/i,
    /\bConsensusDOCS\s*\d{3}/i,
  ],
  [ContractFamily.FIDIC]: [
    /\bFIDIC\b/i,
    /\bFédération Internationale\b/i,
  ],
  [ContractFamily.NEC]: [
    /\bNEC\b/i,
    /\bNew Engineering Contract\b/i,
  ],
  [ContractFamily.CUSTOM]: [],
};

/**
 * IPD indicator patterns
 */
const IPD_PATTERNS = [
  /\bIPD\b/i,
  /\bIntegrated Project Delivery\b/i,
  /\bTarget Cost\b/i,
  /\bShared Savings\b/i,
  /\bPMT\b/,
  /\bProject Management Team\b/i,
  /\bPET\b/,
  /\bProject Executive Team\b/i,
  /\bMulti-Party Agreement\b/i,
];

/**
 * Detect contract type from document text
 *
 * @param text - Document text to analyze
 * @returns Detection result with confidence
 */
export function detectContractType(text: string): ContractTypeDetection {
  const indicators: string[] = [];
  let bestFamily = ContractFamily.CUSTOM;
  let bestFamilyScore = 0;

  // Check each family's patterns
  for (const [family, patterns] of Object.entries(FAMILY_PATTERNS)) {
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        score++;
        indicators.push(`Matched ${family} pattern: ${pattern.source}`);
      }
    }
    if (score > bestFamilyScore) {
      bestFamily = family as ContractFamily;
      bestFamilyScore = score;
    }
  }

  // Check for IPD
  let ipdScore = 0;
  for (const pattern of IPD_PATTERNS) {
    if (pattern.test(text)) {
      ipdScore++;
      indicators.push(`IPD indicator: ${pattern.source}`);
    }
  }
  const isIPD = ipdScore >= 2;

  // Extract contract number
  let contractNumber: string | undefined;
  const contractNumberPatterns = [
    /\b([A-C]\d{3}-\d{4})\b/, // AIA pattern
    /\bCCDC\s*(\d+(?:-\d+)?)/i, // CCDC pattern
    /\bConsensusDOCS\s*(\d{3})/i, // ConsensusDOCS pattern
  ];

  for (const pattern of contractNumberPatterns) {
    const match = text.match(pattern);
    if (match) {
      contractNumber = match[1];
      break;
    }
  }

  // Determine contract type
  let contractType: ContractType | undefined;
  if (isIPD) {
    contractType = ContractType.IPD_MULTI_PARTY;
  } else if (/\bGMP\b|\bGuaranteed Maximum Price\b/i.test(text)) {
    contractType = ContractType.GMP;
  } else if (/\bStipulated\s*(Sum|Price)\b/i.test(text)) {
    contractType = ContractType.STIPULATED_SUM;
  } else if (/\bDesign-Build\b|\bDesign Build\b/i.test(text)) {
    contractType = ContractType.DESIGN_BUILD;
  } else if (/\bCost Plus\b|\bCost\s*\+/i.test(text)) {
    contractType = ContractType.COST_PLUS;
  }

  // Calculate confidence
  const maxScore = 5; // Max patterns per family
  const familyConfidence = Math.min(bestFamilyScore / maxScore, 1);
  const typeConfidence = contractType ? 0.3 : 0;
  const ipdConfidence = isIPD ? 0.2 : 0;
  const overallConfidence = Math.min(
    familyConfidence * 0.5 + typeConfidence + ipdConfidence + (contractNumber ? 0.2 : 0),
    1
  );

  return {
    family: bestFamily,
    contractType,
    contractNumber,
    confidence: overallConfidence,
    isIPD,
    indicators,
  };
}

/**
 * Match a template based on criteria
 *
 * @param criteria - Match criteria
 * @returns Match result with candidates
 */
export function matchTemplate(criteria: TemplateMatchCriteria): TemplateMatchResult {
  const candidates: ContractTemplate[] = [];
  let bestMatch: ContractTemplate | undefined;
  let bestScore = 0;

  for (const template of templateRegistry.values()) {
    let score = 0;

    // Contract number match (highest weight)
    if (criteria.contractNumber && template.contractNumber === criteria.contractNumber) {
      score += 0.5;
    }

    // Family match
    if (criteria.family && template.family === criteria.family) {
      score += 0.25;
    }

    // Contract type match
    if (criteria.contractType && template.contractType === criteria.contractType) {
      score += 0.15;
    }

    // Delivery method match
    if (criteria.deliveryMethod && template.deliveryMethod === criteria.deliveryMethod) {
      score += 0.1;
    }

    if (score > 0) {
      candidates.push(template);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = template;
      }
    }
  }

  // Sort candidates by match score
  candidates.sort((a, b) => {
    const scoreA = calculateMatchScore(a, criteria);
    const scoreB = calculateMatchScore(b, criteria);
    return scoreB - scoreA;
  });

  return {
    template: bestMatch,
    confidence: bestScore,
    candidates,
  };
}

/**
 * Calculate match score for a template
 */
function calculateMatchScore(template: ContractTemplate, criteria: TemplateMatchCriteria): number {
  let score = 0;
  if (criteria.contractNumber && template.contractNumber === criteria.contractNumber) {
    score += 0.5;
  }
  if (criteria.family && template.family === criteria.family) {
    score += 0.25;
  }
  if (criteria.contractType && template.contractType === criteria.contractType) {
    score += 0.15;
  }
  if (criteria.deliveryMethod && template.deliveryMethod === criteria.deliveryMethod) {
    score += 0.1;
  }
  return score;
}

/**
 * Get suggested template from document text
 *
 * @param documentText - Document text to analyze
 * @returns Template suggestion
 */
export function getSuggestedTemplate(documentText: string): TemplateSuggestion {
  const detection = detectContractType(documentText);
  const reasoning: string[] = [];

  // Build match criteria from detection
  const criteria: TemplateMatchCriteria = {
    family: detection.family,
    contractType: detection.contractType,
  };

  if (detection.contractNumber) {
    criteria.contractNumber = detection.contractNumber;
    reasoning.push(`Detected contract number: ${detection.contractNumber}`);
  }

  reasoning.push(`Detected family: ${detection.family} (confidence: ${(detection.confidence * 100).toFixed(0)}%)`);

  if (detection.isIPD) {
    reasoning.push('Document contains IPD indicators');
  }

  // Match against templates
  const matchResult = matchTemplate(criteria);

  const alternatives = matchResult.candidates
    .filter(t => t.urn !== matchResult.template?.urn)
    .slice(0, 3)
    .map(t => ({
      urn: t.urn,
      confidence: calculateMatchScore(t, criteria),
    }));

  // If no registered template matches, generate a suggested URN based on detection
  let templateUrn = matchResult.template?.urn;
  let confidence = matchResult.confidence;

  if (!templateUrn && detection.family) {
    // Generate a default template URN based on detected family
    const contractNumber = detection.contractNumber || 'GENERIC';
    templateUrn = buildTemplateURN(detection.family, contractNumber);
    confidence = detection.confidence * 0.7; // Lower confidence for generated URN
    reasoning.push('Generated template URN from detection (no registered template matched)');
  }

  return {
    templateUrn,
    confidence,
    reasoning,
    alternatives,
  };
}

// ============================================================================
// Authority Mappings
// ============================================================================

/**
 * Get default authority mappings
 *
 * @returns Default role to authority level mappings
 */
export function getDefaultAuthorityMappings(): Record<ContractPartyRole, AuthorityLevel> {
  return { ...DEFAULT_AUTHORITY_MAPPINGS };
}

/**
 * Get roles that map to a specific authority level
 *
 * @param level - Authority level
 * @returns Array of roles at that level
 */
export function getRoleMappingForLevel(level: AuthorityLevel): ContractPartyRole[] {
  const roles: ContractPartyRole[] = [];

  for (const [role, roleLevel] of Object.entries(DEFAULT_AUTHORITY_MAPPINGS)) {
    if (roleLevel === level) {
      roles.push(role as ContractPartyRole);
    }
  }

  return roles;
}

/**
 * Get authority level for a contract role
 *
 * @param templateUrn - Template URN
 * @param roleName - Contract role name (from document)
 * @returns Authority level
 */
export function getAuthorityLevelForRole(
  templateUrn: ContractTemplateURN,
  roleName: string
): AuthorityLevel {
  const template = templateRegistry.get(templateUrn);
  const normalizedRole = roleName.toLowerCase();

  // Check template-specific mappings first
  if (template?.authorityMappings) {
    const mapping = template.authorityMappings.find(
      m => m.contractRole.toLowerCase() === normalizedRole
    );
    if (mapping) {
      return mapping.authorityLevel;
    }
  }

  // Fall back to default mappings
  for (const [role, level] of Object.entries(DEFAULT_AUTHORITY_MAPPINGS)) {
    if (role.toLowerCase() === normalizedRole) {
      return level;
    }
  }

  // Default to PM level for unknown roles
  return AuthorityLevel.PM;
}

// ============================================================================
// Extraction Rules
// ============================================================================

/**
 * Valid extraction methods
 */
const VALID_METHODS = ['regex', 'llm', 'pattern', 'table', 'date'];

/**
 * Get extraction rules for a template
 *
 * @param templateUrn - Template URN
 * @returns Extraction rules
 */
export function getExtractionRules(templateUrn: ContractTemplateURN): ExtractionRule[] {
  const template = templateRegistry.get(templateUrn);
  return template?.extractionRules ?? [];
}

/**
 * Get required fields for a template
 *
 * @param templateUrn - Template URN
 * @returns Required extraction rules
 */
export function getRequiredFields(templateUrn: ContractTemplateURN): ExtractionRule[] {
  return getExtractionRules(templateUrn).filter(r => r.required);
}

/**
 * Validate extraction rules
 *
 * @param rules - Rules to validate
 * @returns Validation result
 */
export function validateExtractionRules(rules: ExtractionRule[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const prefix = `Rule[${i}] (${rule.fieldPath})`;

    // Check method
    if (!VALID_METHODS.includes(rule.method)) {
      errors.push(`${prefix}: Invalid extraction method '${rule.method}'`);
    }

    // Check pattern for regex/pattern methods
    if ((rule.method === 'regex' || rule.method === 'pattern') && !rule.pattern) {
      errors.push(`${prefix}: pattern required for ${rule.method} method`);
    }

    // Check llmPrompt for llm method
    if (rule.method === 'llm' && !rule.llmPrompt) {
      errors.push(`${prefix}: llmPrompt required for llm method`);
    }

    // Check confidence threshold
    if (rule.confidenceThreshold < 0 || rule.confidenceThreshold > 1) {
      errors.push(`${prefix}: confidence threshold must be between 0 and 1`);
    }

    // Check data type
    const validTypes = ['string', 'number', 'date', 'boolean', 'array', 'object'];
    if (!validTypes.includes(rule.dataType)) {
      errors.push(`${prefix}: Invalid data type '${rule.dataType}'`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Template Utilities
// ============================================================================

/**
 * Build template URN from family and contract number
 *
 * @param family - Contract family
 * @param contractNumber - Contract number
 * @returns Template URN
 */
export function buildTemplateURN(
  family: ContractFamily,
  contractNumber: string
): ContractTemplateURN {
  const normalized = contractNumber.replace(/\s+/g, '-');
  return `urn:luhtech:ectropy:contract-template:${family}-${normalized}` as ContractTemplateURN;
}

/**
 * Parse template URN
 *
 * @param urn - Template URN
 * @returns Parsed components or null
 */
export function parseTemplateURN(urn: ContractTemplateURN): ParsedTemplateURN | null {
  const match = urn.match(TEMPLATE_URN_PATTERN);
  if (!match) {
    return null;
  }

  const familyStr = match[1].toUpperCase();
  let family: ContractFamily;

  switch (familyStr) {
    case 'AIA':
      family = ContractFamily.AIA;
      break;
    case 'CCDC':
      family = ContractFamily.CCDC;
      break;
    case 'CONSENSUSDOCS':
      family = ContractFamily.CONSENSUSDOCS;
      break;
    case 'FIDIC':
      family = ContractFamily.FIDIC;
      break;
    case 'NEC':
      family = ContractFamily.NEC;
      break;
    default:
      family = ContractFamily.CUSTOM;
  }

  return {
    family,
    contractNumber: match[2],
  };
}

/**
 * Check if a contract type is IPD
 */
function isIPDContractType(contractType: ContractType): boolean {
  return (
    contractType === ContractType.IPD_MULTI_PARTY ||
    contractType === ContractType.IPD_SPE
  );
}

/**
 * Check if a template is for IPD contracts
 *
 * @param templateUrn - Template URN
 * @returns true if IPD
 */
export function isIPDContract(templateUrn: ContractTemplateURN): boolean {
  const template = templateRegistry.get(templateUrn);
  if (!template) {
    return false;
  }

  return isIPDContractType(template.contractType) || !!template.ipdGovernance;
}

// ============================================================================
// Service Export
// ============================================================================

/**
 * Contract Template Service namespace
 */
export const ContractTemplateService = {
  // Template management
  getTemplate,
  getAllTemplates,
  getTemplatesByFamily,
  registerTemplate,
  validateTemplate,
  clearTemplates,

  // Template matching
  detectContractType,
  matchTemplate,
  getSuggestedTemplate,

  // Authority mappings
  getDefaultAuthorityMappings,
  getRoleMappingForLevel,
  getAuthorityLevelForRole,

  // Extraction rules
  getExtractionRules,
  getRequiredFields,
  validateExtractionRules,

  // Utilities
  buildTemplateURN,
  parseTemplateURN,
  isIPDContract,
};

export default ContractTemplateService;

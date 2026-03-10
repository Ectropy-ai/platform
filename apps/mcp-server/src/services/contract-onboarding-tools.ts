/**
 * Contract Onboarding MCP Tools - CO-M4
 *
 * MCP tool definitions and handlers for contract onboarding.
 * These tools enable AI agents to parse contracts, extract authority
 * cascades, and configure projects automatically.
 *
 * Tools Implemented (3 total):
 * - parse_contract: Parse uploaded contract documents
 * - extract_authority_cascade: Extract authority mappings from parsed contract
 * - configure_project_from_contract: Auto-configure project from contract data
 *
 * @see .roadmap/features/contract-onboarding/FEATURE.json
 * @version 1.0.0
 */

import {
  ContractFamily,
  ContractType,
  DeliveryMethod,
  ContractPartyRole,
  type ContractExtractionResult,
  type ParseContractInput,
  type ParseContractResult,
  type ContractTemplateURN,
  type ContractURN,
  type ExtractedParty,
  type ProjectConfiguration,
  type ContractAuthorityCascade,
  type MappedParticipant,
  CONFIDENCE_THRESHOLDS,
  DEFAULT_AUTHORITY_MAPPINGS,
} from '../types/contract.types.js';

import { AuthorityLevel } from '../types/pm.types.js';

import {
  parseContract,
  parseContractText,
} from './contract-parser.service.js';

import {
  buildAuthorityCascade,
  mapAllPartiesToParticipants,
  buildProjectConfiguration,
} from './authority-mapper.service.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Contract tool result type
 */
export interface ContractToolResult<T = unknown> {
  success: boolean;
  data?: T;
  errors?: string[];
  warnings?: string[];
  durationMs: number;
}

/**
 * Contract tool definition interface
 */
export interface ContractToolDefinition {
  name: string;
  description: string;
  category: string;
  version: string;
  inputSchema: {
    type: 'object';
    required: string[];
    properties: Record<string, unknown>;
  };
  handler: (args: Record<string, unknown>) => Promise<ContractToolResult<unknown>>;
}

/**
 * Parse contract tool result data
 */
export interface ParseContractToolData {
  extraction?: ContractExtractionResult;
  suggestedTemplate?: ContractTemplateURN;
  templateConfidence?: number;
}

/**
 * Authority level entry in structured format
 */
export interface AuthorityLevelEntry {
  level: AuthorityLevel;
  levelNumber: number;
  name: string;
  participants: string[];
}

/**
 * Extract authority cascade tool result data
 */
export interface ExtractAuthorityCascadeData {
  authorityCascade?: ContractAuthorityCascade;
  levels?: AuthorityLevelEntry[];
  participants?: MappedParticipant[];
  ipdGovernance?: {
    hasPMT: boolean;
    hasPET: boolean;
    pmtVoting?: {
      quorum: string;
      votingWindowHours: number;
      decisionThreshold: number;
    };
  };
  decisionThresholds?: Record<AuthorityLevel, number>;
}

/**
 * Configure project tool result data
 */
export interface ConfigureProjectData {
  projectConfiguration?: {
    urn: string;
    projectId: string;
    projectName?: string;
    tenantId?: string;
    authorityCascade: ContractAuthorityCascade;
    team: MappedParticipant[];
    governance: {
      pmtEnabled: boolean;
      petEnabled: boolean;
      votingConfig?: {
        quorum: string;
        votingWindowHours: number;
        decisionThreshold: number;
      };
    };
    milestones: {
      commencementDate?: string;
      substantialCompletion?: string;
      finalCompletion?: string;
    };
    financial: {
      currency: string;
      targetCost?: number;
      contractValue?: number;
      gmp?: number;
      savingsDistribution?: {
        ownerShare: number;
        designTeamShare: number;
        constructionTeamShare: number;
      };
    };
    contractInfo: {
      family: ContractFamily;
      type: ContractType;
      deliveryMethod: DeliveryMethod;
    };
  };
  summary?: {
    partiesConfigured: number;
    authorityLevelsSet: number;
    governanceConfigured: boolean;
    financialTermsSet: boolean;
  };
}

// ============================================================================
// Default Authority Thresholds
// ============================================================================

const DEFAULT_DECISION_THRESHOLDS: Record<AuthorityLevel, number> = {
  [AuthorityLevel.FIELD]: 500,
  [AuthorityLevel.FOREMAN]: 2500,
  [AuthorityLevel.SUPERINTENDENT]: 10000,
  [AuthorityLevel.PM]: 50000,
  [AuthorityLevel.ARCHITECT]: 100000,
  [AuthorityLevel.OWNER]: 500000,
  [AuthorityLevel.REGULATORY]: Infinity,
};

// ============================================================================
// parse_contract Tool
// ============================================================================

export const parseContractTool: ContractToolDefinition = {
  name: 'parse_contract',
  description: 'Parse an uploaded contract document (PDF, DOCX, or text) and extract structured data including parties, financial terms, dates, and governance structure',
  category: 'contract-onboarding',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    required: ['filename', 'content'],
    properties: {
      filename: {
        type: 'string',
        description: 'Name of the contract file',
      },
      content: {
        type: 'string',
        description: 'Base64 encoded file content',
      },
      mimeType: {
        type: 'string',
        description: 'MIME type of the file (e.g., application/pdf, text/plain)',
      },
      templateUrn: {
        type: 'string',
        description: 'Optional template URN to use for parsing',
      },
    },
  },
  handler: async (args): Promise<ContractToolResult<ParseContractToolData>> => {
    const startTime = performance.now();

    try {
      const input: ParseContractInput = {
        filename: args.filename as string,
        content: args.content as string,
        mimeType: args.mimeType as ParseContractInput['mimeType'],
        templateUrn: args.templateUrn as ContractTemplateURN | undefined,
      };

      const result = await parseContract(input);

      const elapsedMs = Math.max(1, Math.round(performance.now() - startTime));

      if (!result.success) {
        return {
          success: false,
          errors: result.errors,
          durationMs: elapsedMs,
        };
      }

      return {
        success: true,
        data: {
          extraction: result.extraction,
          suggestedTemplate: result.suggestedTemplate,
          templateConfidence: result.templateConfidence,
        },
        durationMs: elapsedMs,
      };
    } catch (error) {
      return {
        success: false,
        errors: [(error as Error).message],
        durationMs: Math.max(1, Math.round(performance.now() - startTime)),
      };
    }
  },
};

// ============================================================================
// extract_authority_cascade Tool
// ============================================================================

export const extractAuthorityCascadeTool: ContractToolDefinition = {
  name: 'extract_authority_cascade',
  description: 'Extract the 7-tier authority cascade mapping from a parsed contract extraction result, mapping contract roles to authority levels',
  category: 'contract-onboarding',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    required: ['extractionResult'],
    properties: {
      extractionResult: {
        type: 'object',
        description: 'The contract extraction result from parse_contract tool',
      },
    },
  },
  handler: async (args): Promise<ContractToolResult<ExtractAuthorityCascadeData>> => {
    const startTime = performance.now();

    try {
      const extractionResult = args.extractionResult as ContractExtractionResult;

      // Generate a contract URN from extraction
      const contractUrn = (extractionResult.templateUsed ||
        `urn:luhtech:ectropy:contract:CON-${extractionResult.extractionId}-001`) as ContractURN;

      // Build the 7-tier authority cascade
      const authorityCascade = buildAuthorityCascade(
        extractionResult.parties || [],
        contractUrn
      );

      // Build structured levels array
      const levels: AuthorityLevelEntry[] = [
        { level: AuthorityLevel.FIELD, levelNumber: 0, name: 'Field', participants: authorityCascade.level0_FIELD },
        { level: AuthorityLevel.FOREMAN, levelNumber: 1, name: 'Foreman', participants: authorityCascade.level1_FOREMAN },
        { level: AuthorityLevel.SUPERINTENDENT, levelNumber: 2, name: 'Superintendent', participants: authorityCascade.level2_SUPERINTENDENT },
        { level: AuthorityLevel.PM, levelNumber: 3, name: 'Project Manager', participants: authorityCascade.level3_PM },
        { level: AuthorityLevel.ARCHITECT, levelNumber: 4, name: 'Architect', participants: authorityCascade.level4_ARCHITECT },
        { level: AuthorityLevel.OWNER, levelNumber: 5, name: 'Owner', participants: authorityCascade.level5_OWNER },
        { level: AuthorityLevel.REGULATORY, levelNumber: 6, name: 'Regulatory', participants: authorityCascade.level6_REGULATORY },
      ];

      // Map all parties to participants with authority levels
      const participants = mapAllPartiesToParticipants(
        extractionResult.parties || []
      );

      // Extract IPD governance if present
      const governance = extractionResult.governance;
      const ipdGovernance = {
        hasPMT: governance?.hasPMT?.value ?? false,
        hasPET: governance?.hasPET?.value ?? false,
        pmtVoting: governance?.pmtVoting ? {
          quorum: governance.pmtVoting.quorum?.value || 'majority',
          votingWindowHours: governance.pmtVoting.votingWindowHours?.value || 72,
          decisionThreshold: governance.pmtVoting.decisionThreshold?.value || 100000,
        } : undefined,
      };

      // Get decision thresholds
      const decisionThresholds = { ...DEFAULT_DECISION_THRESHOLDS };

      // Override PM threshold if PMT decision threshold is specified
      if (ipdGovernance.pmtVoting?.decisionThreshold) {
        decisionThresholds[AuthorityLevel.PM] = ipdGovernance.pmtVoting.decisionThreshold;
      }

      const elapsedMs = Math.max(1, Math.round(performance.now() - startTime));

      return {
        success: true,
        data: {
          authorityCascade,
          levels,
          participants,
          ipdGovernance,
          decisionThresholds,
        },
        durationMs: elapsedMs,
      };
    } catch (error) {
      return {
        success: false,
        errors: [(error as Error).message],
        durationMs: Math.max(1, Math.round(performance.now() - startTime)),
      };
    }
  },
};

// ============================================================================
// configure_project_from_contract Tool
// ============================================================================

export const configureProjectFromContractTool: ContractToolDefinition = {
  name: 'configure_project_from_contract',
  description: 'Configure a project automatically from contract extraction data, setting up authority cascade, team structure, governance, milestones, and financial settings',
  category: 'contract-onboarding',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    required: ['extractionResult', 'projectId'],
    properties: {
      extractionResult: {
        type: 'object',
        description: 'The contract extraction result from parse_contract tool',
      },
      projectId: {
        type: 'string',
        description: 'Unique identifier for the project',
      },
      projectName: {
        type: 'string',
        description: 'Human-readable project name',
      },
      tenantId: {
        type: 'string',
        description: 'Optional tenant identifier for multi-tenant deployment',
      },
    },
  },
  handler: async (args): Promise<ContractToolResult<ConfigureProjectData>> => {
    const startTime = performance.now();

    try {
      const extractionResult = args.extractionResult as ContractExtractionResult;
      const projectId = args.projectId as string;
      const projectName = args.projectName as string | undefined;
      const tenantId = args.tenantId as string | undefined;

      const warnings: string[] = [];

      // Check confidence and add warnings
      if (extractionResult.confidence?.overall < CONFIDENCE_THRESHOLDS.REVIEW_THRESHOLD) {
        warnings.push(`Overall extraction confidence (${(extractionResult.confidence.overall * 100).toFixed(0)}%) is below review threshold`);
      }

      // Add warnings for flagged fields
      for (const field of extractionResult.confidence?.flaggedFields || []) {
        const reason = extractionResult.confidence?.flagReasons?.[field] || 'Unknown reason';
        warnings.push(`Field "${field}" flagged: ${reason}`);
      }

      // Generate a contract URN from extraction
      const contractUrn = (extractionResult.templateUsed ||
        `urn:luhtech:ectropy:contract:CON-${extractionResult.extractionId}-001`) as ContractURN;

      // Build authority cascade
      const authorityCascade = buildAuthorityCascade(
        extractionResult.parties || [],
        contractUrn
      );

      // Map participants
      const team = mapAllPartiesToParticipants(extractionResult.parties || []);

      // Extract governance configuration
      const governance = extractionResult.governance;
      const governanceConfig = {
        pmtEnabled: governance?.hasPMT?.value ?? false,
        petEnabled: governance?.hasPET?.value ?? false,
        votingConfig: governance?.pmtVoting ? {
          quorum: governance.pmtVoting.quorum?.value || 'majority',
          votingWindowHours: governance.pmtVoting.votingWindowHours?.value || 72,
          decisionThreshold: governance.pmtVoting.decisionThreshold?.value || 100000,
        } : undefined,
      };

      // Extract milestones
      const milestones = {
        commencementDate: extractionResult.dates?.commencementDate?.value,
        substantialCompletion: extractionResult.dates?.substantialCompletion?.value,
        finalCompletion: extractionResult.dates?.finalCompletion?.value,
      };

      // Extract financial settings
      const financialTerms = extractionResult.financialTerms;
      const financial = {
        currency: financialTerms?.currency?.value || 'USD',
        targetCost: financialTerms?.targetCost?.value,
        contractValue: financialTerms?.contractValue?.value,
        gmp: financialTerms?.gmp?.value,
        savingsDistribution: financialTerms?.savingsDistribution ? {
          ownerShare: financialTerms.savingsDistribution.ownerShare?.value || 0,
          designTeamShare: financialTerms.savingsDistribution.designTeamShare?.value || 0,
          constructionTeamShare: financialTerms.savingsDistribution.constructionTeamShare?.value || 0,
        } : undefined,
      };

      // Extract contract info
      const contractInfo = {
        family: extractionResult.contractInfo?.family?.value || ContractFamily.CUSTOM,
        type: extractionResult.contractInfo?.type?.value || ContractType.STIPULATED_SUM,
        deliveryMethod: extractionResult.contractInfo?.deliveryMethod?.value || DeliveryMethod.DBB,
      };

      // Build project configuration
      const projectConfiguration = {
        urn: `urn:luhtech:ectropy:project:${projectId}`,
        projectId,
        projectName,
        tenantId,
        authorityCascade,
        team,
        governance: governanceConfig,
        milestones,
        financial,
        contractInfo,
      };

      // Build summary
      // Count authority levels that have participants
      const levelArrays = [
        authorityCascade.level0_FIELD,
        authorityCascade.level1_FOREMAN,
        authorityCascade.level2_SUPERINTENDENT,
        authorityCascade.level3_PM,
        authorityCascade.level4_ARCHITECT,
        authorityCascade.level5_OWNER,
        authorityCascade.level6_REGULATORY,
      ];
      const authorityLevelsSet = levelArrays.filter(arr => arr.length > 0).length;

      const summary = {
        partiesConfigured: team.length,
        authorityLevelsSet,
        governanceConfigured: governanceConfig.pmtEnabled || governanceConfig.petEnabled,
        financialTermsSet: !!(financial.targetCost || financial.contractValue || financial.gmp),
      };

      const elapsedMs = Math.max(1, Math.round(performance.now() - startTime));

      return {
        success: true,
        data: {
          projectConfiguration,
          summary,
        },
        warnings: warnings.length > 0 ? warnings : undefined,
        durationMs: elapsedMs,
      };
    } catch (error) {
      return {
        success: false,
        errors: [(error as Error).message],
        durationMs: Math.max(1, Math.round(performance.now() - startTime)),
      };
    }
  },
};

// ============================================================================
// Tool Registry
// ============================================================================

/**
 * All contract onboarding tools
 */
export const contractOnboardingTools: ContractToolDefinition[] = [
  parseContractTool,
  extractAuthorityCascadeTool,
  configureProjectFromContractTool,
];

/**
 * Get a tool by name
 */
export function getContractToolByName(name: string): ContractToolDefinition | undefined {
  return contractOnboardingTools.find(tool => tool.name === name);
}

/**
 * Get all tool names
 */
export function getContractToolNames(): string[] {
  return contractOnboardingTools.map(tool => tool.name);
}

/**
 * Register contract onboarding tools with an MCP server
 */
export function registerContractTools(server: {
  registerTool: (tool: ContractToolDefinition) => void;
}): void {
  for (const tool of contractOnboardingTools) {
    server.registerTool(tool);
  }
}

// ============================================================================
// Service Export
// ============================================================================

export const ContractOnboardingToolsService = {
  // Tools
  parseContractTool,
  extractAuthorityCascadeTool,
  configureProjectFromContractTool,

  // Registry
  contractOnboardingTools,
  getContractToolByName,
  getContractToolNames,
  registerContractTools,
};

export default ContractOnboardingToolsService;

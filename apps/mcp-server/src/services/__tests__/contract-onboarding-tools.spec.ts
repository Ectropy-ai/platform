/**
 * Contract Onboarding MCP Tools Tests - CO-M4
 *
 * Test-first development for Contract Onboarding MCP tools.
 * These tools expose contract parsing, authority mapping, and
 * project configuration through the MCP interface.
 *
 * Tools Implemented (3 total):
 * - parse_contract: Parse uploaded contract documents
 * - extract_authority_cascade: Extract authority mappings from parsed contract
 * - configure_project_from_contract: Auto-configure project from contract data
 *
 * @see .roadmap/features/contract-onboarding/FEATURE.json
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  ContractFamily,
  ContractType,
  DeliveryMethod,
  ContractPartyRole,
  type ContractExtractionResult,
  type ParseContractInput,
  CONFIDENCE_THRESHOLDS,
} from '../../types/contract.types.js';

import { AuthorityLevel } from '../../types/pm.types.js';

// Import the tools module (to be implemented)
import {
  // Tool definitions
  parseContractTool,
  extractAuthorityCascadeTool,
  configureProjectFromContractTool,

  // Tool registry
  contractOnboardingTools,
  getContractToolByName,
  getContractToolNames,

  // Types
  type ContractToolDefinition,
  type ContractToolResult,
  type ExtractAuthorityCascadeData,
  type ConfigureProjectData,
} from '../contract-onboarding-tools.js';

// ============================================================================
// Mock Data
// ============================================================================

const sampleAIAContractBase64 = Buffer.from(`
AIA Document C191-2009
MULTI-PARTY AGREEMENT FOR INTEGRATED PROJECT DELIVERY

THIS AGREEMENT made as of the 15th day of January in the year 2026

BETWEEN the OWNER:
Acme Development Corporation
123 Main Street, Suite 500
New York, NY 10001
Contact: John Smith, john@acme.com

AND the ARCHITECT:
Smith & Associates Architecture, P.C.
456 Design Boulevard
New York, NY 10002
Contact: Jane Doe, jane@smitharch.com

AND the CONTRACTOR:
BuildRight General Contractors, Inc.
789 Construction Way
Newark, NJ 07101
Contact: Bob Builder, bob@buildright.com

ARTICLE 2 - TARGET COST AND COMPENSATION

2.1 The Target Cost for the Project is Fifty Million Dollars ($50,000,000.00).

2.2 The parties agree to share any savings below the Target Cost as follows:
- Owner: 40%
- Architect: 30%
- Contractor: 30%

ARTICLE 3 - PROJECT MANAGEMENT

3.1 The Project Management Team (PMT) shall consist of one representative from each Party.

3.2 The Project Executive Team (PET) shall have final authority on matters exceeding $100,000.

3.3 PMT decisions shall be made by majority vote within 72 hours.

ARTICLE 4 - KEY DATES

4.1 Commencement Date: March 1, 2026
4.2 Substantial Completion: June 30, 2028
4.3 Final Completion: September 30, 2028
`).toString('base64');

const mockExtractionResult: ContractExtractionResult = {
  extractionId: 'ext-test-001',
  sourceDocument: {
    filename: 'test-contract.pdf',
    mimeType: 'application/pdf',
    pageCount: 3,
    sha256Hash: 'abc123',
  },
  templateUsed: 'urn:luhtech:ectropy:contract-template:AIA-C191-2009' as any,
  contractInfo: {
    family: {
      value: ContractFamily.AIA,
      confidence: 0.95,
      sources: [],
      method: 'pattern',
      needsReview: false,
    },
    type: {
      value: ContractType.IPD_MULTI_PARTY,
      confidence: 0.9,
      sources: [],
      method: 'pattern',
      needsReview: false,
    },
    deliveryMethod: {
      value: DeliveryMethod.IPD,
      confidence: 0.92,
      sources: [],
      method: 'pattern',
      needsReview: false,
    },
  },
  parties: [
    {
      name: { value: 'Acme Development Corporation', confidence: 0.95, sources: [], method: 'pattern', needsReview: false },
      role: { value: ContractPartyRole.OWNER, confidence: 0.98, sources: [], method: 'pattern', needsReview: false },
      mappedAuthorityLevel: AuthorityLevel.OWNER,
    },
    {
      name: { value: 'Smith & Associates Architecture, P.C.', confidence: 0.93, sources: [], method: 'pattern', needsReview: false },
      role: { value: ContractPartyRole.ARCHITECT, confidence: 0.96, sources: [], method: 'pattern', needsReview: false },
      mappedAuthorityLevel: AuthorityLevel.ARCHITECT,
    },
    {
      name: { value: 'BuildRight General Contractors, Inc.', confidence: 0.94, sources: [], method: 'pattern', needsReview: false },
      role: { value: ContractPartyRole.CONTRACTOR, confidence: 0.97, sources: [], method: 'pattern', needsReview: false },
      mappedAuthorityLevel: AuthorityLevel.PM,
    },
  ],
  financialTerms: {
    currency: { value: 'USD', confidence: 0.99, sources: [], method: 'pattern', needsReview: false },
    targetCost: { value: 50000000, confidence: 0.92, sources: [], method: 'pattern', needsReview: false },
    savingsDistribution: {
      ownerShare: { value: 40, confidence: 0.88, sources: [], method: 'pattern', needsReview: false },
      designTeamShare: { value: 30, confidence: 0.88, sources: [], method: 'pattern', needsReview: false },
      constructionTeamShare: { value: 30, confidence: 0.88, sources: [], method: 'pattern', needsReview: false },
    },
  },
  dates: {
    commencementDate: { value: '2026-03-01', confidence: 0.9, sources: [], method: 'date', needsReview: false },
    substantialCompletion: { value: '2028-06-30', confidence: 0.88, sources: [], method: 'date', needsReview: false },
    finalCompletion: { value: '2028-09-30', confidence: 0.85, sources: [], method: 'date', needsReview: false },
  },
  governance: {
    hasPMT: { value: true, confidence: 0.95, sources: [], method: 'pattern', needsReview: false },
    hasPET: { value: true, confidence: 0.93, sources: [], method: 'pattern', needsReview: false },
    pmtVoting: {
      quorum: { value: 'majority', confidence: 0.85, sources: [], method: 'pattern', needsReview: false },
      votingWindowHours: { value: 72, confidence: 0.88, sources: [], method: 'pattern', needsReview: false },
      decisionThreshold: { value: 100000, confidence: 0.85, sources: [], method: 'pattern', needsReview: false },
    },
  },
  confidence: {
    overall: 0.91,
    fields: {
      'contractInfo.family': 0.95,
      'parties[0].name': 0.95,
      'financialTerms.targetCost': 0.92,
    },
    flaggedFields: [],
    flagReasons: {},
  },
  reviewItems: [],
  timestamps: {
    startedAt: '2026-01-23T08:00:00Z',
    completedAt: '2026-01-23T08:00:05Z',
    durationMs: 5000,
  },
};

// ============================================================================
// Tool Definition Tests
// ============================================================================

describe('ContractOnboardingTools', () => {
  describe('Tool Registry', () => {
    it('should export all contract onboarding tools', () => {
      expect(contractOnboardingTools).toBeDefined();
      expect(Array.isArray(contractOnboardingTools)).toBe(true);
      expect(contractOnboardingTools.length).toBe(3);
    });

    it('should have unique tool names', () => {
      const names = contractOnboardingTools.map(t => t.name);
      const uniqueNames = [...new Set(names)];
      expect(names.length).toBe(uniqueNames.length);
    });

    it('should get tool by name', () => {
      const tool = getContractToolByName('parse_contract');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('parse_contract');
    });

    it('should return undefined for unknown tool name', () => {
      const tool = getContractToolByName('unknown_tool');
      expect(tool).toBeUndefined();
    });

    it('should get all tool names', () => {
      const names = getContractToolNames();
      expect(names).toContain('parse_contract');
      expect(names).toContain('extract_authority_cascade');
      expect(names).toContain('configure_project_from_contract');
    });
  });

  // ============================================================================
  // parse_contract Tool Tests
  // ============================================================================

  describe('parse_contract Tool', () => {
    it('should have correct tool definition', () => {
      expect(parseContractTool.name).toBe('parse_contract');
      expect(parseContractTool.description).toContain('Parse');
      expect(parseContractTool.inputSchema.type).toBe('object');
      expect(parseContractTool.inputSchema.required).toContain('filename');
      expect(parseContractTool.inputSchema.required).toContain('content');
    });

    it('should define required input properties', () => {
      const props = parseContractTool.inputSchema.properties;
      expect(props.filename).toBeDefined();
      expect(props.content).toBeDefined();
      expect(props.mimeType).toBeDefined();
      expect(props.templateUrn).toBeDefined();
    });

    it('should parse contract document successfully', async () => {
      const result = await parseContractTool.handler({
        filename: 'aia-c191-contract.txt',
        content: sampleAIAContractBase64,
        mimeType: 'text/plain',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.extraction).toBeDefined();
    });

    it('should detect contract family from content', async () => {
      const result = await parseContractTool.handler({
        filename: 'contract.txt',
        content: sampleAIAContractBase64,
        mimeType: 'text/plain',
      });

      expect(result.success).toBe(true);
      expect(result.data?.extraction?.contractInfo?.family?.value).toBe(ContractFamily.AIA);
    });

    it('should extract parties from contract', async () => {
      const result = await parseContractTool.handler({
        filename: 'contract.txt',
        content: sampleAIAContractBase64,
        mimeType: 'text/plain',
      });

      expect(result.success).toBe(true);
      const parties = result.data?.extraction?.parties;
      expect(parties).toBeDefined();
      expect(parties?.length).toBeGreaterThan(0);
    });

    it('should extract financial terms', async () => {
      const result = await parseContractTool.handler({
        filename: 'contract.txt',
        content: sampleAIAContractBase64,
        mimeType: 'text/plain',
      });

      expect(result.success).toBe(true);
      const terms = result.data?.extraction?.financialTerms;
      expect(terms?.targetCost?.value).toBe(50000000);
    });

    it('should return confidence scores', async () => {
      const result = await parseContractTool.handler({
        filename: 'contract.txt',
        content: sampleAIAContractBase64,
        mimeType: 'text/plain',
      });

      expect(result.success).toBe(true);
      expect(result.data?.extraction?.confidence?.overall).toBeGreaterThan(0);
    });

    it('should handle empty content gracefully', async () => {
      const result = await parseContractTool.handler({
        filename: 'empty.txt',
        content: Buffer.from('').toString('base64'),
        mimeType: 'text/plain',
      });

      // Should still succeed but with low confidence
      expect(result.success).toBe(true);
    });

    it('should return suggested template', async () => {
      const result = await parseContractTool.handler({
        filename: 'contract.txt',
        content: sampleAIAContractBase64,
        mimeType: 'text/plain',
      });

      expect(result.success).toBe(true);
      expect(result.data?.suggestedTemplate).toBeDefined();
    });

    it('should track processing duration', async () => {
      const result = await parseContractTool.handler({
        filename: 'contract.txt',
        content: sampleAIAContractBase64,
        mimeType: 'text/plain',
      });

      expect(result.success).toBe(true);
      expect(result.durationMs).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // extract_authority_cascade Tool Tests
  // ============================================================================

  describe('extract_authority_cascade Tool', () => {
    it('should have correct tool definition', () => {
      expect(extractAuthorityCascadeTool.name).toBe('extract_authority_cascade');
      expect(extractAuthorityCascadeTool.description).toContain('authority');
      expect(extractAuthorityCascadeTool.inputSchema.type).toBe('object');
      expect(extractAuthorityCascadeTool.inputSchema.required).toContain('extractionResult');
    });

    it('should define extraction result input property', () => {
      const props = extractAuthorityCascadeTool.inputSchema.properties;
      expect(props.extractionResult).toBeDefined();
    });

    it('should extract authority cascade from extraction result', async () => {
      const result = await extractAuthorityCascadeTool.handler({
        extractionResult: mockExtractionResult,
      });

      expect(result.success).toBe(true);
      expect(result.data?.authorityCascade).toBeDefined();
    });

    it('should map parties to authority levels', async () => {
      const result = await extractAuthorityCascadeTool.handler({
        extractionResult: mockExtractionResult,
      });

      expect(result.success).toBe(true);
      // Check that levels array is properly constructed
      expect(result.data?.levels).toBeDefined();
    });

    it('should include 7-tier cascade structure', async () => {
      const result = await extractAuthorityCascadeTool.handler({
        extractionResult: mockExtractionResult,
      });

      expect(result.success).toBe(true);
      // 7 tiers: FIELD, FOREMAN, SUPERINTENDENT, PM, ARCHITECT, OWNER, REGULATORY
      expect(result.data?.levels?.length).toBe(7);
    });

    it('should map project participants', async () => {
      const result = await extractAuthorityCascadeTool.handler({
        extractionResult: mockExtractionResult,
      });

      expect(result.success).toBe(true);
      expect(result.data?.participants).toBeDefined();
      expect(result.data?.participants?.length).toBeGreaterThan(0);
    });

    it('should identify IPD governance when present', async () => {
      const result = await extractAuthorityCascadeTool.handler({
        extractionResult: mockExtractionResult,
      });

      expect(result.success).toBe(true);
      expect(result.data?.ipdGovernance).toBeDefined();
      expect(result.data?.ipdGovernance?.hasPMT).toBe(true);
      expect(result.data?.ipdGovernance?.hasPET).toBe(true);
    });

    it('should include decision thresholds', async () => {
      const result = await extractAuthorityCascadeTool.handler({
        extractionResult: mockExtractionResult,
      });

      expect(result.success).toBe(true);
      const thresholds = result.data?.decisionThresholds;
      expect(thresholds).toBeDefined();
    });

    it('should handle missing parties gracefully', async () => {
      const emptyExtraction: ContractExtractionResult = {
        ...mockExtractionResult,
        parties: [],
      };

      const result = await extractAuthorityCascadeTool.handler({
        extractionResult: emptyExtraction,
      });

      expect(result.success).toBe(true);
      expect(result.data?.participants?.length).toBe(0);
    });

    it('should track processing duration', async () => {
      const result = await extractAuthorityCascadeTool.handler({
        extractionResult: mockExtractionResult,
      });

      expect(result.success).toBe(true);
      expect(result.durationMs).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // configure_project_from_contract Tool Tests
  // ============================================================================

  describe('configure_project_from_contract Tool', () => {
    it('should have correct tool definition', () => {
      expect(configureProjectFromContractTool.name).toBe('configure_project_from_contract');
      expect(configureProjectFromContractTool.description).toContain('project');
      expect(configureProjectFromContractTool.inputSchema.type).toBe('object');
      expect(configureProjectFromContractTool.inputSchema.required).toContain('extractionResult');
      expect(configureProjectFromContractTool.inputSchema.required).toContain('projectId');
    });

    it('should define all input properties', () => {
      const props = configureProjectFromContractTool.inputSchema.properties;
      expect(props.extractionResult).toBeDefined();
      expect(props.projectId).toBeDefined();
      expect(props.projectName).toBeDefined();
      expect(props.tenantId).toBeDefined();
    });

    it('should create project configuration from extraction', async () => {
      const result = await configureProjectFromContractTool.handler({
        extractionResult: mockExtractionResult,
        projectId: 'PROJ-TEST-001',
        projectName: 'Test Construction Project',
      });

      expect(result.success).toBe(true);
      expect(result.data?.projectConfiguration).toBeDefined();
    });

    it('should configure authority cascade for project', async () => {
      const result = await configureProjectFromContractTool.handler({
        extractionResult: mockExtractionResult,
        projectId: 'PROJ-TEST-001',
      });

      expect(result.success).toBe(true);
      expect(result.data?.projectConfiguration?.authorityCascade).toBeDefined();
    });

    it('should configure team structure', async () => {
      const result = await configureProjectFromContractTool.handler({
        extractionResult: mockExtractionResult,
        projectId: 'PROJ-TEST-001',
      });

      expect(result.success).toBe(true);
      expect(result.data?.projectConfiguration?.team).toBeDefined();
      expect(result.data?.projectConfiguration?.team?.length).toBeGreaterThan(0);
    });

    it('should configure IPD governance when applicable', async () => {
      const result = await configureProjectFromContractTool.handler({
        extractionResult: mockExtractionResult,
        projectId: 'PROJ-TEST-001',
      });

      expect(result.success).toBe(true);
      const config = result.data?.projectConfiguration;
      expect(config?.governance?.pmtEnabled).toBe(true);
      expect(config?.governance?.petEnabled).toBe(true);
    });

    it('should configure project milestones from dates', async () => {
      const result = await configureProjectFromContractTool.handler({
        extractionResult: mockExtractionResult,
        projectId: 'PROJ-TEST-001',
      });

      expect(result.success).toBe(true);
      const milestones = result.data?.projectConfiguration?.milestones;
      expect(milestones).toBeDefined();
      expect(milestones?.commencementDate).toBe('2026-03-01');
    });

    it('should configure financial settings', async () => {
      const result = await configureProjectFromContractTool.handler({
        extractionResult: mockExtractionResult,
        projectId: 'PROJ-TEST-001',
      });

      expect(result.success).toBe(true);
      const financial = result.data?.projectConfiguration?.financial;
      expect(financial?.targetCost).toBe(50000000);
      expect(financial?.currency).toBe('USD');
    });

    it('should support tenant configuration', async () => {
      const result = await configureProjectFromContractTool.handler({
        extractionResult: mockExtractionResult,
        projectId: 'PROJ-TEST-001',
        tenantId: 'TENANT-001',
      });

      expect(result.success).toBe(true);
      expect(result.data?.projectConfiguration?.tenantId).toBe('TENANT-001');
    });

    it('should generate project URN', async () => {
      const result = await configureProjectFromContractTool.handler({
        extractionResult: mockExtractionResult,
        projectId: 'PROJ-TEST-001',
      });

      expect(result.success).toBe(true);
      expect(result.data?.projectConfiguration?.urn).toContain('PROJ-TEST-001');
    });

    it('should include configuration summary', async () => {
      const result = await configureProjectFromContractTool.handler({
        extractionResult: mockExtractionResult,
        projectId: 'PROJ-TEST-001',
      });

      expect(result.success).toBe(true);
      expect(result.data?.summary).toBeDefined();
      expect(result.data?.summary?.partiesConfigured).toBeGreaterThan(0);
      expect(result.data?.summary?.authorityLevelsSet).toBeGreaterThan(0);
    });

    it('should track processing duration', async () => {
      const result = await configureProjectFromContractTool.handler({
        extractionResult: mockExtractionResult,
        projectId: 'PROJ-TEST-001',
      });

      expect(result.success).toBe(true);
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it('should handle low confidence extraction with warnings', async () => {
      const lowConfidenceExtraction: ContractExtractionResult = {
        ...mockExtractionResult,
        confidence: {
          ...mockExtractionResult.confidence,
          overall: 0.5,
          flaggedFields: ['parties[0].name'],
          flagReasons: { 'parties[0].name': 'Low confidence' },
        },
      };

      const result = await configureProjectFromContractTool.handler({
        extractionResult: lowConfidenceExtraction,
        projectId: 'PROJ-TEST-001',
      });

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration', () => {
    it('should complete full workflow: parse -> extract -> configure', async () => {
      // Step 1: Parse contract
      const parseResult = await parseContractTool.handler({
        filename: 'contract.txt',
        content: sampleAIAContractBase64,
        mimeType: 'text/plain',
      });

      expect(parseResult.success).toBe(true);
      const extraction = parseResult.data?.extraction;
      expect(extraction).toBeDefined();

      // Step 2: Extract authority cascade
      const cascadeResult = await extractAuthorityCascadeTool.handler({
        extractionResult: extraction!,
      });

      expect(cascadeResult.success).toBe(true);
      expect(cascadeResult.data?.authorityCascade).toBeDefined();

      // Step 3: Configure project
      const configResult = await configureProjectFromContractTool.handler({
        extractionResult: extraction!,
        projectId: 'PROJ-INTEGRATION-001',
        projectName: 'Integration Test Project',
      });

      expect(configResult.success).toBe(true);
      expect(configResult.data?.projectConfiguration).toBeDefined();
    });

    it('should handle AIA IPD contract end-to-end', async () => {
      const parseResult = await parseContractTool.handler({
        filename: 'aia-ipd-contract.txt',
        content: sampleAIAContractBase64,
        mimeType: 'text/plain',
      });

      expect(parseResult.success).toBe(true);

      const extraction = parseResult.data?.extraction;
      expect(extraction?.contractInfo?.family?.value).toBe(ContractFamily.AIA);
      expect(extraction?.governance?.hasPMT?.value).toBe(true);

      const configResult = await configureProjectFromContractTool.handler({
        extractionResult: extraction!,
        projectId: 'PROJ-AIA-IPD-001',
      });

      expect(configResult.success).toBe(true);
      expect(configResult.data?.projectConfiguration?.governance?.pmtEnabled).toBe(true);
    });
  });
});

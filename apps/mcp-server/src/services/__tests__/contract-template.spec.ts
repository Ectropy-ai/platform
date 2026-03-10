/**
 * Contract Template Service Tests - CO-M1
 *
 * Test-first development for Contract Template Library.
 * Tests template management, validation, and authority mappings.
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  ContractFamily,
  ContractType,
  DeliveryMethod,
  ContractPartyRole,
  type ContractTemplate,
  type ContractTemplateURN,
  type AuthorityRoleMapping,
  SUPPORTED_CONTRACTS,
  DEFAULT_AUTHORITY_MAPPINGS,
} from '../../types/contract.types.js';

import { AuthorityLevel } from '../../types/pm.types.js';

// Import the service (to be implemented)
import {
  // Template management
  getTemplate,
  getAllTemplates,
  getTemplatesByFamily,
  registerTemplate,
  validateTemplate,

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

  // Template utilities
  buildTemplateURN,
  parseTemplateURN,
  isIPDContract,

  // Service namespace
  ContractTemplateService,
} from '../contract-template.service.js';

// ============================================================================
// Test Data
// ============================================================================

const mockAIAC191Template: ContractTemplate = {
  urn: 'urn:luhtech:ectropy:contract-template:AIA-C191-2009' as ContractTemplateURN,
  family: ContractFamily.AIA,
  contractNumber: 'C191-2009',
  contractType: ContractType.IPD_MULTI_PARTY,
  deliveryMethod: DeliveryMethod.IPD,
  displayName: 'AIA C191-2009 Multi-Party Agreement for IPD',
  description: 'Standard form of multi-party agreement for Integrated Project Delivery',
  version: '1.0.0',
  documentStructure: {
    articles: [
      { number: '1', title: 'Project Team', purpose: 'Define parties and roles' },
      { number: '2', title: 'Target Cost', purpose: 'Financial terms and targets' },
      { number: '3', title: 'Management of the Project', purpose: 'Governance structure' },
      { number: '4', title: 'Compensation', purpose: 'Payment and profit distribution' },
    ],
    exhibits: ['A - Project Description', 'B - Target Cost', 'C - Insurance'],
    keyClauses: ['Target Cost', 'PMT', 'PET', 'Shared Savings', 'At-Risk'],
  },
  extractionRules: [
    {
      fieldPath: 'parties[].name',
      method: 'llm',
      llmPrompt: 'Extract the legal name of each party from Article 1',
      articleHint: ['1'],
      dataType: 'string',
      required: true,
      confidenceThreshold: 0.85,
    },
    {
      fieldPath: 'financialTerms.targetCost',
      method: 'pattern',
      pattern: '\\$([\\d,]+(?:\\.\\d{2})?)',
      articleHint: ['2', 'Exhibit B'],
      dataType: 'number',
      required: true,
      confidenceThreshold: 0.9,
    },
    {
      fieldPath: 'governance.hasPMT',
      method: 'regex',
      pattern: 'Project Management Team|PMT',
      articleHint: ['3'],
      dataType: 'boolean',
      required: true,
      defaultValue: true,
      confidenceThreshold: 0.8,
    },
  ],
  authorityMappings: [
    {
      contractRole: 'Owner',
      authorityLevel: AuthorityLevel.OWNER,
      participantRole: ContractPartyRole.OWNER,
      permissions: ['approve_all', 'escalate', 'view_all'],
      canApprove: true,
      canEscalate: true,
    },
    {
      contractRole: 'Architect',
      authorityLevel: AuthorityLevel.ARCHITECT,
      participantRole: ContractPartyRole.ARCHITECT,
      permissions: ['approve_design', 'escalate', 'view_all'],
      canApprove: true,
      canEscalate: true,
    },
    {
      contractRole: 'Contractor',
      authorityLevel: AuthorityLevel.PM,
      participantRole: ContractPartyRole.CONTRACTOR,
      permissions: ['approve_construction', 'escalate', 'view_construction'],
      canApprove: true,
      canEscalate: true,
    },
  ],
  ipdGovernance: {
    hasPMT: true,
    hasPET: true,
    pmtVotingDefault: 'majority',
    petEscalationTriggers: ['budget_overrun', 'schedule_delay_30_days', 'scope_change'],
  },
  validationRules: [
    {
      name: 'has_minimum_parties',
      description: 'IPD requires at least 3 parties',
      rule: 'parties.length >= 3',
    },
    {
      name: 'has_target_cost',
      description: 'IPD requires target cost',
      rule: 'financialTerms.targetCost > 0',
    },
  ],
};

const mockCCDC2Template: ContractTemplate = {
  urn: 'urn:luhtech:ectropy:contract-template:CCDC-2-2020' as ContractTemplateURN,
  family: ContractFamily.CCDC,
  contractNumber: 'CCDC 2-2020',
  contractType: ContractType.STIPULATED_SUM,
  deliveryMethod: DeliveryMethod.DBB,
  displayName: 'CCDC 2-2020 Stipulated Price Contract',
  description: 'Standard Canadian construction contract for stipulated price projects',
  version: '1.0.0',
  documentStructure: {
    articles: [
      { number: 'A-1', title: 'The Contract', purpose: 'Contract documents and priority' },
      { number: 'A-2', title: 'Contract Price', purpose: 'Stipulated price' },
      { number: 'GC 1', title: 'General Conditions', purpose: 'Roles and responsibilities' },
    ],
    exhibits: [],
    keyClauses: ['Contract Price', 'Owner', 'Contractor', 'Consultant'],
  },
  extractionRules: [
    {
      fieldPath: 'parties[].name',
      method: 'llm',
      llmPrompt: 'Extract party names from agreement section',
      dataType: 'string',
      required: true,
      confidenceThreshold: 0.85,
    },
    {
      fieldPath: 'financialTerms.contractValue',
      method: 'pattern',
      pattern: '\\$([\\d,]+(?:\\.\\d{2})?)',
      articleHint: ['A-2'],
      dataType: 'number',
      required: true,
      confidenceThreshold: 0.9,
    },
  ],
  authorityMappings: [
    {
      contractRole: 'Owner',
      authorityLevel: AuthorityLevel.OWNER,
      participantRole: ContractPartyRole.OWNER,
      permissions: ['approve_all', 'escalate'],
      canApprove: true,
      canEscalate: true,
    },
    {
      contractRole: 'Consultant',
      authorityLevel: AuthorityLevel.ARCHITECT,
      participantRole: ContractPartyRole.CONSULTANT,
      permissions: ['approve_design', 'escalate'],
      canApprove: true,
      canEscalate: true,
    },
    {
      contractRole: 'Contractor',
      authorityLevel: AuthorityLevel.PM,
      participantRole: ContractPartyRole.CONTRACTOR,
      permissions: ['approve_construction', 'escalate'],
      canApprove: true,
      canEscalate: true,
    },
  ],
  validationRules: [
    {
      name: 'has_two_parties',
      description: 'CCDC 2 requires at least Owner and Contractor',
      rule: 'parties.length >= 2',
    },
  ],
};

// ============================================================================
// Template Management Tests
// ============================================================================

describe('ContractTemplateService', () => {
  beforeEach(() => {
    // Clear any registered templates before each test
    ContractTemplateService.clearTemplates?.();
  });

  describe('Template Management', () => {
    describe('getTemplate', () => {
      it('should return registered template by URN', () => {
        registerTemplate(mockAIAC191Template);

        const template = getTemplate(mockAIAC191Template.urn);

        expect(template).toBeDefined();
        expect(template?.urn).toBe(mockAIAC191Template.urn);
        expect(template?.family).toBe(ContractFamily.AIA);
      });

      it('should return undefined for non-existent template', () => {
        const template = getTemplate('urn:luhtech:ectropy:contract-template:NON-EXISTENT' as ContractTemplateURN);

        expect(template).toBeUndefined();
      });

      it('should return template with complete structure', () => {
        registerTemplate(mockAIAC191Template);

        const template = getTemplate(mockAIAC191Template.urn);

        expect(template?.extractionRules).toBeDefined();
        expect(template?.extractionRules.length).toBeGreaterThan(0);
        expect(template?.authorityMappings).toBeDefined();
        expect(template?.validationRules).toBeDefined();
      });
    });

    describe('getAllTemplates', () => {
      it('should return empty array when no templates registered', () => {
        const templates = getAllTemplates();

        expect(templates).toEqual([]);
      });

      it('should return all registered templates', () => {
        registerTemplate(mockAIAC191Template);
        registerTemplate(mockCCDC2Template);

        const templates = getAllTemplates();

        expect(templates).toHaveLength(2);
        expect(templates.map(t => t.urn)).toContain(mockAIAC191Template.urn);
        expect(templates.map(t => t.urn)).toContain(mockCCDC2Template.urn);
      });
    });

    describe('getTemplatesByFamily', () => {
      it('should return templates for specific family', () => {
        registerTemplate(mockAIAC191Template);
        registerTemplate(mockCCDC2Template);

        const aiaTemplates = getTemplatesByFamily(ContractFamily.AIA);

        expect(aiaTemplates).toHaveLength(1);
        expect(aiaTemplates[0].family).toBe(ContractFamily.AIA);
      });

      it('should return empty array for family with no templates', () => {
        registerTemplate(mockAIAC191Template);

        const fidic = getTemplatesByFamily(ContractFamily.FIDIC);

        expect(fidic).toEqual([]);
      });
    });

    describe('registerTemplate', () => {
      it('should register valid template', () => {
        const result = registerTemplate(mockAIAC191Template);

        expect(result.success).toBe(true);
        expect(result.urn).toBe(mockAIAC191Template.urn);
      });

      it('should reject template with invalid URN pattern', () => {
        const invalidTemplate = {
          ...mockAIAC191Template,
          urn: 'invalid-urn' as ContractTemplateURN,
        };

        const result = registerTemplate(invalidTemplate);

        expect(result.success).toBe(false);
        expect(result.errors).toContain('Invalid URN format');
      });

      it('should reject template with missing required fields', () => {
        const incompleteTemplate = {
          urn: mockAIAC191Template.urn,
          family: ContractFamily.AIA,
          // Missing other required fields
        } as unknown as ContractTemplate;

        const result = registerTemplate(incompleteTemplate);

        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should update existing template when re-registered', () => {
        registerTemplate(mockAIAC191Template);

        const updatedTemplate = {
          ...mockAIAC191Template,
          version: '2.0.0',
        };

        const result = registerTemplate(updatedTemplate);

        expect(result.success).toBe(true);

        const template = getTemplate(mockAIAC191Template.urn);
        expect(template?.version).toBe('2.0.0');
      });
    });

    describe('validateTemplate', () => {
      it('should validate complete template', () => {
        const result = validateTemplate(mockAIAC191Template);

        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('should detect missing extraction rules', () => {
        const templateNoRules = {
          ...mockAIAC191Template,
          extractionRules: [],
        };

        const result = validateTemplate(templateNoRules);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Template must have at least one extraction rule');
      });

      it('should detect missing authority mappings', () => {
        const templateNoMappings = {
          ...mockAIAC191Template,
          authorityMappings: [],
        };

        const result = validateTemplate(templateNoMappings);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Template must have at least one authority mapping');
      });

      it('should validate extraction rule confidence thresholds', () => {
        const templateBadThreshold = {
          ...mockAIAC191Template,
          extractionRules: [
            {
              ...mockAIAC191Template.extractionRules[0],
              confidenceThreshold: 1.5, // Invalid
            },
          ],
        };

        const result = validateTemplate(templateBadThreshold);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('confidence'))).toBe(true);
      });
    });
  });

  // ============================================================================
  // Template Matching Tests
  // ============================================================================

  describe('Template Matching', () => {
    beforeEach(() => {
      registerTemplate(mockAIAC191Template);
      registerTemplate(mockCCDC2Template);
    });

    describe('detectContractType', () => {
      it('should detect AIA contract from text', () => {
        const text = `
          AIA Document C191-2009
          Multi-Party Agreement for Integrated Project Delivery

          This Agreement is made between the Owner, Architect, and Contractor...
        `;

        const result = detectContractType(text);

        expect(result.family).toBe(ContractFamily.AIA);
        expect(result.confidence).toBeGreaterThan(0.8);
      });

      it('should detect CCDC contract from text', () => {
        const text = `
          CCDC 2 - 2020
          STIPULATED PRICE CONTRACT

          This Agreement made between the Owner and the Contractor...
        `;

        const result = detectContractType(text);

        expect(result.family).toBe(ContractFamily.CCDC);
        expect(result.confidence).toBeGreaterThan(0.6); // Pattern-based detection
      });

      it('should return low confidence for ambiguous text', () => {
        const text = 'This is a construction contract between parties.';

        const result = detectContractType(text);

        expect(result.confidence).toBeLessThan(0.5);
      });

      it('should detect IPD contract type', () => {
        const text = `
          AIA C191-2009
          Integrated Project Delivery
          Target Cost: $50,000,000
          PMT Members: Owner, Architect, Contractor
        `;

        const result = detectContractType(text);

        expect(result.contractType).toBe(ContractType.IPD_MULTI_PARTY);
        expect(result.isIPD).toBe(true);
      });
    });

    describe('matchTemplate', () => {
      it('should match template by contract number', () => {
        const result = matchTemplate({
          contractNumber: 'C191-2009',
          family: ContractFamily.AIA,
        });

        expect(result.template?.urn).toBe(mockAIAC191Template.urn);
        expect(result.confidence).toBeGreaterThan(0.7); // Contract number + family match
      });

      it('should match template by family and type', () => {
        const result = matchTemplate({
          family: ContractFamily.CCDC,
          contractType: ContractType.STIPULATED_SUM,
        });

        expect(result.template?.urn).toBe(mockCCDC2Template.urn);
      });

      it('should return no match for unsupported contract', () => {
        const result = matchTemplate({
          family: ContractFamily.FIDIC,
          contractType: ContractType.DESIGN_BUILD,
        });

        expect(result.template).toBeUndefined();
        expect(result.confidence).toBe(0);
      });

      it('should return multiple candidates when ambiguous', () => {
        // Register another AIA template
        const aiaA133: ContractTemplate = {
          ...mockAIAC191Template,
          urn: 'urn:luhtech:ectropy:contract-template:AIA-A133-2019' as ContractTemplateURN,
          contractNumber: 'A133-2019',
          contractType: ContractType.GMP,
        };
        registerTemplate(aiaA133);

        const result = matchTemplate({
          family: ContractFamily.AIA,
        });

        expect(result.candidates.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('getSuggestedTemplate', () => {
      it('should suggest template from document text', () => {
        const documentText = `
          CCDC 2 - 2020
          STIPULATED PRICE CONTRACT

          BETWEEN the OWNER and CONTRACTOR
          Contract Price: $10,000,000
        `;

        const suggestion = getSuggestedTemplate(documentText);

        expect(suggestion.templateUrn).toBe(mockCCDC2Template.urn);
        expect(suggestion.confidence).toBeGreaterThan(0.3); // Detection + template match
      });

      it('should provide reasoning for suggestion', () => {
        const documentText = 'AIA C191-2009 Integrated Project Delivery';

        const suggestion = getSuggestedTemplate(documentText);

        expect(suggestion.reasoning).toBeDefined();
        expect(suggestion.reasoning.length).toBeGreaterThan(0);
      });
    });
  });

  // ============================================================================
  // Authority Mapping Tests
  // ============================================================================

  describe('Authority Mappings', () => {
    beforeEach(() => {
      registerTemplate(mockAIAC191Template);
    });

    describe('getDefaultAuthorityMappings', () => {
      it('should return default mappings for all roles', () => {
        const mappings = getDefaultAuthorityMappings();

        expect(mappings[ContractPartyRole.OWNER]).toBe(AuthorityLevel.OWNER);
        expect(mappings[ContractPartyRole.ARCHITECT]).toBe(AuthorityLevel.ARCHITECT);
        expect(mappings[ContractPartyRole.CONTRACTOR]).toBe(AuthorityLevel.PM);
        expect(mappings[ContractPartyRole.SUBCONTRACTOR]).toBe(AuthorityLevel.SUPERINTENDENT);
      });
    });

    describe('getRoleMappingForLevel', () => {
      it('should return roles that map to authority level', () => {
        const pmRoles = getRoleMappingForLevel(AuthorityLevel.PM);

        expect(pmRoles).toContain(ContractPartyRole.CONTRACTOR);
        expect(pmRoles).toContain(ContractPartyRole.KEY_PARTICIPANT);
      });

      it('should return empty array for level with no default mappings', () => {
        const fieldRoles = getRoleMappingForLevel(AuthorityLevel.FIELD);

        expect(fieldRoles).toEqual([]);
      });
    });

    describe('getAuthorityLevelForRole', () => {
      it('should return authority level for contract role', () => {
        const level = getAuthorityLevelForRole(
          mockAIAC191Template.urn,
          'Owner'
        );

        expect(level).toBe(AuthorityLevel.OWNER);
      });

      it('should return default mapping if role not in template', () => {
        const level = getAuthorityLevelForRole(
          mockAIAC191Template.urn,
          'Subcontractor' // Not explicitly in C191 template
        );

        expect(level).toBe(DEFAULT_AUTHORITY_MAPPINGS[ContractPartyRole.SUBCONTRACTOR]);
      });

      it('should handle case-insensitive role names', () => {
        const level = getAuthorityLevelForRole(
          mockAIAC191Template.urn,
          'OWNER'
        );

        expect(level).toBe(AuthorityLevel.OWNER);
      });
    });
  });

  // ============================================================================
  // Extraction Rule Tests
  // ============================================================================

  describe('Extraction Rules', () => {
    beforeEach(() => {
      registerTemplate(mockAIAC191Template);
    });

    describe('getExtractionRules', () => {
      it('should return extraction rules for template', () => {
        const rules = getExtractionRules(mockAIAC191Template.urn);

        expect(rules).toBeDefined();
        expect(rules.length).toBe(mockAIAC191Template.extractionRules.length);
      });

      it('should return empty array for non-existent template', () => {
        const rules = getExtractionRules('urn:luhtech:ectropy:contract-template:FAKE' as ContractTemplateURN);

        expect(rules).toEqual([]);
      });
    });

    describe('getRequiredFields', () => {
      it('should return only required fields', () => {
        const required = getRequiredFields(mockAIAC191Template.urn);

        expect(required.every(r => r.required)).toBe(true);
      });

      it('should include party names as required', () => {
        const required = getRequiredFields(mockAIAC191Template.urn);

        expect(required.some(r => r.fieldPath.includes('parties'))).toBe(true);
      });
    });

    describe('validateExtractionRules', () => {
      it('should validate well-formed rules', () => {
        const result = validateExtractionRules(mockAIAC191Template.extractionRules);

        expect(result.valid).toBe(true);
      });

      it('should reject rules with invalid method', () => {
        const badRules = [
          {
            ...mockAIAC191Template.extractionRules[0],
            method: 'invalid' as any,
          },
        ];

        const result = validateExtractionRules(badRules);

        expect(result.valid).toBe(false);
      });

      it('should require pattern for regex method', () => {
        const badRules = [
          {
            ...mockAIAC191Template.extractionRules[0],
            method: 'regex' as const,
            pattern: undefined,
          },
        ];

        const result = validateExtractionRules(badRules);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('pattern'))).toBe(true);
      });

      it('should require llmPrompt for llm method', () => {
        const badRules = [
          {
            ...mockAIAC191Template.extractionRules[0],
            method: 'llm' as const,
            llmPrompt: undefined,
          },
        ];

        const result = validateExtractionRules(badRules);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('llmPrompt'))).toBe(true);
      });
    });
  });

  // ============================================================================
  // Template Utility Tests
  // ============================================================================

  describe('Template Utilities', () => {
    describe('buildTemplateURN', () => {
      it('should build valid URN from family and contract number', () => {
        const urn = buildTemplateURN(ContractFamily.AIA, 'C191-2009');

        expect(urn).toBe('urn:luhtech:ectropy:contract-template:AIA-C191-2009');
      });

      it('should normalize contract number format', () => {
        const urn = buildTemplateURN(ContractFamily.CCDC, '2-2020');

        expect(urn).toBe('urn:luhtech:ectropy:contract-template:CCDC-2-2020');
      });
    });

    describe('parseTemplateURN', () => {
      it('should parse family and contract number from URN', () => {
        const result = parseTemplateURN('urn:luhtech:ectropy:contract-template:AIA-C191-2009' as ContractTemplateURN);

        expect(result.family).toBe(ContractFamily.AIA);
        expect(result.contractNumber).toBe('C191-2009');
      });

      it('should return null for invalid URN', () => {
        const result = parseTemplateURN('invalid-urn' as ContractTemplateURN);

        expect(result).toBeNull();
      });
    });

    describe('isIPDContract', () => {
      beforeEach(() => {
        registerTemplate(mockAIAC191Template);
        registerTemplate(mockCCDC2Template);
      });

      it('should return true for IPD contracts', () => {
        const result = isIPDContract(mockAIAC191Template.urn);

        expect(result).toBe(true);
      });

      it('should return false for non-IPD contracts', () => {
        const result = isIPDContract(mockCCDC2Template.urn);

        expect(result).toBe(false);
      });

      it('should check for IPD governance structure', () => {
        const template = getTemplate(mockAIAC191Template.urn);

        expect(template?.ipdGovernance).toBeDefined();
        expect(template?.ipdGovernance?.hasPMT).toBe(true);
        expect(template?.ipdGovernance?.hasPET).toBe(true);
      });
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration', () => {
    it('should support full template workflow', () => {
      // 1. Register template
      const regResult = registerTemplate(mockAIAC191Template);
      expect(regResult.success).toBe(true);

      // 2. Validate template
      const valResult = validateTemplate(mockAIAC191Template);
      expect(valResult.valid).toBe(true);

      // 3. Match template
      const matchResult = matchTemplate({
        family: ContractFamily.AIA,
        contractNumber: 'C191-2009',
      });
      expect(matchResult.template?.urn).toBe(mockAIAC191Template.urn);

      // 4. Get extraction rules
      const rules = getExtractionRules(mockAIAC191Template.urn);
      expect(rules.length).toBeGreaterThan(0);

      // 5. Get authority mappings
      const level = getAuthorityLevelForRole(mockAIAC191Template.urn, 'Owner');
      expect(level).toBe(AuthorityLevel.OWNER);
    });

    it('should support CCDC for Canadian pilot', () => {
      registerTemplate(mockCCDC2Template);

      const template = getTemplate(mockCCDC2Template.urn);

      expect(template?.family).toBe(ContractFamily.CCDC);
      expect(template?.contractNumber).toBe('CCDC 2-2020');
      expect(template?.deliveryMethod).toBe(DeliveryMethod.DBB);

      // Verify authority mappings include Canadian "Consultant" role
      const consultantMapping = template?.authorityMappings.find(
        m => m.contractRole === 'Consultant'
      );
      expect(consultantMapping).toBeDefined();
      expect(consultantMapping?.authorityLevel).toBe(AuthorityLevel.ARCHITECT);
    });

    it('should support IPD governance configuration', () => {
      registerTemplate(mockAIAC191Template);

      const template = getTemplate(mockAIAC191Template.urn);

      expect(template?.ipdGovernance?.hasPMT).toBe(true);
      expect(template?.ipdGovernance?.hasPET).toBe(true);
      expect(template?.ipdGovernance?.pmtVotingDefault).toBe('majority');
      expect(template?.ipdGovernance?.petEscalationTriggers).toContain('budget_overrun');
    });
  });

  // ============================================================================
  // Performance Tests
  // ============================================================================

  describe('Performance', () => {
    it('should register 100 templates in under 100ms', () => {
      const start = performance.now();

      for (let i = 0; i < 100; i++) {
        const template = {
          ...mockAIAC191Template,
          urn: `urn:luhtech:ectropy:contract-template:TEST-${i}` as ContractTemplateURN,
          contractNumber: `TEST-${i}`,
        };
        registerTemplate(template);
      }

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100);
    });

    it('should lookup template by URN in under 1ms', () => {
      registerTemplate(mockAIAC191Template);

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        getTemplate(mockAIAC191Template.urn);
      }
      const duration = performance.now() - start;

      const avgLookup = duration / 1000;
      expect(avgLookup).toBeLessThan(1);
    });

    it('should match template in under 5ms', () => {
      registerTemplate(mockAIAC191Template);
      registerTemplate(mockCCDC2Template);

      const start = performance.now();
      matchTemplate({
        family: ContractFamily.AIA,
        contractNumber: 'C191-2009',
      });
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(5);
    });
  });
});

/**
 * Authority Mapper Service Tests - CO-M3
 *
 * Test-first development for Authority Cascade Mapping.
 * Maps contract party roles to 7-tier authority cascade.
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  ContractFamily,
  ContractType,
  DeliveryMethod,
  ContractPartyRole,
  type ContractExtractionResult,
  type ExtractedParty,
  type ContractAuthorityCascade,
  type MappedParticipant,
  type ProjectConfiguration,
} from '../../types/contract.types.js';

import { AuthorityLevel } from '../../types/pm.types.js';

// Import the service (to be implemented)
import {
  // Authority mapping
  mapPartiesToAuthority,
  buildAuthorityCascade,
  mapContractRoleToAuthority,
  validateAuthorityCascade,

  // Participant mapping
  mapPartyToParticipant,
  mapAllPartiesToParticipants,
  resolveAuthorityConflicts,

  // IPD governance mapping
  mapIPDGovernance,
  identifyPMTMembers,
  identifyPETMembers,
  configurePMTAuthority,
  configurePETAuthority,

  // Project configuration
  buildProjectConfiguration,
  validateProjectConfiguration,
  getDefaultTenantConfig,

  // Escalation paths
  buildEscalationPaths,
  getEscalationPathForLevel,

  // Service namespace
  AuthorityMapperService,
} from '../authority-mapper.service.js';

// ============================================================================
// Test Data
// ============================================================================

const mockExtractedParties: ExtractedParty[] = [
  {
    name: { value: 'Acme Construction LLC', confidence: 0.95, sources: [], method: 'llm', needsReview: false },
    role: { value: ContractPartyRole.OWNER, confidence: 0.92, sources: [], method: 'llm', needsReview: false },
    email: { value: 'owner@acme.com', confidence: 0.88, sources: [], method: 'pattern', needsReview: false },
    mappedAuthorityLevel: AuthorityLevel.OWNER,
    ipdConfig: {
      pmtMember: { value: true, confidence: 0.9, sources: [], method: 'llm', needsReview: false },
      petMember: { value: true, confidence: 0.9, sources: [], method: 'llm', needsReview: false },
      votingWeight: { value: 1, confidence: 0.85, sources: [], method: 'pattern', needsReview: false },
      savingsShare: { value: 40, confidence: 0.8, sources: [], method: 'pattern', needsReview: false },
    },
  },
  {
    name: { value: 'Smith Architects Inc', confidence: 0.93, sources: [], method: 'llm', needsReview: false },
    role: { value: ContractPartyRole.ARCHITECT, confidence: 0.91, sources: [], method: 'llm', needsReview: false },
    email: { value: 'arch@smith.com', confidence: 0.85, sources: [], method: 'pattern', needsReview: false },
    mappedAuthorityLevel: AuthorityLevel.ARCHITECT,
    ipdConfig: {
      pmtMember: { value: true, confidence: 0.88, sources: [], method: 'llm', needsReview: false },
      petMember: { value: true, confidence: 0.87, sources: [], method: 'llm', needsReview: false },
      votingWeight: { value: 1, confidence: 0.85, sources: [], method: 'pattern', needsReview: false },
      savingsShare: { value: 30, confidence: 0.8, sources: [], method: 'pattern', needsReview: false },
    },
  },
  {
    name: { value: 'BuildRight General Contractors', confidence: 0.94, sources: [], method: 'llm', needsReview: false },
    role: { value: ContractPartyRole.CONTRACTOR, confidence: 0.93, sources: [], method: 'llm', needsReview: false },
    email: { value: 'gc@buildright.com', confidence: 0.87, sources: [], method: 'pattern', needsReview: false },
    mappedAuthorityLevel: AuthorityLevel.PM,
    ipdConfig: {
      pmtMember: { value: true, confidence: 0.9, sources: [], method: 'llm', needsReview: false },
      petMember: { value: true, confidence: 0.88, sources: [], method: 'llm', needsReview: false },
      votingWeight: { value: 1, confidence: 0.85, sources: [], method: 'pattern', needsReview: false },
      savingsShare: { value: 30, confidence: 0.8, sources: [], method: 'pattern', needsReview: false },
    },
  },
];

const mockExtractionResult: Partial<ContractExtractionResult> = {
  extractionId: 'ext-001',
  sourceDocument: {
    filename: 'contract.pdf',
    mimeType: 'application/pdf',
    pageCount: 80,
    sha256Hash: 'abc123',
  },
  templateUsed: 'urn:luhtech:ectropy:contract-template:AIA-C191-2009' as any,
  contractInfo: {
    family: { value: ContractFamily.AIA, confidence: 0.95, sources: [], method: 'llm', needsReview: false },
    type: { value: ContractType.IPD_MULTI_PARTY, confidence: 0.92, sources: [], method: 'llm', needsReview: false },
    deliveryMethod: { value: DeliveryMethod.IPD, confidence: 0.9, sources: [], method: 'llm', needsReview: false },
    contractNumber: { value: 'C191-2009', confidence: 0.88, sources: [], method: 'pattern', needsReview: false },
  },
  parties: mockExtractedParties,
  governance: {
    hasPMT: { value: true, confidence: 0.95, sources: [], method: 'llm', needsReview: false },
    hasPET: { value: true, confidence: 0.93, sources: [], method: 'llm', needsReview: false },
    pmtVoting: {
      quorum: { value: 'majority', confidence: 0.88, sources: [], method: 'llm', needsReview: false },
      decisionThreshold: { value: 100000, confidence: 0.85, sources: [], method: 'pattern', needsReview: false },
      votingWindowHours: { value: 72, confidence: 0.82, sources: [], method: 'pattern', needsReview: false },
    },
    petEscalationTriggers: {
      value: ['budget_overrun', 'schedule_delay_30_days'],
      confidence: 0.8,
      sources: [],
      method: 'llm',
      needsReview: false,
    },
  },
  financialTerms: {
    targetCost: { value: 50000000, confidence: 0.92, sources: [], method: 'pattern', needsReview: false },
    currency: { value: 'USD', confidence: 0.99, sources: [], method: 'pattern', needsReview: false },
  },
  dates: {
    commencementDate: { value: '2026-03-01', confidence: 0.9, sources: [], method: 'date', needsReview: false },
    substantialCompletion: { value: '2028-06-30', confidence: 0.88, sources: [], method: 'date', needsReview: false },
  },
};

// ============================================================================
// Authority Mapping Tests
// ============================================================================

describe('AuthorityMapperService', () => {
  describe('Authority Mapping', () => {
    describe('mapContractRoleToAuthority', () => {
      it('should map Owner to OWNER level (5)', () => {
        const level = mapContractRoleToAuthority(ContractPartyRole.OWNER);
        expect(level).toBe(AuthorityLevel.OWNER);
      });

      it('should map Architect to ARCHITECT level (4)', () => {
        const level = mapContractRoleToAuthority(ContractPartyRole.ARCHITECT);
        expect(level).toBe(AuthorityLevel.ARCHITECT);
      });

      it('should map Contractor to PM level (3)', () => {
        const level = mapContractRoleToAuthority(ContractPartyRole.CONTRACTOR);
        expect(level).toBe(AuthorityLevel.PM);
      });

      it('should map Subcontractor to SUPERINTENDENT level (2)', () => {
        const level = mapContractRoleToAuthority(ContractPartyRole.SUBCONTRACTOR);
        expect(level).toBe(AuthorityLevel.SUPERINTENDENT);
      });

      it('should map Consultant to ARCHITECT level (4)', () => {
        const level = mapContractRoleToAuthority(ContractPartyRole.CONSULTANT);
        expect(level).toBe(AuthorityLevel.ARCHITECT);
      });
    });

    describe('mapPartiesToAuthority', () => {
      it('should map all parties to their authority levels', () => {
        const mapped = mapPartiesToAuthority(mockExtractedParties);

        expect(mapped).toHaveLength(3);
        expect(mapped[0].authorityLevel).toBe(AuthorityLevel.OWNER);
        expect(mapped[1].authorityLevel).toBe(AuthorityLevel.ARCHITECT);
        expect(mapped[2].authorityLevel).toBe(AuthorityLevel.PM);
      });

      it('should preserve party names and emails', () => {
        const mapped = mapPartiesToAuthority(mockExtractedParties);

        expect(mapped[0].name).toBe('Acme Construction LLC');
        expect(mapped[0].email).toBe('owner@acme.com');
      });

      it('should handle parties without email', () => {
        const partiesNoEmail: ExtractedParty[] = [
          {
            name: { value: 'Test Co', confidence: 0.9, sources: [], method: 'llm', needsReview: false },
            role: { value: ContractPartyRole.OWNER, confidence: 0.9, sources: [], method: 'llm', needsReview: false },
            mappedAuthorityLevel: AuthorityLevel.OWNER,
          },
        ];

        const mapped = mapPartiesToAuthority(partiesNoEmail);

        expect(mapped[0].email).toBe('');
      });
    });

    describe('buildAuthorityCascade', () => {
      it('should build complete 7-tier cascade', () => {
        const cascade = buildAuthorityCascade(
          mockExtractedParties,
          'urn:luhtech:test:contract:CON-2024-0001' as any
        );

        expect(cascade.level0_FIELD).toBeDefined();
        expect(cascade.level1_FOREMAN).toBeDefined();
        expect(cascade.level2_SUPERINTENDENT).toBeDefined();
        expect(cascade.level3_PM).toBeDefined();
        expect(cascade.level4_ARCHITECT).toBeDefined();
        expect(cascade.level5_OWNER).toBeDefined();
        expect(cascade.level6_REGULATORY).toBeDefined();
      });

      it('should place Owner in level 5', () => {
        const cascade = buildAuthorityCascade(
          mockExtractedParties,
          'urn:luhtech:test:contract:CON-2024-0001' as any
        );

        expect(cascade.level5_OWNER).toContain('Acme Construction LLC');
      });

      it('should place Architect in level 4', () => {
        const cascade = buildAuthorityCascade(
          mockExtractedParties,
          'urn:luhtech:test:contract:CON-2024-0001' as any
        );

        expect(cascade.level4_ARCHITECT).toContain('Smith Architects Inc');
      });

      it('should place Contractor in level 3 (PM)', () => {
        const cascade = buildAuthorityCascade(
          mockExtractedParties,
          'urn:luhtech:test:contract:CON-2024-0001' as any
        );

        expect(cascade.level3_PM).toContain('BuildRight General Contractors');
      });

      it('should include contract URN', () => {
        const cascade = buildAuthorityCascade(
          mockExtractedParties,
          'urn:luhtech:test:contract:CON-2024-0001' as any
        );

        expect(cascade.contractUrn).toBe('urn:luhtech:test:contract:CON-2024-0001');
      });
    });

    describe('validateAuthorityCascade', () => {
      it('should validate cascade with Owner present', () => {
        const cascade = buildAuthorityCascade(
          mockExtractedParties,
          'urn:luhtech:test:contract:CON-2024-0001' as any
        );

        const result = validateAuthorityCascade(cascade);

        expect(result.valid).toBe(true);
      });

      it('should fail validation if no Owner', () => {
        const cascade: ContractAuthorityCascade = {
          contractUrn: 'urn:luhtech:test:contract:CON-2024-0001' as any,
          level0_FIELD: [],
          level1_FOREMAN: [],
          level2_SUPERINTENDENT: [],
          level3_PM: ['Some PM'],
          level4_ARCHITECT: [],
          level5_OWNER: [], // No owner!
          level6_REGULATORY: [],
        };

        const result = validateAuthorityCascade(cascade);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Authority cascade must have at least one Owner');
      });

      it('should warn if no Architect for design-related projects', () => {
        const cascade: ContractAuthorityCascade = {
          contractUrn: 'urn:luhtech:test:contract:CON-2024-0001' as any,
          level0_FIELD: [],
          level1_FOREMAN: [],
          level2_SUPERINTENDENT: [],
          level3_PM: [],
          level4_ARCHITECT: [], // No architect
          level5_OWNER: ['Owner Corp'],
          level6_REGULATORY: [],
        };

        const result = validateAuthorityCascade(cascade);

        expect(result.warnings).toContain('No Architect defined at level 4');
      });
    });
  });

  // ============================================================================
  // Participant Mapping Tests
  // ============================================================================

  describe('Participant Mapping', () => {
    describe('mapPartyToParticipant', () => {
      it('should create participant from party', () => {
        const participant = mapPartyToParticipant(
          mockExtractedParties[0],
          'urn:luhtech:test:contract-party:PTY-2024-0001' as any
        );

        expect(participant.name).toBe('Acme Construction LLC');
        expect(participant.email).toBe('owner@acme.com');
        expect(participant.authorityLevel).toBe(AuthorityLevel.OWNER);
        expect(participant.role).toBe(ContractPartyRole.OWNER);
      });

      it('should set canApprove based on authority level', () => {
        const ownerParticipant = mapPartyToParticipant(
          mockExtractedParties[0],
          'urn:luhtech:test:contract-party:PTY-2024-0001' as any
        );

        expect(ownerParticipant.canApprove).toBe(true);
      });

      it('should set PMT membership from IPD config', () => {
        const participant = mapPartyToParticipant(
          mockExtractedParties[0],
          'urn:luhtech:test:contract-party:PTY-2024-0001' as any
        );

        expect(participant.isPMTMember).toBe(true);
        expect(participant.isPETMember).toBe(true);
      });

      it('should include contract party URN', () => {
        const participant = mapPartyToParticipant(
          mockExtractedParties[0],
          'urn:luhtech:test:contract-party:PTY-2024-0001' as any
        );

        expect(participant.contractPartyUrn).toBe('urn:luhtech:test:contract-party:PTY-2024-0001');
      });
    });

    describe('mapAllPartiesToParticipants', () => {
      it('should map all parties to participants', () => {
        const participants = mapAllPartiesToParticipants(mockExtractedParties);

        expect(participants).toHaveLength(3);
      });

      it('should generate unique URNs for each participant', () => {
        const participants = mapAllPartiesToParticipants(mockExtractedParties);

        const urns = participants.map(p => p.contractPartyUrn);
        const uniqueUrns = new Set(urns);

        expect(uniqueUrns.size).toBe(3);
      });
    });

    describe('resolveAuthorityConflicts', () => {
      it('should resolve when multiple parties at same level', () => {
        const partiesWithConflict: ExtractedParty[] = [
          ...mockExtractedParties,
          {
            name: { value: 'Another Owner Corp', confidence: 0.9, sources: [], method: 'llm', needsReview: false },
            role: { value: ContractPartyRole.OWNER, confidence: 0.9, sources: [], method: 'llm', needsReview: false },
            mappedAuthorityLevel: AuthorityLevel.OWNER,
          },
        ];

        const result = resolveAuthorityConflicts(partiesWithConflict);

        expect(result.hasConflicts).toBe(true);
        expect(result.conflicts).toHaveLength(1);
        expect(result.conflicts[0].level).toBe(AuthorityLevel.OWNER);
        expect(result.conflicts[0].parties).toHaveLength(2);
      });

      it('should not flag multiple parties at PM level as conflict', () => {
        // PM level can have multiple participants
        const parties: ExtractedParty[] = [
          mockExtractedParties[2], // Contractor at PM
          {
            name: { value: 'Key Participant', confidence: 0.9, sources: [], method: 'llm', needsReview: false },
            role: { value: ContractPartyRole.KEY_PARTICIPANT, confidence: 0.9, sources: [], method: 'llm', needsReview: false },
            mappedAuthorityLevel: AuthorityLevel.PM,
          },
        ];

        const result = resolveAuthorityConflicts(parties);

        expect(result.hasConflicts).toBe(false);
      });
    });
  });

  // ============================================================================
  // IPD Governance Tests
  // ============================================================================

  describe('IPD Governance Mapping', () => {
    describe('identifyPMTMembers', () => {
      it('should identify PMT members from parties', () => {
        const pmtMembers = identifyPMTMembers(mockExtractedParties);

        expect(pmtMembers).toHaveLength(3);
        expect(pmtMembers.map(m => m.name.value)).toContain('Acme Construction LLC');
        expect(pmtMembers.map(m => m.name.value)).toContain('Smith Architects Inc');
        expect(pmtMembers.map(m => m.name.value)).toContain('BuildRight General Contractors');
      });

      it('should return empty for non-IPD contracts', () => {
        const nonIPDParties: ExtractedParty[] = [
          {
            name: { value: 'Owner', confidence: 0.9, sources: [], method: 'llm', needsReview: false },
            role: { value: ContractPartyRole.OWNER, confidence: 0.9, sources: [], method: 'llm', needsReview: false },
            mappedAuthorityLevel: AuthorityLevel.OWNER,
            // No ipdConfig
          },
        ];

        const pmtMembers = identifyPMTMembers(nonIPDParties);

        expect(pmtMembers).toHaveLength(0);
      });
    });

    describe('identifyPETMembers', () => {
      it('should identify PET members from parties', () => {
        const petMembers = identifyPETMembers(mockExtractedParties);

        expect(petMembers).toHaveLength(3);
      });
    });

    describe('configurePMTAuthority', () => {
      it('should configure PMT authority thresholds', () => {
        const pmtConfig = configurePMTAuthority(mockExtractedParties, {
          budgetLimit: 100000,
          scheduleLimitDays: 30,
        });

        expect(pmtConfig.budgetLimit).toBe(100000);
        expect(pmtConfig.scheduleLimitDays).toBe(30);
        expect(pmtConfig.members).toHaveLength(3);
      });
    });

    describe('configurePETAuthority', () => {
      it('should configure PET authority as unlimited', () => {
        const petConfig = configurePETAuthority(mockExtractedParties, {
          budgetLimit: 'unlimited',
          scheduleLimitDays: 'unlimited',
        });

        expect(petConfig.budgetLimit).toBe('unlimited');
        expect(petConfig.scheduleLimitDays).toBe('unlimited');
      });
    });

    describe('mapIPDGovernance', () => {
      it('should map complete IPD governance structure', () => {
        const governance = mapIPDGovernance(mockExtractionResult as ContractExtractionResult);

        expect(governance.hasPMT).toBe(true);
        expect(governance.hasPET).toBe(true);
        expect(governance.pmtConfig?.quorum).toBe('majority');
        expect(governance.petConfig?.escalationTriggers).toContain('budget_overrun');
      });
    });
  });

  // ============================================================================
  // Project Configuration Tests
  // ============================================================================

  describe('Project Configuration', () => {
    describe('getDefaultTenantConfig', () => {
      it('should return default tenant config', () => {
        const config = getDefaultTenantConfig();

        expect(config.dataRegion).toBe('us-west-2');
        expect(config.complianceFlags).toContain('SOC2');
      });

      it('should use PIPEDA for Canadian projects', () => {
        const config = getDefaultTenantConfig({ isCanadian: true });

        expect(config.complianceFlags).toContain('PIPEDA');
        expect(config.dataRegion).toBe('ca-central-1');
      });
    });

    describe('buildProjectConfiguration', () => {
      it('should build complete project configuration', () => {
        const config = buildProjectConfiguration(
          mockExtractionResult as ContractExtractionResult,
          {
            tenantId: 'tenant-123',
            tenantSlug: 'acme-corp',
            projectName: 'Downtown Office Complex',
          }
        );

        expect(config.projectInfo.name).toBe('Downtown Office Complex');
        expect(config.tenantConfig.tenantId).toBe('tenant-123');
        expect(config.participants).toHaveLength(3);
        expect(config.authorityCascade).toBeDefined();
      });

      it('should include financial terms in project info', () => {
        const config = buildProjectConfiguration(
          mockExtractionResult as ContractExtractionResult,
          {
            tenantId: 'tenant-123',
            tenantSlug: 'acme-corp',
            projectName: 'Test Project',
          }
        );

        expect(config.projectInfo.totalBudget).toBe(50000000);
      });

      it('should include dates in project info', () => {
        const config = buildProjectConfiguration(
          mockExtractionResult as ContractExtractionResult,
          {
            tenantId: 'tenant-123',
            tenantSlug: 'acme-corp',
            projectName: 'Test Project',
          }
        );

        expect(config.projectInfo.startDate).toBe('2026-03-01');
        expect(config.projectInfo.expectedCompletion).toBe('2028-06-30');
      });

      it('should configure IPD governance', () => {
        const config = buildProjectConfiguration(
          mockExtractionResult as ContractExtractionResult,
          {
            tenantId: 'tenant-123',
            tenantSlug: 'acme-corp',
            projectName: 'IPD Project',
          }
        );

        expect(config.governance.hasPMT).toBe(true);
        expect(config.governance.hasPET).toBe(true);
        expect(config.governance.pmtConfig?.quorum).toBe('majority');
      });
    });

    describe('validateProjectConfiguration', () => {
      it('should validate complete configuration', () => {
        const config = buildProjectConfiguration(
          mockExtractionResult as ContractExtractionResult,
          {
            tenantId: 'tenant-123',
            tenantSlug: 'acme-corp',
            projectName: 'Test Project',
          }
        );

        const result = validateProjectConfiguration(config);

        expect(result.valid).toBe(true);
      });

      it('should fail if no participants', () => {
        const config: ProjectConfiguration = {
          projectUrn: 'urn:luhtech:test:project:PRJ-001',
          sourceContractUrn: 'urn:luhtech:test:contract:CON-001' as any,
          tenantConfig: {
            tenantId: 'tenant-123',
            tenantSlug: 'test',
            dataRegion: 'us-west-2',
            complianceFlags: [],
          },
          projectInfo: {
            name: 'Test',
            status: 'planning',
          },
          authorityCascade: {
            contractUrn: 'urn:luhtech:test:contract:CON-001' as any,
            level0_FIELD: [],
            level1_FOREMAN: [],
            level2_SUPERINTENDENT: [],
            level3_PM: [],
            level4_ARCHITECT: [],
            level5_OWNER: [],
            level6_REGULATORY: [],
          },
          participants: [], // No participants!
          governance: {
            hasPMT: false,
            hasPET: false,
          },
        };

        const result = validateProjectConfiguration(config);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Project must have at least one participant');
      });
    });
  });

  // ============================================================================
  // Escalation Path Tests
  // ============================================================================

  describe('Escalation Paths', () => {
    describe('buildEscalationPaths', () => {
      it('should build escalation paths for all levels', () => {
        const cascade = buildAuthorityCascade(
          mockExtractedParties,
          'urn:luhtech:test:contract:CON-2024-0001' as any
        );

        const paths = buildEscalationPaths(cascade);

        expect(paths).toHaveLength(7);
      });

      it('should define path from FIELD to FOREMAN', () => {
        const cascade = buildAuthorityCascade(
          mockExtractedParties,
          'urn:luhtech:test:contract:CON-2024-0001' as any
        );

        const paths = buildEscalationPaths(cascade);
        const fieldPath = paths.find(p => p.fromLevel === AuthorityLevel.FIELD);

        expect(fieldPath?.toLevel).toBe(AuthorityLevel.FOREMAN);
      });

      it('should have no escalation from REGULATORY', () => {
        const cascade = buildAuthorityCascade(
          mockExtractedParties,
          'urn:luhtech:test:contract:CON-2024-0001' as any
        );

        const paths = buildEscalationPaths(cascade);
        const regPath = paths.find(p => p.fromLevel === AuthorityLevel.REGULATORY);

        expect(regPath?.toLevel).toBeNull();
      });
    });

    describe('getEscalationPathForLevel', () => {
      it('should return next level in escalation', () => {
        const cascade = buildAuthorityCascade(
          mockExtractedParties,
          'urn:luhtech:test:contract:CON-2024-0001' as any
        );

        const nextLevel = getEscalationPathForLevel(cascade, AuthorityLevel.PM);

        expect(nextLevel).toBe(AuthorityLevel.ARCHITECT);
      });

      it('should return null for REGULATORY level', () => {
        const cascade = buildAuthorityCascade(
          mockExtractedParties,
          'urn:luhtech:test:contract:CON-2024-0001' as any
        );

        const nextLevel = getEscalationPathForLevel(cascade, AuthorityLevel.REGULATORY);

        expect(nextLevel).toBeNull();
      });
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration', () => {
    it('should complete full mapping workflow', () => {
      // 1. Map parties to authority levels
      const authorityMapped = mapPartiesToAuthority(mockExtractedParties);
      expect(authorityMapped).toHaveLength(3);

      // 2. Build authority cascade
      const cascade = buildAuthorityCascade(
        mockExtractedParties,
        'urn:luhtech:test:contract:CON-2024-0001' as any
      );
      expect(cascade.level5_OWNER).toHaveLength(1);

      // 3. Map to participants
      const participants = mapAllPartiesToParticipants(mockExtractedParties);
      expect(participants).toHaveLength(3);

      // 4. Build project configuration
      const config = buildProjectConfiguration(
        mockExtractionResult as ContractExtractionResult,
        {
          tenantId: 'tenant-123',
          tenantSlug: 'acme-corp',
          projectName: 'Integration Test Project',
        }
      );

      // 5. Validate configuration
      const validation = validateProjectConfiguration(config);
      expect(validation.valid).toBe(true);

      // 6. Build escalation paths
      const paths = buildEscalationPaths(cascade);
      expect(paths.length).toBe(7);
    });

    it('should handle CCDC contracts (Canadian)', () => {
      const ccdcParties: ExtractedParty[] = [
        {
          name: { value: 'Owner Corp', confidence: 0.9, sources: [], method: 'llm', needsReview: false },
          role: { value: ContractPartyRole.OWNER, confidence: 0.9, sources: [], method: 'llm', needsReview: false },
          mappedAuthorityLevel: AuthorityLevel.OWNER,
        },
        {
          // CCDC uses "Consultant" instead of "Architect"
          name: { value: 'Consulting Engineers Ltd', confidence: 0.9, sources: [], method: 'llm', needsReview: false },
          role: { value: ContractPartyRole.CONSULTANT, confidence: 0.9, sources: [], method: 'llm', needsReview: false },
          mappedAuthorityLevel: AuthorityLevel.ARCHITECT,
        },
        {
          name: { value: 'Contractor Inc', confidence: 0.9, sources: [], method: 'llm', needsReview: false },
          role: { value: ContractPartyRole.CONTRACTOR, confidence: 0.9, sources: [], method: 'llm', needsReview: false },
          mappedAuthorityLevel: AuthorityLevel.PM,
        },
      ];

      const cascade = buildAuthorityCascade(
        ccdcParties,
        'urn:luhtech:test:contract:CON-2024-0002' as any
      );

      // Consultant should map to ARCHITECT level
      expect(cascade.level4_ARCHITECT).toContain('Consulting Engineers Ltd');
    });
  });

  // ============================================================================
  // Performance Tests
  // ============================================================================

  describe('Performance', () => {
    it('should map 100 parties in under 50ms', () => {
      const manyParties: ExtractedParty[] = [];
      for (let i = 0; i < 100; i++) {
        manyParties.push({
          name: { value: `Party ${i}`, confidence: 0.9, sources: [], method: 'llm', needsReview: false },
          role: { value: ContractPartyRole.SUBCONTRACTOR, confidence: 0.9, sources: [], method: 'llm', needsReview: false },
          mappedAuthorityLevel: AuthorityLevel.SUPERINTENDENT,
        });
      }

      const start = performance.now();
      mapAllPartiesToParticipants(manyParties);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(50);
    });

    it('should build project configuration in under 10ms', () => {
      const start = performance.now();

      buildProjectConfiguration(
        mockExtractionResult as ContractExtractionResult,
        {
          tenantId: 'tenant-123',
          tenantSlug: 'acme-corp',
          projectName: 'Performance Test',
        }
      );

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(10);
    });
  });
});

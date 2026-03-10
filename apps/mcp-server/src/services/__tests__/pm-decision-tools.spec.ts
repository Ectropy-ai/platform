/**
 * PM Decision MCP Tools Tests
 *
 * Validates the 21 MCP tools (17 spec-aligned + 4 legacy) for construction
 * decision lifecycle management.
 * Tests authority calculation, URN generation, tool handlers, and end-to-end flows.
 *
 * @see .roadmap/features/decision-lifecycle/interfaces.json
 * @version 2.0.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

// Import types
import {
  PMDecision,
  AuthorityLevel,
  AUTHORITY_THRESHOLDS,
  PMDecisionStatus,
  ConsequenceCategory,
  ConsequenceSeverity,
  InspectionType,
} from '../../types/pm.types.js';

// Import URN utilities
import {
  buildURN,
  generateDecisionId,
  generateConsequenceId,
  generateInspectionId,
  generateProposalId,
  generateVoxelId,
  parseURN,
  validateURN,
  createGraphMetadata,
  resetAllIdCounters,
} from '../pm-urn.utils.js';

// Import authority service
import {
  calculateRequiredAuthority,
  validateAuthorityLevel,
  routeDecision,
  findDecisionAuthority,
  getAuthorityCascade,
  hasAuthority,
  getNextAuthority,
  shouldAutoApprove,
} from '../pm-authority.service.js';

// Import tools
import {
  pmDecisionTools,
  getToolByName,
  getToolNames,
} from '../pm-decision-tools.js';

// ============================================================================
// Test Setup
// ============================================================================

const TEST_PROJECT_ID = 'test-project-alpha';
const TEST_DATA_DIR = join(
  process.cwd(),
  '.test-data',
  'projects',
  TEST_PROJECT_ID
);

describe('PM Decision MCP Tools', () => {
  beforeEach(() => {
    // Reset ID counters before each test
    resetAllIdCounters();

    // Create test data directory
    if (!existsSync(TEST_DATA_DIR)) {
      mkdirSync(TEST_DATA_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Cleanup test data
    if (existsSync(join(process.cwd(), '.test-data'))) {
      rmSync(join(process.cwd(), '.test-data'), {
        recursive: true,
        force: true,
      });
    }
  });

  // ============================================================================
  // URN Utilities Tests
  // ============================================================================

  describe('URN Utilities', () => {
    describe('generateDecisionId', () => {
      it('should generate sequential decision IDs', () => {
        const id1 = generateDecisionId();
        const id2 = generateDecisionId();
        const id3 = generateDecisionId();

        expect(id1).toMatch(/^DEC-\d{4}-0001$/);
        expect(id2).toMatch(/^DEC-\d{4}-0002$/);
        expect(id3).toMatch(/^DEC-\d{4}-0003$/);
      });

      it('should include current year', () => {
        const id = generateDecisionId();
        const year = new Date().getFullYear();
        expect(id).toContain(`DEC-${year}`);
      });
    });

    describe('generateConsequenceId', () => {
      it('should generate sequential consequence IDs', () => {
        const id1 = generateConsequenceId();
        const id2 = generateConsequenceId();

        expect(id1).toMatch(/^CONSQ-\d{4}-0001$/);
        expect(id2).toMatch(/^CONSQ-\d{4}-0002$/);
      });
    });

    describe('generateInspectionId', () => {
      it('should generate sequential inspection IDs', () => {
        const id1 = generateInspectionId();
        const id2 = generateInspectionId();

        expect(id1).toMatch(/^INSP-\d{4}-0001$/);
        expect(id2).toMatch(/^INSP-\d{4}-0002$/);
      });
    });

    describe('generateProposalId', () => {
      it('should generate sequential proposal IDs', () => {
        const id1 = generateProposalId();
        const id2 = generateProposalId();

        expect(id1).toMatch(/^PROP-\d{4}-0001$/);
        expect(id2).toMatch(/^PROP-\d{4}-0002$/);
      });
    });

    describe('generateVoxelId', () => {
      it('should generate voxel IDs with level, zone, and sequence', () => {
        const id = generateVoxelId('L2', 'MECH', 47);
        expect(id).toBe('VOX-L2-MECH-047');
      });

      it('should uppercase level and zone', () => {
        const id = generateVoxelId('b1', 'elec', 12);
        expect(id).toBe('VOX-B1-ELEC-012');
      });
    });

    describe('buildURN', () => {
      it('should build valid PM decision URN', () => {
        const urn = buildURN('project-alpha', 'pm-decision', 'DEC-2026-0001');
        expect(urn).toBe('urn:luhtech:project-alpha:pm-decision:dec-2026-0001');
      });

      it('should build valid voxel URN', () => {
        const urn = buildURN('project-alpha', 'voxel', 'VOX-L2-MECH-047');
        expect(urn).toBe('urn:luhtech:project-alpha:voxel:vox-l2-mech-047');
      });

      it('should build valid consequence URN', () => {
        const urn = buildURN('project-alpha', 'consequence', 'CONSQ-2026-0001');
        expect(urn).toBe(
          'urn:luhtech:project-alpha:consequence:consq-2026-0001'
        );
      });
    });

    describe('parseURN', () => {
      it('should parse valid URN into components', () => {
        const parsed = parseURN(
          'urn:luhtech:project-alpha:pm-decision:dec-2026-0001'
        );
        expect(parsed).toEqual({
          projectId: 'project-alpha',
          nodeType: 'pm-decision',
          identifier: 'dec-2026-0001',
        });
      });

      it('should return null for invalid URN', () => {
        const parsed = parseURN('invalid-urn');
        expect(parsed).toBeNull();
      });
    });

    describe('validateURN', () => {
      it('should validate correct URN format', () => {
        expect(
          validateURN('urn:luhtech:project-alpha:pm-decision:dec-2026-0001')
        ).toBe(true);
        expect(validateURN('urn:luhtech:proj-1:voxel:vox-l2-mech-047')).toBe(
          true
        );
      });

      it('should reject invalid URN format', () => {
        expect(validateURN('invalid')).toBe(false);
        expect(validateURN('urn:other:project:type:id')).toBe(false);
        expect(validateURN('')).toBe(false);
      });
    });

    describe('createGraphMetadata', () => {
      it('should create empty graph metadata', () => {
        const metadata = createGraphMetadata();
        expect(metadata).toEqual({
          inEdges: [],
          outEdges: [],
        });
      });

      it('should deduplicate edges', () => {
        const urn1 = 'urn:luhtech:proj:voxel:v1' as any;
        const urn2 = 'urn:luhtech:proj:voxel:v2' as any;
        const metadata = createGraphMetadata([urn1, urn1, urn2], [urn2, urn2]);

        expect(metadata.inEdges).toHaveLength(2);
        expect(metadata.outEdges).toHaveLength(1);
      });
    });
  });

  // ============================================================================
  // Authority Service Tests
  // ============================================================================

  describe('Authority Service', () => {
    describe('calculateRequiredAuthority', () => {
      it('should return FIELD (0) for no impact', () => {
        const level = calculateRequiredAuthority({});
        expect(level).toBe(AuthorityLevel.FIELD);
      });

      it('should return FOREMAN (1) for small budget', () => {
        const level = calculateRequiredAuthority({ budgetImpact: 100 });
        expect(level).toBe(AuthorityLevel.FOREMAN);
      });

      it('should return SUPERINTENDENT (2) for medium budget', () => {
        const level = calculateRequiredAuthority({ budgetImpact: 3000 });
        expect(level).toBe(AuthorityLevel.SUPERINTENDENT);
      });

      it('should return PM (3) for large budget', () => {
        const level = calculateRequiredAuthority({ budgetImpact: 25000 });
        expect(level).toBe(AuthorityLevel.PM);
      });

      it('should return OWNER (5) for very large budget', () => {
        const level = calculateRequiredAuthority({ budgetImpact: 100000 });
        expect(level).toBe(AuthorityLevel.OWNER);
      });

      it('should return PM (3) for week schedule impact', () => {
        // > 168 hours = 1 week
        const level = calculateRequiredAuthority({ scheduleImpactHours: 200 });
        expect(level).toBe(AuthorityLevel.PM);
      });

      it('should return ARCHITECT (4) for two week schedule impact', () => {
        // > 336 hours = 2 weeks
        const level = calculateRequiredAuthority({ scheduleImpactHours: 400 });
        expect(level).toBe(AuthorityLevel.ARCHITECT);
      });

      it('should return REGULATORY (6) for safety issues', () => {
        const level = calculateRequiredAuthority({ isSafetyIssue: true });
        expect(level).toBe(AuthorityLevel.REGULATORY);
      });

      it('should return ARCHITECT (4) for design changes', () => {
        const level = calculateRequiredAuthority({ isDesignChange: true });
        expect(level).toBe(AuthorityLevel.ARCHITECT);
      });

      it('should take highest authority from multiple factors', () => {
        // PM level budget (25000) + ARCHITECT level schedule (400 hours)
        const level = calculateRequiredAuthority({
          budgetImpact: 25000,
          scheduleImpactHours: 400,
        });
        expect(level).toBe(AuthorityLevel.ARCHITECT);
      });

      it('should prioritize safety over other factors', () => {
        const level = calculateRequiredAuthority({
          budgetImpact: 100,
          isSafetyIssue: true,
        });
        expect(level).toBe(AuthorityLevel.REGULATORY);
      });
    });

    describe('validateAuthorityLevel', () => {
      it('should validate when participant has sufficient authority', () => {
        const result = validateAuthorityLevel(
          AuthorityLevel.PM,
          AuthorityLevel.SUPERINTENDENT
        );
        expect(result.canApprove).toBe(true);
        expect(result.participantLevel).toBe(AuthorityLevel.PM);
        expect(result.requiredLevel).toBe(AuthorityLevel.SUPERINTENDENT);
      });

      it('should invalidate when participant has insufficient authority', () => {
        const result = validateAuthorityLevel(
          AuthorityLevel.FOREMAN,
          AuthorityLevel.PM
        );
        expect(result.canApprove).toBe(false);
        expect(result.escalationRequired).toBe(true);
        expect(result.gap).toBeGreaterThan(0);
      });

      it('should validate when participant matches required authority', () => {
        const result = validateAuthorityLevel(
          AuthorityLevel.PM,
          AuthorityLevel.PM
        );
        expect(result.canApprove).toBe(true);
      });
    });

    describe('hasAuthority', () => {
      it('should return true when participant level >= required', () => {
        expect(hasAuthority(AuthorityLevel.PM, AuthorityLevel.FOREMAN)).toBe(
          true
        );
        expect(hasAuthority(AuthorityLevel.PM, AuthorityLevel.PM)).toBe(true);
      });

      it('should return false when participant level < required', () => {
        expect(hasAuthority(AuthorityLevel.FOREMAN, AuthorityLevel.PM)).toBe(
          false
        );
      });
    });

    describe('getNextAuthority', () => {
      it('should return next higher authority level', () => {
        expect(getNextAuthority(AuthorityLevel.FIELD)).toBe(
          AuthorityLevel.FOREMAN
        );
        expect(getNextAuthority(AuthorityLevel.PM)).toBe(
          AuthorityLevel.ARCHITECT
        );
      });

      it('should return null at highest level', () => {
        expect(getNextAuthority(AuthorityLevel.REGULATORY)).toBeNull();
      });
    });

    describe('shouldAutoApprove', () => {
      it('should return true for field-level impacts', () => {
        expect(shouldAutoApprove({})).toBe(true);
      });

      it('should return false for any budget impact', () => {
        expect(shouldAutoApprove({ budgetImpact: 50 })).toBe(false);
      });
    });

    describe('findDecisionAuthority', () => {
      it('should return authority info with escalation path', () => {
        const result = findDecisionAuthority({ budgetImpact: 3000 });

        expect(result.requiredLevel).toBe(AuthorityLevel.SUPERINTENDENT);
        expect(result.requiredName).toBe('SUPERINTENDENT');
        expect(result.triggeringFactors).toBeDefined();
        expect(result.escalationPath).toHaveLength(3); // FIELD, FOREMAN, SUPERINTENDENT
      });
    });

    describe('getAuthorityCascade', () => {
      it('should return all 7 authority levels', () => {
        const cascade = getAuthorityCascade();
        expect(cascade).toHaveLength(7);
        expect(cascade[0].level).toBe(AuthorityLevel.FIELD);
        expect(cascade[6].level).toBe(AuthorityLevel.REGULATORY);
      });

      it('should match AUTHORITY_THRESHOLDS', () => {
        const cascade = getAuthorityCascade();
        expect(cascade).toEqual(AUTHORITY_THRESHOLDS);
      });
    });
  });

  // ============================================================================
  // Tool Registry Tests
  // ============================================================================

  describe('Tool Registry', () => {
    describe('pmDecisionTools', () => {
      it('should contain 21 total tools (17 spec-aligned + 4 legacy)', () => {
        expect(pmDecisionTools).toHaveLength(21);
      });

      it('should have all decision management tools (6)', () => {
        const names = getToolNames();
        expect(names).toContain('capture_decision');
        expect(names).toContain('route_decision');
        expect(names).toContain('approve_decision');
        expect(names).toContain('reject_decision');
        expect(names).toContain('escalate_decision');
        expect(names).toContain('query_decision_history');
      });

      it('should have all authority & graph tools (3)', () => {
        const names = getToolNames();
        expect(names).toContain('get_authority_graph');
        expect(names).toContain('find_decision_authority');
        expect(names).toContain('validate_authority_level');
      });

      it('should have all voxel operation tools (3) including M2', () => {
        const names = getToolNames();
        expect(names).toContain('attach_decision_to_voxel');
        expect(names).toContain('get_voxel_decisions');
        expect(names).toContain('navigate_decision_surface'); // M2
      });

      it('should have tolerance management tools (2) - M2', () => {
        const names = getToolNames();
        expect(names).toContain('apply_tolerance_override');
        expect(names).toContain('query_tolerance_overrides');
      });

      it('should have consequence & inspection tools (3) including M2', () => {
        const names = getToolNames();
        expect(names).toContain('track_consequence');
        expect(names).toContain('request_inspection');
        expect(names).toContain('complete_inspection'); // M2
      });

      it('should have legacy tools (4) for backward compatibility', () => {
        const names = getToolNames();
        expect(names).toContain('query_voxels_by_status');
        expect(names).toContain('link_consequence_to_decision');
        expect(names).toContain('query_consequences_by_voxel');
        expect(names).toContain('propose_schedule_change');
      });
    });

    describe('getToolByName', () => {
      it('should find tool by name', () => {
        const tool = getToolByName('capture_decision');
        expect(tool).toBeDefined();
        expect(tool?.name).toBe('capture_decision');
      });

      it('should return undefined for unknown tool', () => {
        const tool = getToolByName('unknown_tool');
        expect(tool).toBeUndefined();
      });
    });

    describe('Tool Input Schemas', () => {
      it('capture_decision should have required fields', () => {
        const tool = getToolByName('capture_decision');
        expect(tool?.inputSchema.required).toContain('projectId');
        expect(tool?.inputSchema.required).toContain('voxelId');
        expect(tool?.inputSchema.required).toContain('title');
        expect(tool?.inputSchema.required).toContain('type');
      });

      it('approve_decision should require approverId', () => {
        const tool = getToolByName('approve_decision');
        expect(tool?.inputSchema.required).toContain('approverId');
      });

      it('reject_decision should require reason', () => {
        const tool = getToolByName('reject_decision');
        expect(tool?.inputSchema.required).toContain('reason');
      });

      it('track_consequence should require category and severity', () => {
        const tool = getToolByName('track_consequence');
        expect(tool?.inputSchema.required).toContain('category');
        expect(tool?.inputSchema.required).toContain('severity');
      });
    });
  });

  // ============================================================================
  // Authority Graph Tool Tests
  // ============================================================================

  describe('Authority Graph Tool', () => {
    it('should return all authority levels', async () => {
      const tool = getToolByName('get_authority_graph');
      expect(tool).toBeDefined();

      const result = await tool!.handler({});
      expect(result.success).toBe(true);
      expect(result.data?.levels).toHaveLength(7);
    });
  });

  describe('Find Decision Authority Tool', () => {
    it('should calculate authority for budget impact', async () => {
      const tool = getToolByName('find_decision_authority');
      const result = await tool!.handler({ budgetImpact: 3000 });

      expect(result.success).toBe(true);
      expect(result.data?.requiredLevel).toBe(AuthorityLevel.SUPERINTENDENT);
      expect(result.data?.requiredName).toBe('SUPERINTENDENT');
    });

    it('should calculate authority for safety issues', async () => {
      const tool = getToolByName('find_decision_authority');
      const result = await tool!.handler({ isSafetyIssue: true });

      expect(result.success).toBe(true);
      expect(result.data?.requiredLevel).toBe(AuthorityLevel.REGULATORY);
    });
  });

  describe('Validate Authority Level Tool', () => {
    it('should validate sufficient authority', async () => {
      const tool = getToolByName('validate_authority_level');
      const result = await tool!.handler({
        participantLevel: AuthorityLevel.PM,
        requiredLevel: AuthorityLevel.SUPERINTENDENT,
      });

      expect(result.success).toBe(true);
      expect(result.data?.canApprove).toBe(true);
    });

    it('should reject insufficient authority', async () => {
      const tool = getToolByName('validate_authority_level');
      const result = await tool!.handler({
        participantLevel: AuthorityLevel.FOREMAN,
        requiredLevel: AuthorityLevel.PM,
      });

      expect(result.success).toBe(true);
      expect(result.data?.canApprove).toBe(false);
      expect(result.data?.escalationRequired).toBe(true);
    });
  });

  // ============================================================================
  // Type Exports Tests
  // ============================================================================

  describe('Type Exports', () => {
    it('should export AuthorityLevel enum', () => {
      expect(AuthorityLevel.FIELD).toBe(0);
      expect(AuthorityLevel.FOREMAN).toBe(1);
      expect(AuthorityLevel.SUPERINTENDENT).toBe(2);
      expect(AuthorityLevel.PM).toBe(3);
      expect(AuthorityLevel.ARCHITECT).toBe(4);
      expect(AuthorityLevel.OWNER).toBe(5);
      expect(AuthorityLevel.REGULATORY).toBe(6);
    });

    it('should export AUTHORITY_THRESHOLDS with correct structure', () => {
      expect(AUTHORITY_THRESHOLDS).toHaveLength(7);

      // Validate FOREMAN threshold
      const foreman = AUTHORITY_THRESHOLDS[1];
      expect(foreman.level).toBe(1);
      expect(foreman.name).toBe('FOREMAN');
      expect(foreman.budgetLimit).toBe(500);
      expect(foreman.varianceTolerance).toBe('1/8"');
      expect(foreman.scheduleAuthority).toBe('4 hours');
    });
  });
});

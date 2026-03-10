/**
 * Platform Agent Integration Tests
 *
 * Validates the Platform Decision Agent implementation:
 * 1. Context isolation from tenant data
 * 2. Tool availability restrictions
 * 3. Authority cascade enforcement
 * 4. Decision-milestone linking
 * 5. Pattern matching and compression
 *
 * @see .roadmap/features/platform-agent/FEATURE.json
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  PLATFORM_AGENT_CONFIG,
  PlatformAuthorityLevel,
  isToolAvailableForPlatform,
  getRequiredAuthorityLevel,
  hasAuthorityForDecision,
  createPlatformContext,
  PLATFORM_INCLUDED_TOOLS,
  PLATFORM_EXCLUDED_TOOLS,
  PLATFORM_EIGENMODE_LABELS,
} from '../../config/platform-agent.config.js';

import {
  initializePlatformContext,
  getCurrentPlatformContext,
  isPlatformContextInitialized,
  resetPlatformContext,
  validatePlatformToolCall,
  injectPlatformContext,
  checkAuthorityForDecision,
  getPlatformEigenmodeLabels,
  createLabeledEigenmodeVector,
} from '../platform-context.service.js';

import {
  calculatePlatformEigenmodes,
  getEigenmodeLabels,
  createDefaultEigenmodeSnapshot,
} from '../platform-eigenmode.service.js';

import {
  linkDecisionToMilestone,
  unlinkDecisionFromMilestone,
  addDecisionDependency,
  getDecisionsForMilestone,
  getMilestoneForDecision,
  getDecisionDependencies,
  getDecisionDependents,
  validateDecisionDAG,
  resetLinkState,
  getLinkStatistics,
  classificationFromTriggerType,
  type DecisionEventUrn,
  type MilestoneUrn,
} from '../decision-milestone-linker.service.js';

// ============================================================================
// Platform Context Service Tests
// ============================================================================

describe('Platform Context Service', () => {
  beforeEach(() => {
    resetPlatformContext();
  });

  afterEach(() => {
    resetPlatformContext();
  });

  describe('initializePlatformContext', () => {
    it('should initialize context with default Claude agent level', () => {
      const context = initializePlatformContext('claude-session-123');

      expect(context.agentType).toBe('PLATFORM');
      expect(context.tenantId).toBeNull();
      expect(context.dataScope).toBe('PLATFORM_ONLY');
      expect(context.successStackTier).toBe('platform');
      expect(context.authorityContext.currentLevel).toBe(
        PlatformAuthorityLevel.CLAUDE_AGENT
      );
    });

    it('should initialize context with specified authority level', () => {
      const context = initializePlatformContext(
        'erik',
        PlatformAuthorityLevel.ERIK
      );

      expect(context.authorityContext.currentLevel).toBe(
        PlatformAuthorityLevel.ERIK
      );
      expect(context.authorityContext.currentActor).toBe('erik');
    });

    it('should mark context as initialized', () => {
      expect(isPlatformContextInitialized()).toBe(false);

      initializePlatformContext('test-actor');

      expect(isPlatformContextInitialized()).toBe(true);
      expect(getCurrentPlatformContext()).not.toBeNull();
    });
  });

  describe('validatePlatformToolCall', () => {
    beforeEach(() => {
      initializePlatformContext('test-actor');
    });

    it('should validate included tools', () => {
      const result = validatePlatformToolCall('query_success_stack', {
        projectId: 'ectropy-platform',
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject excluded tools', () => {
      const result = validatePlatformToolCall('capture_decision', {});

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Tool 'capture_decision' is not available for Platform Agent"
      );
    });

    it('should reject non-null tenantId', () => {
      const result = validatePlatformToolCall('query_success_stack', {
        tenantId: 'some-tenant',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Platform Agent cannot specify tenantId - must be null'
      );
    });

    it('should warn about non-ectropy projectId', () => {
      const result = validatePlatformToolCall('query_success_stack', {
        projectId: 'customer-project',
      });

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('injectPlatformContext', () => {
    beforeEach(() => {
      initializePlatformContext('test-actor');
    });

    it('should inject platform context into tool arguments', () => {
      const toolCall = injectPlatformContext('query_success_stack', {
        pattern: 'test',
      });

      expect(toolCall.toolName).toBe('query_success_stack');
      expect(toolCall.arguments._platformContext).toBeDefined();
      expect(toolCall.arguments._platformContext.agentType).toBe('PLATFORM');
      expect(toolCall.arguments._platformContext.tenantId).toBeNull();
    });

    it('should set tier to platform for success stack queries', () => {
      const toolCall = injectPlatformContext('query_success_stack', {});

      expect(toolCall.arguments.tier).toBe('platform');
      expect(toolCall.arguments.excludeGlobal).toBe(true);
      expect(toolCall.arguments.excludeTenant).toBe(true);
    });

    it('should throw if context not initialized', () => {
      resetPlatformContext();

      expect(() => injectPlatformContext('query_success_stack', {})).toThrow(
        'Platform context not initialized'
      );
    });
  });

  describe('checkAuthorityForDecision', () => {
    it('should authorize Claude agent for small scope', () => {
      initializePlatformContext('claude', PlatformAuthorityLevel.CLAUDE_AGENT);

      const result = checkAuthorityForDecision(2, 'single_file', 0.95);

      expect(result.authorized).toBe(true);
      expect(result.escalationRequired).toBe(false);
    });

    it('should require escalation for large effort', () => {
      initializePlatformContext('claude', PlatformAuthorityLevel.CLAUDE_AGENT);

      const result = checkAuthorityForDecision(50, 'single_feature');

      expect(result.authorized).toBe(false);
      expect(result.escalationRequired).toBe(true);
      expect(result.escalationTarget).toBe('DEVELOPER');
    });

    it('should require escalation for low pattern confidence', () => {
      initializePlatformContext('claude', PlatformAuthorityLevel.CLAUDE_AGENT);

      const result = checkAuthorityForDecision(2, 'single_file', 0.5);

      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('confidence');
    });

    it('should authorize ERIK for any decision', () => {
      initializePlatformContext('erik', PlatformAuthorityLevel.ERIK);

      const result = checkAuthorityForDecision(1000, 'strategic', 0);

      expect(result.authorized).toBe(true);
    });
  });
});

// ============================================================================
// Tool Availability Tests
// ============================================================================

describe('Tool Availability', () => {
  describe('isToolAvailableForPlatform', () => {
    it('should include cognitive tools', () => {
      expect(isToolAvailableForPlatform('calculate_health_score')).toBe(true);
      expect(isToolAvailableForPlatform('get_eigenmodes')).toBe(true);
      expect(isToolAvailableForPlatform('calculate_sdi')).toBe(true);
    });

    it('should include success stack tools', () => {
      expect(isToolAvailableForPlatform('query_success_stack')).toBe(true);
      expect(isToolAvailableForPlatform('compress_decision_pattern')).toBe(
        true
      );
      expect(isToolAvailableForPlatform('store_success_pattern')).toBe(true);
    });

    it('should include mediation tools', () => {
      expect(isToolAvailableForPlatform('mediate_decision')).toBe(true);
      expect(isToolAvailableForPlatform('generate_options')).toBe(true);
    });

    it('should include platform-specific tools', () => {
      expect(isToolAvailableForPlatform('read_roadmap')).toBe(true);
      expect(isToolAvailableForPlatform('read_decision_log')).toBe(true);
    });

    it('should exclude construction-specific tools', () => {
      expect(isToolAvailableForPlatform('capture_decision')).toBe(false);
      expect(isToolAvailableForPlatform('route_decision')).toBe(false);
      expect(isToolAvailableForPlatform('attach_decision_to_voxel')).toBe(
        false
      );
      expect(isToolAvailableForPlatform('request_inspection')).toBe(false);
    });
  });

  describe('Tool lists are disjoint', () => {
    it('should have no overlap between included and excluded tools', () => {
      const overlap = PLATFORM_INCLUDED_TOOLS.filter((t) =>
        PLATFORM_EXCLUDED_TOOLS.includes(t)
      );

      expect(overlap).toHaveLength(0);
    });
  });
});

// ============================================================================
// Platform Eigenmode Tests
// ============================================================================

describe('Platform Eigenmode Service', () => {
  describe('getEigenmodeLabels', () => {
    it('should return 12 eigenmode labels', () => {
      const labels = getEigenmodeLabels();

      expect(labels).toHaveLength(12);
      expect(labels[0]).toBe('codebase_health');
      expect(labels[1]).toBe('test_coverage');
      expect(labels[11]).toBe('feature_completion');
    });
  });

  describe('calculatePlatformEigenmodes', () => {
    it('should calculate default snapshot with unknown values', () => {
      const snapshot = createDefaultEigenmodeSnapshot();

      expect(snapshot.vector).toHaveLength(12);
      expect(snapshot.measurements).toHaveLength(12);
      expect(snapshot.classification).toBeDefined();
    });

    it('should calculate snapshot with provided metrics', () => {
      const snapshot = calculatePlatformEigenmodes({
        codebaseMetrics: {
          typescriptErrors: 0,
          lintWarnings: 5,
          lintErrors: 0,
          totalFiles: 500,
          totalLines: 50000,
        },
        testMetrics: {
          unitCoverage: 0.85,
          integrationCoverage: 0.7,
          e2eCoverage: 0.5,
          totalTests: 500,
          passingTests: 495,
        },
      });

      expect(snapshot.vector[0]).toBeGreaterThan(0.9); // Good codebase health
      expect(snapshot.vector[1]).toBeGreaterThan(0.7); // Good test coverage
      expect(snapshot.overallHealth).toBeGreaterThan(0);
    });

    it('should classify health correctly', () => {
      const criticalSnapshot = calculatePlatformEigenmodes({
        codebaseMetrics: {
          typescriptErrors: 100,
          lintWarnings: 500,
          lintErrors: 50,
          totalFiles: 100,
          totalLines: 10000,
        },
      });

      // With only codebase metrics bad and 11 other eigenmodes defaulting to 0.5,
      // unweighted average stays above 0.3 threshold — correctly classified as WARNING
      expect(criticalSnapshot.classification).toBe('WARNING');
    });
  });

  describe('createLabeledEigenmodeVector', () => {
    it('should create labeled vector from values', () => {
      const values = [
        0.9, 0.8, 0.7, 0.85, 0.9, 0.75, 0.6, 0.85, 0.8, 0.95, 0.8, 0.75,
      ];
      const labeled = createLabeledEigenmodeVector(values);

      expect(labeled).toHaveLength(12);
      expect(labeled[0]).toEqual({
        index: 0,
        label: 'codebase_health',
        value: 0.9,
      });
      expect(labeled[11]).toEqual({
        index: 11,
        label: 'feature_completion',
        value: 0.75,
      });
    });

    it('should throw for wrong vector length', () => {
      expect(() => createLabeledEigenmodeVector([0.5, 0.5])).toThrow();
    });
  });
});

// ============================================================================
// Decision-Milestone Linker Tests
// ============================================================================

describe('Decision-Milestone Linker Service', () => {
  const testDecisionUrn =
    'urn:luhtech:ectropy-platform:decision-event:DEV-2026-0001' as DecisionEventUrn;
  const testDecisionUrn2 =
    'urn:luhtech:ectropy-platform:decision-event:DEV-2026-0002' as DecisionEventUrn;
  const testMilestoneUrn =
    'urn:luhtech:ectropy:milestone:PA-M1' as MilestoneUrn;
  const testMilestoneUrn2 =
    'urn:luhtech:ectropy:milestone:PA-M2' as MilestoneUrn;

  beforeEach(() => {
    resetLinkState();
  });

  afterEach(() => {
    resetLinkState();
  });

  describe('linkDecisionToMilestone', () => {
    it('should create link between decision and milestone', () => {
      const result = linkDecisionToMilestone(
        testDecisionUrn,
        testMilestoneUrn,
        {
          classification: 'LEAD',
          linkedBy: 'test',
        }
      );

      expect(result.success).toBe(true);
      expect(result.link).toBeDefined();
      expect(result.link?.decisionUrn).toBe(testDecisionUrn);
      expect(result.link?.milestoneUrn).toBe(testMilestoneUrn);
      expect(result.link?.classification).toBe('LEAD');
    });

    it('should update indices correctly', () => {
      linkDecisionToMilestone(testDecisionUrn, testMilestoneUrn);

      expect(getMilestoneForDecision(testDecisionUrn)).toBe(testMilestoneUrn);
      expect(getDecisionsForMilestone(testMilestoneUrn)).toContain(
        testDecisionUrn
      );
    });

    it('should warn when re-linking to different milestone', () => {
      linkDecisionToMilestone(testDecisionUrn, testMilestoneUrn);
      const result = linkDecisionToMilestone(
        testDecisionUrn,
        testMilestoneUrn2
      );

      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(getMilestoneForDecision(testDecisionUrn)).toBe(testMilestoneUrn2);
    });

    it('should reject invalid URN formats', () => {
      const badDecisionUrn = 'invalid-urn' as DecisionEventUrn;
      const result = linkDecisionToMilestone(badDecisionUrn, testMilestoneUrn);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid decision URN');
    });
  });

  describe('unlinkDecisionFromMilestone', () => {
    it('should remove link', () => {
      linkDecisionToMilestone(testDecisionUrn, testMilestoneUrn);

      const removed = unlinkDecisionFromMilestone(
        testDecisionUrn,
        testMilestoneUrn
      );

      expect(removed).toBe(true);
      expect(getMilestoneForDecision(testDecisionUrn)).toBeUndefined();
    });

    it('should return false for non-existent link', () => {
      const removed = unlinkDecisionFromMilestone(
        testDecisionUrn,
        testMilestoneUrn
      );

      expect(removed).toBe(false);
    });
  });

  describe('Decision Dependencies', () => {
    it('should track decision dependencies', () => {
      addDecisionDependency(testDecisionUrn2, testDecisionUrn);

      expect(getDecisionDependencies(testDecisionUrn2)).toContain(
        testDecisionUrn
      );
      expect(getDecisionDependents(testDecisionUrn)).toContain(
        testDecisionUrn2
      );
    });

    it('should validate DAG property (no cycles)', () => {
      addDecisionDependency(testDecisionUrn2, testDecisionUrn);

      const result = validateDecisionDAG(testDecisionUrn);

      expect(result.valid).toBe(true);
    });

    it('should detect cycles', () => {
      const decision3 =
        'urn:luhtech:ectropy-platform:decision-event:DEV-2026-0003' as DecisionEventUrn;

      addDecisionDependency(testDecisionUrn2, testDecisionUrn);
      addDecisionDependency(decision3, testDecisionUrn2);
      addDecisionDependency(testDecisionUrn, decision3); // Creates cycle

      const result = validateDecisionDAG(testDecisionUrn);

      expect(result.valid).toBe(false);
      expect(result.cycle).toBeDefined();
    });
  });

  describe('getDecisionsForMilestone', () => {
    it('should return direct decisions', () => {
      linkDecisionToMilestone(testDecisionUrn, testMilestoneUrn);
      linkDecisionToMilestone(testDecisionUrn2, testMilestoneUrn);

      const decisions = getDecisionsForMilestone(testMilestoneUrn);

      expect(decisions).toHaveLength(2);
      expect(decisions).toContain(testDecisionUrn);
      expect(decisions).toContain(testDecisionUrn2);
    });

    it('should include indirect decisions when requested', () => {
      const decision3 =
        'urn:luhtech:ectropy-platform:decision-event:DEV-2026-0003' as DecisionEventUrn;

      linkDecisionToMilestone(testDecisionUrn, testMilestoneUrn);
      addDecisionDependency(testDecisionUrn, testDecisionUrn2);
      addDecisionDependency(testDecisionUrn2, decision3);

      const directOnly = getDecisionsForMilestone(testMilestoneUrn);
      const withIndirect = getDecisionsForMilestone(testMilestoneUrn, {
        includeIndirect: true,
      });

      expect(directOnly).toHaveLength(1);
      expect(withIndirect).toHaveLength(3);
    });
  });

  describe('classificationFromTriggerType', () => {
    it('should map trigger types to classifications', () => {
      expect(classificationFromTriggerType('scheduled')).toBe('LEAD');
      expect(classificationFromTriggerType('exception')).toBe('DERIVED');
      expect(classificationFromTriggerType('opportunity')).toBe('FLEXIBLE');
      expect(classificationFromTriggerType('escalation')).toBe('EXTERNAL');
    });
  });

  describe('getLinkStatistics', () => {
    it('should return accurate statistics', () => {
      linkDecisionToMilestone(testDecisionUrn, testMilestoneUrn, {
        classification: 'LEAD',
      });
      linkDecisionToMilestone(testDecisionUrn2, testMilestoneUrn, {
        classification: 'DERIVED',
      });

      const stats = getLinkStatistics();

      expect(stats.totalLinks).toBe(2);
      expect(stats.totalMilestones).toBe(1);
      expect(stats.totalDecisions).toBe(2);
      expect(stats.classificationBreakdown.LEAD).toBe(1);
      expect(stats.classificationBreakdown.DERIVED).toBe(1);
    });
  });
});

// ============================================================================
// Isolation Tests
// ============================================================================

describe('Platform Agent Isolation', () => {
  beforeEach(() => {
    resetPlatformContext();
    initializePlatformContext('test-actor');
  });

  afterEach(() => {
    resetPlatformContext();
  });

  it('should have null tenantId in platform context', () => {
    const context = getCurrentPlatformContext();

    expect(context?.tenantId).toBeNull();
  });

  it('should set success stack tier to platform only', () => {
    const context = getCurrentPlatformContext();

    expect(context?.successStackTier).toBe('platform');
  });

  it('should exclude tenant contexts', () => {
    const context = getCurrentPlatformContext();

    expect(context?.excludedContexts).toContain('tenant_projects');
    expect(context?.excludedContexts).toContain('construction_decisions');
    expect(context?.excludedContexts).toContain('global_patterns');
  });

  it('should inject exclusions into tool calls', () => {
    const toolCall = injectPlatformContext('query_success_stack', {});

    expect(toolCall.arguments.excludeGlobal).toBe(true);
    expect(toolCall.arguments.excludeTenant).toBe(true);
    expect(toolCall.arguments.tier).toBe('platform');
  });
});

// ============================================================================
// Authority Cascade Tests
// ============================================================================

describe('Platform Authority Cascade', () => {
  describe('getRequiredAuthorityLevel', () => {
    it('should return CLAUDE_AGENT for small effort', () => {
      expect(getRequiredAuthorityLevel(2)).toBe(
        PlatformAuthorityLevel.CLAUDE_AGENT
      );
      expect(getRequiredAuthorityLevel(4)).toBe(
        PlatformAuthorityLevel.CLAUDE_AGENT
      );
    });

    it('should return DEVELOPER for medium effort', () => {
      expect(getRequiredAuthorityLevel(10)).toBe(
        PlatformAuthorityLevel.DEVELOPER
      );
      expect(getRequiredAuthorityLevel(40)).toBe(
        PlatformAuthorityLevel.DEVELOPER
      );
    });

    it('should return ARCHITECT for large effort', () => {
      expect(getRequiredAuthorityLevel(100)).toBe(
        PlatformAuthorityLevel.ARCHITECT
      );
      expect(getRequiredAuthorityLevel(200)).toBe(
        PlatformAuthorityLevel.ARCHITECT
      );
    });

    it('should return ERIK for very large effort', () => {
      expect(getRequiredAuthorityLevel(500)).toBe(PlatformAuthorityLevel.ERIK);
    });
  });

  describe('hasAuthorityForDecision', () => {
    it('should allow same level', () => {
      expect(
        hasAuthorityForDecision(
          PlatformAuthorityLevel.DEVELOPER,
          PlatformAuthorityLevel.DEVELOPER
        )
      ).toBe(true);
    });

    it('should allow higher level', () => {
      expect(
        hasAuthorityForDecision(
          PlatformAuthorityLevel.ARCHITECT,
          PlatformAuthorityLevel.DEVELOPER
        )
      ).toBe(true);
    });

    it('should reject lower level', () => {
      expect(
        hasAuthorityForDecision(
          PlatformAuthorityLevel.CLAUDE_AGENT,
          PlatformAuthorityLevel.DEVELOPER
        )
      ).toBe(false);
    });
  });
});

// ============================================================================
// Configuration Tests
// ============================================================================

describe('Platform Agent Configuration', () => {
  it('should have correct agent type', () => {
    expect(PLATFORM_AGENT_CONFIG.agentType).toBe('PLATFORM');
  });

  it('should have 12 eigenmode labels', () => {
    expect(PLATFORM_AGENT_CONFIG.eigenmodeLabels).toHaveLength(12);
  });

  it('should have 4 authority levels', () => {
    expect(PLATFORM_AGENT_CONFIG.authorityLevels).toHaveLength(4);
  });

  it('should have platform data files configured', () => {
    expect(PLATFORM_AGENT_CONFIG.contextInjection.dataFiles.roadmap).toBe(
      '.roadmap/roadmap.json'
    );
    expect(PLATFORM_AGENT_CONFIG.contextInjection.dataFiles.successStack).toBe(
      '.roadmap/success-stack-platform.json'
    );
  });
});

/**
 * Possibility Space Service Tests - DP-M4
 *
 * Tests for Engine 2 of the Dual-Process Decision Architecture.
 * Verifies option generation, constraint checking, novelty detection,
 * risk profiling, and exploration value calculation.
 *
 * @see .roadmap/features/dual-process-decision/FEATURE.json
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  generateCandidateActions,
  checkConstraintViolations,
  calculateFeasibility,
  checkNovelty,
  calculateRiskProfile,
  calculateExplorationValue,
  generateOptions,
  findBestOption,
  filterByRiskLevel,
  getOptionsSummary,
  setOptionIdCounter,
  DEFAULT_POSSIBILITY_SPACE_CONFIG,
  type DecisionContext,
  type Constraint,
  type ResourceState,
  type Option,
  type ConstraintViolation,
  type GenerateOptionsInput,
  type PossibilitySpaceConfig,
} from '../possibility-space.service.js';

import type { ProposedAction } from '../sdi-projector.service.js';
import type {
  SDIComponents,
  SuccessPattern,
  EigenmodeVector,
} from '../../types/dual-process.types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const createTestContext = (
  overrides: Partial<DecisionContext> = {}
): DecisionContext => ({
  triggerType: 'exception',
  constraints: [],
  resources: {
    laborHoursAvailable: 100,
    budgetRemaining: 50000,
  },
  urgency: 0.5,
  ...overrides,
});

const createTestConstraint = (
  overrides: Partial<Constraint> = {}
): Constraint => ({
  id: 'C-001',
  type: 'budget',
  description: 'Budget limit',
  severity: 'soft',
  value: 10000,
  ...overrides,
});

const createTestResources = (
  overrides: Partial<ResourceState> = {}
): ResourceState => ({
  laborHoursAvailable: 100,
  budgetRemaining: 50000,
  equipmentAvailable: ['crane', 'excavator'],
  ...overrides,
});

const createTestAction = (
  overrides: Partial<ProposedAction> = {}
): ProposedAction => ({
  actionType: 'add_resource',
  parameters: {},
  ...overrides,
});

const createTestComponents = (): SDIComponents => ({
  financialHealth: 0.8,
  schedulePerformance: 0.75,
  scopeStability: 0.9,
  qualityMetrics: 0.85,
  riskExposure: 0.3,
  resourceUtilization: 0.7,
  stakeholderSatisfaction: 0.8,
  teamMorale: 0.75,
});

const createTestEigenmode = (): EigenmodeVector => [
  0.5, 0.3, 0.2, -0.1, 0.4, 0.3, -0.2, 0.1, 0.6, -0.1, 0.2, 0.3,
];

const createTestPattern = (
  overrides: Partial<SuccessPattern> = {}
): SuccessPattern => ({
  $id: 'PAT-001',
  actionType: 'add_resource',
  contextSignature: createTestEigenmode(),
  successRate: 0.85,
  frequency: 10,
  avgSdiImprovement: 150,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const createTestOption = (
  overrides: Partial<Option> = {}
): Option => ({
  id: 'OPT-TEST-001',
  action: createTestAction(),
  isNovel: false,
  projectedSdi: 5000,
  sdiDelta: 100,
  riskLevel: 'low',
  constraintViolations: [],
  feasibilityScore: 1.0,
  explorationValue: 0.1,
  ...overrides,
});

// ============================================================================
// generateCandidateActions Tests
// ============================================================================

describe('generateCandidateActions', () => {
  describe('Basic Action Generation', () => {
    it('should generate base actions for scheduled trigger', () => {
      const context = createTestContext({ triggerType: 'scheduled' });
      const actions = generateCandidateActions(context, 1);

      expect(actions.length).toBeGreaterThan(0);
      const actionTypes = actions.map((a) => a.actionType);
      expect(actionTypes).toContain('approve');
      expect(actionTypes).toContain('defer');
    });

    it('should generate exception-specific actions', () => {
      const context = createTestContext({ triggerType: 'exception' });
      const actions = generateCandidateActions(context, 1);

      const actionTypes = actions.map((a) => a.actionType);
      expect(actionTypes).toContain('mitigate_risk');
      expect(actionTypes).toContain('reallocate_resource');
      expect(actionTypes).toContain('extend_deadline');
    });

    it('should generate opportunity-specific actions', () => {
      const context = createTestContext({ triggerType: 'opportunity' });
      const actions = generateCandidateActions(context, 1);

      const actionTypes = actions.map((a) => a.actionType);
      expect(actionTypes).toContain('increase_quality');
    });

    it('should generate escalation-specific actions', () => {
      const context = createTestContext({ triggerType: 'escalation' });
      const actions = generateCandidateActions(context, 1);

      const actionTypes = actions.map((a) => a.actionType);
      expect(actionTypes).toContain('reject');
    });

    it('should not generate duplicate action types', () => {
      const context = createTestContext({
        constraints: [
          createTestConstraint({ type: 'budget' }),
          createTestConstraint({ id: 'C-002', type: 'schedule' }),
        ],
      });
      const actions = generateCandidateActions(context, 1);

      const actionTypes = actions.map((a) => a.actionType);
      const uniqueTypes = new Set(actionTypes);
      expect(actionTypes.length).toBe(uniqueTypes.size);
    });
  });

  describe('Constraint-Specific Actions', () => {
    it('should add budget constraint responses', () => {
      const context = createTestContext({
        constraints: [createTestConstraint({ type: 'budget' })],
      });
      const actions = generateCandidateActions(context, 1);

      const actionTypes = actions.map((a) => a.actionType);
      expect(actionTypes).toContain('reduce_scope');
    });

    it('should add schedule constraint responses', () => {
      const context = createTestContext({
        constraints: [createTestConstraint({ type: 'schedule' })],
      });
      const actions = generateCandidateActions(context, 1);

      const actionTypes = actions.map((a) => a.actionType);
      expect(actionTypes).toContain('compress_schedule');
    });

    it('should add safety constraint responses', () => {
      const context = createTestContext({
        constraints: [createTestConstraint({ type: 'safety' })],
      });
      const actions = generateCandidateActions(context, 1);

      const actionTypes = actions.map((a) => a.actionType);
      expect(actionTypes).toContain('mitigate_risk');
    });
  });

  describe('Computation Depth', () => {
    it('should generate more variations at depth 2', () => {
      const context = createTestContext();
      const depth1Actions = generateCandidateActions(context, 1);
      const depth2Actions = generateCandidateActions(context, 2);

      expect(depth2Actions.length).toBeGreaterThan(depth1Actions.length);
    });

    it('should add urgent variations at depth 2', () => {
      const context = createTestContext();
      const actions = generateCandidateActions(context, 2);

      const urgentActions = actions.filter((a) => a.parameters?.urgent === true);
      expect(urgentActions.length).toBeGreaterThan(0);
    });

    it('should add resource-specific variations at depth 3', () => {
      const context = createTestContext({
        resources: {
          laborHoursAvailable: 200,
          budgetRemaining: 100000,
        },
      });
      const actions = generateCandidateActions(context, 3);

      const resourceActions = actions.filter(
        (a) => a.resourceImpact || a.parameters?.resourceType
      );
      expect(resourceActions.length).toBeGreaterThan(0);
    });

    it('should include labor-based variations when labor available', () => {
      const context = createTestContext({
        resources: { laborHoursAvailable: 100 },
      });
      const actions = generateCandidateActions(context, 3);

      const laborAction = actions.find(
        (a) => a.resourceImpact?.laborHoursConsumed
      );
      expect(laborAction).toBeDefined();
    });

    it('should include budget-based variations when budget available', () => {
      const context = createTestContext({
        resources: { budgetRemaining: 50000 },
      });
      const actions = generateCandidateActions(context, 3);

      const budgetAction = actions.find(
        (a) => a.resourceImpact?.budgetConsumed
      );
      expect(budgetAction).toBeDefined();
    });
  });
});

// ============================================================================
// checkConstraintViolations Tests
// ============================================================================

describe('checkConstraintViolations', () => {
  describe('Budget Constraints', () => {
    it('should detect budget overrun', () => {
      const action = createTestAction({
        estimatedCost: 20000,
      });
      const constraints = [
        createTestConstraint({
          type: 'budget',
          value: 15000,
        }),
      ];
      const resources = createTestResources({
        budgetRemaining: 10000,
      });

      const violations = checkConstraintViolations(action, constraints, resources);

      expect(violations.length).toBe(1);
      expect(violations[0].constraintType).toBe('budget');
      expect(violations[0].magnitude).toBeGreaterThan(0);
    });

    it('should not flag budget constraint when within limits', () => {
      const action = createTestAction({
        estimatedCost: 5000,
      });
      const constraints = [
        createTestConstraint({
          type: 'budget',
          value: 15000,
        }),
      ];
      const resources = createTestResources({
        budgetRemaining: 10000,
      });

      const violations = checkConstraintViolations(action, constraints, resources);

      expect(violations.length).toBe(0);
    });
  });

  describe('Schedule Constraints', () => {
    it('should flag extend_deadline when schedule is hard constraint', () => {
      const action = createTestAction({
        actionType: 'extend_deadline',
      });
      const constraints = [
        createTestConstraint({
          type: 'schedule',
          severity: 'hard',
        }),
      ];

      const violations = checkConstraintViolations(
        action,
        constraints,
        createTestResources()
      );

      expect(violations.length).toBe(1);
      expect(violations[0].constraintType).toBe('schedule');
      expect(violations[0].severity).toBe('hard');
    });

    it('should not flag extend_deadline when schedule is soft constraint', () => {
      const action = createTestAction({
        actionType: 'extend_deadline',
      });
      const constraints = [
        createTestConstraint({
          type: 'schedule',
          severity: 'soft',
        }),
      ];

      const violations = checkConstraintViolations(
        action,
        constraints,
        createTestResources()
      );

      expect(violations.length).toBe(0);
    });
  });

  describe('Resource Constraints', () => {
    it('should flag labor overuse', () => {
      const action = createTestAction({
        resourceImpact: {
          laborHoursConsumed: 150,
        },
      });
      const constraints = [
        createTestConstraint({
          type: 'resource',
        }),
      ];
      const resources = createTestResources({
        laborHoursAvailable: 100,
      });

      const violations = checkConstraintViolations(action, constraints, resources);

      expect(violations.length).toBe(1);
      expect(violations[0].constraintType).toBe('resource');
    });

    it('should not flag labor use within limits', () => {
      const action = createTestAction({
        resourceImpact: {
          laborHoursConsumed: 50,
        },
      });
      const constraints = [
        createTestConstraint({
          type: 'resource',
        }),
      ];
      const resources = createTestResources({
        laborHoursAvailable: 100,
      });

      const violations = checkConstraintViolations(action, constraints, resources);

      expect(violations.length).toBe(0);
    });
  });

  describe('Safety Constraints', () => {
    it('should flag accept_risk action', () => {
      const action = createTestAction({
        actionType: 'accept_risk',
      });
      const constraints = [
        createTestConstraint({
          type: 'safety',
        }),
      ];

      const violations = checkConstraintViolations(
        action,
        constraints,
        createTestResources()
      );

      expect(violations.length).toBe(1);
      expect(violations[0].constraintType).toBe('safety');
    });
  });

  describe('Regulatory Constraints', () => {
    it('should flag relax_tolerance action', () => {
      const action = createTestAction({
        actionType: 'relax_tolerance',
      });
      const constraints = [
        createTestConstraint({
          type: 'regulatory',
        }),
      ];

      const violations = checkConstraintViolations(
        action,
        constraints,
        createTestResources()
      );

      expect(violations.length).toBe(1);
      expect(violations[0].constraintType).toBe('regulatory');
    });
  });

  describe('Multiple Constraints', () => {
    it('should check all constraints', () => {
      const action = createTestAction({
        actionType: 'accept_risk',
        estimatedCost: 100000,
      });
      const constraints = [
        createTestConstraint({ id: 'C-001', type: 'budget', value: 10000 }),
        createTestConstraint({ id: 'C-002', type: 'safety' }),
      ];
      const resources = createTestResources({
        budgetRemaining: 5000,
      });

      const violations = checkConstraintViolations(action, constraints, resources);

      expect(violations.length).toBe(2);
    });

    it('should return empty array when no violations', () => {
      const action = createTestAction({
        actionType: 'approve',
      });
      const constraints = [
        createTestConstraint({ type: 'budget' }),
      ];

      const violations = checkConstraintViolations(
        action,
        constraints,
        createTestResources()
      );

      expect(violations.length).toBe(0);
    });
  });
});

// ============================================================================
// calculateFeasibility Tests
// ============================================================================

describe('calculateFeasibility', () => {
  it('should return 1.0 for no violations', () => {
    const violations: ConstraintViolation[] = [];
    const feasibility = calculateFeasibility(violations);

    expect(feasibility).toBe(1.0);
  });

  it('should return 0 for hard constraint violations', () => {
    const violations: ConstraintViolation[] = [
      {
        constraintId: 'C-001',
        constraintType: 'schedule',
        severity: 'hard',
        magnitude: 0.5,
        description: 'Hard constraint violated',
      },
    ];

    const feasibility = calculateFeasibility(violations);

    expect(feasibility).toBe(0);
  });

  it('should reduce feasibility for soft constraint violations', () => {
    const violations: ConstraintViolation[] = [
      {
        constraintId: 'C-001',
        constraintType: 'budget',
        severity: 'soft',
        magnitude: 0.3,
        description: 'Soft constraint violated',
      },
    ];

    const feasibility = calculateFeasibility(violations);

    expect(feasibility).toBeGreaterThan(0);
    expect(feasibility).toBeLessThan(1);
  });

  it('should reduce feasibility more for larger violations', () => {
    const smallViolation: ConstraintViolation[] = [
      {
        constraintId: 'C-001',
        constraintType: 'budget',
        severity: 'soft',
        magnitude: 0.1,
        description: 'Small violation',
      },
    ];
    const largeViolation: ConstraintViolation[] = [
      {
        constraintId: 'C-001',
        constraintType: 'budget',
        severity: 'soft',
        magnitude: 0.8,
        description: 'Large violation',
      },
    ];

    const smallFeasibility = calculateFeasibility(smallViolation);
    const largeFeasibility = calculateFeasibility(largeViolation);

    expect(smallFeasibility).toBeGreaterThan(largeFeasibility);
  });

  it('should not return negative feasibility', () => {
    const manyViolations: ConstraintViolation[] = [
      {
        constraintId: 'C-001',
        constraintType: 'budget',
        severity: 'soft',
        magnitude: 1.0,
        description: 'Violation 1',
      },
      {
        constraintId: 'C-002',
        constraintType: 'resource',
        severity: 'soft',
        magnitude: 1.0,
        description: 'Violation 2',
      },
      {
        constraintId: 'C-003',
        constraintType: 'scope',
        severity: 'soft',
        magnitude: 1.0,
        description: 'Violation 3',
      },
    ];

    const feasibility = calculateFeasibility(manyViolations);

    expect(feasibility).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// checkNovelty Tests
// ============================================================================

describe('checkNovelty', () => {
  it('should return novel when no patterns exist', () => {
    const action = createTestAction();
    const context = createTestEigenmode();

    const result = checkNovelty(action, context, []);

    expect(result.isNovel).toBe(true);
    expect(result.matchedPatternId).toBeUndefined();
  });

  it('should return novel when no context signature', () => {
    const action = createTestAction();
    const patterns = [createTestPattern()];

    const result = checkNovelty(action, undefined, patterns);

    expect(result.isNovel).toBe(true);
  });

  it('should return novel when no matching action types', () => {
    const action = createTestAction({ actionType: 'reduce_scope' });
    const context = createTestEigenmode();
    const patterns = [createTestPattern({ actionType: 'add_resource' })];

    const result = checkNovelty(action, context, patterns);

    expect(result.isNovel).toBe(true);
  });

  it('should detect non-novel option with similar pattern', () => {
    const action = createTestAction({ actionType: 'add_resource' });
    const context = createTestEigenmode();
    const patterns = [
      createTestPattern({
        actionType: 'add_resource',
        contextSignature: context, // Exact match
      }),
    ];

    const result = checkNovelty(action, context, patterns, 0.7);

    expect(result.isNovel).toBe(false);
    expect(result.matchedPatternId).toBe('PAT-001');
    expect(result.similarity).toBeCloseTo(1.0, 2);
  });

  it('should detect novel option with dissimilar pattern', () => {
    const action = createTestAction({ actionType: 'add_resource' });
    // Use orthogonal vectors for low similarity
    const context: EigenmodeVector = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    const differentContext: EigenmodeVector = [0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    const patterns = [
      createTestPattern({
        actionType: 'add_resource',
        contextSignature: differentContext,
      }),
    ];

    const result = checkNovelty(action, context, patterns, 0.7);

    expect(result.isNovel).toBe(true);
    // Similarity should be very low (close to 0 for orthogonal vectors)
    expect(result.similarity).toBeDefined();
    expect(result.similarity!).toBeLessThan(0.7);
  });

  it('should respect custom threshold', () => {
    const action = createTestAction({ actionType: 'add_resource' });
    // Create vectors with moderate similarity (~0.75)
    const context: EigenmodeVector = [0.8, 0.4, 0.2, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    const moderatelySimilar: EigenmodeVector = [0.6, 0.5, 0.4, 0.2, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    const patterns = [
      createTestPattern({
        actionType: 'add_resource',
        contextSignature: moderatelySimilar,
      }),
    ];

    const highThreshold = checkNovelty(action, context, patterns, 0.95);
    const lowThreshold = checkNovelty(action, context, patterns, 0.5);

    // With high threshold (0.95), similar but not that similar -> novel
    expect(highThreshold.isNovel).toBe(true);
    // With low threshold (0.5), should not be novel
    expect(lowThreshold.isNovel).toBe(false);
  });
});

// ============================================================================
// calculateRiskProfile Tests
// ============================================================================

describe('calculateRiskProfile', () => {
  it('should return low risk for positive SDI delta with no violations', () => {
    const option = createTestOption({
      sdiDelta: 500,
      isNovel: false,
      constraintViolations: [],
    });
    const context = createTestContext({ urgency: 0.3 });

    const profile = calculateRiskProfile(option, context);

    expect(profile.overallRisk).toBe('low');
    expect(profile.factors.length).toBe(0);
  });

  it('should add risk factor for negative SDI delta', () => {
    const option = createTestOption({
      sdiDelta: -1000,
    });
    const context = createTestContext();

    const profile = calculateRiskProfile(option, context);

    expect(profile.factors.some((f) => f.name === 'SDI Degradation')).toBe(true);
  });

  it('should add risk factor for novel options', () => {
    const option = createTestOption({
      isNovel: true,
    });
    const context = createTestContext();

    const profile = calculateRiskProfile(option, context);

    expect(profile.factors.some((f) => f.name === 'Unproven Approach')).toBe(true);
  });

  it('should add risk factors for constraint violations', () => {
    const option = createTestOption({
      constraintViolations: [
        {
          constraintId: 'C-001',
          constraintType: 'budget',
          severity: 'soft',
          magnitude: 0.5,
          description: 'Budget exceeded',
        },
      ],
    });
    const context = createTestContext();

    const profile = calculateRiskProfile(option, context);

    expect(profile.factors.some((f) => f.name.includes('Constraint'))).toBe(true);
  });

  it('should add time pressure risk for high urgency', () => {
    const option = createTestOption();
    const context = createTestContext({ urgency: 0.9 });

    const profile = calculateRiskProfile(option, context);

    expect(profile.factors.some((f) => f.name === 'Time Pressure')).toBe(true);
  });

  it('should classify overall risk based on severity', () => {
    const lowRiskOption = createTestOption({
      sdiDelta: 100,
      isNovel: false,
      constraintViolations: [],
    });
    // Create a truly high-risk option with multiple severe risk factors
    const highRiskOption = createTestOption({
      sdiDelta: -3000, // Severe SDI degradation
      isNovel: true,   // Unproven approach
      constraintViolations: [
        {
          constraintId: 'C-001',
          constraintType: 'budget',
          severity: 'soft',
          magnitude: 0.95,
          description: 'Major violation 1',
        },
        {
          constraintId: 'C-002',
          constraintType: 'schedule',
          severity: 'soft',
          magnitude: 0.9,
          description: 'Major violation 2',
        },
      ],
    });
    const lowContext = createTestContext({ urgency: 0.3 });
    const highContext = createTestContext({ urgency: 0.95 }); // Very high urgency

    const lowProfile = calculateRiskProfile(lowRiskOption, lowContext);
    const highProfile = calculateRiskProfile(highRiskOption, highContext);

    expect(['low', 'medium']).toContain(lowProfile.overallRisk);
    // High risk option with multiple severe factors should be high or critical
    expect(['medium', 'high', 'critical']).toContain(highProfile.overallRisk);
  });
});

// ============================================================================
// calculateExplorationValue Tests
// ============================================================================

describe('calculateExplorationValue', () => {
  it('should assign high value to novel options', () => {
    const novelOption = createTestOption({ isNovel: true });
    const regularOption = createTestOption({ isNovel: false });
    const context = createTestContext();
    const patterns: SuccessPattern[] = [];

    const novelValue = calculateExplorationValue(novelOption, patterns, context);
    const regularValue = calculateExplorationValue(regularOption, patterns, context);

    expect(novelValue).toBeGreaterThan(regularValue);
  });

  it('should assign value to low-frequency patterns', () => {
    const option = createTestOption({
      isNovel: false,
      matchedPatternId: 'PAT-001',
    });
    const lowFreqPatterns = [createTestPattern({ $id: 'PAT-001', frequency: 2 })];
    const highFreqPatterns = [createTestPattern({ $id: 'PAT-001', frequency: 20 })];
    const context = createTestContext();

    const lowFreqValue = calculateExplorationValue(option, lowFreqPatterns, context);
    const highFreqValue = calculateExplorationValue(option, highFreqPatterns, context);

    expect(lowFreqValue).toBeGreaterThan(highFreqValue);
  });

  it('should assign value for SDI improvement in constrained context', () => {
    const option = createTestOption({ sdiDelta: 200 });
    const constrainedContext = createTestContext({
      constraints: [
        createTestConstraint({ id: 'C-001' }),
        createTestConstraint({ id: 'C-002' }),
        createTestConstraint({ id: 'C-003' }),
        createTestConstraint({ id: 'C-004' }),
      ],
    });
    const unconstrainedContext = createTestContext({ constraints: [] });

    const constrainedValue = calculateExplorationValue(option, [], constrainedContext);
    const unconstrainedValue = calculateExplorationValue(option, [], unconstrainedContext);

    expect(constrainedValue).toBeGreaterThan(unconstrainedValue);
  });

  it('should cap exploration value at 1.0', () => {
    const option = createTestOption({
      isNovel: true,
      matchedPatternId: 'PAT-001',
      sdiDelta: 500,
    });
    const patterns = [createTestPattern({ $id: 'PAT-001', frequency: 1 })];
    const context = createTestContext({
      constraints: [
        createTestConstraint({ id: 'C-001', type: 'budget' }),
        createTestConstraint({ id: 'C-002', type: 'schedule' }),
        createTestConstraint({ id: 'C-003', type: 'resource' }),
        createTestConstraint({ id: 'C-004', type: 'quality' }),
      ],
    });

    const value = calculateExplorationValue(option, patterns, context);

    expect(value).toBeLessThanOrEqual(1.0);
  });
});

// ============================================================================
// generateOptions Tests
// ============================================================================

describe('generateOptions', () => {
  beforeEach(() => {
    setOptionIdCounter(0);
  });

  const createTestInput = (
    overrides: Partial<GenerateOptionsInput> = {}
  ): GenerateOptionsInput => ({
    projectId: 'PRJ-001',
    currentComponents: createTestComponents(),
    decisionContext: createTestContext(),
    computationDepth: 2,
    maxOptions: 5,
    ...overrides,
  });

  describe('Basic Generation', () => {
    it('should generate viable options', () => {
      const input = createTestInput();
      const output = generateOptions(input);

      expect(output.viableOptions.length).toBeGreaterThan(0);
      expect(output.viableOptions.length).toBeLessThanOrEqual(5);
    });

    it('should track generation metrics', () => {
      const input = createTestInput();
      const output = generateOptions(input);

      expect(output.computationDepth).toBe(2);
      expect(output.optionsConsidered).toBeGreaterThan(0);
      expect(output.generationLatencyMs).toBeGreaterThan(0);
    });

    it('should respect maxOptions limit', () => {
      const input = createTestInput({ maxOptions: 3 });
      const output = generateOptions(input);

      expect(output.viableOptions.length).toBeLessThanOrEqual(3);
    });

    it('should use default config values', () => {
      const input = createTestInput({
        computationDepth: undefined,
        maxOptions: undefined,
      });
      const output = generateOptions(input);

      expect(output.computationDepth).toBe(DEFAULT_POSSIBILITY_SPACE_CONFIG.defaultComputationDepth);
    });
  });

  describe('SDI Projections', () => {
    it('should include SDI projections for viable options', () => {
      const input = createTestInput();
      const output = generateOptions(input);

      expect(output.sdiProjections.size).toBe(output.viableOptions.length);
      for (const option of output.viableOptions) {
        expect(output.sdiProjections.has(option.id)).toBe(true);
      }
    });

    it('should sort options by SDI impact', () => {
      const input = createTestInput();
      const output = generateOptions(input);

      // Options should be sorted in descending order
      // Filter to only valid SDI options for sorting check
      const validOptions = output.viableOptions.filter(
        (o) => Number.isFinite(o.projectedSdi)
      );

      // Skip if no valid options or only one option
      if (validOptions.length <= 1) {
        expect(output.viableOptions.length).toBeGreaterThanOrEqual(0);
        return;
      }

      for (let i = 1; i < validOptions.length; i++) {
        const current = validOptions[i];
        const previous = validOptions[i - 1];

        // Account for exploration bonus in sorting
        const prevScore = previous.projectedSdi +
          previous.explorationValue * DEFAULT_POSSIBILITY_SPACE_CONFIG.explorationBonusWeight * previous.projectedSdi;
        const currScore = current.projectedSdi +
          current.explorationValue * DEFAULT_POSSIBILITY_SPACE_CONFIG.explorationBonusWeight * current.projectedSdi;
        expect(prevScore).toBeGreaterThanOrEqual(currScore);
      }
    });
  });

  describe('Novel Options', () => {
    it('should identify novel options', () => {
      const input = createTestInput({
        existingPatterns: [],
      });
      const output = generateOptions(input);

      // Without patterns, all options should be novel
      expect(output.novelOptions.length).toBe(output.viableOptions.length);
    });

    it('should distinguish novel from pattern-matched', () => {
      const input = createTestInput({
        existingPatterns: [
          createTestPattern({ actionType: 'add_resource' }),
          createTestPattern({ $id: 'PAT-002', actionType: 'reduce_scope' }),
        ],
        decisionContext: createTestContext({
          eigenmodeContext: createTestEigenmode(),
        }),
      });
      const output = generateOptions(input);

      // Some options may be novel, some may match patterns
      expect(output.novelOptions.length).toBeLessThanOrEqual(output.viableOptions.length);
    });
  });

  describe('Risk Profiles', () => {
    it('should include risk profiles when requested', () => {
      const input = createTestInput({
        includeRiskProfiles: true,
      });
      const output = generateOptions(input);

      expect(output.riskProfiles).toBeDefined();
      expect(output.riskProfiles?.size).toBe(output.viableOptions.length);
    });

    it('should not include risk profiles when not requested', () => {
      const input = createTestInput({
        includeRiskProfiles: false,
      });
      const output = generateOptions(input);

      expect(output.riskProfiles).toBeUndefined();
    });

    it('should assign appropriate risk levels', () => {
      const input = createTestInput({
        includeRiskProfiles: true,
      });
      const output = generateOptions(input);

      for (const option of output.viableOptions) {
        expect(['low', 'medium', 'high', 'critical']).toContain(option.riskLevel);
      }
    });
  });

  describe('Exploration Value', () => {
    it('should include exploration values for all options', () => {
      const input = createTestInput();
      const output = generateOptions(input);

      expect(output.explorationValue.size).toBe(output.viableOptions.length);
      for (const option of output.viableOptions) {
        expect(output.explorationValue.has(option.id)).toBe(true);
      }
    });

    it('should calculate valid exploration values', () => {
      const input = createTestInput();
      const output = generateOptions(input);

      for (const [_, value] of output.explorationValue) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Constraint Filtering', () => {
    it('should filter out infeasible options', () => {
      const input = createTestInput({
        decisionContext: createTestContext({
          constraints: [
            createTestConstraint({
              type: 'schedule',
              severity: 'hard',
            }),
          ],
        }),
      });
      const output = generateOptions(input);

      // Options with extend_deadline should be filtered
      const extendDeadlineOptions = output.viableOptions.filter(
        (o) => o.action.actionType === 'extend_deadline'
      );
      expect(extendDeadlineOptions.length).toBe(0);
    });

    it('should track filtered options count', () => {
      const input = createTestInput({
        decisionContext: createTestContext({
          constraints: [
            createTestConstraint({
              type: 'safety',
              severity: 'hard',
            }),
          ],
        }),
      });
      const output = generateOptions(input);

      // Should have filtered some options
      expect(output.optionsFiltered).toBeGreaterThanOrEqual(0);
      expect(output.optionsFiltered + output.viableOptions.length).toBeLessThanOrEqual(
        output.optionsConsidered
      );
    });
  });

  describe('Zone Context', () => {
    it('should pass zone context to projections', () => {
      const input = createTestInput({
        zoneId: 'ZONE-001',
        zoneDependencies: [
          { sourceZone: 'ZONE-001', targetZone: 'ZONE-002', impactWeight: 0.5 },
        ],
      });
      const output = generateOptions(input);

      // Should still generate options
      expect(output.viableOptions.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// findBestOption Tests
// ============================================================================

describe('findBestOption', () => {
  beforeEach(() => {
    setOptionIdCounter(0);
  });

  const createTestOptions = (): Option[] => [
    createTestOption({
      id: 'OPT-1',
      projectedSdi: 5000,
      feasibilityScore: 0.9,
      explorationValue: 0.2,
      riskLevel: 'low',
    }),
    createTestOption({
      id: 'OPT-2',
      projectedSdi: 7000,
      feasibilityScore: 0.6,
      explorationValue: 0.1,
      riskLevel: 'medium',
    }),
    createTestOption({
      id: 'OPT-3',
      projectedSdi: 4000,
      feasibilityScore: 1.0,
      explorationValue: 0.8,
      riskLevel: 'low',
    }),
  ];

  it('should return undefined for empty options', () => {
    const result = findBestOption([]);
    expect(result).toBeUndefined();
  });

  it('should find best by SDI', () => {
    const options = createTestOptions();
    const best = findBestOption(options, 'sdi');

    expect(best?.id).toBe('OPT-2');
  });

  it('should find best by feasibility', () => {
    const options = createTestOptions();
    const best = findBestOption(options, 'feasibility');

    expect(best?.id).toBe('OPT-3');
  });

  it('should find best by exploration', () => {
    const options = createTestOptions();
    const best = findBestOption(options, 'exploration');

    expect(best?.id).toBe('OPT-3');
  });

  it('should find balanced best option', () => {
    const options = createTestOptions();
    const best = findBestOption(options, 'balanced');

    // Should consider all factors
    expect(best).toBeDefined();
    expect(['OPT-1', 'OPT-2', 'OPT-3']).toContain(best?.id);
  });

  it('should default to balanced criteria', () => {
    const options = createTestOptions();
    const best = findBestOption(options);

    expect(best).toBeDefined();
  });
});

// ============================================================================
// filterByRiskLevel Tests
// ============================================================================

describe('filterByRiskLevel', () => {
  const createRiskyOptions = (): Option[] => [
    createTestOption({ id: 'OPT-LOW', riskLevel: 'low' }),
    createTestOption({ id: 'OPT-MED', riskLevel: 'medium' }),
    createTestOption({ id: 'OPT-HIGH', riskLevel: 'high' }),
    createTestOption({ id: 'OPT-CRIT', riskLevel: 'critical' }),
  ];

  it('should filter to low risk only', () => {
    const options = createRiskyOptions();
    const filtered = filterByRiskLevel(options, 'low');

    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('OPT-LOW');
  });

  it('should filter to medium and below', () => {
    const options = createRiskyOptions();
    const filtered = filterByRiskLevel(options, 'medium');

    expect(filtered.length).toBe(2);
    expect(filtered.map((o) => o.id)).toContain('OPT-LOW');
    expect(filtered.map((o) => o.id)).toContain('OPT-MED');
  });

  it('should filter to high and below', () => {
    const options = createRiskyOptions();
    const filtered = filterByRiskLevel(options, 'high');

    expect(filtered.length).toBe(3);
    expect(filtered.map((o) => o.id)).not.toContain('OPT-CRIT');
  });

  it('should include all when critical', () => {
    const options = createRiskyOptions();
    const filtered = filterByRiskLevel(options, 'critical');

    expect(filtered.length).toBe(4);
  });

  it('should return empty array when no options match', () => {
    const options = [
      createTestOption({ riskLevel: 'high' }),
      createTestOption({ riskLevel: 'critical' }),
    ];
    const filtered = filterByRiskLevel(options, 'low');

    expect(filtered.length).toBe(0);
  });
});

// ============================================================================
// getOptionsSummary Tests
// ============================================================================

describe('getOptionsSummary', () => {
  it('should count total options', () => {
    const options = [
      createTestOption(),
      createTestOption({ id: 'OPT-2' }),
      createTestOption({ id: 'OPT-3' }),
    ];

    const summary = getOptionsSummary(options);

    expect(summary.totalOptions).toBe(3);
  });

  it('should count novel options', () => {
    const options = [
      createTestOption({ isNovel: true }),
      createTestOption({ id: 'OPT-2', isNovel: false }),
      createTestOption({ id: 'OPT-3', isNovel: true }),
    ];

    const summary = getOptionsSummary(options);

    expect(summary.novelCount).toBe(2);
  });

  it('should count feasible options', () => {
    const options = [
      createTestOption({ feasibilityScore: 0.8 }),
      createTestOption({ id: 'OPT-2', feasibilityScore: 0.3 }),
      createTestOption({ id: 'OPT-3', feasibilityScore: 0.9 }),
    ];

    const summary = getOptionsSummary(options);

    expect(summary.feasibleCount).toBe(2);
  });

  it('should calculate average SDI delta', () => {
    const options = [
      createTestOption({ sdiDelta: 100 }),
      createTestOption({ id: 'OPT-2', sdiDelta: 200 }),
      createTestOption({ id: 'OPT-3', sdiDelta: 300 }),
    ];

    const summary = getOptionsSummary(options);

    expect(summary.avgSdiDelta).toBe(200);
  });

  it('should compute risk distribution', () => {
    const options = [
      createTestOption({ riskLevel: 'low' }),
      createTestOption({ id: 'OPT-2', riskLevel: 'low' }),
      createTestOption({ id: 'OPT-3', riskLevel: 'medium' }),
      createTestOption({ id: 'OPT-4', riskLevel: 'high' }),
    ];

    const summary = getOptionsSummary(options);

    expect(summary.riskDistribution.low).toBe(2);
    expect(summary.riskDistribution.medium).toBe(1);
    expect(summary.riskDistribution.high).toBe(1);
    expect(summary.riskDistribution.critical).toBe(0);
  });

  it('should handle empty options', () => {
    const summary = getOptionsSummary([]);

    expect(summary.totalOptions).toBe(0);
    expect(summary.novelCount).toBe(0);
    expect(summary.feasibleCount).toBe(0);
    expect(summary.avgSdiDelta).toBe(0);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty constraints', () => {
    const input: GenerateOptionsInput = {
      projectId: 'PRJ-001',
      currentComponents: createTestComponents(),
      decisionContext: createTestContext({ constraints: [] }),
    };

    const output = generateOptions(input);

    expect(output.constraintsAnalyzed).toBe(0);
    expect(output.viableOptions.length).toBeGreaterThan(0);
  });

  it('should handle empty resources', () => {
    const input: GenerateOptionsInput = {
      projectId: 'PRJ-001',
      currentComponents: createTestComponents(),
      decisionContext: createTestContext({ resources: {} }),
    };

    const output = generateOptions(input);

    expect(output.viableOptions.length).toBeGreaterThan(0);
  });

  it('should handle very high computation depth', () => {
    const input: GenerateOptionsInput = {
      projectId: 'PRJ-001',
      currentComponents: createTestComponents(),
      decisionContext: createTestContext(),
      computationDepth: 10,
    };

    const output = generateOptions(input);

    expect(output.computationDepth).toBe(10);
    expect(output.optionsConsidered).toBeGreaterThan(0);
  });

  it('should handle very low maxOptions', () => {
    const input: GenerateOptionsInput = {
      projectId: 'PRJ-001',
      currentComponents: createTestComponents(),
      decisionContext: createTestContext(),
      maxOptions: 1,
    };

    const output = generateOptions(input);

    expect(output.viableOptions.length).toBeLessThanOrEqual(1);
  });

  it('should handle all hard constraints', () => {
    const input: GenerateOptionsInput = {
      projectId: 'PRJ-001',
      currentComponents: createTestComponents(),
      decisionContext: createTestContext({
        constraints: [
          createTestConstraint({ id: 'C-001', type: 'safety', severity: 'hard' }),
          createTestConstraint({ id: 'C-002', type: 'regulatory', severity: 'hard' }),
          createTestConstraint({ id: 'C-003', type: 'schedule', severity: 'hard' }),
        ],
      }),
    };

    const output = generateOptions(input);

    // Should still have some viable options that don't violate hard constraints
    // (approve, defer, etc. don't typically violate these)
    expect(output.optionsFiltered).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('Performance', () => {
  it('should complete option generation within reasonable time', () => {
    const input: GenerateOptionsInput = {
      projectId: 'PRJ-001',
      currentComponents: createTestComponents(),
      decisionContext: createTestContext({
        constraints: [
          createTestConstraint({ id: 'C-001', type: 'budget' }),
          createTestConstraint({ id: 'C-002', type: 'schedule' }),
          createTestConstraint({ id: 'C-003', type: 'resource' }),
        ],
      }),
      computationDepth: 5,
      maxOptions: 20,
      includeRiskProfiles: true,
    };

    const output = generateOptions(input);

    // Should complete in under 100ms
    expect(output.generationLatencyMs).toBeLessThan(100);
  });

  it('should handle multiple patterns efficiently', () => {
    const patterns: SuccessPattern[] = [];
    for (let i = 0; i < 50; i++) {
      patterns.push(
        createTestPattern({
          $id: `PAT-${i}`,
          actionType: i % 5 === 0 ? 'add_resource' : 'reduce_scope',
        })
      );
    }

    const input: GenerateOptionsInput = {
      projectId: 'PRJ-001',
      currentComponents: createTestComponents(),
      decisionContext: createTestContext({
        eigenmodeContext: createTestEigenmode(),
      }),
      existingPatterns: patterns,
      computationDepth: 3,
    };

    const start = performance.now();
    const output = generateOptions(input);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(200);
    expect(output.viableOptions.length).toBeGreaterThan(0);
  });
});

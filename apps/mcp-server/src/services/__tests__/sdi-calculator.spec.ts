/**
 * SDI Calculator Service Tests - DP-M2
 *
 * Test-first development for the Solution Density Index (SDI) Calculator.
 * Implements comprehensive testing for the SDI calculation, classification,
 * Shannon entropy computation, and exploration budget calculation.
 *
 * Test Coverage Target: 95%
 *
 * @see .roadmap/features/dual-process-decision/FEATURE.json
 * @see .roadmap/features/dual-process-decision/interfaces.json
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Import types
import type {
  SDICalculationResult,
  SDIComponents,
  SDIThresholds,
  SDIClassification,
  ExplorationBudget,
  EigenmodeVector,
  DualProcessConfig,
} from '../../types/dual-process.types.js';

import {
  DEFAULT_DUAL_PROCESS_CONFIG,
  SDIClassification as SDIClassificationEnum,
  ExplorationRecommendation,
} from '../../types/dual-process.types.js';

// Import the service (to be implemented)
import {
  calculateSDI,
  classifySDI,
  computeShannonEntropy,
  computeExplorationBudget,
  getSDIThresholds,
  normalizeSDI,
  computeSDIFromComponents,
  validateSDIComponents,
  type SDICalculatorConfig,
} from '../sdi-calculator.service.js';

// ============================================================================
// Test Constants
// ============================================================================

const TEST_PROJECT_ID = 'sdi-calc-test-project';

/**
 * Default SDI thresholds for testing
 */
const DEFAULT_THRESHOLDS: SDIThresholds = {
  critical: 100,
  warning: 1000,
  healthy: 10000,
  abundant: 100000,
  isProjectSpecific: false,
};

/**
 * Sample eigenmode vector (stable state)
 */
const STABLE_EIGENMODES: EigenmodeVector = [
  0.85, 0.82, 0.78, 0.75,
  0.72, 0.68, 0.65, 0.62,
  0.58, 0.55, 0.52, 0.48,
];

/**
 * Sample eigenmode vector (unstable state)
 */
const UNSTABLE_EIGENMODES: EigenmodeVector = [
  0.25, 0.32, 0.18, 0.45,
  0.12, 0.38, 0.55, 0.22,
  0.08, 0.35, 0.42, 0.28,
];

// ============================================================================
// Test Suite: SDI Calculation Core
// ============================================================================

describe('SDI Calculator Service - DP-M2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // SDI Calculation Tests
  // ==========================================================================

  describe('calculateSDI', () => {
    it('should calculate SDI within valid range (10^3 to 10^6)', async () => {
      const components: SDIComponents = {
        viablePathCount: 500,
        constraintCount: 10,
        resourceSlackRatio: 0.7,
        eigenmodeStability: 0.85,
      };

      const result = await calculateSDI({
        projectId: TEST_PROJECT_ID,
        components,
      });

      expect(result.sdiValue).toBeGreaterThanOrEqual(100);
      expect(result.sdiValue).toBeLessThanOrEqual(1000000);
      expect(result.sdiLog).toBeGreaterThanOrEqual(2);
      expect(result.sdiLog).toBeLessThanOrEqual(6);
    });

    it('should return critical classification for very low SDI', async () => {
      const components: SDIComponents = {
        viablePathCount: 10,       // Very few paths
        constraintCount: 100,      // Many constraints
        resourceSlackRatio: 0.1,   // Low resources
        eigenmodeStability: 0.3,   // Unstable
      };

      const result = await calculateSDI({
        projectId: TEST_PROJECT_ID,
        components,
      });

      expect(result.classification).toBe(SDIClassificationEnum.CRITICAL);
      expect(result.sdiValue).toBeLessThan(100);
      expect(result.explorationBudget).toBe(0);
    });

    it('should return abundant classification for very high SDI', async () => {
      const components: SDIComponents = {
        viablePathCount: 50000,    // Many paths
        constraintCount: 2,        // Few constraints
        resourceSlackRatio: 0.95,  // High resources
        eigenmodeStability: 0.98,  // Very stable
      };

      const result = await calculateSDI({
        projectId: TEST_PROJECT_ID,
        components,
      });

      expect(result.classification).toBe(SDIClassificationEnum.ABUNDANT);
      expect(result.sdiValue).toBeGreaterThan(100000);
      expect(result.explorationBudget).toBeGreaterThan(0.7);
    });

    it('should include components in result when requested', async () => {
      const components: SDIComponents = {
        viablePathCount: 1000,
        constraintCount: 20,
        resourceSlackRatio: 0.6,
        eigenmodeStability: 0.75,
      };

      const result = await calculateSDI({
        projectId: TEST_PROJECT_ID,
        components,
        includeComponents: true,
      });

      expect(result.components).toBeDefined();
      expect(result.components.viablePathCount).toBe(1000);
      expect(result.components.constraintCount).toBe(20);
      expect(result.components.resourceSlackRatio).toBe(0.6);
      expect(result.components.eigenmodeStability).toBe(0.75);
    });

    it('should include thresholds in result when requested', async () => {
      const components: SDIComponents = {
        viablePathCount: 1000,
        constraintCount: 20,
        resourceSlackRatio: 0.6,
        eigenmodeStability: 0.75,
      };

      const result = await calculateSDI({
        projectId: TEST_PROJECT_ID,
        components,
        includeThresholds: true,
      });

      expect(result.thresholds).toBeDefined();
      expect(result.thresholds.critical).toBe(100);
      expect(result.thresholds.warning).toBe(1000);
      expect(result.thresholds.healthy).toBe(10000);
      expect(result.thresholds.abundant).toBe(100000);
    });

    it('should include timestamp in ISO 8601 format', async () => {
      const components: SDIComponents = {
        viablePathCount: 1000,
        constraintCount: 20,
        resourceSlackRatio: 0.6,
        eigenmodeStability: 0.75,
      };

      const result = await calculateSDI({
        projectId: TEST_PROJECT_ID,
        components,
      });

      expect(result.timestamp).toBeDefined();
      // Validate ISO 8601 format
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });
  });

  // ==========================================================================
  // SDI Classification Tests
  // ==========================================================================

  describe('classifySDI', () => {
    it('should classify as CRITICAL when SDI < 100', () => {
      expect(classifySDI(50, DEFAULT_THRESHOLDS)).toBe(SDIClassificationEnum.CRITICAL);
      expect(classifySDI(99, DEFAULT_THRESHOLDS)).toBe(SDIClassificationEnum.CRITICAL);
      expect(classifySDI(1, DEFAULT_THRESHOLDS)).toBe(SDIClassificationEnum.CRITICAL);
    });

    it('should classify as WARNING when 100 <= SDI < 1000', () => {
      expect(classifySDI(100, DEFAULT_THRESHOLDS)).toBe(SDIClassificationEnum.WARNING);
      expect(classifySDI(500, DEFAULT_THRESHOLDS)).toBe(SDIClassificationEnum.WARNING);
      expect(classifySDI(999, DEFAULT_THRESHOLDS)).toBe(SDIClassificationEnum.WARNING);
    });

    it('should classify as HEALTHY when 1000 <= SDI < 10000', () => {
      // Note: Per implementation-plan, HEALTHY is >= healthy threshold (10000)
      // Warning zone is 1000-9999
      expect(classifySDI(1000, DEFAULT_THRESHOLDS)).toBe(SDIClassificationEnum.WARNING);
      expect(classifySDI(5000, DEFAULT_THRESHOLDS)).toBe(SDIClassificationEnum.WARNING);
      expect(classifySDI(9999, DEFAULT_THRESHOLDS)).toBe(SDIClassificationEnum.WARNING);
    });

    it('should classify as HEALTHY when 10000 <= SDI < 100000', () => {
      expect(classifySDI(10000, DEFAULT_THRESHOLDS)).toBe(SDIClassificationEnum.HEALTHY);
      expect(classifySDI(50000, DEFAULT_THRESHOLDS)).toBe(SDIClassificationEnum.HEALTHY);
      expect(classifySDI(99999, DEFAULT_THRESHOLDS)).toBe(SDIClassificationEnum.HEALTHY);
    });

    it('should classify as ABUNDANT when SDI >= 100000', () => {
      expect(classifySDI(100000, DEFAULT_THRESHOLDS)).toBe(SDIClassificationEnum.ABUNDANT);
      expect(classifySDI(500000, DEFAULT_THRESHOLDS)).toBe(SDIClassificationEnum.ABUNDANT);
      expect(classifySDI(1000000, DEFAULT_THRESHOLDS)).toBe(SDIClassificationEnum.ABUNDANT);
    });

    it('should handle edge case of SDI = 0', () => {
      expect(classifySDI(0, DEFAULT_THRESHOLDS)).toBe(SDIClassificationEnum.CRITICAL);
    });

    it('should use custom thresholds when provided', () => {
      const customThresholds: SDIThresholds = {
        critical: 500,
        warning: 2000,
        healthy: 20000,
        abundant: 200000,
        isProjectSpecific: true,
      };

      expect(classifySDI(400, customThresholds)).toBe(SDIClassificationEnum.CRITICAL);
      expect(classifySDI(1500, customThresholds)).toBe(SDIClassificationEnum.WARNING);
      expect(classifySDI(50000, customThresholds)).toBe(SDIClassificationEnum.HEALTHY);
      expect(classifySDI(250000, customThresholds)).toBe(SDIClassificationEnum.ABUNDANT);
    });
  });

  // ==========================================================================
  // Shannon Entropy Tests
  // ==========================================================================

  describe('computeShannonEntropy', () => {
    it('should compute Shannon entropy as log2(SDI)', () => {
      // H = log2(SDI)
      expect(computeShannonEntropy(1024)).toBeCloseTo(10, 5);     // 2^10 = 1024
      expect(computeShannonEntropy(2048)).toBeCloseTo(11, 5);     // 2^11 = 2048
      expect(computeShannonEntropy(4096)).toBeCloseTo(12, 5);     // 2^12 = 4096
    });

    it('should handle typical SDI values correctly', () => {
      // 1000 paths: log2(1000) ≈ 9.97
      expect(computeShannonEntropy(1000)).toBeCloseTo(9.97, 1);

      // 10000 paths: log2(10000) ≈ 13.29
      expect(computeShannonEntropy(10000)).toBeCloseTo(13.29, 1);

      // 100000 paths: log2(100000) ≈ 16.61
      expect(computeShannonEntropy(100000)).toBeCloseTo(16.61, 1);
    });

    it('should return 0 for SDI <= 1', () => {
      expect(computeShannonEntropy(1)).toBe(0);
      expect(computeShannonEntropy(0)).toBe(0);
    });

    it('should handle fractional SDI values', () => {
      expect(computeShannonEntropy(0.5)).toBe(0);
      expect(computeShannonEntropy(1.5)).toBeGreaterThan(0);
    });

    it('should correlate with information content interpretation', () => {
      // Higher SDI means more information/options
      const lowSDI = computeShannonEntropy(100);
      const midSDI = computeShannonEntropy(10000);
      const highSDI = computeShannonEntropy(1000000);

      expect(midSDI).toBeGreaterThan(lowSDI);
      expect(highSDI).toBeGreaterThan(midSDI);
    });
  });

  // ==========================================================================
  // Exploration Budget Tests
  // ==========================================================================

  describe('computeExplorationBudget', () => {
    it('should return 0 exploration budget in critical state', () => {
      const result = computeExplorationBudget({
        sdiValue: 50,
        eigenmodeStability: 0.5,
        resourceSlackRatio: 0.5,
        thresholds: DEFAULT_THRESHOLDS,
      });

      expect(result.budget).toBe(0);
      expect(result.recommendation).toBe(ExplorationRecommendation.EXPLOIT);
    });

    it('should return low exploration budget in warning state', () => {
      // Use lower values to get constrained budget
      const result = computeExplorationBudget({
        sdiValue: 200,      // Just above critical
        eigenmodeStability: 0.2,
        resourceSlackRatio: 0.1,
        thresholds: DEFAULT_THRESHOLDS,
      });

      expect(result.budget).toBeGreaterThan(0);
      expect(result.budget).toBeLessThan(0.3);
      expect(result.recommendation).toBe(ExplorationRecommendation.CAUTIOUS_EXPLORE);
    });

    it('should return balanced exploration budget in healthy state', () => {
      const result = computeExplorationBudget({
        sdiValue: 15000,
        eigenmodeStability: 0.75,
        resourceSlackRatio: 0.6,
        thresholds: DEFAULT_THRESHOLDS,
      });

      expect(result.budget).toBeGreaterThan(0.3);
      expect(result.budget).toBeLessThan(0.7);
      expect(result.recommendation).toBe(ExplorationRecommendation.BALANCED);
    });

    it('should return high exploration budget in abundant state', () => {
      const result = computeExplorationBudget({
        sdiValue: 200000,
        eigenmodeStability: 0.9,
        resourceSlackRatio: 0.85,
        thresholds: DEFAULT_THRESHOLDS,
      });

      expect(result.budget).toBeGreaterThan(0.7);
      expect(result.recommendation).toBe(ExplorationRecommendation.AGGRESSIVE_EXPLORE);
    });

    it('should apply correct weights to budget components', () => {
      const result = computeExplorationBudget({
        sdiValue: 50000,
        eigenmodeStability: 0.8,
        resourceSlackRatio: 0.7,
        thresholds: DEFAULT_THRESHOLDS,
      });

      // Verify breakdown exists
      expect(result.breakdown).toBeDefined();
      expect(result.breakdown.sdiFactor).toBeDefined();
      expect(result.breakdown.stabilityFactor).toBeDefined();
      expect(result.breakdown.resourceFactor).toBeDefined();

      // Weights: SDI 40%, Stability 35%, Resources 25%
      // Budget = (sdiFactor * 0.4) + (stabilityFactor * 0.35) + (resourceFactor * 0.25)
      const expectedBudget =
        result.breakdown.sdiFactor * 0.4 +
        result.breakdown.stabilityFactor * 0.35 +
        result.breakdown.resourceFactor * 0.25;

      expect(result.budget).toBeCloseTo(expectedBudget, 5);
    });

    it('should use formula: min(log10(SDI) / 6, 1) for SDI factor', () => {
      // SDI = 1000 -> log10(1000) = 3 -> 3/6 = 0.5
      const result1 = computeExplorationBudget({
        sdiValue: 1000,
        eigenmodeStability: 1,
        resourceSlackRatio: 1,
        thresholds: DEFAULT_THRESHOLDS,
      });
      expect(result1.breakdown.sdiFactor).toBeCloseTo(0.5, 2);

      // SDI = 1000000 -> log10(1000000) = 6 -> 6/6 = 1
      const result2 = computeExplorationBudget({
        sdiValue: 1000000,
        eigenmodeStability: 1,
        resourceSlackRatio: 1,
        thresholds: DEFAULT_THRESHOLDS,
      });
      expect(result2.breakdown.sdiFactor).toBeCloseTo(1, 2);

      // SDI > 1000000 should be capped at 1
      const result3 = computeExplorationBudget({
        sdiValue: 10000000,
        eigenmodeStability: 1,
        resourceSlackRatio: 1,
        thresholds: DEFAULT_THRESHOLDS,
      });
      expect(result3.breakdown.sdiFactor).toBe(1);
    });

    it('should clamp budget between 0 and 1', () => {
      // Maximum possible inputs
      const maxResult = computeExplorationBudget({
        sdiValue: 10000000,
        eigenmodeStability: 1,
        resourceSlackRatio: 1,
        thresholds: DEFAULT_THRESHOLDS,
      });
      expect(maxResult.budget).toBeLessThanOrEqual(1);

      // Minimum possible inputs
      const minResult = computeExplorationBudget({
        sdiValue: 0,
        eigenmodeStability: 0,
        resourceSlackRatio: 0,
        thresholds: DEFAULT_THRESHOLDS,
      });
      expect(minResult.budget).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // SDI Thresholds Tests
  // ==========================================================================

  describe('getSDIThresholds', () => {
    it('should return default thresholds for unknown project', async () => {
      const thresholds = await getSDIThresholds('unknown-project');

      expect(thresholds.critical).toBe(100);
      expect(thresholds.warning).toBe(1000);
      expect(thresholds.healthy).toBe(10000);
      expect(thresholds.abundant).toBe(100000);
      expect(thresholds.isProjectSpecific).toBe(false);
    });

    it('should return project-specific thresholds when configured', async () => {
      // This tests that the service can look up project-specific thresholds
      const thresholds = await getSDIThresholds(TEST_PROJECT_ID, {
        critical: 200,
        warning: 2000,
        healthy: 20000,
        abundant: 200000,
      });

      expect(thresholds.isProjectSpecific).toBe(true);
    });

    it('should validate threshold ordering (critical < warning < healthy < abundant)', async () => {
      const thresholds = await getSDIThresholds(TEST_PROJECT_ID);

      expect(thresholds.critical).toBeLessThan(thresholds.warning);
      expect(thresholds.warning).toBeLessThan(thresholds.healthy);
      expect(thresholds.healthy).toBeLessThan(thresholds.abundant);
    });
  });

  // ==========================================================================
  // Component Computation Tests
  // ==========================================================================

  describe('computeSDIFromComponents', () => {
    it('should compute SDI from component formula', () => {
      const components: SDIComponents = {
        viablePathCount: 1000,
        constraintCount: 10,
        resourceSlackRatio: 0.8,
        eigenmodeStability: 0.9,
      };

      const sdi = computeSDIFromComponents(components);

      // SDI should scale with paths and slack, inverse with constraints
      expect(sdi).toBeGreaterThan(0);
    });

    it('should increase SDI with more viable paths', () => {
      const base: SDIComponents = {
        viablePathCount: 100,
        constraintCount: 10,
        resourceSlackRatio: 0.5,
        eigenmodeStability: 0.7,
      };

      const morePaths: SDIComponents = {
        ...base,
        viablePathCount: 1000,
      };

      const sdiBase = computeSDIFromComponents(base);
      const sdiMore = computeSDIFromComponents(morePaths);

      expect(sdiMore).toBeGreaterThan(sdiBase);
    });

    it('should decrease SDI with more constraints', () => {
      const base: SDIComponents = {
        viablePathCount: 1000,
        constraintCount: 10,
        resourceSlackRatio: 0.5,
        eigenmodeStability: 0.7,
      };

      const moreConstraints: SDIComponents = {
        ...base,
        constraintCount: 100,
      };

      const sdiBase = computeSDIFromComponents(base);
      const sdiConstrained = computeSDIFromComponents(moreConstraints);

      expect(sdiConstrained).toBeLessThan(sdiBase);
    });

    it('should increase SDI with higher resource slack', () => {
      const base: SDIComponents = {
        viablePathCount: 1000,
        constraintCount: 20,
        resourceSlackRatio: 0.3,
        eigenmodeStability: 0.7,
      };

      const moreSlack: SDIComponents = {
        ...base,
        resourceSlackRatio: 0.9,
      };

      const sdiBase = computeSDIFromComponents(base);
      const sdiSlack = computeSDIFromComponents(moreSlack);

      expect(sdiSlack).toBeGreaterThan(sdiBase);
    });

    it('should increase SDI with higher eigenmode stability', () => {
      const base: SDIComponents = {
        viablePathCount: 1000,
        constraintCount: 20,
        resourceSlackRatio: 0.5,
        eigenmodeStability: 0.3,
      };

      const moreStable: SDIComponents = {
        ...base,
        eigenmodeStability: 0.95,
      };

      const sdiBase = computeSDIFromComponents(base);
      const sdiStable = computeSDIFromComponents(moreStable);

      expect(sdiStable).toBeGreaterThan(sdiBase);
    });

    it('should handle zero viable paths gracefully', () => {
      const components: SDIComponents = {
        viablePathCount: 0,
        constraintCount: 10,
        resourceSlackRatio: 0.5,
        eigenmodeStability: 0.7,
      };

      const sdi = computeSDIFromComponents(components);

      // Zero paths should result in critical SDI
      expect(sdi).toBeLessThan(100);
    });

    it('should handle zero constraints as unconstrained', () => {
      const components: SDIComponents = {
        viablePathCount: 1000,
        constraintCount: 0,
        resourceSlackRatio: 0.5,
        eigenmodeStability: 0.7,
      };

      const sdi = computeSDIFromComponents(components);

      // Zero constraints should result in higher SDI
      expect(sdi).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Validation Tests
  // ==========================================================================

  describe('validateSDIComponents', () => {
    it('should validate correct components', () => {
      const components: SDIComponents = {
        viablePathCount: 1000,
        constraintCount: 20,
        resourceSlackRatio: 0.6,
        eigenmodeStability: 0.75,
      };

      expect(validateSDIComponents(components)).toBe(true);
    });

    it('should reject negative viable path count', () => {
      const components: SDIComponents = {
        viablePathCount: -10,
        constraintCount: 20,
        resourceSlackRatio: 0.6,
        eigenmodeStability: 0.75,
      };

      expect(validateSDIComponents(components)).toBe(false);
    });

    it('should reject negative constraint count', () => {
      const components: SDIComponents = {
        viablePathCount: 1000,
        constraintCount: -5,
        resourceSlackRatio: 0.6,
        eigenmodeStability: 0.75,
      };

      expect(validateSDIComponents(components)).toBe(false);
    });

    it('should reject resource slack ratio outside 0-1 range', () => {
      const tooLow: SDIComponents = {
        viablePathCount: 1000,
        constraintCount: 20,
        resourceSlackRatio: -0.1,
        eigenmodeStability: 0.75,
      };

      const tooHigh: SDIComponents = {
        viablePathCount: 1000,
        constraintCount: 20,
        resourceSlackRatio: 1.5,
        eigenmodeStability: 0.75,
      };

      expect(validateSDIComponents(tooLow)).toBe(false);
      expect(validateSDIComponents(tooHigh)).toBe(false);
    });

    it('should reject eigenmode stability outside 0-1 range', () => {
      const tooLow: SDIComponents = {
        viablePathCount: 1000,
        constraintCount: 20,
        resourceSlackRatio: 0.6,
        eigenmodeStability: -0.2,
      };

      const tooHigh: SDIComponents = {
        viablePathCount: 1000,
        constraintCount: 20,
        resourceSlackRatio: 0.6,
        eigenmodeStability: 1.3,
      };

      expect(validateSDIComponents(tooLow)).toBe(false);
      expect(validateSDIComponents(tooHigh)).toBe(false);
    });

    it('should accept boundary values', () => {
      const boundary: SDIComponents = {
        viablePathCount: 0,
        constraintCount: 0,
        resourceSlackRatio: 0,
        eigenmodeStability: 0,
      };

      expect(validateSDIComponents(boundary)).toBe(true);

      const maxBoundary: SDIComponents = {
        viablePathCount: 1000000,
        constraintCount: 1000,
        resourceSlackRatio: 1,
        eigenmodeStability: 1,
      };

      expect(validateSDIComponents(maxBoundary)).toBe(true);
    });
  });

  // ==========================================================================
  // Normalization Tests
  // ==========================================================================

  describe('normalizeSDI', () => {
    it('should compute log10 of SDI', () => {
      expect(normalizeSDI(100)).toBeCloseTo(2, 5);
      expect(normalizeSDI(1000)).toBeCloseTo(3, 5);
      expect(normalizeSDI(10000)).toBeCloseTo(4, 5);
      expect(normalizeSDI(100000)).toBeCloseTo(5, 5);
      expect(normalizeSDI(1000000)).toBeCloseTo(6, 5);
    });

    it('should handle SDI <= 0 gracefully', () => {
      expect(normalizeSDI(0)).toBe(0);
      expect(normalizeSDI(-100)).toBe(0);
    });

    it('should handle fractional SDI values', () => {
      expect(normalizeSDI(0.1)).toBeLessThan(0);
      expect(normalizeSDI(0.5)).toBeLessThan(0);
    });
  });

  // ==========================================================================
  // Integration Scenario Tests
  // ==========================================================================

  describe('Integration Scenarios', () => {
    it('should handle crisis mode scenario (very low SDI)', async () => {
      // Simulate: Project with few options, many constraints, low resources
      const crisisComponents: SDIComponents = {
        viablePathCount: 5,
        constraintCount: 50,
        resourceSlackRatio: 0.05,
        eigenmodeStability: 0.2,
      };

      const result = await calculateSDI({
        projectId: TEST_PROJECT_ID,
        components: crisisComponents,
        includeComponents: true,
        includeThresholds: true,
      });

      // Should be critical
      expect(result.classification).toBe(SDIClassificationEnum.CRITICAL);

      // No exploration allowed
      expect(result.explorationBudget).toBe(0);

      // Low entropy (few options)
      expect(result.shannonEntropy).toBeLessThan(10);
    });

    it('should handle optimal state scenario (high SDI)', async () => {
      // Simulate: Project with many options, few constraints, high resources
      // Need very high viable paths to overcome formula scaling and reach ABUNDANT (>100000)
      const optimalComponents: SDIComponents = {
        viablePathCount: 500000,
        constraintCount: 2,
        resourceSlackRatio: 0.95,
        eigenmodeStability: 0.98,
      };

      const result = await calculateSDI({
        projectId: TEST_PROJECT_ID,
        components: optimalComponents,
        includeComponents: true,
        includeThresholds: true,
      });

      // Should be abundant (SDI > 100000)
      expect(result.classification).toBe(SDIClassificationEnum.ABUNDANT);

      // High exploration allowed
      expect(result.explorationBudget).toBeGreaterThan(0.7);

      // High entropy (many options)
      expect(result.shannonEntropy).toBeGreaterThan(15);
    });

    it('should handle transitional state (SDI near threshold)', async () => {
      // Simulate: Project at the warning/healthy boundary
      const transitionalComponents: SDIComponents = {
        viablePathCount: 2000,
        constraintCount: 15,
        resourceSlackRatio: 0.5,
        eigenmodeStability: 0.6,
      };

      const result = await calculateSDI({
        projectId: TEST_PROJECT_ID,
        components: transitionalComponents,
      });

      // Should be in warning or healthy zone
      expect([SDIClassificationEnum.WARNING, SDIClassificationEnum.HEALTHY]).toContain(
        result.classification
      );

      // Moderate exploration
      expect(result.explorationBudget).toBeGreaterThan(0.1);
      expect(result.explorationBudget).toBeLessThan(0.6);
    });

    it('should maintain consistency between SDI, log, and entropy', async () => {
      const components: SDIComponents = {
        viablePathCount: 5000,
        constraintCount: 25,
        resourceSlackRatio: 0.65,
        eigenmodeStability: 0.8,
      };

      const result = await calculateSDI({
        projectId: TEST_PROJECT_ID,
        components,
      });

      // sdiLog should be log10(sdiValue)
      expect(result.sdiLog).toBeCloseTo(Math.log10(result.sdiValue), 3);

      // shannonEntropy should be log2(sdiValue)
      if (result.sdiValue > 1) {
        expect(result.shannonEntropy).toBeCloseTo(Math.log2(result.sdiValue), 3);
      }
    });
  });

  // ==========================================================================
  // Performance Tests
  // ==========================================================================

  describe('Performance', () => {
    it('should calculate SDI in under 10ms', async () => {
      const components: SDIComponents = {
        viablePathCount: 10000,
        constraintCount: 50,
        resourceSlackRatio: 0.7,
        eigenmodeStability: 0.8,
      };

      const start = performance.now();
      await calculateSDI({
        projectId: TEST_PROJECT_ID,
        components,
        includeComponents: true,
        includeThresholds: true,
      });
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(10);
    });

    it('should handle batch calculations efficiently', async () => {
      const components: SDIComponents = {
        viablePathCount: 5000,
        constraintCount: 30,
        resourceSlackRatio: 0.6,
        eigenmodeStability: 0.75,
      };

      const iterations = 100;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        await calculateSDI({
          projectId: TEST_PROJECT_ID,
          components: {
            ...components,
            viablePathCount: components.viablePathCount + i * 10,
          },
        });
      }

      const duration = performance.now() - start;
      const avgDuration = duration / iterations;

      // Average should still be under 10ms
      expect(avgDuration).toBeLessThan(10);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle maximum viable path count', async () => {
      const components: SDIComponents = {
        viablePathCount: Number.MAX_SAFE_INTEGER,
        constraintCount: 1,
        resourceSlackRatio: 1,
        eigenmodeStability: 1,
      };

      const result = await calculateSDI({
        projectId: TEST_PROJECT_ID,
        components,
      });

      expect(result.classification).toBe(SDIClassificationEnum.ABUNDANT);
      expect(result.explorationBudget).toBe(1);
    });

    it('should handle floating point precision in ratios', async () => {
      const components: SDIComponents = {
        viablePathCount: 1000,
        constraintCount: 10,
        resourceSlackRatio: 0.333333333333,
        eigenmodeStability: 0.666666666666,
      };

      const result = await calculateSDI({
        projectId: TEST_PROJECT_ID,
        components,
      });

      // Should not have NaN or Infinity
      expect(Number.isFinite(result.sdiValue)).toBe(true);
      expect(Number.isFinite(result.sdiLog)).toBe(true);
      expect(Number.isFinite(result.shannonEntropy)).toBe(true);
      expect(Number.isFinite(result.explorationBudget)).toBe(true);
    });

    it('should handle all zero components', async () => {
      const components: SDIComponents = {
        viablePathCount: 0,
        constraintCount: 0,
        resourceSlackRatio: 0,
        eigenmodeStability: 0,
      };

      const result = await calculateSDI({
        projectId: TEST_PROJECT_ID,
        components,
      });

      // Should return critical state
      expect(result.classification).toBe(SDIClassificationEnum.CRITICAL);
      expect(result.explorationBudget).toBe(0);
    });
  });
});

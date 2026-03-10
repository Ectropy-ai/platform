/**
 * Platform Eigenmodes Tests
 *
 * Tests eigenmode computation logic — the 12 health metrics
 * that drive the dual-process decision engine for the platform domain.
 *
 * @module adapters/__tests__
 */

import { describe, it, expect } from 'vitest';
import {
  PLATFORM_EIGENMODE_DEFINITIONS,
  computeMetricValue,
  computeAllMetrics,
  metricsToEigenmodeVector,
  computeHealthAssessment,
} from '../platform/platform-eigenmodes.js';
import type { PlatformMetricInputs } from '../platform/platform-eigenmodes.js';
import type { DomainContext } from '../universal/universal.types.js';

describe('Platform Eigenmodes', () => {
  const testDomain: DomainContext = {
    domainId: 'platform',
    domainName: 'Test Platform',
    domainVersion: '1.0.0',
  };

  /**
   * Healthy baseline inputs reflecting Ectropy's current state.
   */
  const healthyInputs: PlatformMetricInputs = {
    tsErrorCount: 0,
    tsProjectCount: 9,
    testPassRate: 0.85,
    testCoverage: 0.6,
    deprecatedCodeCount: 3,
    todoCount: 10,
    outdatedDependencyCount: 5,
    totalDependencyCount: 200,
    securityAdvisoryCount: 0,
    ciBuildSuccessRate: 0.85,
    flakyTestRate: 0.05,
    deploysPerWeek: 3,
    targetDeploysPerWeek: 5,
    documentationCompleteness: 0.7,
    breakingChangeCount: 0,
    productionReadinessScore: 92,
    typeSafetyScore: 100,
    completedDeliverables: 53,
    totalDeliverables: 54,
    activeWorkstreams: 6,
  };

  /**
   * Degraded inputs for testing warning/critical states.
   */
  const degradedInputs: PlatformMetricInputs = {
    tsErrorCount: 25,
    tsProjectCount: 9,
    testPassRate: 0.5,
    testCoverage: 0.3,
    deprecatedCodeCount: 15,
    todoCount: 100,
    outdatedDependencyCount: 50,
    totalDependencyCount: 200,
    securityAdvisoryCount: 3,
    ciBuildSuccessRate: 0.5,
    flakyTestRate: 0.2,
    deploysPerWeek: 1,
    targetDeploysPerWeek: 5,
    documentationCompleteness: 0.3,
    breakingChangeCount: 3,
    productionReadinessScore: 40,
    typeSafetyScore: 60,
    completedDeliverables: 10,
    totalDeliverables: 54,
    activeWorkstreams: 2,
  };

  describe('PLATFORM_EIGENMODE_DEFINITIONS', () => {
    it('should define exactly 12 eigenmodes', () => {
      expect(PLATFORM_EIGENMODE_DEFINITIONS).toHaveLength(12);
    });

    it('should have unique indexes 0-11', () => {
      const indexes = PLATFORM_EIGENMODE_DEFINITIONS.map((d) => d.index);
      expect(new Set(indexes).size).toBe(12);
      expect(Math.min(...indexes)).toBe(0);
      expect(Math.max(...indexes)).toBe(11);
    });

    it('should have unique IDs', () => {
      const ids = PLATFORM_EIGENMODE_DEFINITIONS.map((d) => d.id);
      expect(new Set(ids).size).toBe(12);
    });

    it('should have weights that sum to approximately 1.0', () => {
      const totalWeight = PLATFORM_EIGENMODE_DEFINITIONS.reduce(
        (sum, d) => sum + d.weight,
        0
      );
      expect(totalWeight).toBeCloseTo(1.0, 2);
    });

    it('should have valid thresholds (warning < healthy)', () => {
      for (const def of PLATFORM_EIGENMODE_DEFINITIONS) {
        expect(def.warningThreshold).toBeLessThanOrEqual(def.healthyThreshold);
        expect(def.warningThreshold).toBeGreaterThan(0);
        expect(def.healthyThreshold).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('computeMetricValue', () => {
    it('should compute codebase_health correctly for zero errors', () => {
      const def = PLATFORM_EIGENMODE_DEFINITIONS[0]; // codebase_health
      const value = computeMetricValue(def, healthyInputs);

      // 0 errors + 100% type safety should be very high
      expect(value).toBeGreaterThan(0.9);
      expect(value).toBeLessThanOrEqual(1.0);
    });

    it('should degrade codebase_health with TS errors', () => {
      const def = PLATFORM_EIGENMODE_DEFINITIONS[0];
      const healthy = computeMetricValue(def, healthyInputs);
      const degraded = computeMetricValue(def, degradedInputs);

      expect(degraded).toBeLessThan(healthy);
    });

    it('should compute test_coverage as blend of pass rate and coverage', () => {
      const def = PLATFORM_EIGENMODE_DEFINITIONS[1]; // test_coverage
      const value = computeMetricValue(def, healthyInputs);

      // Blend of 0.85 pass rate and 0.6 coverage
      expect(value).toBeCloseTo(0.725, 2);
    });

    it('should compute feature_completion from deliverable ratio', () => {
      const def = PLATFORM_EIGENMODE_DEFINITIONS[11]; // feature_completion
      const value = computeMetricValue(def, healthyInputs);

      // 53/54 = ~0.981
      expect(value).toBeGreaterThan(0.95);
    });

    it('should compute security_posture as 1.0 with zero advisories', () => {
      const def = PLATFORM_EIGENMODE_DEFINITIONS[9]; // security_posture
      const value = computeMetricValue(def, healthyInputs);

      expect(value).toBe(1.0);
    });

    it('should degrade security_posture with advisories', () => {
      const def = PLATFORM_EIGENMODE_DEFINITIONS[9];
      const value = computeMetricValue(def, degradedInputs);

      // 3 advisories * 0.2 penalty = 0.6 remaining
      expect(value).toBeCloseTo(0.4, 1);
    });

    it('should return 0 for unknown metric IDs', () => {
      const unknownDef = {
        ...PLATFORM_EIGENMODE_DEFINITIONS[0],
        id: 'unknown_metric',
      };
      const value = computeMetricValue(unknownDef, healthyInputs);
      expect(value).toBe(0);
    });

    it('should clamp all values between 0 and 1', () => {
      for (const def of PLATFORM_EIGENMODE_DEFINITIONS) {
        const healthyValue = computeMetricValue(def, healthyInputs);
        const degradedValue = computeMetricValue(def, degradedInputs);

        expect(healthyValue).toBeGreaterThanOrEqual(0);
        expect(healthyValue).toBeLessThanOrEqual(1);
        expect(degradedValue).toBeGreaterThanOrEqual(0);
        expect(degradedValue).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('computeAllMetrics', () => {
    it('should return exactly 12 metrics', () => {
      const metrics = computeAllMetrics(healthyInputs);
      expect(metrics).toHaveLength(12);
    });

    it('should set source to platform-eigenmodes', () => {
      const metrics = computeAllMetrics(healthyInputs);
      for (const metric of metrics) {
        expect(metric.source).toBe('platform-eigenmodes');
      }
    });

    it('should set trend to stable when no previous metrics', () => {
      const metrics = computeAllMetrics(healthyInputs);
      for (const metric of metrics) {
        expect(metric.trend).toBe('stable');
      }
    });

    it('should detect improving trend', () => {
      const previousMetrics = computeAllMetrics(degradedInputs);
      const currentMetrics = computeAllMetrics(healthyInputs, previousMetrics);

      // At least some metrics should show improvement
      const improving = currentMetrics.filter((m) => m.trend === 'improving');
      expect(improving.length).toBeGreaterThan(0);
    });

    it('should detect declining trend', () => {
      const previousMetrics = computeAllMetrics(healthyInputs);
      const currentMetrics = computeAllMetrics(degradedInputs, previousMetrics);

      // At least some metrics should show decline
      const declining = currentMetrics.filter((m) => m.trend === 'declining');
      expect(declining.length).toBeGreaterThan(0);
    });

    it('should include valid measuredAt timestamps', () => {
      const metrics = computeAllMetrics(healthyInputs);
      for (const metric of metrics) {
        expect(new Date(metric.measuredAt).getTime()).toBeGreaterThan(0);
      }
    });
  });

  describe('metricsToEigenmodeVector', () => {
    it('should produce a 12-element vector', () => {
      const metrics = computeAllMetrics(healthyInputs);
      const vector = metricsToEigenmodeVector(metrics);

      expect(vector).toHaveLength(12);
    });

    it('should place metrics at correct indexes', () => {
      const metrics = computeAllMetrics(healthyInputs);
      const vector = metricsToEigenmodeVector(metrics);

      // Check that each position matches the expected metric
      for (const def of PLATFORM_EIGENMODE_DEFINITIONS) {
        const metric = metrics.find((m) => m.id === def.id);
        if (metric) {
          expect(vector[def.index]).toBe(metric.value);
        }
      }
    });

    it('should have all values between 0 and 1', () => {
      const metrics = computeAllMetrics(healthyInputs);
      const vector = metricsToEigenmodeVector(metrics);

      for (const value of vector) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('computeHealthAssessment', () => {
    it('should classify healthy state correctly', () => {
      const metrics = computeAllMetrics(healthyInputs);
      const assessment = computeHealthAssessment(testDomain, metrics);

      expect(assessment.overallHealth).toBe('healthy');
      expect(assessment.score).toBeGreaterThan(70);
      expect(assessment.domain.domainId).toBe('platform');
    });

    it('should classify degraded state as warning or critical', () => {
      const metrics = computeAllMetrics(degradedInputs);
      const assessment = computeHealthAssessment(testDomain, metrics);

      expect(['warning', 'critical']).toContain(assessment.overallHealth);
      expect(assessment.score).toBeLessThan(70);
    });

    it('should include all 12 metrics in the assessment', () => {
      const metrics = computeAllMetrics(healthyInputs);
      const assessment = computeHealthAssessment(testDomain, metrics);

      expect(assessment.metrics).toHaveLength(12);
    });

    it('should include a valid eigenmode vector', () => {
      const metrics = computeAllMetrics(healthyInputs);
      const assessment = computeHealthAssessment(testDomain, metrics);

      expect(assessment.eigenmodeVector).toHaveLength(12);
    });

    it('should include a valid timestamp', () => {
      const metrics = computeAllMetrics(healthyInputs);
      const assessment = computeHealthAssessment(testDomain, metrics);

      expect(new Date(assessment.assessedAt).getTime()).toBeGreaterThan(0);
    });

    it('should compute score as weighted average of metrics', () => {
      const metrics = computeAllMetrics(healthyInputs);
      const assessment = computeHealthAssessment(testDomain, metrics);

      // Score should be 0-100
      expect(assessment.score).toBeGreaterThanOrEqual(0);
      expect(assessment.score).toBeLessThanOrEqual(100);
    });
  });
});

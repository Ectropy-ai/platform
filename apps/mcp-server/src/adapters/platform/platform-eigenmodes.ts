/**
 * Platform Eigenmodes Calculator
 *
 * Computes 12 health metrics for Ectropy's platform development context.
 * These metrics form the eigenmode vector that drives the dual-process
 * decision engine's SDI calculations and pattern matching.
 *
 * Each eigenmode is a normalized 0.0-1.0 value measuring a distinct
 * dimension of platform health. Together they provide a complete
 * picture of the development environment's state.
 *
 * Eigenmode Index Map:
 *  [0] codebase_health       — TypeScript errors, lint violations
 *  [1] test_coverage         — Test pass rate, coverage percentage
 *  [2] technical_debt        — Deprecated code, TODO count, code age
 *  [3] dependency_freshness  — Outdated packages, security advisories
 *  [4] ci_stability          — Build success rate, flaky test rate
 *  [5] deployment_frequency  — Deploy cadence, lead time
 *  [6] documentation_coverage — API docs, architectural docs currency
 *  [7] api_stability         — Breaking changes, schema drift
 *  [8] performance_regression — Response times, bundle size growth
 *  [9] security_posture      — Vulnerability count, audit findings
 * [10] team_velocity         — Deliverables completed per sprint
 * [11] feature_completion    — Roadmap progress vs plan
 *
 * @module adapters/platform
 * @version 1.0.0
 */

import type {
  IHealthMetric,
  IHealthAssessment,
  DomainContext,
} from '../universal/universal.types.js';
import type { EigenmodeVector } from '../../types/dual-process.types.js';

// ============================================================================
// Eigenmode Definitions
// ============================================================================

/**
 * Static definition for each platform eigenmode.
 * Defines the identity, weight, and thresholds for classification.
 */
export interface EigenmodeDefinition {
  /** Index in the eigenmode vector (0-11) */
  index: number;
  /** Machine-readable metric ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Weight in overall health score (sums to 1.0) */
  weight: number;
  /** Below this value = 'warning' */
  warningThreshold: number;
  /** Below this value = 'critical' (when below warningThreshold) */
  healthyThreshold: number;
  /** Description of what this metric measures */
  description: string;
}

/**
 * The 12 platform eigenmode definitions.
 */
export const PLATFORM_EIGENMODE_DEFINITIONS: EigenmodeDefinition[] = [
  {
    index: 0,
    id: 'codebase_health',
    name: 'Codebase Health',
    weight: 0.1,
    warningThreshold: 0.7,
    healthyThreshold: 0.85,
    description:
      'TypeScript compilation errors, lint violations, code quality score',
  },
  {
    index: 1,
    id: 'test_coverage',
    name: 'Test Coverage',
    weight: 0.1,
    warningThreshold: 0.6,
    healthyThreshold: 0.8,
    description: 'Test pass rate, coverage percentage, test-to-code ratio',
  },
  {
    index: 2,
    id: 'technical_debt',
    name: 'Technical Debt',
    weight: 0.08,
    warningThreshold: 0.5,
    healthyThreshold: 0.7,
    description: 'Deprecated code usage, TODO/FIXME count, code staleness',
  },
  {
    index: 3,
    id: 'dependency_freshness',
    name: 'Dependency Freshness',
    weight: 0.07,
    warningThreshold: 0.5,
    healthyThreshold: 0.7,
    description:
      'Outdated package count, security advisory count, major version lag',
  },
  {
    index: 4,
    id: 'ci_stability',
    name: 'CI/CD Stability',
    weight: 0.1,
    warningThreshold: 0.7,
    healthyThreshold: 0.85,
    description:
      'Build success rate, flaky test rate, pipeline duration stability',
  },
  {
    index: 5,
    id: 'deployment_frequency',
    name: 'Deployment Frequency',
    weight: 0.08,
    warningThreshold: 0.4,
    healthyThreshold: 0.6,
    description: 'Deploy cadence vs target, lead time, change failure rate',
  },
  {
    index: 6,
    id: 'documentation_coverage',
    name: 'Documentation Coverage',
    weight: 0.06,
    warningThreshold: 0.4,
    healthyThreshold: 0.6,
    description:
      'API documentation completeness, architectural doc currency, evidence trail',
  },
  {
    index: 7,
    id: 'api_stability',
    name: 'API Stability',
    weight: 0.09,
    warningThreshold: 0.6,
    healthyThreshold: 0.8,
    description: 'Breaking changes count, schema drift, backward compatibility',
  },
  {
    index: 8,
    id: 'performance_regression',
    name: 'Performance Health',
    weight: 0.08,
    warningThreshold: 0.6,
    healthyThreshold: 0.8,
    description:
      'Response time trends, bundle size growth, memory usage patterns',
  },
  {
    index: 9,
    id: 'security_posture',
    name: 'Security Posture',
    weight: 0.1,
    warningThreshold: 0.7,
    healthyThreshold: 0.85,
    description:
      'Known vulnerability count, audit findings, secret scan results',
  },
  {
    index: 10,
    id: 'team_velocity',
    name: 'Team Velocity',
    weight: 0.07,
    warningThreshold: 0.5,
    healthyThreshold: 0.7,
    description:
      'Deliverables completed per sprint, cycle time, throughput trend',
  },
  {
    index: 11,
    id: 'feature_completion',
    name: 'Feature Completion',
    weight: 0.07,
    warningThreshold: 0.5,
    healthyThreshold: 0.7,
    description:
      'Roadmap progress vs plan, milestone hit rate, scope change rate',
  },
];

// ============================================================================
// Data Types for Metric Computation
// ============================================================================

/**
 * Raw platform data used to compute eigenmode metrics.
 * Populated by the Platform Context Adapter from .roadmap/ files
 * and CI/CD metrics.
 */
export interface PlatformMetricInputs {
  /** TypeScript error count (0 = perfect) */
  tsErrorCount: number;
  /** Total TypeScript projects in monorepo */
  tsProjectCount: number;
  /** Test pass rate (0.0 to 1.0) */
  testPassRate: number;
  /** Code coverage percentage (0.0 to 1.0) */
  testCoverage: number;
  /** Count of deprecated code references still active */
  deprecatedCodeCount: number;
  /** Count of TODO/FIXME comments */
  todoCount: number;
  /** Count of outdated dependencies (major versions behind) */
  outdatedDependencyCount: number;
  /** Total dependency count */
  totalDependencyCount: number;
  /** Count of known security advisories */
  securityAdvisoryCount: number;
  /** CI build success rate over last 30 days (0.0 to 1.0) */
  ciBuildSuccessRate: number;
  /** Flaky test rate (0.0 to 1.0, lower is better) */
  flakyTestRate: number;
  /** Deploys per week (current) */
  deploysPerWeek: number;
  /** Target deploys per week */
  targetDeploysPerWeek: number;
  /** Documentation completeness estimate (0.0 to 1.0) */
  documentationCompleteness: number;
  /** Breaking API changes in last 30 days */
  breakingChangeCount: number;
  /** Production readiness score from current-truth (0-100) */
  productionReadinessScore: number;
  /** Type safety score from current-truth (0-100) */
  typeSafetyScore: number;
  /** Completed deliverables count */
  completedDeliverables: number;
  /** Total deliverables count */
  totalDeliverables: number;
  /** Active workstream count */
  activeWorkstreams: number;
}

// ============================================================================
// Computation Functions
// ============================================================================

/**
 * Compute a single eigenmode metric value from raw platform data.
 *
 * @param definition - The eigenmode definition
 * @param inputs - Raw platform data
 * @returns Normalized metric value (0.0 to 1.0)
 */
export function computeMetricValue(
  definition: EigenmodeDefinition,
  inputs: PlatformMetricInputs
): number {
  switch (definition.id) {
    case 'codebase_health':
      return computeCodebaseHealth(inputs);
    case 'test_coverage':
      return computeTestCoverage(inputs);
    case 'technical_debt':
      return computeTechnicalDebt(inputs);
    case 'dependency_freshness':
      return computeDependencyFreshness(inputs);
    case 'ci_stability':
      return computeCiStability(inputs);
    case 'deployment_frequency':
      return computeDeploymentFrequency(inputs);
    case 'documentation_coverage':
      return computeDocumentationCoverage(inputs);
    case 'api_stability':
      return computeApiStability(inputs);
    case 'performance_regression':
      return computePerformanceHealth(inputs);
    case 'security_posture':
      return computeSecurityPosture(inputs);
    case 'team_velocity':
      return computeTeamVelocity(inputs);
    case 'feature_completion':
      return computeFeatureCompletion(inputs);
    default:
      return 0;
  }
}

/**
 * Compute all 12 eigenmode metrics from raw platform data.
 */
export function computeAllMetrics(
  inputs: PlatformMetricInputs,
  previousMetrics?: IHealthMetric[]
): IHealthMetric[] {
  const now = new Date().toISOString();

  return PLATFORM_EIGENMODE_DEFINITIONS.map((definition) => {
    const value = clamp(computeMetricValue(definition, inputs), 0, 1);
    const previousValue = previousMetrics?.find(
      (m) => m.id === definition.id
    )?.value;

    return {
      id: definition.id,
      name: definition.name,
      value,
      previousValue,
      trend: determineTrend(value, previousValue),
      weight: definition.weight,
      healthyThreshold: definition.healthyThreshold,
      warningThreshold: definition.warningThreshold,
      measuredAt: now,
      source: 'platform-eigenmodes',
    };
  });
}

/**
 * Compute the eigenmode vector from metrics.
 */
export function metricsToEigenmodeVector(
  metrics: IHealthMetric[]
): EigenmodeVector {
  const vector: number[] = new Array(12).fill(0);

  for (const metric of metrics) {
    const definition = PLATFORM_EIGENMODE_DEFINITIONS.find(
      (d) => d.id === metric.id
    );
    if (definition) {
      vector[definition.index] = metric.value;
    }
  }

  return vector as EigenmodeVector;
}

/**
 * Compute the overall health assessment from metrics.
 */
export function computeHealthAssessment(
  domain: DomainContext,
  metrics: IHealthMetric[]
): IHealthAssessment {
  // Weighted score
  let weightedSum = 0;
  let totalWeight = 0;

  for (const metric of metrics) {
    weightedSum += metric.value * metric.weight;
    totalWeight += metric.weight;
  }

  const score =
    totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : 0;

  // Classification
  let overallHealth: IHealthAssessment['overallHealth'] = 'healthy';
  if (score < 50) {
    overallHealth = 'critical';
  } else if (score < 70) {
    overallHealth = 'warning';
  }

  // Check for any critical individual metrics
  const hasCriticalMetric = metrics.some(
    (m) => m.value < m.warningThreshold * 0.7
  );
  if (hasCriticalMetric && overallHealth === 'healthy') {
    overallHealth = 'warning';
  }

  return {
    domain,
    overallHealth,
    score,
    metrics,
    eigenmodeVector: metricsToEigenmodeVector(metrics),
    assessedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Individual Metric Computations
// ============================================================================

function computeCodebaseHealth(inputs: PlatformMetricInputs): number {
  // Perfect: 0 errors across all projects
  // Each error degrades the score
  const errorScore =
    inputs.tsProjectCount > 0
      ? Math.max(0, 1 - inputs.tsErrorCount / (inputs.tsProjectCount * 5))
      : 0.5;

  // Type safety score is already 0-100
  const typeScore = inputs.typeSafetyScore / 100;

  return errorScore * 0.6 + typeScore * 0.4;
}

function computeTestCoverage(inputs: PlatformMetricInputs): number {
  // Blend test pass rate and coverage
  return inputs.testPassRate * 0.5 + inputs.testCoverage * 0.5;
}

function computeTechnicalDebt(inputs: PlatformMetricInputs): number {
  // Lower debt = higher score (inverted)
  const deprecationPenalty = Math.min(inputs.deprecatedCodeCount * 0.05, 0.4);
  const todoPenalty = Math.min(inputs.todoCount * 0.01, 0.3);
  return Math.max(0, 1 - deprecationPenalty - todoPenalty);
}

function computeDependencyFreshness(inputs: PlatformMetricInputs): number {
  if (inputs.totalDependencyCount === 0) {
    return 1;
  }
  const outdatedRatio =
    inputs.outdatedDependencyCount / inputs.totalDependencyCount;
  return Math.max(0, 1 - outdatedRatio * 3); // 33% outdated = 0 score
}

function computeCiStability(inputs: PlatformMetricInputs): number {
  const buildScore = inputs.ciBuildSuccessRate;
  const flakyPenalty = inputs.flakyTestRate * 2; // Flaky tests are doubly bad
  return Math.max(0, buildScore - flakyPenalty);
}

function computeDeploymentFrequency(inputs: PlatformMetricInputs): number {
  if (inputs.targetDeploysPerWeek === 0) {
    return 0.5;
  }
  const ratio = inputs.deploysPerWeek / inputs.targetDeploysPerWeek;
  return Math.min(1, ratio); // Cap at 1.0 (exceeding target is still 1.0)
}

function computeDocumentationCoverage(inputs: PlatformMetricInputs): number {
  return inputs.documentationCompleteness;
}

function computeApiStability(inputs: PlatformMetricInputs): number {
  // Each breaking change degrades stability
  return Math.max(0, 1 - inputs.breakingChangeCount * 0.15);
}

function computePerformanceHealth(inputs: PlatformMetricInputs): number {
  // Use production readiness as proxy for performance health
  return inputs.productionReadinessScore / 100;
}

function computeSecurityPosture(inputs: PlatformMetricInputs): number {
  // Each advisory degrades security
  return Math.max(0, 1 - inputs.securityAdvisoryCount * 0.2);
}

function computeTeamVelocity(inputs: PlatformMetricInputs): number {
  // Active workstreams relative to capacity
  // 6 active workstreams for a solo founder = healthy
  const capacityRatio = Math.min(1, inputs.activeWorkstreams / 6);
  return capacityRatio;
}

function computeFeatureCompletion(inputs: PlatformMetricInputs): number {
  if (inputs.totalDeliverables === 0) {
    return 0;
  }
  return inputs.completedDeliverables / inputs.totalDeliverables;
}

// ============================================================================
// Utility Functions
// ============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function determineTrend(
  current: number,
  previous: number | undefined
): 'improving' | 'stable' | 'declining' {
  if (previous === undefined) {
    return 'stable';
  }
  const delta = current - previous;
  if (delta > 0.02) {
    return 'improving';
  }
  if (delta < -0.02) {
    return 'declining';
  }
  return 'stable';
}

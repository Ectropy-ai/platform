/**
 * Platform Eigenmode Service
 *
 * Calculates the 12 platform eigenmodes that capture Ectropy's codebase health.
 * These eigenmodes are the platform equivalent of construction EFAS factors,
 * enabling SDI calculations for platform decisions.
 *
 * Platform Eigenmodes (12 dimensions):
 * 0: codebase_health      - TypeScript errors, linting warnings
 * 1: test_coverage        - Unit, integration, E2E coverage
 * 2: technical_debt       - TODO count, deprecated usage, complexity
 * 3: dependency_freshness - npm outdated, security vulnerabilities
 * 4: ci_stability         - CI pass rate, flaky tests, build times
 * 5: deployment_frequency - Deploy cadence, rollback rate (DORA)
 * 6: documentation_coverage - JSDoc coverage, README completeness
 * 7: api_stability        - Breaking changes, deprecation warnings
 * 8: performance_regression - Response times, memory, bundle size
 * 9: security_posture     - Vulnerability count, secrets exposure
 * 10: team_velocity       - PR throughput, review time, cycle time
 * 11: feature_completion  - Milestone completion rate, rework rate
 *
 * @see .roadmap/features/platform-agent/FEATURE.json
 * @version 1.0.0
 */

import { PLATFORM_EIGENMODE_LABELS } from '../config/platform-agent.config.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Individual eigenmode measurement
 */
export interface EigenmodeMeasurement {
  index: number;
  label: string;
  value: number;
  raw: Record<string, number>;
  sources: string[];
  timestamp: string;
  confidence: number;
}

/**
 * Complete eigenmode snapshot
 */
export interface EigenmodeSnapshot {
  vector: number[];
  measurements: EigenmodeMeasurement[];
  timestamp: string;
  overallHealth: number;
  classification: 'CRITICAL' | 'WARNING' | 'HEALTHY' | 'ABUNDANT';
}

/**
 * Eigenmode calculation input
 */
export interface EigenmodeInput {
  codebaseMetrics?: CodebaseMetrics;
  testMetrics?: TestMetrics;
  debtMetrics?: DebtMetrics;
  dependencyMetrics?: DependencyMetrics;
  ciMetrics?: CIMetrics;
  deploymentMetrics?: DeploymentMetrics;
  documentationMetrics?: DocumentationMetrics;
  apiMetrics?: APIMetrics;
  performanceMetrics?: PerformanceMetrics;
  securityMetrics?: SecurityMetrics;
  velocityMetrics?: VelocityMetrics;
  completionMetrics?: CompletionMetrics;
}

/**
 * Codebase health metrics
 */
export interface CodebaseMetrics {
  typescriptErrors: number;
  lintWarnings: number;
  lintErrors: number;
  totalFiles: number;
  totalLines: number;
}

/**
 * Test coverage metrics
 */
export interface TestMetrics {
  unitCoverage: number;
  integrationCoverage: number;
  e2eCoverage: number;
  totalTests: number;
  passingTests: number;
}

/**
 * Technical debt metrics
 */
export interface DebtMetrics {
  todoCount: number;
  deprecatedUsageCount: number;
  complexityScore: number;
  duplicateCodePercentage: number;
}

/**
 * Dependency metrics
 */
export interface DependencyMetrics {
  outdatedCount: number;
  totalDependencies: number;
  criticalVulnerabilities: number;
  highVulnerabilities: number;
  mediumVulnerabilities: number;
}

/**
 * CI metrics
 */
export interface CIMetrics {
  passRate: number;
  flakyTestCount: number;
  averageBuildTimeMs: number;
  failuresLast30Days: number;
}

/**
 * Deployment metrics (DORA-aligned)
 */
export interface DeploymentMetrics {
  deployFrequencyPerWeek: number;
  leadTimeHours: number;
  changeFailureRate: number;
  meanTimeToRecoverHours: number;
}

/**
 * Documentation metrics
 */
export interface DocumentationMetrics {
  jsdocCoverage: number;
  readmeCompleteness: number;
  apiDocsCoverage: number;
  changelogUpToDate: boolean;
}

/**
 * API stability metrics
 */
export interface APIMetrics {
  breakingChangesLast90Days: number;
  deprecationWarnings: number;
  apiVersionsActive: number;
  backwardCompatibilityScore: number;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  p95ResponseTimeMs: number;
  p99ResponseTimeMs: number;
  memoryUsageMB: number;
  bundleSizeKB: number;
  lighthouseScore: number;
}

/**
 * Security metrics
 */
export interface SecurityMetrics {
  vulnerabilityCount: number;
  secretsExposed: number;
  authCoverage: number;
  lastSecurityAuditDays: number;
}

/**
 * Team velocity metrics
 */
export interface VelocityMetrics {
  prMergedPerWeek: number;
  averageReviewTimeHours: number;
  averageCycleTimeHours: number;
  openPRCount: number;
}

/**
 * Feature completion metrics
 */
export interface CompletionMetrics {
  milestonesOnTime: number;
  milestonesTotal: number;
  reworkRate: number;
  scopeCreepPercentage: number;
}

// ============================================================================
// Default Thresholds
// ============================================================================

/**
 * Thresholds for normalizing metrics to 0-1 scale
 */
const THRESHOLDS = {
  codebase: {
    errorPenaltyPerError: 0.05,
    warningPenaltyPerWarning: 0.01,
    maxPenalty: 0.8,
  },
  test: {
    minCoverage: 0.6,
    targetCoverage: 0.9,
  },
  debt: {
    maxTodos: 100,
    maxDeprecated: 20,
    maxComplexity: 50,
  },
  dependency: {
    maxOutdated: 20,
    criticalPenalty: 0.3,
    highPenalty: 0.1,
    mediumPenalty: 0.02,
  },
  ci: {
    targetPassRate: 0.98,
    maxFlakyTests: 5,
    targetBuildTimeMs: 300000,
  },
  deployment: {
    minDeploysPerWeek: 1,
    targetDeploysPerWeek: 5,
    maxLeadTimeHours: 24,
    maxFailureRate: 0.15,
  },
  documentation: {
    minCoverage: 0.5,
    targetCoverage: 0.8,
  },
  api: {
    maxBreakingChanges: 0,
    maxDeprecations: 10,
  },
  performance: {
    targetP95Ms: 200,
    maxP95Ms: 1000,
    targetBundleKB: 500,
    maxBundleKB: 2000,
  },
  security: {
    maxVulnerabilities: 0,
    maxSecretsExposed: 0,
    maxAuditAgeDays: 90,
  },
  velocity: {
    minPRsPerWeek: 3,
    targetPRsPerWeek: 10,
    maxReviewTimeHours: 24,
  },
  completion: {
    targetOnTimeRate: 0.8,
    maxReworkRate: 0.2,
    maxScopeCreep: 0.1,
  },
};

// ============================================================================
// Calculation Functions
// ============================================================================

/**
 * Calculate codebase health eigenmode (index 0)
 */
function calculateCodebaseHealth(metrics?: CodebaseMetrics): EigenmodeMeasurement {
  const timestamp = new Date().toISOString();

  if (!metrics) {
    return {
      index: 0,
      label: 'codebase_health',
      value: 0.5, // Unknown = middle
      raw: {},
      sources: [],
      timestamp,
      confidence: 0,
    };
  }

  const errorPenalty = Math.min(
    metrics.typescriptErrors * THRESHOLDS.codebase.errorPenaltyPerError,
    THRESHOLDS.codebase.maxPenalty
  );
  const warningPenalty = Math.min(
    (metrics.lintWarnings + metrics.lintErrors) * THRESHOLDS.codebase.warningPenaltyPerWarning,
    THRESHOLDS.codebase.maxPenalty / 2
  );

  const value = Math.max(0, 1 - errorPenalty - warningPenalty);

  return {
    index: 0,
    label: 'codebase_health',
    value,
    raw: {
      typescriptErrors: metrics.typescriptErrors,
      lintWarnings: metrics.lintWarnings,
      lintErrors: metrics.lintErrors,
    },
    sources: ['tsc --noEmit', 'eslint'],
    timestamp,
    confidence: 1,
  };
}

/**
 * Calculate test coverage eigenmode (index 1)
 */
function calculateTestCoverage(metrics?: TestMetrics): EigenmodeMeasurement {
  const timestamp = new Date().toISOString();

  if (!metrics) {
    return {
      index: 1,
      label: 'test_coverage',
      value: 0.5,
      raw: {},
      sources: [],
      timestamp,
      confidence: 0,
    };
  }

  // Weighted average: unit (40%), integration (35%), e2e (25%)
  const weightedCoverage =
    metrics.unitCoverage * 0.4 +
    metrics.integrationCoverage * 0.35 +
    metrics.e2eCoverage * 0.25;

  // Pass rate bonus
  const passRate = metrics.totalTests > 0 ? metrics.passingTests / metrics.totalTests : 0;
  const passBonus = passRate * 0.1;

  const value = Math.min(1, weightedCoverage + passBonus);

  return {
    index: 1,
    label: 'test_coverage',
    value,
    raw: {
      unitCoverage: metrics.unitCoverage,
      integrationCoverage: metrics.integrationCoverage,
      e2eCoverage: metrics.e2eCoverage,
      passRate,
    },
    sources: ['vitest coverage', 'playwright'],
    timestamp,
    confidence: 1,
  };
}

/**
 * Calculate technical debt eigenmode (index 2)
 */
function calculateTechnicalDebt(metrics?: DebtMetrics): EigenmodeMeasurement {
  const timestamp = new Date().toISOString();

  if (!metrics) {
    return {
      index: 2,
      label: 'technical_debt',
      value: 0.5,
      raw: {},
      sources: [],
      timestamp,
      confidence: 0,
    };
  }

  const todoPenalty = Math.min(metrics.todoCount / THRESHOLDS.debt.maxTodos, 1) * 0.3;
  const deprecatedPenalty =
    Math.min(metrics.deprecatedUsageCount / THRESHOLDS.debt.maxDeprecated, 1) * 0.3;
  const complexityPenalty =
    Math.min(metrics.complexityScore / THRESHOLDS.debt.maxComplexity, 1) * 0.2;
  const duplicatePenalty = metrics.duplicateCodePercentage * 0.2;

  const value = Math.max(0, 1 - todoPenalty - deprecatedPenalty - complexityPenalty - duplicatePenalty);

  return {
    index: 2,
    label: 'technical_debt',
    value,
    raw: {
      todoCount: metrics.todoCount,
      deprecatedUsageCount: metrics.deprecatedUsageCount,
      complexityScore: metrics.complexityScore,
      duplicateCodePercentage: metrics.duplicateCodePercentage,
    },
    sources: ['sonarqube', 'complexity analysis'],
    timestamp,
    confidence: 1,
  };
}

/**
 * Calculate dependency freshness eigenmode (index 3)
 */
function calculateDependencyFreshness(metrics?: DependencyMetrics): EigenmodeMeasurement {
  const timestamp = new Date().toISOString();

  if (!metrics) {
    return {
      index: 3,
      label: 'dependency_freshness',
      value: 0.5,
      raw: {},
      sources: [],
      timestamp,
      confidence: 0,
    };
  }

  const outdatedPenalty =
    Math.min(metrics.outdatedCount / THRESHOLDS.dependency.maxOutdated, 1) * 0.4;
  const criticalPenalty = metrics.criticalVulnerabilities * THRESHOLDS.dependency.criticalPenalty;
  const highPenalty = metrics.highVulnerabilities * THRESHOLDS.dependency.highPenalty;
  const mediumPenalty = metrics.mediumVulnerabilities * THRESHOLDS.dependency.mediumPenalty;

  const value = Math.max(0, 1 - outdatedPenalty - criticalPenalty - highPenalty - mediumPenalty);

  return {
    index: 3,
    label: 'dependency_freshness',
    value,
    raw: {
      outdatedCount: metrics.outdatedCount,
      criticalVulnerabilities: metrics.criticalVulnerabilities,
      highVulnerabilities: metrics.highVulnerabilities,
      mediumVulnerabilities: metrics.mediumVulnerabilities,
    },
    sources: ['npm audit', 'dependabot'],
    timestamp,
    confidence: 1,
  };
}

/**
 * Calculate CI stability eigenmode (index 4)
 */
function calculateCIStability(metrics?: CIMetrics): EigenmodeMeasurement {
  const timestamp = new Date().toISOString();

  if (!metrics) {
    return {
      index: 4,
      label: 'ci_stability',
      value: 0.5,
      raw: {},
      sources: [],
      timestamp,
      confidence: 0,
    };
  }

  const passRateScore = Math.min(metrics.passRate / THRESHOLDS.ci.targetPassRate, 1) * 0.5;
  const flakyPenalty =
    Math.min(metrics.flakyTestCount / THRESHOLDS.ci.maxFlakyTests, 1) * 0.2;
  const buildTimeScore =
    Math.max(0, 1 - metrics.averageBuildTimeMs / THRESHOLDS.ci.targetBuildTimeMs) * 0.3;

  const value = Math.max(0, passRateScore - flakyPenalty + buildTimeScore);

  return {
    index: 4,
    label: 'ci_stability',
    value,
    raw: {
      passRate: metrics.passRate,
      flakyTestCount: metrics.flakyTestCount,
      averageBuildTimeMs: metrics.averageBuildTimeMs,
    },
    sources: ['GitHub Actions'],
    timestamp,
    confidence: 1,
  };
}

/**
 * Calculate deployment frequency eigenmode (index 5)
 */
function calculateDeploymentFrequency(metrics?: DeploymentMetrics): EigenmodeMeasurement {
  const timestamp = new Date().toISOString();

  if (!metrics) {
    return {
      index: 5,
      label: 'deployment_frequency',
      value: 0.5,
      raw: {},
      sources: [],
      timestamp,
      confidence: 0,
    };
  }

  const frequencyScore =
    Math.min(metrics.deployFrequencyPerWeek / THRESHOLDS.deployment.targetDeploysPerWeek, 1) * 0.3;
  const leadTimeScore =
    Math.max(0, 1 - metrics.leadTimeHours / THRESHOLDS.deployment.maxLeadTimeHours) * 0.3;
  const failureScore =
    Math.max(0, 1 - metrics.changeFailureRate / THRESHOLDS.deployment.maxFailureRate) * 0.2;
  const mttrScore =
    Math.max(0, 1 - metrics.meanTimeToRecoverHours / 24) * 0.2;

  const value = frequencyScore + leadTimeScore + failureScore + mttrScore;

  return {
    index: 5,
    label: 'deployment_frequency',
    value,
    raw: {
      deployFrequencyPerWeek: metrics.deployFrequencyPerWeek,
      leadTimeHours: metrics.leadTimeHours,
      changeFailureRate: metrics.changeFailureRate,
      meanTimeToRecoverHours: metrics.meanTimeToRecoverHours,
    },
    sources: ['deployment logs', 'DORA metrics'],
    timestamp,
    confidence: 1,
  };
}

/**
 * Calculate documentation coverage eigenmode (index 6)
 */
function calculateDocumentationCoverage(metrics?: DocumentationMetrics): EigenmodeMeasurement {
  const timestamp = new Date().toISOString();

  if (!metrics) {
    return {
      index: 6,
      label: 'documentation_coverage',
      value: 0.5,
      raw: {},
      sources: [],
      timestamp,
      confidence: 0,
    };
  }

  const jsdocScore = metrics.jsdocCoverage * 0.4;
  const readmeScore = metrics.readmeCompleteness * 0.3;
  const apiDocsScore = metrics.apiDocsCoverage * 0.2;
  const changelogBonus = metrics.changelogUpToDate ? 0.1 : 0;

  const value = jsdocScore + readmeScore + apiDocsScore + changelogBonus;

  return {
    index: 6,
    label: 'documentation_coverage',
    value,
    raw: {
      jsdocCoverage: metrics.jsdocCoverage,
      readmeCompleteness: metrics.readmeCompleteness,
      apiDocsCoverage: metrics.apiDocsCoverage,
      changelogUpToDate: metrics.changelogUpToDate ? 1 : 0,
    },
    sources: ['typedoc', 'manual audit'],
    timestamp,
    confidence: 1,
  };
}

/**
 * Calculate API stability eigenmode (index 7)
 */
function calculateAPIStability(metrics?: APIMetrics): EigenmodeMeasurement {
  const timestamp = new Date().toISOString();

  if (!metrics) {
    return {
      index: 7,
      label: 'api_stability',
      value: 0.5,
      raw: {},
      sources: [],
      timestamp,
      confidence: 0,
    };
  }

  const breakingPenalty = metrics.breakingChangesLast90Days * 0.2;
  const deprecationPenalty =
    Math.min(metrics.deprecationWarnings / THRESHOLDS.api.maxDeprecations, 1) * 0.2;
  const compatibilityScore = metrics.backwardCompatibilityScore * 0.6;

  const value = Math.max(0, compatibilityScore - breakingPenalty - deprecationPenalty);

  return {
    index: 7,
    label: 'api_stability',
    value,
    raw: {
      breakingChangesLast90Days: metrics.breakingChangesLast90Days,
      deprecationWarnings: metrics.deprecationWarnings,
      backwardCompatibilityScore: metrics.backwardCompatibilityScore,
    },
    sources: ['API changelog', 'OpenAPI diff'],
    timestamp,
    confidence: 1,
  };
}

/**
 * Calculate performance regression eigenmode (index 8)
 */
function calculatePerformanceRegression(metrics?: PerformanceMetrics): EigenmodeMeasurement {
  const timestamp = new Date().toISOString();

  if (!metrics) {
    return {
      index: 8,
      label: 'performance_regression',
      value: 0.5,
      raw: {},
      sources: [],
      timestamp,
      confidence: 0,
    };
  }

  const p95Score =
    Math.max(0, 1 - (metrics.p95ResponseTimeMs - THRESHOLDS.performance.targetP95Ms) /
      (THRESHOLDS.performance.maxP95Ms - THRESHOLDS.performance.targetP95Ms)) * 0.3;
  const bundleScore =
    Math.max(0, 1 - (metrics.bundleSizeKB - THRESHOLDS.performance.targetBundleKB) /
      (THRESHOLDS.performance.maxBundleKB - THRESHOLDS.performance.targetBundleKB)) * 0.3;
  const lighthouseScore = (metrics.lighthouseScore / 100) * 0.4;

  const value = Math.min(1, p95Score + bundleScore + lighthouseScore);

  return {
    index: 8,
    label: 'performance_regression',
    value,
    raw: {
      p95ResponseTimeMs: metrics.p95ResponseTimeMs,
      bundleSizeKB: metrics.bundleSizeKB,
      lighthouseScore: metrics.lighthouseScore,
    },
    sources: ['Lighthouse', 'bundle analyzer'],
    timestamp,
    confidence: 1,
  };
}

/**
 * Calculate security posture eigenmode (index 9)
 */
function calculateSecurityPosture(metrics?: SecurityMetrics): EigenmodeMeasurement {
  const timestamp = new Date().toISOString();

  if (!metrics) {
    return {
      index: 9,
      label: 'security_posture',
      value: 0.5,
      raw: {},
      sources: [],
      timestamp,
      confidence: 0,
    };
  }

  const vulnPenalty = Math.min(metrics.vulnerabilityCount * 0.1, 0.5);
  const secretsPenalty = metrics.secretsExposed * 0.3;
  const authScore = metrics.authCoverage * 0.3;
  const auditPenalty =
    Math.min(metrics.lastSecurityAuditDays / THRESHOLDS.security.maxAuditAgeDays, 1) * 0.2;

  const value = Math.max(0, authScore - vulnPenalty - secretsPenalty - auditPenalty + 0.5);

  return {
    index: 9,
    label: 'security_posture',
    value: Math.min(1, value),
    raw: {
      vulnerabilityCount: metrics.vulnerabilityCount,
      secretsExposed: metrics.secretsExposed,
      authCoverage: metrics.authCoverage,
      lastSecurityAuditDays: metrics.lastSecurityAuditDays,
    },
    sources: ['snyk', 'gitleaks', 'security audit'],
    timestamp,
    confidence: 1,
  };
}

/**
 * Calculate team velocity eigenmode (index 10)
 */
function calculateTeamVelocity(metrics?: VelocityMetrics): EigenmodeMeasurement {
  const timestamp = new Date().toISOString();

  if (!metrics) {
    return {
      index: 10,
      label: 'team_velocity',
      value: 0.5,
      raw: {},
      sources: [],
      timestamp,
      confidence: 0,
    };
  }

  const prScore =
    Math.min(metrics.prMergedPerWeek / THRESHOLDS.velocity.targetPRsPerWeek, 1) * 0.4;
  const reviewScore =
    Math.max(0, 1 - metrics.averageReviewTimeHours / THRESHOLDS.velocity.maxReviewTimeHours) * 0.3;
  const cycleScore =
    Math.max(0, 1 - metrics.averageCycleTimeHours / 168) * 0.3; // 168 = 1 week

  const value = prScore + reviewScore + cycleScore;

  return {
    index: 10,
    label: 'team_velocity',
    value,
    raw: {
      prMergedPerWeek: metrics.prMergedPerWeek,
      averageReviewTimeHours: metrics.averageReviewTimeHours,
      averageCycleTimeHours: metrics.averageCycleTimeHours,
    },
    sources: ['GitHub Insights'],
    timestamp,
    confidence: 1,
  };
}

/**
 * Calculate feature completion eigenmode (index 11)
 */
function calculateFeatureCompletion(metrics?: CompletionMetrics): EigenmodeMeasurement {
  const timestamp = new Date().toISOString();

  if (!metrics) {
    return {
      index: 11,
      label: 'feature_completion',
      value: 0.5,
      raw: {},
      sources: [],
      timestamp,
      confidence: 0,
    };
  }

  const onTimeRate = metrics.milestonesTotal > 0
    ? metrics.milestonesOnTime / metrics.milestonesTotal
    : 0;
  const onTimeScore = onTimeRate * 0.5;
  const reworkPenalty = Math.min(metrics.reworkRate / THRESHOLDS.completion.maxReworkRate, 1) * 0.25;
  const scopeCreepPenalty =
    Math.min(metrics.scopeCreepPercentage / THRESHOLDS.completion.maxScopeCreep, 1) * 0.25;

  const value = Math.max(0, onTimeScore + 0.5 - reworkPenalty - scopeCreepPenalty);

  return {
    index: 11,
    label: 'feature_completion',
    value,
    raw: {
      onTimeRate,
      reworkRate: metrics.reworkRate,
      scopeCreepPercentage: metrics.scopeCreepPercentage,
    },
    sources: ['roadmap.json', 'commit analysis'],
    timestamp,
    confidence: 1,
  };
}

// ============================================================================
// Main Calculation
// ============================================================================

/**
 * Calculate complete eigenmode snapshot
 */
export function calculatePlatformEigenmodes(input: EigenmodeInput): EigenmodeSnapshot {
  const timestamp = new Date().toISOString();

  const measurements: EigenmodeMeasurement[] = [
    calculateCodebaseHealth(input.codebaseMetrics),
    calculateTestCoverage(input.testMetrics),
    calculateTechnicalDebt(input.debtMetrics),
    calculateDependencyFreshness(input.dependencyMetrics),
    calculateCIStability(input.ciMetrics),
    calculateDeploymentFrequency(input.deploymentMetrics),
    calculateDocumentationCoverage(input.documentationMetrics),
    calculateAPIStability(input.apiMetrics),
    calculatePerformanceRegression(input.performanceMetrics),
    calculateSecurityPosture(input.securityMetrics),
    calculateTeamVelocity(input.velocityMetrics),
    calculateFeatureCompletion(input.completionMetrics),
  ];

  const vector = measurements.map((m) => m.value);
  const overallHealth = vector.reduce((sum, v) => sum + v, 0) / vector.length;

  let classification: 'CRITICAL' | 'WARNING' | 'HEALTHY' | 'ABUNDANT';
  if (overallHealth < 0.3) {
    classification = 'CRITICAL';
  } else if (overallHealth < 0.6) {
    classification = 'WARNING';
  } else if (overallHealth < 0.85) {
    classification = 'HEALTHY';
  } else {
    classification = 'ABUNDANT';
  }

  return {
    vector,
    measurements,
    timestamp,
    overallHealth,
    classification,
  };
}

/**
 * Get eigenmode labels
 */
export function getEigenmodeLabels(): string[] {
  return [...PLATFORM_EIGENMODE_LABELS];
}

/**
 * Create default (unknown) eigenmode snapshot
 */
export function createDefaultEigenmodeSnapshot(): EigenmodeSnapshot {
  return calculatePlatformEigenmodes({});
}

export default {
  calculatePlatformEigenmodes,
  getEigenmodeLabels,
  createDefaultEigenmodeSnapshot,
};

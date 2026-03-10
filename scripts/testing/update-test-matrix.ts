#!/usr/bin/env ts-node
/**
 * ENTERPRISE CLOSED-LOOP AUTOMATION: Test Matrix Auto-Updater
 *
 * PATTERN: "Schemas Update Schemas" - Living, Breathing QA Framework
 *
 * PURPOSE:
 * This script reads test results from Vitest, Playwright, and Jest, then automatically
 * updates apps/mcp-server/data/test-matrix.json with current coverage metrics.
 *
 * CLOSED-LOOP INTEGRATION:
 * 1. Tests run (vitest/playwright/jest)
 * 2. This script parses test results and coverage reports
 * 3. test-matrix.json updates with current metrics
 * 4. Roadmap deliverables validate against test-matrix.json
 * 5. CI/CD gates enforce quality based on test-matrix.json
 * 6. CONTINUOUS LOOP: test-matrix.json drives roadmap progress tracking
 *
 * STRATEGIC ALIGNMENT:
 * - Eliminates manual spreadsheet tracking (100% automation)
 * - Single source of truth for test coverage (test-matrix.json)
 * - Enables agent-driven CI/CD pipeline (schemas are actionable data)
 * - Roadmap-driven development (tests lead deliverable completion)
 *
 * USAGE:
 * - Post-test run: pnpm test:matrix:update
 * - Pre-commit hook: Auto-runs after affected tests
 * - CI/CD pipeline: Auto-runs after test job completion
 *
 * INDUSTRY ALIGNMENT:
 * - Vitest JSON reporter: --reporter=json
 * - Playwright JSON reporter: --reporter=json
 * - Jest JSON reporter: --json --outputFile
 * - Coverage.py JSON output: coverage json
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM compatibility: Get __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface TestMatrixProject {
  projectId: string;
  projectName: string;
  path: string;
  testTypes: {
    [key: string]: {
      coverageCurrent: number;
      coverageTarget: number;
      totalTests: number;
      passingTests: number;
      testFiles: string[];
      lastRun: string | null;
      status: 'not-started' | 'in-progress' | 'completed';
    };
  };
  overallCoverage: number;
  overallStatus: 'not-started' | 'in-progress' | 'completed';
}

interface TestMatrix {
  documentId: string;
  version: string;
  lastUpdated: string;
  metadata: {
    title: string;
    description: string;
    maintainer: string;
    purpose: string;
    autoUpdate: boolean;
    updateTriggers: string[];
    tags: string[];
  };
  projects: {
    [key: string]: TestMatrixProject;
  };
  globalMetrics: {
    totalProjects: number;
    projectsAtTarget: number;
    projectsInProgress: number;
    projectsNotStarted: number;
    aggregateCoverage: {
      [key: string]: {
        current: number;
        target: number;
        gap: number;
      };
    };
    overallCoverage: number;
    overallTarget: number;
    overallGap: number;
  };
  milestones: {
    [key: string]: {
      targetDate: string;
      targetCoverage: number;
      status: string;
      goals: string[];
    };
  };
  trendData: {
    weeklySnapshots: any[];
    coverageGrowthRate: number;
    projectedCompletion: string;
    atRisk: boolean;
    notes: string;
  };
  automationConfig: any;
  relatedDocuments: any;
  schemaVersion: string;
  confidenceLevel: string;
  status: string;
}

interface VitestCoverageReport {
  total: {
    lines: { pct: number };
    statements: { pct: number };
    functions: { pct: number };
    branches: { pct: number };
  };
}

interface PlaywrightTestResults {
  suites: Array<{
    specs: Array<{
      file: string;
      tests: Array<{
        status: string;
      }>;
    }>;
  }>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const REPO_ROOT = path.resolve(__dirname, '../..');
const TEST_MATRIX_PATH = path.join(
  REPO_ROOT,
  'apps/mcp-server/data/test-matrix.json'
);

const COVERAGE_REPORT_PATHS = {
  vitest: path.join(REPO_ROOT, 'coverage/coverage-summary.json'),
  // Playwright JSON results from multiple possible locations (CI vs local)
  playwright: [
    path.join(
      REPO_ROOT,
      'apps/web-dashboard-e2e/dist/test-results/results.json'
    ),
    path.join(REPO_ROOT, 'dist/test-results/results.json'),
    path.join(REPO_ROOT, 'playwright-report/results.json'),
  ],
  jest: path.join(REPO_ROOT, 'coverage/coverage-summary.json'),
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Load test matrix JSON schema
 */
function loadTestMatrix(): TestMatrix {
  if (!fs.existsSync(TEST_MATRIX_PATH)) {
    throw new Error(`Test matrix not found: ${TEST_MATRIX_PATH}`);
  }
  const content = fs.readFileSync(TEST_MATRIX_PATH, 'utf-8');
  return JSON.parse(content);
}

/**
 * Save updated test matrix with atomic write pattern
 */
function saveTestMatrix(matrix: TestMatrix): void {
  // Update lastUpdated timestamp
  matrix.lastUpdated = new Date().toISOString();

  // Atomic write pattern: write to temp file, then rename
  const tempPath = `${TEST_MATRIX_PATH}.tmp`;
  const content = JSON.stringify(matrix, null, 2) + '\n';

  fs.writeFileSync(tempPath, content, 'utf-8');
  fs.renameSync(tempPath, TEST_MATRIX_PATH);

  console.log(`✅ Test matrix updated: ${TEST_MATRIX_PATH}`);
}

/**
 * Read Vitest coverage report (if exists)
 */
function readVitestCoverage(): VitestCoverageReport | null {
  const vitestPath = COVERAGE_REPORT_PATHS.vitest;
  if (!fs.existsSync(vitestPath)) {
    console.log('⚠️  Vitest coverage report not found - skipping');
    return null;
  }

  const content = fs.readFileSync(vitestPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Read Playwright test results (if exists)
 * Checks multiple possible locations for results.json
 */
function readPlaywrightResults(): PlaywrightTestResults | null {
  const playwrightPaths = COVERAGE_REPORT_PATHS.playwright as string[];

  // Try each path until we find results
  for (const playwrightPath of playwrightPaths) {
    if (fs.existsSync(playwrightPath)) {
      console.log(`📊 Found Playwright results: ${playwrightPath}`);
      const content = fs.readFileSync(playwrightPath, 'utf-8');
      return JSON.parse(content);
    }
  }

  console.log('⚠️  Playwright results not found in any expected location:');
  playwrightPaths.forEach((p) => console.log(`   - ${p}`));
  return null;
}

/**
 * Calculate overall project coverage from test types
 */
function calculateProjectCoverage(project: TestMatrixProject): number {
  const testTypes = Object.values(project.testTypes);
  if (testTypes.length === 0) return 0;

  const totalCoverage = testTypes.reduce(
    (sum, type) => sum + type.coverageCurrent,
    0
  );
  return Math.round((totalCoverage / testTypes.length) * 100) / 100;
}

/**
 * Calculate global aggregate coverage metrics
 */
function calculateGlobalMetrics(matrix: TestMatrix): void {
  const projects = Object.values(matrix.projects);

  // Count project statuses
  matrix.globalMetrics.totalProjects = projects.length;
  matrix.globalMetrics.projectsAtTarget = projects.filter(
    (p) =>
      p.overallCoverage >=
      p.testTypes[Object.keys(p.testTypes)[0]]?.coverageTarget
  ).length;
  matrix.globalMetrics.projectsInProgress = projects.filter(
    (p) => p.overallStatus === 'in-progress'
  ).length;
  matrix.globalMetrics.projectsNotStarted = projects.filter(
    (p) => p.overallStatus === 'not-started'
  ).length;

  // Calculate aggregate coverage by test type
  const testTypes = new Set<string>();
  projects.forEach((project) => {
    Object.keys(project.testTypes).forEach((type) => testTypes.add(type));
  });

  testTypes.forEach((type) => {
    const projectsWithType = projects.filter((p) => p.testTypes[type]);
    if (projectsWithType.length === 0) return;

    const avgCurrent =
      projectsWithType.reduce(
        (sum, p) => sum + (p.testTypes[type]?.coverageCurrent || 0),
        0
      ) / projectsWithType.length;

    const avgTarget =
      projectsWithType.reduce(
        (sum, p) => sum + (p.testTypes[type]?.coverageTarget || 0),
        0
      ) / projectsWithType.length;

    matrix.globalMetrics.aggregateCoverage[type] = {
      current: Math.round(avgCurrent * 100) / 100,
      target: Math.round(avgTarget * 100) / 100,
      gap: Math.round((avgCurrent - avgTarget) * 100) / 100,
    };
  });

  // Calculate overall metrics
  const allTypes = Object.values(matrix.globalMetrics.aggregateCoverage);
  if (allTypes.length > 0) {
    matrix.globalMetrics.overallCoverage =
      Math.round(
        (allTypes.reduce((sum, t) => sum + t.current, 0) / allTypes.length) *
          100
      ) / 100;
    matrix.globalMetrics.overallTarget =
      Math.round(
        (allTypes.reduce((sum, t) => sum + t.target, 0) / allTypes.length) * 100
      ) / 100;
    matrix.globalMetrics.overallGap =
      Math.round(
        (matrix.globalMetrics.overallCoverage -
          matrix.globalMetrics.overallTarget) *
          100
      ) / 100;
  }
}

// ============================================================================
// COVERAGE UPDATE FUNCTIONS
// ============================================================================

/**
 * Update unit test coverage from Vitest report
 */
function updateUnitCoverage(
  matrix: TestMatrix,
  vitestReport: VitestCoverageReport
): void {
  console.log('📊 Updating unit test coverage from Vitest...');

  // Calculate average coverage across all metrics
  const avgCoverage =
    (vitestReport.total.lines.pct +
      vitestReport.total.statements.pct +
      vitestReport.total.functions.pct +
      vitestReport.total.branches.pct) /
    4;

  // Update all projects with unit test support
  Object.values(matrix.projects).forEach((project) => {
    if (project.testTypes.unit) {
      project.testTypes.unit.coverageCurrent =
        Math.round(avgCoverage * 100) / 100;
      project.testTypes.unit.lastRun = new Date().toISOString();
      project.testTypes.unit.status = 'in-progress';
    }
  });

  console.log(`✅ Unit coverage updated: ${avgCoverage.toFixed(2)}%`);
}

/**
 * Update E2E test coverage from Playwright results
 */
function updateE2ECoverage(
  matrix: TestMatrix,
  playwrightResults: PlaywrightTestResults
): void {
  console.log('📊 Updating E2E test coverage from Playwright...');

  // Extract test statistics
  let totalTests = 0;
  let passingTests = 0;
  const testFiles: string[] = [];

  playwrightResults.suites.forEach((suite) => {
    suite.specs.forEach((spec) => {
      if (!testFiles.includes(spec.file)) {
        testFiles.push(spec.file);
      }
      spec.tests.forEach((test) => {
        totalTests++;
        if (test.status === 'passed') {
          passingTests++;
        }
      });
    });
  });

  const passRate = totalTests > 0 ? (passingTests / totalTests) * 100 : 0;

  // Update web-dashboard E2E metrics
  if (matrix.projects['web-dashboard']?.testTypes.e2e) {
    matrix.projects['web-dashboard'].testTypes.e2e.totalTests = totalTests;
    matrix.projects['web-dashboard'].testTypes.e2e.passingTests = passingTests;
    matrix.projects['web-dashboard'].testTypes.e2e.coverageCurrent =
      Math.round(passRate * 100) / 100;
    matrix.projects['web-dashboard'].testTypes.e2e.testFiles = testFiles;
    matrix.projects['web-dashboard'].testTypes.e2e.lastRun =
      new Date().toISOString();
    matrix.projects['web-dashboard'].testTypes.e2e.status = 'in-progress';
  }

  console.log(
    `✅ E2E coverage updated: ${passRate.toFixed(2)}% (${passingTests}/${totalTests} passing)`
  );
}

/**
 * Update project overall coverage and status
 */
function updateProjectMetrics(matrix: TestMatrix): void {
  console.log('📊 Calculating project-level metrics...');

  Object.values(matrix.projects).forEach((project) => {
    // Recalculate overall coverage
    project.overallCoverage = calculateProjectCoverage(project);

    // Update overall status based on test types
    const hasActiveTests = Object.values(project.testTypes).some(
      (t) => t.status === 'in-progress' || t.status === 'completed'
    );
    const allComplete = Object.values(project.testTypes).every(
      (t) => t.status === 'completed' || t.status === 'not-started'
    );

    if (allComplete && hasActiveTests) {
      project.overallStatus = 'completed';
    } else if (hasActiveTests) {
      project.overallStatus = 'in-progress';
    } else {
      project.overallStatus = 'not-started';
    }
  });

  console.log('✅ Project metrics updated');
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log(
    '🚀 ENTERPRISE CLOSED-LOOP AUTOMATION: Test Matrix Auto-Updater\n'
  );
  console.log(
    'PATTERN: Schemas Update Schemas - Making test-matrix.json a living document\n'
  );

  try {
    // Load current test matrix
    console.log('📖 Loading test matrix...');
    const matrix = loadTestMatrix();
    console.log(`✅ Loaded test matrix (version ${matrix.version})\n`);

    // Read coverage reports
    const vitestReport = readVitestCoverage();
    const playwrightResults = readPlaywrightResults();

    // Update coverage metrics
    if (vitestReport) {
      updateUnitCoverage(matrix, vitestReport);
    }

    if (playwrightResults) {
      updateE2ECoverage(matrix, playwrightResults);
    }

    // Update project-level metrics
    updateProjectMetrics(matrix);

    // Calculate global aggregate metrics
    console.log('📊 Calculating global metrics...');
    calculateGlobalMetrics(matrix);
    console.log('✅ Global metrics updated\n');

    // Save updated matrix
    console.log('💾 Saving updated test matrix...');
    saveTestMatrix(matrix);

    // Print summary
    console.log('\n📊 COVERAGE SUMMARY:');
    console.log(
      `   Overall Coverage: ${matrix.globalMetrics.overallCoverage}%`
    );
    console.log(`   Target Coverage: ${matrix.globalMetrics.overallTarget}%`);
    console.log(`   Gap: ${matrix.globalMetrics.overallGap}%`);
    console.log(
      `   Projects in Progress: ${matrix.globalMetrics.projectsInProgress}/${matrix.globalMetrics.totalProjects}`
    );

    console.log('\n✅ CLOSED-LOOP AUTOMATION COMPLETE');
    console.log(
      '   test-matrix.json is now up to date with latest test results'
    );
    console.log(
      '   Roadmap deliverables can now validate against current metrics\n'
    );
  } catch (error) {
    console.error('❌ Error updating test matrix:', error);
    process.exit(1);
  }
}

// Run if executed directly (ESM compatibility)
// In ESM, check if this module is the entry point
const isMainModule =
  import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
if (isMainModule || process.argv[1].endsWith('update-test-matrix.ts')) {
  main();
}

export { main, updateUnitCoverage, updateE2ECoverage, updateProjectMetrics };

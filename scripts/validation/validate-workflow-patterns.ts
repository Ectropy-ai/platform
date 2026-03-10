#!/usr/bin/env tsx
/**
 * Workflow Pattern Validation Script
 *
 * Validates all GitHub Actions workflows against enterprise standards using
 * MCP infrastructure catalog as single source of truth.
 *
 * Usage:
 *   pnpm tsx scripts/validation/validate-workflow-patterns.ts
 *   pnpm tsx scripts/validation/validate-workflow-patterns.ts --fix
 *
 * Output:
 *   evidence/workflow-validation-report-YYYY-MM-DD.json
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

interface Workflow {
  workflowId: string;
  name: string;
  path: string;
  environmentVariables?: string[];
  secrets?: string[];
  maturityRating?: string;
  technicalDebt?: string[];
  serviceManagement?: {
    rollbackStrategy?: string;
  };
  phases?: Array<{
    environment?: string;
    steps?: unknown[];
  }>;
  runners?: string[];
  tags?: string[];
  dependencies?: string[];
}

interface Violation {
  workflow: string;
  workflowPath: string;
  issue: string;
  fix: string;
  severity: 'P0' | 'P1' | 'P2';
  ruleId: string;
}

interface ValidationResult {
  ruleId: string;
  ruleName: string;
  passed: boolean;
  violations: Violation[];
  summary: string;
}

interface ValidationReport {
  timestamp: string;
  totalWorkflows: number;
  rulesValidated: number;
  p0Violations: number;
  p1Violations: number;
  p2Violations: number;
  results: ValidationResult[];
  overallStatus: 'PASS' | 'FAIL';
}

// ============================================================================
// Validation Rules
// ============================================================================

/**
 * Rule 1: DATABASE_URL Pattern Compliance
 * All workflows must construct DATABASE_URL from components, not use single secret
 */
function validateDatabaseUrlPattern(workflows: Workflow[]): ValidationResult {
  const violations: Violation[] = [];

  for (const workflow of workflows) {
    if (!workflow.environmentVariables?.includes('DATABASE_URL')) {
      continue; // Doesn't use DATABASE_URL
    }

    // Check if using single DATABASE_URL secret (anti-pattern)
    const hasSingleSecret =
      workflow.secrets?.includes('DATABASE_URL') ||
      workflow.secrets?.includes('STAGING_DATABASE_URL') ||
      workflow.secrets?.includes('PRODUCTION_DATABASE_URL');

    if (hasSingleSecret) {
      violations.push({
        workflow: workflow.name,
        workflowPath: workflow.path,
        issue:
          'Uses single DATABASE_URL secret instead of constructing from components',
        fix: 'Replace with: postgresql://${{ vars.DATABASE_USER }}:${{ secrets.DB_PASSWORD }}@${{ vars.DATABASE_HOST }}:${{ vars.DATABASE_PORT }}/${{ vars.DATABASE_NAME }}',
        severity: 'P0',
        ruleId: 'database-url-pattern',
      });
    }
  }

  return {
    ruleId: 'database-url-pattern',
    ruleName: 'DATABASE_URL Pattern Compliance',
    passed: violations.length === 0,
    violations,
    summary: `${violations.length} workflow(s) violating DATABASE_URL pattern`,
  };
}

/**
 * Rule 2: Environment Context Declaration
 * Workflows using environment-scoped secrets must declare environment context
 */
function validateEnvironmentContext(workflows: Workflow[]): ValidationResult {
  const violations: Violation[] = [];

  const environmentScopedSecrets = [
    'DB_PASSWORD',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'JWT_SECRET',
    'REDIS_PASSWORD',
    'SESSION_SECRET',
  ];

  for (const workflow of workflows) {
    const usesEnvSecrets = workflow.secrets?.some((secret) =>
      environmentScopedSecrets.some((envSecret) => secret.includes(envSecret))
    );

    if (!usesEnvSecrets) {
      continue;
    }

    // Check if any phase declares environment
    const hasEnvironmentContext = workflow.phases?.some((p) => p.environment);

    if (!hasEnvironmentContext) {
      violations.push({
        workflow: workflow.name,
        workflowPath: workflow.path,
        issue:
          'Uses environment-scoped secrets without environment declaration',
        fix: 'Add "environment: staging" or "environment: production" to job',
        severity: 'P1',
        ruleId: 'environment-context',
      });
    }
  }

  return {
    ruleId: 'environment-context',
    ruleName: 'Environment Context Declaration',
    passed: violations.length === 0,
    violations,
    summary: `${violations.length} workflow(s) missing environment context`,
  };
}

/**
 * Rule 3: Terraform Version Standardization
 * All Terraform workflows must use version 1.9.0
 */
function validateTerraformVersion(workflows: Workflow[]): ValidationResult {
  const violations: Violation[] = [];

  for (const workflow of workflows) {
    const isTerraformWorkflow =
      workflow.tags?.includes('terraform') ||
      workflow.name.toLowerCase().includes('terraform');

    if (!isTerraformWorkflow) {
      continue;
    }

    const hasCorrectVersion = workflow.dependencies?.some((dep) =>
      dep.includes('1.9.0')
    );

    if (!hasCorrectVersion) {
      violations.push({
        workflow: workflow.name,
        workflowPath: workflow.path,
        issue: 'Non-standard Terraform version',
        fix: 'Update to terraform-version: "1.9.0"',
        severity: 'P1',
        ruleId: 'terraform-version',
      });
    }
  }

  return {
    ruleId: 'terraform-version',
    ruleName: 'Terraform Version Standardization',
    passed: violations.length === 0,
    violations,
    summary: `${violations.length} Terraform workflow(s) using non-standard version`,
  };
}

/**
 * Rule 4: Production Rollback Strategy
 * Production deployments must have rollback procedures
 */
function validateProductionRollback(workflows: Workflow[]): ValidationResult {
  const violations: Violation[] = [];

  for (const workflow of workflows) {
    const isProductionDeployment =
      workflow.tags?.includes('deployment') &&
      workflow.tags?.includes('production');

    if (!isProductionDeployment) {
      continue;
    }

    if (!workflow.serviceManagement?.rollbackStrategy) {
      violations.push({
        workflow: workflow.name,
        workflowPath: workflow.path,
        issue: 'Production deployment without documented rollback strategy',
        fix: 'Add serviceManagement.rollbackStrategy to workflow metadata',
        severity: 'P1',
        ruleId: 'production-rollback',
      });
    }
  }

  return {
    ruleId: 'production-rollback',
    ruleName: 'Production Rollback Strategy',
    passed: violations.length === 0,
    violations,
    summary: `${violations.length} production workflow(s) missing rollback strategy`,
  };
}

/**
 * Rule 5: Maturity Rating vs Technical Debt
 * PRODUCTION workflows should have minimal technical debt
 */
function validateMaturityDebtBalance(workflows: Workflow[]): ValidationResult {
  const violations: Violation[] = [];

  for (const workflow of workflows) {
    if (workflow.maturityRating !== 'PRODUCTION') {
      continue;
    }

    const debtCount = workflow.technicalDebt?.length || 0;

    if (debtCount > 2) {
      violations.push({
        workflow: workflow.name,
        workflowPath: workflow.path,
        issue: `PRODUCTION workflow has ${debtCount} technical debt items`,
        fix: 'Address technical debt or downgrade maturity rating to STABLE',
        severity: 'P2',
        ruleId: 'maturity-debt-balance',
      });
    }
  }

  return {
    ruleId: 'maturity-debt-balance',
    ruleName: 'Maturity Rating vs Technical Debt',
    passed: violations.length === 0,
    violations,
    summary: `${violations.length} PRODUCTION workflow(s) with excessive debt`,
  };
}

// ============================================================================
// Main Validation Orchestration
// ============================================================================

async function validateAllWorkflows(): Promise<ValidationReport> {
  console.log('🔍 Workflow Pattern Validation');
  console.log('================================\n');

  // Load infrastructure catalog
  const catalogPath = path.join(
    process.cwd(),
    'apps/mcp-server/data/infrastructure-catalog.json'
  );

  if (!fs.existsSync(catalogPath)) {
    throw new Error(`Infrastructure catalog not found at ${catalogPath}`);
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
  const workflows: Workflow[] = catalog.workflows || [];

  console.log(`📊 Loaded ${workflows.length} workflows from catalog\n`);

  // Run all validation rules
  const results: ValidationResult[] = [
    validateDatabaseUrlPattern(workflows),
    validateEnvironmentContext(workflows),
    validateTerraformVersion(workflows),
    validateProductionRollback(workflows),
    validateMaturityDebtBalance(workflows),
  ];

  // Calculate summary statistics
  const p0Violations = results.flatMap((r) =>
    r.violations.filter((v) => v.severity === 'P0')
  ).length;

  const p1Violations = results.flatMap((r) =>
    r.violations.filter((v) => v.severity === 'P1')
  ).length;

  const p2Violations = results.flatMap((r) =>
    r.violations.filter((v) => v.severity === 'P2')
  ).length;

  const report: ValidationReport = {
    timestamp: new Date().toISOString(),
    totalWorkflows: workflows.length,
    rulesValidated: results.length,
    p0Violations,
    p1Violations,
    p2Violations,
    results,
    overallStatus: p0Violations === 0 ? 'PASS' : 'FAIL',
  };

  // Print results
  console.log('📋 Validation Results:');
  console.log('======================\n');

  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.ruleName}`);
    console.log(`   ${result.summary}`);

    if (result.violations.length > 0) {
      console.log('   Violations:');
      for (const violation of result.violations.slice(0, 3)) {
        console.log(`   - [${violation.severity}] ${violation.workflow}`);
        console.log(`     ${violation.issue}`);
      }
      if (result.violations.length > 3) {
        console.log(`   ... and ${result.violations.length - 3} more`);
      }
    }
    console.log('');
  }

  // Summary
  console.log('📊 Summary:');
  console.log('===========');
  console.log(`Total Workflows: ${report.totalWorkflows}`);
  console.log(`Rules Validated: ${report.rulesValidated}`);
  console.log(`P0 Violations: ${report.p0Violations}`);
  console.log(`P1 Violations: ${report.p1Violations}`);
  console.log(`P2 Violations: ${report.p2Violations}`);
  console.log(`Overall Status: ${report.overallStatus}\n`);

  // Save report
  const evidenceDir = path.join(process.cwd(), 'evidence');
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
  }

  const reportDate = new Date().toISOString().split('T')[0];
  const reportPath = path.join(
    evidenceDir,
    `workflow-validation-report-${reportDate}.json`
  );

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`💾 Report saved to: ${reportPath}\n`);

  return report;
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
  try {
    const report = await validateAllWorkflows();

    // Exit with error code if P0 violations found
    if (report.p0Violations > 0) {
      console.error('❌ Validation failed: P0 violations detected');
      process.exit(1);
    }

    console.log('✅ Validation passed!');
    process.exit(0);
  } catch (error) {
    console.error('💥 Validation error:', error);
    process.exit(1);
  }
}

// Run if executed directly
main();

export { validateAllWorkflows, ValidationReport, Violation };

#!/usr/bin/env tsx
/**
 * Runbook JSON Validator
 *
 * Validates runbook JSON files against enterprise schema and business rules
 *
 * Usage:
 *   pnpm tsx scripts/runbooks/validate-runbook.ts <runbook-file.json>
 *   pnpm tsx scripts/runbooks/validate-runbook.ts --all
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Types
// ============================================================================

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  info: ValidationInfo[];
}

interface ValidationError {
  type: 'schema' | 'business' | 'architecture';
  field?: string;
  message: string;
  severity: 'error';
}

interface ValidationWarning {
  type: 'schema' | 'business' | 'architecture';
  field?: string;
  message: string;
  severity: 'warning';
}

interface ValidationInfo {
  type: 'schema' | 'business' | 'architecture';
  field?: string;
  message: string;
  severity: 'info';
}

// ============================================================================
// Validator Class
// ============================================================================

class RunbookValidator {
  private ajv: Ajv;
  private schema: any;
  private routingArchitecture: any;

  constructor() {
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    addFormats(this.ajv);
    this.loadSchema();
    this.loadRoutingArchitecture();
  }

  /**
   * Load JSON Schema
   */
  private loadSchema() {
    const schemaPath = path.join(__dirname, 'schema', 'runbook-schema.json');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema not found: ${schemaPath}`);
    }
    this.schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  }

  /**
   * Load routing architecture for cross-validation
   */
  private loadRoutingArchitecture() {
    const routingPath = path.join(
      __dirname,
      '..',
      '..',
      'apps',
      'mcp-server',
      'data',
      'routing-architecture.json'
    );
    if (fs.existsSync(routingPath)) {
      this.routingArchitecture = JSON.parse(fs.readFileSync(routingPath, 'utf-8'));
    }
  }

  /**
   * Validate runbook JSON
   */
  validate(runbookPath: string): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      info: []
    };

    // Check file exists
    if (!fs.existsSync(runbookPath)) {
      result.valid = false;
      result.errors.push({
        type: 'schema',
        message: `File not found: ${runbookPath}`,
        severity: 'error'
      });
      return result;
    }

    // Parse JSON
    let runbook: any;
    try {
      const content = fs.readFileSync(runbookPath, 'utf-8');
      runbook = JSON.parse(content);
    } catch (error) {
      result.valid = false;
      result.errors.push({
        type: 'schema',
        message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error'
      });
      return result;
    }

    // Validate against JSON Schema
    const schemaValid = this.ajv.validate(this.schema, runbook);
    if (!schemaValid && this.ajv.errors) {
      result.valid = false;
      for (const error of this.ajv.errors) {
        result.errors.push({
          type: 'schema',
          field: error.instancePath || error.schemaPath,
          message: `${error.instancePath || 'root'}: ${error.message}`,
          severity: 'error'
        });
      }
    }

    // Business rules validation
    this.validateBusinessRules(runbook, result);

    // Architecture alignment validation
    if (this.routingArchitecture) {
      this.validateArchitectureAlignment(runbook, result);
    }

    // MCP integration validation
    this.validateMcpIntegration(runbook, result);

    return result;
  }

  /**
   * Validate business rules
   */
  private validateBusinessRules(runbook: any, result: ValidationResult) {
    // Normalize: Accept both phases and deploymentSteps
    const phases = runbook.phases || runbook.deploymentSteps;

    // Rule: At least one phase must exist
    if (!phases || phases.length === 0) {
      result.valid = false;
      result.errors.push({
        type: 'business',
        field: 'phases/deploymentSteps',
        message: 'At least one phase or deploymentStep is required',
        severity: 'error'
      });
    }

    // Rule: Each phase must have at least one step
    if (phases) {
      phases.forEach((phase: any, idx: number) => {
        if (!phase.steps || phase.steps.length === 0) {
          result.valid = false;
          result.errors.push({
            type: 'business',
            field: `phases[${idx}].steps`,
            message: `Phase ${phase.phase} "${phase.name}" has no steps`,
            severity: 'error'
          });
        }

        // Rule: Each step must have either command or commands
        phase.steps?.forEach((step: any, stepIdx: number) => {
          if (!step.command && (!step.commands || step.commands.length === 0)) {
            result.warnings.push({
              type: 'business',
              field: `phases[${idx}].steps[${stepIdx}]`,
              message: `Step ${step.step} "${step.name}" has no command or commands`,
              severity: 'warning'
            });
          }
        });
      });
    }

    // Rule: If rollback.supported = true, must have rollback steps
    if (runbook.rollback?.supported === true) {
      if (!runbook.rollback.steps || runbook.rollback.steps.length === 0) {
        result.warnings.push({
          type: 'business',
          field: 'rollback.steps',
          message: 'Rollback is supported but no rollback steps defined',
          severity: 'warning'
        });
      }
    }

    // Rule: Success criteria should have at least one REQUIRED criterion
    if (runbook.successCriteria) {
      const hasRequired = runbook.successCriteria.some(
        (sc: any) => sc.status === 'REQUIRED'
      );
      if (!hasRequired) {
        result.warnings.push({
          type: 'business',
          field: 'successCriteria',
          message: 'No REQUIRED success criteria defined',
          severity: 'warning'
        });
      }
    }

    // Rule: Catalog ID should match pattern
    if (runbook.metadata?.catalogId) {
      const expectedPattern = `${runbook.runbookType}-runbook`;
      if (!runbook.metadata.catalogId.includes(expectedPattern)) {
        result.warnings.push({
          type: 'business',
          field: 'metadata.catalogId',
          message: `Catalog ID should contain "${expectedPattern}"`,
          severity: 'warning'
        });
      }
    }

    // Rule: Version in metadata should match top-level version
    if (runbook.version && runbook.metadata?.sourceFile) {
      const versionInId = runbook.metadata.catalogId.match(/v(\d+-\d+-\d+)/)?.[1];
      if (versionInId) {
        const normalizedVersion = runbook.version.replace(/\./g, '-');
        if (versionInId !== normalizedVersion) {
          result.warnings.push({
            type: 'business',
            field: 'metadata.catalogId',
            message: `Version mismatch: catalog ID has ${versionInId}, runbook has ${runbook.version}`,
            severity: 'warning'
          });
        }
      }
    }
  }

  /**
   * Validate architecture alignment
   */
  private validateArchitectureAlignment(runbook: any, result: ValidationResult) {
    if (!runbook.mcpIntegration?.architectureAlignment) {
      result.warnings.push({
        type: 'architecture',
        field: 'mcpIntegration.architectureAlignment',
        message: 'No architecture alignment defined (recommended for production runbooks)',
        severity: 'warning'
      });
      return;
    }

    const alignment = runbook.mcpIntegration.architectureAlignment;

    // Validate port references
    if (alignment.portAllocation) {
      const portRef = alignment.portAllocation;
      if (portRef.includes('routing-architecture.json#')) {
        const path = portRef.split('#')[1];
        if (!this.checkJsonPointer(this.routingArchitecture, path)) {
          result.warnings.push({
            type: 'architecture',
            field: 'mcpIntegration.architectureAlignment.portAllocation',
            message: `Port allocation reference not found in routing-architecture.json: ${path}`,
            severity: 'warning'
          });
        }
      }
    }

    // Validate OAuth config references
    if (alignment.oauthConfig) {
      const oauthRef = alignment.oauthConfig;
      if (oauthRef.includes('routing-architecture.json#')) {
        const path = oauthRef.split('#')[1];
        if (!this.checkJsonPointer(this.routingArchitecture, path)) {
          result.warnings.push({
            type: 'architecture',
            field: 'mcpIntegration.architectureAlignment.oauthConfig',
            message: `OAuth config reference not found in routing-architecture.json: ${path}`,
            severity: 'warning'
          });
        }
      }
    }

    // Check for port conflicts in commands
    this.checkPortConflicts(runbook, result);
  }

  /**
   * Check JSON pointer path exists
   */
  private checkJsonPointer(obj: any, pointer: string): boolean {
    if (!pointer) return false;
    const parts = pointer.replace(/^\//, '').split('/');
    let current = obj;

    for (const part of parts) {
      const decodedPart = part.replace(/~1/g, '/').replace(/~0/g, '~');
      if (current[decodedPart] === undefined) {
        return false;
      }
      current = current[decodedPart];
    }

    return true;
  }

  /**
   * Check for port conflicts
   */
  private checkPortConflicts(runbook: any, result: ValidationResult) {
    if (!this.routingArchitecture?.portAllocationMatrix) return;

    const env = runbook.environment;
    const allocatedPorts = this.routingArchitecture.portAllocationMatrix[env];
    if (!allocatedPorts) return;

    // Extract port numbers from allocated ports
    const portNumbers = new Set<number>();
    Object.values(allocatedPorts).forEach((service: any) => {
      if (service.hostPort) portNumbers.add(service.hostPort);
      if (service.hostPorts) service.hostPorts.forEach((p: number) => portNumbers.add(p));
    });

    // Check commands for port references
    const portPattern = /(?:localhost|127\.0\.0\.1):(\d{4,5})/g;
    const phases = runbook.phases || runbook.deploymentSteps;
    phases?.forEach((phase: any) => {
      phase.steps?.forEach((step: any) => {
        const commands = step.commands || [step.command];
        commands.forEach((cmd: string) => {
          if (!cmd) return;
          let match;
          while ((match = portPattern.exec(cmd)) !== null) {
            const port = parseInt(match[1]);
            if (!portNumbers.has(port)) {
              result.warnings.push({
                type: 'architecture',
                field: `phases[${phase.phase}].steps`,
                message: `Port ${port} in command not found in routing-architecture.json for ${env} environment`,
                severity: 'warning'
              });
            }
          }
        });
      });
    });
  }

  /**
   * Validate MCP integration
   */
  private validateMcpIntegration(runbook: any, result: ValidationResult) {
    if (!runbook.mcpIntegration) {
      result.warnings.push({
        type: 'business',
        field: 'mcpIntegration',
        message: 'MCP integration is recommended for all runbooks',
        severity: 'warning'
      });
      return;
    }

    const mcp = runbook.mcpIntegration;

    // Check queryable fields reference valid top-level fields
    if (mcp.queryableFields) {
      mcp.queryableFields.forEach((field: string) => {
        if (!runbook[field]) {
          result.warnings.push({
            type: 'business',
            field: 'mcpIntegration.queryableFields',
            message: `Queryable field "${field}" does not exist in runbook`,
            severity: 'warning'
          });
        }
      });
    }

    // Check supported queries have required fields
    if (mcp.supportedQueries) {
      mcp.supportedQueries.forEach((query: any, idx: number) => {
        if (!query.query || !query.returns || !query.purpose) {
          result.warnings.push({
            type: 'business',
            field: `mcpIntegration.supportedQueries[${idx}]`,
            message: 'Query missing required fields (query, returns, purpose)',
            severity: 'warning'
          });
        }
      });
    }

    // Info: Recommend decision support capabilities
    if (!mcp.decisionSupport || mcp.decisionSupport.length === 0) {
      result.info.push({
        type: 'business',
        field: 'mcpIntegration.decisionSupport',
        message: 'Consider adding decision support capabilities for enhanced MCP integration',
        severity: 'info'
      });
    }
  }
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: validate-runbook.ts <runbook-file.json>');
    console.error('       validate-runbook.ts --all');
    process.exit(1);
  }

  const validator = new RunbookValidator();
  let files: string[] = [];

  if (args[0] === '--all') {
    // Validate all runbooks in data directory
    const runbooksDir = path.join(__dirname, '..', '..', 'apps', 'mcp-server', 'data', 'runbooks');
    const types = ['deployment', 'migration', 'operational', 'emergency', 'validation'];

    for (const type of types) {
      const typeDir = path.join(runbooksDir, type);
      if (fs.existsSync(typeDir)) {
        const typeFiles = fs.readdirSync(typeDir)
          .filter(f => f.endsWith('.json'))
          .map(f => path.join(typeDir, f));
        files.push(...typeFiles);
      }
    }

    // Also check root data directory
    const rootRunbooks = path.join(__dirname, '..', '..', 'apps', 'mcp-server', 'data');
    if (fs.existsSync(rootRunbooks)) {
      const rootFiles = fs.readdirSync(rootRunbooks)
        .filter(f => f.endsWith('-runbook-v') && f.endsWith('.json'))
        .map(f => path.join(rootRunbooks, f));
      files.push(...rootFiles);
    }
  } else {
    files = [args[0]];
  }

  if (files.length === 0) {
    console.log('No runbook files found to validate.');
    process.exit(0);
  }

  console.log(`\n🔍 Validating ${files.length} runbook(s)...\n`);

  let totalErrors = 0;
  let totalWarnings = 0;
  let totalInfo = 0;
  let validRunbooks = 0;

  for (const file of files) {
    const filename = path.basename(file);
    console.log(`\n📄 ${filename}`);
    console.log('─'.repeat(60));

    const result = validator.validate(file);

    if (result.valid && result.errors.length === 0) {
      console.log('✅ Valid');
      validRunbooks++;
    } else {
      console.log('❌ Invalid');
    }

    if (result.errors.length > 0) {
      console.log(`\n   Errors (${result.errors.length}):`);
      result.errors.forEach(err => {
        console.log(`   ❌ [${err.type}] ${err.message}`);
        if (err.field) console.log(`      Field: ${err.field}`);
      });
      totalErrors += result.errors.length;
    }

    if (result.warnings.length > 0) {
      console.log(`\n   Warnings (${result.warnings.length}):`);
      result.warnings.forEach(warn => {
        console.log(`   ⚠️  [${warn.type}] ${warn.message}`);
        if (warn.field) console.log(`      Field: ${warn.field}`);
      });
      totalWarnings += result.warnings.length;
    }

    if (result.info.length > 0) {
      console.log(`\n   Info (${result.info.length}):`);
      result.info.forEach(info => {
        console.log(`   ℹ️  [${info.type}] ${info.message}`);
      });
      totalInfo += result.info.length;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Validation Summary');
  console.log('='.repeat(60));
  console.log(`Total runbooks:  ${files.length}`);
  console.log(`Valid runbooks:  ${validRunbooks}`);
  console.log(`Invalid runbooks: ${files.length - validRunbooks}`);
  console.log(`Total errors:    ${totalErrors}`);
  console.log(`Total warnings:  ${totalWarnings}`);
  console.log(`Total info:      ${totalInfo}`);
  console.log('');

  if (totalErrors > 0) {
    process.exit(1);
  } else {
    console.log('✅ All runbooks passed validation!');
    process.exit(0);
  }
}

main().catch(console.error);

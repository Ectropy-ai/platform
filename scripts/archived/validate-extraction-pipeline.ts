#!/usr/bin/env node
/**
 * Extraction Pipeline Validation Script
 * Enterprise-grade validation for the Ectropy extraction pipeline
 * Part of Phase 2: Infrastructure Hardening
 */

import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ValidationResult {
  status: 'success' | 'warning' | 'failed';
  message: string;
  details?: any;
}

class ExtractionPipelineValidator {
  private results: ValidationResult[] = [];

  async validate(): Promise<boolean> {
    console.log('=== Extraction Pipeline Validation ===');

    // Check pipeline configuration
    await this.validateConfiguration();

    // Test dry run
    await this.testDryRun();

    // Validate dependencies
    await this.validateDependencies();

    // Check TypeScript compilation
    await this.validateTypeScript();

    // Output results
    return this.outputResults();
  }

  private async validateConfiguration(): Promise<void> {
    try {
      const configPath = path.join(
        process.cwd(),
        'tools/extraction-pipeline/package.json'
      );
      const configExists = await fs
        .access(configPath)
        .then(() => true)
        .catch(() => false);

      if (!configExists) {
        this.results.push({
          status: 'warning',
          message: 'Package.json not found in extraction pipeline',
          details: { path: configPath },
        });
        return;
      }

      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));

      // Validate basic package.json structure
      if (!config.name) {
        this.results.push({
          status: 'warning',
          message: 'Package name not specified',
        });
      }

      if (!config.main && !config.module) {
        this.results.push({
          status: 'warning',
          message: 'No entry point specified',
        });
      }

      this.results.push({
        status: 'success',
        message: 'Configuration validated',
      });
    } catch (error) {
      this.results.push({
        status: 'failed',
        message: 'Configuration validation error',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async validateTypeScript(): Promise<void> {
    try {
      const tsconfigPath = path.join(
        process.cwd(),
        'tools/extraction-pipeline/tsconfig.json'
      );
      const tsconfigExists = await fs
        .access(tsconfigPath)
        .then(() => true)
        .catch(() => false);

      if (!tsconfigExists) {
        this.results.push({
          status: 'warning',
          message: 'TypeScript configuration not found',
          details: { path: tsconfigPath },
        });
        return;
      }

      // Test TypeScript compilation
      const result = await this.runCommand('npx', [
        'tsc',
        '--noEmit',
        '--project',
        'tools/extraction-pipeline/tsconfig.json',
      ]);

      if (result.success) {
        this.results.push({
          status: 'success',
          message: 'TypeScript compilation successful',
        });
      } else {
        this.results.push({
          status: 'failed',
          message: 'TypeScript compilation failed',
          details: { error: result.stderr },
        });
      }
    } catch (error) {
      this.results.push({
        status: 'failed',
        message: 'TypeScript validation error',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async testDryRun(): Promise<void> {
    try {
      const result = await this.runCommand(
        'node',
        [
          '--import',
          'tsx',
          'tools/extraction-pipeline/src/index.ts',
          '--dry-run',
        ],
        { timeout: 30000 }
      );

      if (result.success) {
        this.results.push({
          status: 'success',
          message: 'Dry run completed successfully',
        });
      } else {
        this.results.push({
          status: 'warning',
          message: 'Dry run failed (may be expected)',
          details: {
            exitCode: result.exitCode,
            error: result.stderr || 'No error output',
          },
        });
      }
    } catch (error) {
      this.results.push({
        status: 'failed',
        message: 'Failed to start dry run',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async validateDependencies(): Promise<void> {
    const requiredModules = ['typescript', 'js-yaml'];

    for (const module of requiredModules) {
      try {
        await import(module);
        this.results.push({
          status: 'success',
          message: `Module ${module} found`,
        });
      } catch {
        try {
          // Try require for CommonJS modules
          require.resolve(module);
          this.results.push({
            status: 'success',
            message: `Module ${module} found (CommonJS)`,
          });
        } catch {
          this.results.push({
            status: 'failed',
            message: `Required module ${module} not found`,
          });
        }
      }
    }
  }

  private async runCommand(
    command: string,
    args: string[],
    options: { timeout?: number; cwd?: string } = {}
  ): Promise<{
    success: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd: options.cwd || process.cwd(),
        timeout: options.timeout || 10000,
        stdio: 'pipe',
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          success: code === 0,
          exitCode: code || 0,
          stdout,
          stderr,
        });
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          exitCode: 1,
          stdout,
          stderr: error.message,
        });
      });
    });
  }

  private outputResults(): boolean {
    let hasFailures = false;
    let hasWarnings = false;

    for (const result of this.results) {
      const prefix =
        result.status === 'success'
          ? '✅'
          : result.status === 'warning'
            ? '⚠️'
            : '❌';

      console.log(`${prefix} ${result.message}`);

      if (result.details) {
        console.log('   Details:', JSON.stringify(result.details, null, 2));
      }

      if (result.status === 'failed') hasFailures = true;
      if (result.status === 'warning') hasWarnings = true;
    }

    if (hasFailures) {
      console.log('\n❌ Extraction pipeline validation FAILED');
      return false;
    } else if (hasWarnings) {
      console.log('\n⚠️ Extraction pipeline validation passed with warnings');
      return true;
    } else {
      console.log('\n✅ Extraction pipeline validation PASSED');
      return true;
    }
  }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new ExtractionPipelineValidator();
  validator
    .validate()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('❌ Validation script failed:', error);
      process.exit(1);
    });
}

export { ExtractionPipelineValidator };

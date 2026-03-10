#!/usr/bin/env node
/**
 * End-to-End Validation Script for Secret Management Implementation
 * Tests all components of the enterprise secret management system
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';

const colors = {
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  reset: '\x1b[0m',
};

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

class SecretManagementValidator {
  private results: TestResult[] = [];
  private testEnvFile = '.env.local.test';

  constructor() {
    console.log(colors.blue('🧪 Secret Management Implementation Validator'));
    console.log(colors.blue('=============================================='));
  }

  async runAllTests(): Promise<void> {
    console.log(
      colors.blue('\n🔍 Running comprehensive validation tests...\n')
    );

    try {
      // Test 1: Script execution
      await this.testScriptExecution();

      // Test 2: .env.local generation
      await this.testEnvGeneration();

      // Test 3: Secret validation
      await this.testSecretValidation();

      // Test 4: Package.json integration
      await this.testPackageScripts();

      // Test 5: CI/CD workflow validation
      await this.testCIWorkflow();

      // Test 6: Error handling
      await this.testErrorHandling();

      // Generate report
      this.generateReport();
    } finally {
      // Cleanup
      this.cleanup();
    }
  }

  private async runTest(
    name: string,
    testFn: () => Promise<void>
  ): Promise<void> {
    const startTime = Date.now();
    console.log(colors.blue(`🔍 Testing: ${name}...`));

    try {
      await testFn();
      const duration = Date.now() - startTime;
      console.log(colors.green(`✅ ${name} - PASSED (${duration}ms)`));

      this.results.push({
        name,
        passed: true,
        message: 'Test passed successfully',
        duration,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);
      console.log(
        colors.red(`❌ ${name} - FAILED (${duration}ms): ${message}`)
      );

      this.results.push({
        name,
        passed: false,
        message,
        duration,
      });
    }
  }

  private async testScriptExecution(): Promise<void> {
    await this.runTest('Script Execution', async () => {
      // Test sync-secrets.ts help
      const helpOutput = execSync(
        'pnpm tsx scripts/sync-secrets.ts --help || pnpm tsx scripts/sync-secrets.ts help || echo "help command test"',
        {
          encoding: 'utf8',
          stdio: 'pipe',
        }
      );

      // Test setup-dev-env.ts help
      const setupHelpOutput = execSync(
        'pnpm tsx scripts/setup-dev-env.ts --help || pnpm tsx scripts/setup-dev-env.ts help || echo "help command test"',
        {
          encoding: 'utf8',
          stdio: 'pipe',
        }
      );

      if (
        !helpOutput.includes('Commands:') &&
        !helpOutput.includes('Secret') &&
        !setupHelpOutput.includes('Ectropy Platform')
      ) {
        throw new Error('Script help output not as expected');
      }
    });
  }

  private async testEnvGeneration(): Promise<void> {
    await this.runTest('Environment File Generation', async () => {
      // Backup existing .env.local if it exists
      const backupPath = '.env.local.backup';
      if (existsSync('.env.local')) {
        const content = readFileSync('.env.local', 'utf8');
        writeFileSync(backupPath, content);
        unlinkSync('.env.local');
      }

      try {
        // Run setup-dev-env which should create .env.local
        execSync('pnpm tsx scripts/setup-dev-env.ts', {
          stdio: 'pipe',
          timeout: 30000,
        });

        // Verify .env.local was created
        if (!existsSync('.env.local')) {
          throw new Error('.env.local was not created');
        }

        // Check content
        const content = readFileSync('.env.local', 'utf8');

        const requiredEntries = [
          'JWT_SECRET=',
          'JWT_REFRESH_SECRET=',
          'DATABASE_URL=',
          'REDIS_URL=',
          'NODE_ENV=development',
        ];

        for (const entry of requiredEntries) {
          if (!content.includes(entry)) {
            throw new Error(`Missing required entry: ${entry}`);
          }
        }

        // Check for OpenAI placeholder
        if (!content.includes('OPENAI_API_KEY')) {
          throw new Error('Missing OPENAI_API_KEY configuration');
        }
      } finally {
        // Restore backup if it exists
        if (existsSync(backupPath)) {
          if (existsSync('.env.local')) {
            unlinkSync('.env.local');
          }
          const backupContent = readFileSync(backupPath, 'utf8');
          writeFileSync('.env.local', backupContent);
          unlinkSync(backupPath);
        }
      }
    });
  }

  private async testSecretValidation(): Promise<void> {
    await this.runTest('Secret Validation', async () => {
      // Create a test env file with valid secrets
      const testEnvContent = `
OPENAI_API_KEY=sk-${'a'.repeat(48)}
JWT_SECRET=${'b'.repeat(64)}
JWT_REFRESH_SECRET=${'c'.repeat(64)}
DATABASE_URL=postgresql://user:\${DB_PASSWORD}@localhost:5432/db
REDIS_URL=redis://localhost:6379
ENCRYPTION_KEY=${'d'.repeat(32)}
NODE_ENV=development
`;

      writeFileSync(this.testEnvFile, testEnvContent);

      // Test validation by temporarily renaming .env.local
      const originalExists = existsSync('.env.local');
      let originalContent = '';

      if (originalExists) {
        originalContent = readFileSync('.env.local', 'utf8');
        unlinkSync('.env.local');
      }

      // Rename test file to .env.local
      execSync(`cp ${this.testEnvFile} .env.local`);

      try {
        // Run validation - should pass
        execSync('pnpm tsx scripts/sync-secrets.ts validate', {
          stdio: 'pipe',
          timeout: 30000,
        });
      } finally {
        // Restore original file
        unlinkSync('.env.local');
        if (originalExists) {
          writeFileSync('.env.local', originalContent);
        }
      }
    });
  }

  private async testPackageScripts(): Promise<void> {
    await this.runTest('Package.json Script Integration', async () => {
      const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

      const requiredScripts = [
        'setup:dev',
        'secrets:sync',
        'secrets:validate',
        'secrets:generate',
      ];

      for (const script of requiredScripts) {
        if (!packageJson.scripts[script]) {
          throw new Error(`Missing package.json script: ${script}`);
        }
      }

      // Test that dev script includes setup:dev
      if (!packageJson.scripts.dev.includes('setup:dev')) {
        throw new Error('dev script should include setup:dev');
      }

      // Test that postinstall includes secrets validation
      if (!packageJson.scripts.postinstall.includes('secrets:validate')) {
        throw new Error('postinstall should include secrets validation');
      }
    });
  }

  private async testCIWorkflow(): Promise<void> {
    await this.runTest('CI/CD Workflow Configuration', async () => {
      const workflowPath = '.github/workflows/secret-validation.yml';

      if (!existsSync(workflowPath)) {
        throw new Error('Secret validation workflow file not found');
      }

      const workflowContent = readFileSync(workflowPath, 'utf8');

      const requiredElements = [
        'name: Secret Validation',
        'OPENAI_API_KEY',
        'JWT_SECRET',
        'DATABASE_URL',
        'validate-secrets',
        'Test OpenAI API Connection',
        'Validate Secret Formats',
        'Run Hardcoded Secret Scan',
      ];

      for (const element of requiredElements) {
        if (!workflowContent.includes(element)) {
          throw new Error(`Missing workflow element: ${element}`);
        }
      }
    });
  }

  private async testErrorHandling(): Promise<void> {
    await this.runTest('Error Handling', async () => {
      try {
        // Test validation with no .env.local (should fail gracefully)
        const tempFile = '.env.local.temp';
        if (existsSync('.env.local')) {
          execSync(`mv .env.local ${tempFile}`);
        }

        try {
          execSync('pnpm tsx scripts/sync-secrets.ts validate', {
            stdio: 'pipe',
            timeout: 10000,
          });
          throw new Error('Validation should fail when .env.local is missing');
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          if (!errorMessage.includes('not found')) {
            throw new Error('Expected "not found" error message');
          }
        } finally {
          // Restore file if it existed
          if (existsSync(tempFile)) {
            execSync(`mv ${tempFile} .env.local`);
          }
        }

        // Test with invalid OpenAI key format
        const invalidEnvContent = `
OPENAI_API_KEY=invalid-key-format
JWT_SECRET=valid-secret-long-enough-to-pass-validation-requirements-64chars
`;

        writeFileSync(this.testEnvFile, invalidEnvContent);
        execSync(`cp ${this.testEnvFile} .env.local`);

        try {
          const result = execSync('pnpm tsx scripts/sync-secrets.ts validate', {
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 10000,
          });

          // Should indicate validation issues
          if (!result.includes('OPENAI_API_KEY')) {
            throw new Error('Should detect OpenAI API key issues');
          }
        } finally {
          unlinkSync('.env.local');
        }
      } catch (error) {
        // If we get here, it means our error handling test caught something unexpected
        throw error;
      }
    });
  }

  private generateReport(): void {
    console.log(colors.blue('\n📊 Test Results Summary'));
    console.log(colors.blue('========================\n'));

    const passed = this.results.filter((r) => r.passed).length;
    const total = this.results.length;
    const passRate = Math.round((passed / total) * 100);

    console.log(colors.blue(`Total Tests: ${total}`));
    console.log(colors.green(`Passed: ${passed}`));
    console.log(colors.red(`Failed: ${total - passed}`));
    console.log(colors.blue(`Pass Rate: ${passRate}%\n`));

    // Detailed results
    this.results.forEach((result) => {
      const status = result.passed
        ? colors.green('✅ PASS')
        : colors.red('❌ FAIL');
      const duration = colors.yellow(`${result.duration}ms`);
      console.log(`${status} ${result.name} (${duration})`);

      if (!result.passed) {
        console.log(colors.red(`    Error: ${result.message}`));
      }
    });

    // Overall result
    console.log('\n' + colors.blue('='.repeat(50)));
    if (passRate >= 90) {
      console.log(
        colors.green('🎉 SECRET MANAGEMENT IMPLEMENTATION VALIDATED')
      );
      console.log(
        colors.green('✅ System ready for OpenAI API key distribution')
      );
    } else if (passRate >= 70) {
      console.log(colors.yellow('⚠️  SECRET MANAGEMENT PARTIALLY IMPLEMENTED'));
      console.log(
        colors.yellow('🔧 Some components need attention before production')
      );
    } else {
      console.log(colors.red('❌ SECRET MANAGEMENT IMPLEMENTATION INCOMPLETE'));
      console.log(colors.red('🚨 Critical issues need resolution'));
    }
  }

  private cleanup(): void {
    // Remove test files
    if (existsSync(this.testEnvFile)) {
      unlinkSync(this.testEnvFile);
    }
  }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new SecretManagementValidator();
  validator.runAllTests().catch((error) => {
    console.error(colors.red('Validation failed:'), error);
    process.exit(1);
  });
}

export { SecretManagementValidator };

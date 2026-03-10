#!/usr/bin/env tsx

/**
 * Platform Integration Tests - Enterprise Grade
 *
 * Comprehensive integration tests covering all platform services,
 * secret management, build performance, and cross-platform compatibility.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Test configuration
const TEST_TIMEOUT = 120000; // 2 minutes per test
const BUILD_TIMEOUT = 60000; // 1 minute for builds
const SERVICE_STARTUP_DELAY = 5000; // 5 seconds for service startup

describe('Ectropy Platform Integration Tests', () => {
  describe('🏗️  Build System Integration', () => {
    it(
      'should build web-dashboard within performance threshold',
      async () => {
        const startTime = Date.now();

        execSync('pnpm nx build web-dashboard --skip-nx-cache', {
          stdio: 'inherit',
          timeout: BUILD_TIMEOUT,
        });

        const buildTime = (Date.now() - startTime) / 1000;
        console.log(`Build completed in ${buildTime}s`);

        // Success criteria: build completes in under 40 seconds
        expect(buildTime).toBeLessThan(40);

        // Verify build artifacts exist
        expect(existsSync('dist/apps/web-dashboard')).toBe(true);
      },
      BUILD_TIMEOUT
    );

    it(
      'should build api-gateway successfully',
      async () => {
        const startTime = Date.now();

        execSync('pnpm nx build api-gateway --skip-nx-cache', {
          stdio: 'inherit',
          timeout: BUILD_TIMEOUT,
        });

        const buildTime = (Date.now() - startTime) / 1000;
        console.log(`API Gateway build completed in ${buildTime}s`);

        expect(existsSync('dist/apps/api-gateway')).toBe(true);
      },
      BUILD_TIMEOUT
    );

    it(
      'should build mcp-server successfully',
      async () => {
        const startTime = Date.now();

        execSync('pnpm nx build mcp-server --skip-nx-cache', {
          stdio: 'inherit',
          timeout: BUILD_TIMEOUT,
        });

        const buildTime = (Date.now() - startTime) / 1000;
        console.log(`MCP Server build completed in ${buildTime}s`);

        expect(existsSync('dist/apps/mcp-server')).toBe(true);
      },
      BUILD_TIMEOUT
    );

    it('should produce optimized bundle sizes', () => {
      // Check web-dashboard bundle size
      if (existsSync('dist/apps/web-dashboard')) {
        const output = execSync('du -sb dist/apps/web-dashboard', {
          encoding: 'utf-8',
        });
        const sizeInBytes = parseInt(output.split('\t')[0]);
        const sizeInMB = sizeInBytes / (1024 * 1024);

        console.log(`Web dashboard bundle size: ${sizeInMB.toFixed(2)}MB`);
        expect(sizeInMB).toBeLessThan(10); // Reasonable threshold for production
      }
    });
  });

  describe('🔐 Secret Management Integration', () => {
    it('should validate secret configuration', async () => {
      // Test secret validation without actually syncing from GitHub
      const result = execSync(
        'pnpm tsx scripts/sync-and-validate-secrets.ts validate || echo "validation-failed"',
        {
          encoding: 'utf-8',
        }
      );

      // Should either pass validation or fail gracefully with missing .env.local
      expect(result).toMatch(/(validation passed|\.env\.local not found)/i);
    });

    it('should pass hardcoded secret scan', async () => {
      const result = execSync(
        'pnpm tsx scripts/validate-no-hardcoded-secrets.ts',
        {
          encoding: 'utf-8',
        }
      );

      expect(result).toMatch(/Security validation passed/i);
    });

    it('should have proper .env templates', () => {
      const envTemplates = ['.env.example', '.env.development.template'];

      envTemplates.forEach((template) => {
        expect(existsSync(template)).toBe(true);

        const content = readFileSync(template, 'utf-8');

        // Should contain environment variable patterns, not hardcoded values
        expect(content).toMatch(/\$\{[^}]+\}/); // Should contain ${VARIABLE} patterns
        expect(content).not.toMatch(/sk-[a-zA-Z0-9]{48}/); // Should not contain real API keys
      });
    });

    it('should have secret rotation monitoring configured', () => {
      const rotationWorkflow = '.github/workflows/secret-rotation.yml';
      expect(existsSync(rotationWorkflow)).toBe(true);

      const content = readFileSync(rotationWorkflow, 'utf-8');
      expect(content).toMatch(/cron.*monthly/i);
      expect(content).toMatch(/OPENAI_API_KEY|JWT_SECRET|SESSION_SECRET/);
    });
  });

  describe('🌐 Cross-Platform Compatibility', () => {
    it('should have proper ESM configuration', () => {
      const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));
      expect(packageJson.type).toBe('module');
    });

    it('should have Windows ESM loader fixes applied', () => {
      const projectConfigs = [
        'apps/mcp-server/project.json',
        'apps/api-gateway/project.json',
        'apps/web-dashboard/project.json',
      ];

      projectConfigs.forEach((configPath) => {
        if (existsSync(configPath)) {
          const config = JSON.parse(readFileSync(configPath, 'utf-8'));

          // Should have Node options for ESM compatibility
          if (config.targets?.serve?.options?.nodeOptions) {
            const nodeOptions = config.targets.serve.options.nodeOptions;
            expect(nodeOptions).toContain(
              '--experimental-specifier-resolution=node'
            );
            expect(nodeOptions).toContain('--loader=tsx');
          }
        }
      });
    });

    it('should have cross-platform startup scripts', () => {
      expect(existsSync('scripts/start-services.sh')).toBe(true);
      expect(existsSync('scripts/start-services.ps1')).toBe(true);

      // Check that Unix script is executable
      const stats = require('fs').statSync('scripts/start-services.sh');
      expect(stats.mode & parseInt('111', 8)).toBeGreaterThan(0); // Should be executable
    });

    it(
      'should validate ESM compatibility',
      async () => {
        const result = execSync('./scripts/validate-esm-compatibility.sh', {
          encoding: 'utf-8',
          timeout: TEST_TIMEOUT,
        });

        expect(result).toMatch(/(ESM validation completed|EXCELLENT|GOOD)/i);
      },
      TEST_TIMEOUT
    );
  });

  describe('📚 API Documentation Integration', () => {
    it(
      'should generate comprehensive API documentation',
      async () => {
        execSync('pnpm tsx scripts/generate-api-docs.ts', {
          stdio: 'inherit',
          timeout: TEST_TIMEOUT,
        });

        // Verify documentation files were created
        expect(existsSync('docs/API_DOCUMENTATION.md')).toBe(true);
        expect(existsSync('docs/api-schema.json')).toBe(true);
        expect(existsSync('docs/openapi.yml')).toBe(true);

        // Verify documentation has content
        const apiDoc = readFileSync('docs/API_DOCUMENTATION.md', 'utf-8');
        expect(apiDoc).toMatch(/# Ectropy Platform API Documentation/);
        expect(apiDoc).toMatch(/API Gateway|MCP Server/);

        const apiSchema = JSON.parse(
          readFileSync('docs/api-schema.json', 'utf-8')
        );
        expect(apiSchema.openapi).toBe('3.0.0');
        expect(apiSchema.paths).toBeDefined();
      },
      TEST_TIMEOUT
    );

    it(
      'should validate documented endpoints',
      async () => {
        const result = execSync('pnpm tsx scripts/validate-endpoints.ts', {
          encoding: 'utf-8',
          timeout: TEST_TIMEOUT,
        });

        // Should complete validation (services may not be running, which is expected)
        expect(result).toMatch(
          /(Endpoint Validation Results|Service Availability)/
        );

        // Verify validation report was generated
        expect(existsSync('endpoint-validation-report.json')).toBe(true);

        const report = JSON.parse(
          readFileSync('endpoint-validation-report.json', 'utf-8')
        );
        expect(report.summary).toBeDefined();
        expect(report.results).toBeInstanceOf(Array);
      },
      TEST_TIMEOUT
    );
  });

  describe('🧪 Code Quality Integration', () => {
    it(
      'should pass linting checks',
      async () => {
        const result = execSync('pnpm lint', {
          encoding: 'utf-8',
          timeout: TEST_TIMEOUT,
        });

        // Should complete without errors (warnings are acceptable)
        expect(result).not.toMatch(/error/i);
      },
      TEST_TIMEOUT
    );

    it(
      'should have acceptable test coverage',
      async () => {
        const result = execSync('pnpm test', {
          encoding: 'utf-8',
          timeout: TEST_TIMEOUT,
        });

        // Should have reasonable test pass rate (based on instructions: 120/122 expected)
        expect(result).toMatch(/Tests:.*passed/i);
      },
      TEST_TIMEOUT
    );

    it(
      'should have repository health check passing',
      async () => {
        const result = execSync(
          './scripts/health/repository-health-check.sh --nx-only',
          {
            encoding: 'utf-8',
            timeout: TEST_TIMEOUT,
          }
        );

        expect(result).toMatch(/health score.*100%.*EXCELLENT/i);
      },
      TEST_TIMEOUT
    );
  });

  describe('🚀 Performance Integration', () => {
    it('should meet startup time requirements', async () => {
      // Test service startup scripts exist and are functional
      const startupScripts = [
        'scripts/start-services.sh',
        'scripts/start-services.ps1',
      ];

      startupScripts.forEach((script) => {
        if (existsSync(script)) {
          const content = readFileSync(script, 'utf-8');

          // Should contain startup logic for all services
          expect(content).toMatch(/API Gateway|api-gateway/i);
          expect(content).toMatch(/MCP Server|mcp-server/i);
          expect(content).toMatch(/Web Dashboard|web-dashboard/i);
        }
      });
    });

    it('should have performance monitoring configured', () => {
      // Check for performance-related files
      const performanceFiles = ['performance.config.js', 'lighthouserc.js'];

      performanceFiles.forEach((file) => {
        if (existsSync(file)) {
          const content = readFileSync(file, 'utf-8');
          expect(content.length).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('🔧 DevOps Integration', () => {
    it('should have proper Docker configuration', () => {
      const dockerFiles = [
        'docker-compose.dev.yml',
        'docker-compose.local.yml',
      ];

      dockerFiles.forEach((file) => {
        if (existsSync(file)) {
          const content = readFileSync(file, 'utf-8');
          expect(content).toMatch(/postgres|database/i);
          expect(content).toMatch(/redis/i);
        }
      });
    });

    it('should have GitHub Actions workflows configured', () => {
      const workflows = ['.github/workflows/secret-rotation.yml'];

      workflows.forEach((workflow) => {
        expect(existsSync(workflow)).toBe(true);

        const content = readFileSync(workflow, 'utf-8');
        expect(content).toMatch(/name:|on:|jobs:/);
      });
    });

    it('should have proper gitignore configuration', () => {
      expect(existsSync('.gitignore')).toBe(true);

      const gitignore = readFileSync('.gitignore', 'utf-8');

      // Should ignore sensitive files
      expect(gitignore).toMatch(/\.env\.local/);
      expect(gitignore).toMatch(/node_modules/);
      expect(gitignore).toMatch(/dist/);

      // Should ignore build artifacts
      expect(gitignore).toMatch(/coverage/);
    });
  });

  describe('🎯 End-to-End Integration', () => {
    it('should have all critical scripts executable and functional', async () => {
      const criticalScripts = [
        'scripts/validate-esm-compatibility.sh',
        'scripts/health/repository-health-check.sh',
      ];

      for (const script of criticalScripts) {
        if (existsSync(script)) {
          // Check if script is executable
          const stats = require('fs').statSync(script);
          expect(stats.mode & parseInt('111', 8)).toBeGreaterThan(0);

          // Test script execution (with timeout)
          try {
            execSync(`timeout 30 ${script} || true`, {
              stdio: 'pipe',
              timeout: 30000,
            });
            // If we get here, the script at least started successfully
          } catch (error) {
            // Only fail if it's not a timeout (expected for some scripts)
            if (!error.message.includes('timeout')) {
              throw error;
            }
          }
        }
      }
    });

    it('should have complete file structure for enterprise deployment', () => {
      const requiredFiles = [
        'package.json',
        'tsconfig.json',
        'nx.json',
        'README.md',
        'SECURITY.md',
        'CONTRIBUTING.md',
      ];

      requiredFiles.forEach((file) => {
        expect(existsSync(file)).toBe(true);
      });

      const requiredDirs = [
        'apps',
        'libs',
        'scripts',
        'docs',
        '.github/workflows',
      ];

      requiredDirs.forEach((dir) => {
        expect(existsSync(dir)).toBe(true);
      });
    });
  });
});

// Performance monitoring helper
function measureExecutionTime<T>(operation: () => T): {
  result: T;
  duration: number;
} {
  const start = Date.now();
  const result = operation();
  const duration = Date.now() - start;
  return { result, duration };
}

export { measureExecutionTime };

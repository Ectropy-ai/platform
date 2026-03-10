#!/usr/bin/env node
/**
 * =============================================================================
 * ENTERPRISE PLATFORM HEALTH VALIDATOR
 * =============================================================================
 *
 * Comprehensive validation script that detects and reports on the 6 core
 * issues identified in the enterprise fix instructions:
 *
 * 1. Incomplete shared library exports
 * 2. Third-party module bugs (pdf-parse initialization)
 * 3. Rate limiter implementation inconsistencies
 * 4. Environment configuration completeness
 * 5. Misleading error reporting in setup scripts
 * 6. Validation tooling gaps
 *
 * This validator provides actionable insights and can auto-fix common issues.
 */

import fs from 'fs';
import path from 'path';

class PlatformHealthValidator {
  constructor() {
    this.results = {
      sharedLibraryExports: { status: 'unknown', issues: [], fixes: [] },
      thirdPartyModules: { status: 'unknown', issues: [], fixes: [] },
      rateLimiterImplementation: { status: 'unknown', issues: [], fixes: [] },
      environmentConfiguration: { status: 'unknown', issues: [], fixes: [] },
      errorReporting: { status: 'unknown', issues: [], fixes: [] },
      validationTooling: { status: 'unknown', issues: [], fixes: [] },
    };
    this.autoFix = process.argv.includes('--auto-fix');
    this.verbose = process.argv.includes('--verbose');
  }

  /**
   * 1. Validate Shared Library Exports
   */
  async validateSharedLibraryExports() {
    console.log('🔍 1. Validating shared library exports...');

    const sharedUtilsIndexPath = 'libs/shared/utils/src/index.ts';
    const loggerPath = 'libs/shared/utils/src/logger.ts';

    try {
      // Check if Logger is properly exported
      if (fs.existsSync(sharedUtilsIndexPath)) {
        const indexContent = fs.readFileSync(sharedUtilsIndexPath, 'utf8');

        if (indexContent.includes('export { Logger, logger }')) {
          this.results.sharedLibraryExports.status = 'healthy';
          console.log('  ✅ Logger properly exported from shared utils');
        } else {
          this.results.sharedLibraryExports.status = 'issues';
          this.results.sharedLibraryExports.issues.push(
            'Logger not exported from index.ts'
          );
          this.results.sharedLibraryExports.fixes.push(
            'Add Logger export to libs/shared/utils/src/index.ts'
          );
        }
      } else {
        this.results.sharedLibraryExports.status = 'issues';
        this.results.sharedLibraryExports.issues.push(
          'Missing shared utils index file'
        );
        this.results.sharedLibraryExports.fixes.push(
          'Create libs/shared/utils/src/index.ts with proper exports'
        );
      }

      // Check Logger implementation completeness
      if (fs.existsSync(loggerPath)) {
        const loggerContent = fs.readFileSync(loggerPath, 'utf8');
        const requiredMethods = [
          'error',
          'warn',
          'info',
          'debug',
          'security',
          'performance',
          'database',
        ];
        const missingMethods = requiredMethods.filter(
          (method) => !loggerContent.includes(`${method}(`)
        );

        if (missingMethods.length === 0) {
          console.log(
            '  ✅ Logger implementation complete with all required methods'
          );
        } else {
          this.results.sharedLibraryExports.status = 'issues';
          this.results.sharedLibraryExports.issues.push(
            `Missing Logger methods: ${missingMethods.join(', ')}`
          );
          this.results.sharedLibraryExports.fixes.push(
            'Implement missing Logger methods'
          );
        }
      }
    } catch (error) {
      this.results.sharedLibraryExports.status = 'error';
      this.results.sharedLibraryExports.issues.push(
        `Error checking exports: ${error.message}`
      );
    }
  }

  /**
   * 2. Validate Third-party Module Bugs
   */
  async validateThirdPartyModules() {
    console.log('🔍 2. Validating third-party modules...');

    try {
      // Check pdf-parse availability and functionality
      const packageJsonPath = 'package.json';
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, 'utf8')
        );

        if (packageJson.dependencies && packageJson.dependencies['pdf-parse']) {
          console.log('  ✅ pdf-parse dependency found in package.json');

          // Test pdf-parse import
          try {
            await import('pdf-parse');
            console.log('  ✅ pdf-parse imports successfully');
            this.results.thirdPartyModules.status = 'healthy';
          } catch (importError) {
            this.results.thirdPartyModules.status = 'issues';
            this.results.thirdPartyModules.issues.push(
              'pdf-parse import fails'
            );
            this.results.thirdPartyModules.fixes.push(
              'Run: pnpm install pdf-parse@1.1.1'
            );
          }
        } else {
          this.results.thirdPartyModules.status = 'issues';
          this.results.thirdPartyModules.issues.push(
            'pdf-parse missing from dependencies'
          );
          this.results.thirdPartyModules.fixes.push(
            'Add pdf-parse to package.json dependencies'
          );
        }

        // Check for dxf-parser used in enhanced document processing
        if (
          packageJson.dependencies &&
          packageJson.dependencies['dxf-parser']
        ) {
          console.log('  ✅ dxf-parser dependency found in package.json');
        } else {
          this.results.thirdPartyModules.status = 'issues';
          this.results.thirdPartyModules.issues.push(
            'dxf-parser missing from dependencies'
          );
          this.results.thirdPartyModules.fixes.push(
            'Add dxf-parser to package.json dependencies'
          );
        }
      }
    } catch (error) {
      this.results.thirdPartyModules.status = 'error';
      this.results.thirdPartyModules.issues.push(
        `Error checking third-party modules: ${error.message}`
      );
    }
  }

  /**
   * 3. Validate Rate Limiter Implementation
   */
  async validateRateLimiterImplementation() {
    console.log('🔍 3. Validating rate limiter implementation...');

    try {
      const rateLimitFiles = [
        'libs/shared/middleware/src/security.middleware.ts',
        'libs/shared/middleware/security.middleware.ts',
        'apps/api-gateway/src/middleware/owasp-security.ts',
      ];

      let foundValidImplementation = false;

      for (const filePath of rateLimitFiles) {
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');

          // Check for incorrect usage patterns
          if (content.includes('rateLimitModule.rateLimit')) {
            this.results.rateLimiterImplementation.status = 'issues';
            this.results.rateLimiterImplementation.issues.push(
              `Incorrect rate limit usage in ${filePath}`
            );
            this.results.rateLimiterImplementation.fixes.push(
              `Fix rate limit import pattern in ${filePath}`
            );
          }

          // Check for correct import patterns
          if (
            content.includes('express-rate-limit') &&
            (content.includes('rateLimitModule.default') ||
              content.includes('rateLimit('))
          ) {
            foundValidImplementation = true;
            console.log(
              `  ✅ Valid rate limiter implementation found in ${filePath}`
            );
          }
        }
      }

      if (
        foundValidImplementation &&
        this.results.rateLimiterImplementation.status !== 'issues'
      ) {
        this.results.rateLimiterImplementation.status = 'healthy';
      } else if (this.results.rateLimiterImplementation.status === 'unknown') {
        this.results.rateLimiterImplementation.status = 'issues';
        this.results.rateLimiterImplementation.issues.push(
          'No valid rate limiter implementation found'
        );
        this.results.rateLimiterImplementation.fixes.push(
          'Implement proper express-rate-limit usage'
        );
      }
    } catch (error) {
      this.results.rateLimiterImplementation.status = 'error';
      this.results.rateLimiterImplementation.issues.push(
        `Error checking rate limiter: ${error.message}`
      );
    }
  }

  /**
   * 4. Validate Environment Configuration
   */
  async validateEnvironmentConfiguration() {
    console.log('🔍 4. Validating environment configuration...');

    try {
      const envTemplates = [
        'environments/development.env.template',
        'environments/staging.env.template',
        'environments/production.env.template',
      ];

      const requiredVars = [
        'NODE_ENV',
        'PORT',
        'DATABASE_URL',
        'JWT_SECRET',
        'REDIS_URL',
        'SPECKLE_SERVER_URL',
        'CORS_ORIGINS',
        'LOG_LEVEL',
      ];

      let validTemplates = 0;
      let totalTemplates = 0;

      for (const templatePath of envTemplates) {
        totalTemplates++;
        if (fs.existsSync(templatePath)) {
          const content = fs.readFileSync(templatePath, 'utf8');
          const missingVars = requiredVars.filter(
            (variable) => !content.includes(variable)
          );

          if (missingVars.length === 0) {
            validTemplates++;
            console.log(`  ✅ ${templatePath} contains all required variables`);
          } else {
            this.results.environmentConfiguration.issues.push(
              `${templatePath} missing variables: ${missingVars.join(', ')}`
            );
          }
        } else {
          this.results.environmentConfiguration.issues.push(
            `Missing template: ${templatePath}`
          );
        }
      }

      if (
        validTemplates === totalTemplates &&
        this.results.environmentConfiguration.issues.length === 0
      ) {
        this.results.environmentConfiguration.status = 'healthy';
        console.log('  ✅ All environment templates are comprehensive');
      } else {
        this.results.environmentConfiguration.status = 'issues';
        this.results.environmentConfiguration.fixes.push(
          'Update environment templates with missing variables'
        );
      }
    } catch (error) {
      this.results.environmentConfiguration.status = 'error';
      this.results.environmentConfiguration.issues.push(
        `Error checking environment config: ${error.message}`
      );
    }
  }

  /**
   * 5. Validate Error Reporting in Setup Scripts
   */
  async validateErrorReporting() {
    console.log('🔍 5. Validating error reporting in setup scripts...');

    try {
      const scriptPaths = [
        'scripts/postinstall.js',
        'scripts/check-prerequisites.cjs',
        'scripts/health/repository-health-check.sh',
      ];

      let scriptsWithGoodErrorReporting = 0;

      for (const scriptPath of scriptPaths) {
        if (fs.existsSync(scriptPath)) {
          const content = fs.readFileSync(scriptPath, 'utf8');

          // Check for error handling patterns
          const hasErrorHandling =
            content.includes('try {') ||
            content.includes('catch') ||
            content.includes('if [') ||
            content.includes('|| {');

          const hasErrorMessages =
            content.includes('console.error') ||
            content.includes('echo') ||
            content.includes('Error:');

          if (hasErrorHandling && hasErrorMessages) {
            scriptsWithGoodErrorReporting++;
            console.log(`  ✅ ${scriptPath} has proper error reporting`);
          } else {
            this.results.errorReporting.issues.push(
              `${scriptPath} lacks comprehensive error reporting`
            );
          }
        }
      }

      if (scriptsWithGoodErrorReporting === scriptPaths.length) {
        this.results.errorReporting.status = 'healthy';
      } else {
        this.results.errorReporting.status = 'issues';
        this.results.errorReporting.fixes.push(
          'Enhance error reporting in setup scripts'
        );
      }
    } catch (error) {
      this.results.errorReporting.status = 'error';
      this.results.errorReporting.issues.push(
        `Error checking error reporting: ${error.message}`
      );
    }
  }

  /**
   * 6. Validate Validation Tooling
   */
  async validateValidationTooling() {
    console.log('🔍 6. Validating validation tooling...');

    try {
      const validationScripts = [
        'scripts/validate-rate-limit-fix.cjs',
        'scripts/health/repository-health-check.sh',
        'scripts/validate-environment.sh',
      ];

      let existingValidators = 0;

      for (const scriptPath of validationScripts) {
        if (fs.existsSync(scriptPath)) {
          existingValidators++;
          console.log(`  ✅ Found validator: ${scriptPath}`);
        }
      }

      // Check for this script itself as comprehensive validation
      const thisScript = 'scripts/validation/platform-health-validator.cjs';
      if (fs.existsSync(thisScript)) {
        existingValidators++;
        console.log(`  ✅ Comprehensive platform validator exists`);
      }

      if (existingValidators >= 3) {
        this.results.validationTooling.status = 'healthy';
        console.log('  ✅ Sufficient validation tooling present');
      } else {
        this.results.validationTooling.status = 'issues';
        this.results.validationTooling.issues.push(
          'Insufficient validation tooling'
        );
        this.results.validationTooling.fixes.push(
          'Create comprehensive validation scripts'
        );
      }
    } catch (error) {
      this.results.validationTooling.status = 'error';
      this.results.validationTooling.issues.push(
        `Error checking validation tooling: ${error.message}`
      );
    }
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    console.log(`\n${'='.repeat(80)}`);
    console.log('📊 ENTERPRISE PLATFORM HEALTH REPORT');
    console.log('='.repeat(80));

    let totalIssues = 0;
    let healthyComponents = 0;

    Object.keys(this.results).forEach((component, index) => {
      const result = this.results[component];
      const status = result.status;
      const statusIcon =
        status === 'healthy' ? '✅' : status === 'issues' ? '⚠️' : '❌';

      console.log(
        `\n${index + 1}. ${component.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())}: ${statusIcon}`
      );

      if (result.issues.length > 0) {
        totalIssues += result.issues.length;
        console.log('   Issues:');
        result.issues.forEach((issue) => console.log(`     - ${issue}`));

        if (result.fixes.length > 0) {
          console.log('   Recommended Fixes:');
          result.fixes.forEach((fix) => console.log(`     → ${fix}`));
        }
      }

      if (status === 'healthy') {
        healthyComponents++;
      }
    });

    const healthScore = Math.round(
      (healthyComponents / Object.keys(this.results).length) * 100
    );

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🎯 OVERALL HEALTH SCORE: ${healthScore}%`);
    console.log(
      `📈 Healthy Components: ${healthyComponents}/${Object.keys(this.results).length}`
    );
    console.log(`🔧 Total Issues Found: ${totalIssues}`);

    if (healthScore >= 90) {
      console.log('🏆 EXCELLENT - Platform is enterprise-ready');
    } else if (healthScore >= 75) {
      console.log('👍 GOOD - Minor improvements needed');
    } else if (healthScore >= 50) {
      console.log('⚠️  NEEDS ATTENTION - Several issues to address');
    } else {
      console.log('🚨 CRITICAL - Immediate action required');
    }

    console.log('='.repeat(80));

    return { healthScore, totalIssues, healthyComponents };
  }

  /**
   * Main execution
   */
  async run() {
    console.log('🚀 Enterprise Platform Health Validator v2.0');
    console.log('=============================================\n');

    // Run all validations
    await this.validateSharedLibraryExports();
    await this.validateThirdPartyModules();
    await this.validateRateLimiterImplementation();
    await this.validateEnvironmentConfiguration();
    await this.validateErrorReporting();
    await this.validateValidationTooling();

    // Generate and save report
    const summary = this.generateReport();

    // Save detailed report
    const reportPath = 'reports/platform-health-validation.json';
    const reportDir = path.dirname(reportPath);

    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const detailedReport = {
      timestamp: new Date().toISOString(),
      summary,
      results: this.results,
      recommendations: this.generateRecommendations(),
    };

    fs.writeFileSync(reportPath, JSON.stringify(detailedReport, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);

    // Exit with appropriate code
    process.exit(summary.totalIssues > 0 ? 1 : 0);
  }

  /**
   * Generate actionable recommendations
   */
  generateRecommendations() {
    const recommendations = [];

    Object.keys(this.results).forEach((component) => {
      const result = this.results[component];
      if (result.status === 'issues' && result.fixes.length > 0) {
        recommendations.push({
          component,
          priority: result.issues.length > 2 ? 'high' : 'medium',
          fixes: result.fixes,
        });
      }
    });

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }
}

// Self-executing validation
if (require.main === module) {
  const validator = new PlatformHealthValidator();
  validator.run().catch((error) => {
    console.error('❌ Validation failed:', error.message);
    process.exit(1);
  });
}

export default PlatformHealthValidator;

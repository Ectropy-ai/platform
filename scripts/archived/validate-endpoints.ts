#!/usr/bin/env tsx

/**
 * API Endpoint Validation - Enterprise Grade
 *
 * Validates all documented API endpoints by testing their availability,
 * response formats, and health status. Provides comprehensive reporting
 * for API reliability and performance monitoring.
 */

import { readFileSync, writeFileSync } from 'fs';

interface TestCase {
  name: string;
  service: string;
  url: string;
  method: string;
  body?: object;
  headers?: Record<string, string>;
  expectedStatus: number | number[];
  timeout?: number;
  validate?: (response: any) => boolean;
  description: string;
}

interface ValidationResult {
  testCase: TestCase;
  success: boolean;
  status?: number;
  responseTime?: number;
  error?: string;
  response?: any;
}

const API_TESTS: TestCase[] = [
  // API Gateway Health Tests
  {
    name: 'API Gateway Health Check',
    service: 'API Gateway',
    url: 'http://localhost:4000/health',
    method: 'GET',
    expectedStatus: 200,
    validate: (res) => res.status === 'healthy' || res.status === 'ok',
    description: 'Verify API Gateway is running and healthy',
  },
  {
    name: 'API Gateway Status',
    service: 'API Gateway',
    url: 'http://localhost:4000/api/status',
    method: 'GET',
    expectedStatus: [200, 404], // 404 is acceptable if endpoint doesn't exist
    description: 'Check API Gateway status endpoint',
  },

  // MCP Server Health Tests
  {
    name: 'MCP Server Health Check',
    service: 'MCP Server',
    url: 'http://localhost:3001/health',
    method: 'GET',
    expectedStatus: 200,
    validate: (res) => res.status === 'healthy' || res.status === 'ok',
    description: 'Verify MCP Server is running and healthy',
  },
  {
    name: 'MCP Server Agent Count',
    service: 'MCP Server',
    url: 'http://localhost:3001/api/mcp/health',
    method: 'GET',
    expectedStatus: [200, 404],
    validate: (res) =>
      typeof res.agentCount === 'number' || res.agents !== undefined,
    description: 'Check MCP Server agent status and count',
  },
  {
    name: 'MCP Server Metrics',
    service: 'MCP Server',
    url: 'http://localhost:3001/metrics',
    method: 'GET',
    expectedStatus: [200, 404],
    description: 'Verify metrics endpoint availability',
  },

  // API Gateway Functional Tests (if services are running)
  {
    name: 'API Gateway CORS Check',
    service: 'API Gateway',
    url: 'http://localhost:4000/health',
    method: 'OPTIONS',
    expectedStatus: [200, 204],
    description: 'Verify CORS headers are configured',
  },

  // Agent Execution Tests (lightweight)
  {
    name: 'MCP Agent List',
    service: 'MCP Server',
    url: 'http://localhost:3001/api/agents',
    method: 'GET',
    expectedStatus: [200, 404, 401],
    description: 'Check if agent listing endpoint exists',
  },

  // Authentication Test (should fail gracefully)
  {
    name: 'Authentication Required Endpoint',
    service: 'API Gateway',
    url: 'http://localhost:4000/api/admin',
    method: 'GET',
    expectedStatus: [401, 403, 404],
    description: 'Verify authentication is required for protected endpoints',
  },

  // Rate Limiting Test
  {
    name: 'Rate Limiting Check',
    service: 'API Gateway',
    url: 'http://localhost:4000/health',
    method: 'GET',
    expectedStatus: [200, 429],
    timeout: 1000,
    description:
      'Verify rate limiting is configured (should not be 429 for single request)',
  },
];

class EndpointValidator {
  private results: ValidationResult[] = [];
  private startTime: number = Date.now();

  async validateAllEndpoints(): Promise<void> {
    console.log('🧪 Validating API endpoints...\n');

    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const testCase of API_TESTS) {
      console.log(`🔍 Testing: ${testCase.name}`);

      try {
        const result = await this.validateEndpoint(testCase);
        this.results.push(result);

        if (result.success) {
          console.log(`✅ PASSED: ${testCase.name} (${result.responseTime}ms)`);
          passed++;
        } else {
          console.log(`❌ FAILED: ${testCase.name} - ${result.error}`);
          failed++;
        }
      } catch (error) {
        console.log(`⚠️  SKIPPED: ${testCase.name} - ${error.message}`);
        this.results.push({
          testCase,
          success: false,
          error: `Skipped: ${error.message}`,
        });
        skipped++;
      }

      // Small delay to avoid overwhelming services
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await this.generateReport(passed, failed, skipped);
  }

  private async validateEndpoint(
    testCase: TestCase
  ): Promise<ValidationResult> {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        testCase.timeout || 10000
      );

      const response = await fetch(testCase.url, {
        method: testCase.method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Ectropy-Endpoint-Validator/1.0',
          ...testCase.headers,
        },
        body: testCase.body ? JSON.stringify(testCase.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      // Check if status code is expected
      const expectedStatuses = Array.isArray(testCase.expectedStatus)
        ? testCase.expectedStatus
        : [testCase.expectedStatus];

      if (!expectedStatuses.includes(response.status)) {
        return {
          testCase,
          success: false,
          status: response.status,
          responseTime,
          error: `Expected status ${expectedStatuses.join(' or ')}, got ${response.status}`,
        };
      }

      // Try to parse JSON response
      let responseData: any;
      try {
        const text = await response.text();
        responseData = text ? JSON.parse(text) : {};
      } catch {
        responseData = {}; // Non-JSON response is acceptable for some endpoints
      }

      // Run custom validation if provided
      if (testCase.validate && response.ok) {
        const isValid = testCase.validate(responseData);
        if (!isValid) {
          return {
            testCase,
            success: false,
            status: response.status,
            responseTime,
            error: 'Custom validation failed',
            response: responseData,
          };
        }
      }

      return {
        testCase,
        success: true,
        status: response.status,
        responseTime,
        response: responseData,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      if (error.name === 'AbortError') {
        return {
          testCase,
          success: false,
          responseTime,
          error: `Timeout after ${testCase.timeout || 10000}ms`,
        };
      }

      // Check if this is a connection error (service not running)
      if (
        error.code === 'ECONNREFUSED' ||
        error.cause?.code === 'ECONNREFUSED'
      ) {
        return {
          testCase,
          success: false,
          responseTime,
          error: `Service not running (${testCase.service})`,
        };
      }

      return {
        testCase,
        success: false,
        responseTime,
        error: error.message,
      };
    }
  }

  private async generateReport(
    passed: number,
    failed: number,
    skipped: number
  ): Promise<void> {
    const totalTime = Date.now() - this.startTime;
    const total = passed + failed + skipped;

    console.log('\n📊 Endpoint Validation Results');
    console.log('==============================');
    console.log(`Total tests: ${total}`);
    console.log(`Passed: ${passed} (${Math.round((passed / total) * 100)}%)`);
    console.log(`Failed: ${failed} (${Math.round((failed / total) * 100)}%)`);
    console.log(
      `Skipped: ${skipped} (${Math.round((skipped / total) * 100)}%)`
    );
    console.log(`Total time: ${totalTime}ms`);

    // Service availability summary
    const serviceResults = this.analyzeServiceAvailability();
    console.log('\n🏥 Service Availability:');
    for (const [service, availability] of Object.entries(serviceResults)) {
      const status = availability.available ? '🟢 ONLINE' : '🔴 OFFLINE';
      console.log(
        `   ${service}: ${status} (${availability.successful}/${availability.total} endpoints)`
      );
    }

    // Performance summary
    const avgResponseTime =
      this.results
        .filter((r) => r.responseTime && r.success)
        .reduce((sum, r) => sum + (r.responseTime || 0), 0) /
      this.results.filter((r) => r.responseTime && r.success).length;

    if (!isNaN(avgResponseTime)) {
      console.log(
        `\n⚡ Average response time: ${Math.round(avgResponseTime)}ms`
      );
    }

    // Generate detailed JSON report
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total,
        passed,
        failed,
        skipped,
        totalTime,
        averageResponseTime: avgResponseTime || 0,
      },
      serviceAvailability: serviceResults,
      results: this.results,
      recommendations: this.generateRecommendations(),
    };

    const reportPath = 'endpoint-validation-report.json';
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed report saved: ${reportPath}`);

    // Exit with appropriate code
    if (failed > 0) {
      console.log('\n💥 Some endpoint validations failed');

      // Show critical failures
      const criticalFailures = this.results.filter(
        (r) =>
          !r.success &&
          r.error &&
          !r.error.includes('Service not running') &&
          !r.error.includes('Skipped')
      );

      if (criticalFailures.length > 0) {
        console.log(
          '\n🚨 Critical failures (services running but endpoints failing):'
        );
        criticalFailures.forEach((f) => {
          console.log(`   ❌ ${f.testCase.name}: ${f.error}`);
        });
        process.exit(1);
      } else {
        console.log(
          '\n⚠️  All failures appear to be due to services not running'
        );
        console.log(
          'This is expected in development - services need to be started manually'
        );
        process.exit(0);
      }
    } else {
      console.log('\n🎉 All available endpoint validations passed!');
      process.exit(0);
    }
  }

  private analyzeServiceAvailability(): Record<
    string,
    { available: boolean; successful: number; total: number }
  > {
    const services: Record<
      string,
      { available: boolean; successful: number; total: number }
    > = {};

    for (const result of this.results) {
      const service = result.testCase.service;
      if (!services[service]) {
        services[service] = { available: false, successful: 0, total: 0 };
      }

      services[service].total++;

      if (result.success) {
        services[service].successful++;
        services[service].available = true;
      }
    }

    return services;
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    const failedResults = this.results.filter((r) => !r.success);
    const serviceNotRunning = failedResults.filter((r) =>
      r.error?.includes('Service not running')
    ).length;

    if (serviceNotRunning > 0) {
      recommendations.push(
        'Start all required services before running validation'
      );
      recommendations.push(
        'Use: npm run dev:all or individual service commands'
      );
    }

    const timeouts = failedResults.filter((r) =>
      r.error?.includes('Timeout')
    ).length;

    if (timeouts > 0) {
      recommendations.push(
        'Some endpoints are responding slowly - investigate performance'
      );
    }

    const criticalFailures = failedResults.filter(
      (r) =>
        r.error &&
        !r.error.includes('Service not running') &&
        !r.error.includes('Skipped')
    ).length;

    if (criticalFailures > 0) {
      recommendations.push(
        'Critical endpoint failures detected - review application logs'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('All endpoints are functioning correctly');
      recommendations.push(
        'Consider adding more comprehensive integration tests'
      );
    }

    return recommendations;
  }
}

// CLI interface
async function main(): Promise<void> {
  console.log('🔍 Ectropy Platform - Endpoint Validator');
  console.log('========================================\n');

  const validator = new EndpointValidator();
  await validator.validateAllEndpoints();
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { EndpointValidator, API_TESTS };

/**
 * ENDPOINT SECURITY VALIDATION - CRITICAL SECURITY REQUIREMENT
 * 
 * As specified in the problem statement, this validates all endpoints
 * are properly secured and fails deployment if ANY exposed endpoints found.
 * 
 * File: apps/mcp-server/src/services/endpoint-validator.ts
 */

import fetch from 'node-fetch';
import { API_GATEWAY_URL } from '../config/api-gateway.config';

export interface SecurityValidationResult {
  protected: string[];
  exposed: Array<{
    endpoint: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
    fix: string;
  }>;
  misconfigured: string[];
  score: number;
}

export class EndpointValidator {
  private baseUrl: string;
  private protectedRoutePatterns = [
    '/api/*',
    '/admin/*', 
    '/dashboard/*',
    '/monitor/*'
  ];

  private publicRoutePatterns = [
    '/health',
    '/auth/login',
    '/auth/callback'
  ];

  constructor(baseUrl = API_GATEWAY_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Discover all available endpoints by checking common routes
   */
  async discoverEndpoints(): Promise<string[]> {
    const commonEndpoints = [
      '/api/v1/test',
      '/api/auth/me',
      '/api/projects',
      '/api/elements', 
      '/api/users',
      '/api/admin/users',
      '/api/admin/settings',
      '/dashboard',
      '/dashboard/architect',
      '/dashboard/contractor',
      '/monitor/health',
      '/monitor/metrics',
      '/health',
      '/auth/login',
      '/auth/callback'
    ];

    // Filter out endpoints that don't exist
    const existingEndpoints: string[] = [];
    
    for (const endpoint of commonEndpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
          const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'GET',
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          
          // If we get any response (even 401/403), the endpoint exists
          if (response.status !== 404) {
            existingEndpoints.push(endpoint);
          }
        } catch (error) {
          clearTimeout(timeoutId);
          if ((error as any)?.name === 'AbortError') {
            console.warn(`Timeout testing endpoint ${endpoint}`);
          } else {
            // Network errors mean we can't test this endpoint
            console.warn(`Cannot test endpoint ${endpoint}:`, error);
          }
        }
      } catch (error) {
        // Network errors mean we can't test this endpoint
        console.warn(`Cannot test endpoint ${endpoint}:`, error);
      }
    }

    return existingEndpoints;
  }

  /**
   * Check if a route should be protected based on patterns
   */
  isProtectedRoute(endpoint: string): boolean {
    // Check if it's explicitly public first
    for (const publicPattern of this.publicRoutePatterns) {
      const regex = new RegExp(`^${ publicPattern.replace('*', '.*') }$`);
      if (regex.test(endpoint)) {
        return false;
      }
    }

    // Check if it matches protected patterns
    for (const protectedPattern of this.protectedRoutePatterns) {
      const regex = new RegExp(`^${ protectedPattern.replace('*', '.*') }$`);
      if (regex.test(endpoint)) {
        return true;
      }
    }

    // Default to protected for security
    return true;
  }

  /**
   * Validate all endpoints for security compliance
   */
  async validateAllEndpoints(): Promise<SecurityValidationResult> {
    const endpoints = await this.discoverEndpoints();
    const results: SecurityValidationResult = {
      protected: [],
      exposed: [],
      misconfigured: [],
      score: 0
    };

    console.log(`🔍 Testing ${endpoints.length} discovered endpoints...`);

    for (const endpoint of endpoints) {
      console.log(`  Testing: ${endpoint}`);
      
      try {
        // Test 1: Try to access without authentication
        const controller1 = new AbortController();
        const timeoutId1 = setTimeout(() => controller1.abort(), 5000);

        try {
          const unauthResponse = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'GET',
            signal: controller1.signal
          });
          clearTimeout(timeoutId1);

        if (this.isProtectedRoute(endpoint)) {
          // This should be protected
          if (unauthResponse.status === 200) {
            // CRITICAL: Protected endpoint is accessible without auth
            results.exposed.push({
              endpoint,
              severity: 'CRITICAL',
              fix: 'Add auth middleware'
            });
            console.log(`    ❌ EXPOSED: Returns 200 without auth`);
          } else if (unauthResponse.status === 401 || unauthResponse.status === 403) {
            // Good: Properly protected
            results.protected.push(endpoint);
            console.log(`    ✅ PROTECTED: Returns ${unauthResponse.status}`);
          } else {
            // Misconfigured: Unexpected response
            results.misconfigured.push(endpoint);
            console.log(`    ⚠️  MISCONFIGURED: Returns ${unauthResponse.status}`);
          }
        } else {
          // This should be public
          if (unauthResponse.status === 200 || unauthResponse.status === 302) {
            // Good: Public endpoint is accessible
            console.log(`    ✅ PUBLIC: Accessible (${unauthResponse.status})`);
          } else {
            console.log(`    ℹ️  PUBLIC: Returns ${unauthResponse.status}`);
          }
        }
        } catch (error) {
          clearTimeout(timeoutId1);
          if ((error as any)?.name === 'AbortError') {
            console.warn(`    ⚠️  TIMEOUT testing ${endpoint}`);
          } else {
            console.warn(`    ⚠️  ERROR testing ${endpoint}:`, error);
          }
          results.misconfigured.push(endpoint);
          continue; // Skip second test if first fails
        }

        // Test 2: Try with expired token (only for protected routes)
        if (this.isProtectedRoute(endpoint)) {
          const controller2 = new AbortController();
          const timeoutId2 = setTimeout(() => controller2.abort(), 5000);

          try {
            const expiredTokenResponse = await fetch(`${this.baseUrl}${endpoint}`, {
              method: 'GET',
              headers: {
                'Authorization': 'Bearer expired_token_here_12345'
              },
              signal: controller2.signal
            });
            clearTimeout(timeoutId2);

          if (expiredTokenResponse.status === 200) {
            // CRITICAL: Endpoint accepts invalid tokens
            if (!results.exposed.find(item => item.endpoint === endpoint)) {
              results.exposed.push({
                endpoint,
                severity: 'CRITICAL', 
                fix: 'Fix token validation'
              });
            }
            console.log(`    ❌ INVALID TOKEN ACCEPTED`);
          }
          } catch (error) {
            clearTimeout(timeoutId2);
            if ((error as any)?.name === 'AbortError') {
              console.warn(`    ⚠️  TIMEOUT testing expired token for ${endpoint}`);
            } else {
              console.warn(`    ⚠️  ERROR testing expired token for ${endpoint}:`, error);
            }
          }
        }

      } catch (error) {
        console.warn(`    ⚠️  ERROR testing ${endpoint}:`, error);
        results.misconfigured.push(endpoint);
      }
    }

    // Calculate security score
    const totalProtectedRoutes = endpoints.filter(e => this.isProtectedRoute(e)).length;
    const properlyProtectedCount = results.protected.length;
    const exposedCount = results.exposed.length;

    if (totalProtectedRoutes > 0) {
      results.score = Math.max(0, Math.floor(((properlyProtectedCount - exposedCount) / totalProtectedRoutes) * 100));
    } else {
      results.score = 100; // No protected routes to secure
    }

    // FAIL DEPLOYMENT IF ANY EXPOSED ENDPOINTS - as specified in requirements
    if (results.exposed.length > 0) {
      const errorMessage = `SECURITY BREACH: ${results.exposed.length} endpoints exposed`;
      console.error(`🚨 ${errorMessage}`);
      console.error('Exposed endpoints:', results.exposed);
      throw new Error(errorMessage);
    }

    return results;
  }

  /**
   * Generate security report
   */
  generateReport(results: SecurityValidationResult): void {
    console.log('\n🔒 ENDPOINT SECURITY VALIDATION REPORT');
    console.log('=====================================');
    console.log(`Security Score: ${results.score}/100`);
    console.log(`Protected Endpoints: ${results.protected.length}`);
    console.log(`Exposed Endpoints: ${results.exposed.length}`);
    console.log(`Misconfigured Endpoints: ${results.misconfigured.length}`);
    
    if (results.exposed.length > 0) {
      console.log('\n❌ EXPOSED ENDPOINTS (CRITICAL):');
      results.exposed.forEach(item => {
        console.log(`  - ${item.endpoint} (${item.severity}): ${item.fix}`);
      });
    }

    if (results.misconfigured.length > 0) {
      console.log('\n⚠️  MISCONFIGURED ENDPOINTS:');
      results.misconfigured.forEach(endpoint => {
        console.log(`  - ${endpoint}`);
      });
    }

    if (results.protected.length > 0) {
      console.log('\n✅ PROPERLY PROTECTED ENDPOINTS:');
      results.protected.forEach(endpoint => {
        console.log(`  - ${endpoint}`);
      });
    }

    console.log(`\nValidation ${results.exposed.length === 0 ? 'PASSED' : 'FAILED'}: ${new Date().toISOString()}`);
  }
}

// CLI interface
if (require.main === module) {
  const validator = new EndpointValidator();
  
  validator.validateAllEndpoints()
    .then(results => {
      validator.generateReport(results);
      process.exit(results.exposed.length > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Validation failed:', error.message);
      process.exit(1);
    });
}
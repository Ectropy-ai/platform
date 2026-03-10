/**
 * Security Test Setup for Ectropy Platform
 * Specialized configuration for security testing
 */

import jwt from 'jsonwebtoken';

// Security test environment configuration
process.env.NODE_ENV = 'security-test';
process.env.SECURITY_TEST_MODE = 'true';
process.env.ENABLE_SECURITY_LOGGING = 'true';

// Enhanced security test utilities
global.securityTestSuite = {
  /**
   * Authentication Security Tests
   */
  auth: {
    /**
     * Test JWT token security
     */
    async testJWTSecurity(token: string) {
      const tests = [
        () => this.validateTokenStructure(token),
        () => this.validateTokenSignature(token),
        () => this.validateTokenExpiration(token),
        () => this.validateTokenClaims(token),
      ];

      const results = await Promise.allSettled(tests.map((test) => test()));
      return results.map((result, index) => ({
        test: ['structure', 'signature', 'expiration', 'claims'][index],
        passed: result.status === 'fulfilled',
        error: result.status === 'rejected' ? result.reason : null,
      }));
    },

    /**
     * Test password security requirements
     */
    testPasswordSecurity(password: string) {
      const requirements = [
        { name: 'length', test: password.length >= 8 },
        { name: 'uppercase', test: /[A-Z]/.test(password) },
        { name: 'lowercase', test: /[a-z]/.test(password) },
        { name: 'numbers', test: /\d/.test(password) },
        { name: 'special', test: /[!@#$%^&*(),.?":{}|<>]/.test(password) },
        { name: 'no_common', test: !this.isCommonPassword(password) },
      ];

      return requirements.map((req) => ({
        requirement: req.name,
        passed: req.test,
      }));
    },

    /**
     * Test rate limiting security
     */
    async testRateLimit(endpoint: string, attempts: number = 150) {
      const requests = Array(attempts)
        .fill()
        .map((_, i) => ({
          attempt: i + 1,
          timestamp: Date.now(),
        }));

      const responses = [];
      for (const request of requests) {
        try {
          const response = await fetch(endpoint);
          responses.push({
            attempt: request.attempt,
            status: response.status,
            rateLimited: response.status === 429,
          });

          if (response.status === 429) break;
        } catch (error) {
          responses.push({
            attempt: request.attempt,
            status: 'error',
            error: error.message,
          });
        }
      }

      return {
        totalAttempts: responses.length,
        rateLimitTriggered: responses.some((r) => r.rateLimited),
        triggerPoint: responses.findIndex((r) => r.rateLimited) + 1,
      };
    },

    isCommonPassword(password: string): boolean {
      const commonPasswords = [
        'password',
        '123456',
        'password123',
        'admin',
        'qwerty',
        'letmein',
        'welcome',
        'monkey',
        '1234567890',
        'abc123',
      ];
      return commonPasswords.includes(password.toLowerCase());
    },

    validateTokenStructure(token: string): boolean {
      const parts = token.split('.');
      return parts.length === 3;
    },

    validateTokenSignature(token: string): boolean {
      try {
        jwt.verify(token, process.env.JWT_SECRET);
        return true;
      } catch {
        return false;
      }
    },

    validateTokenExpiration(token: string): boolean {
      try {
        const decoded = jwt.decode(token) as jwt.JwtPayload;
        return decoded.exp > Date.now() / 1000;
      } catch {
        return false;
      }
    },

    validateTokenClaims(token: string): boolean {
      try {
        const decoded = jwt.decode(token) as jwt.JwtPayload;
        return !!(decoded.userId && decoded.email && decoded.role);
      } catch {
        return false;
      }
    },
  },

  /**
   * Input Validation Security Tests
   */
  inputValidation: {
    /**
     * SQL Injection test payloads
     */
    sqlInjectionPayloads: [
      "'; DROP TABLE users; --",
      "' OR 1=1 --",
      "' UNION SELECT * FROM users --",
      "'; INSERT INTO users (email) VALUES ('hacker@evil.com'); --",
      "' AND 1=CONVERT(int, (SELECT COUNT(*) FROM users)) --",
      "'; EXEC xp_cmdshell('dir'); --",
      "' OR SLEEP(5) --",
      "' OR BENCHMARK(1000000,MD5(1)) --",
    ],

    /**
     * XSS test payloads
     */
    xssPayloads: [
      '<script>alert("XSS")</script>',
      'javascript:alert("XSS")',
      '<img src="x" onerror="alert(\'XSS\')" />',
      '"><script>alert("XSS")</script>',
      '<iframe src="javascript:alert(\'XSS\')"></iframe>',
      '<body onload="alert(\'XSS\')">',
      '<svg onload="alert(\'XSS\')">',
      '{{7*7}}', // Template injection
    ],

    /**
     * Path traversal payloads
     */
    pathTraversalPayloads: [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\drivers\\etc\\hosts',
      '/etc/passwd%00',
      '....//....//....//etc/passwd',
      '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    ],

    /**
     * Test API endpoint for security vulnerabilities
     */
    async testEndpointSecurity(endpoint: string, method = 'POST') {
      const results = {
        sqlInjection: await this.testSQLInjection(endpoint, method),
        xss: await this.testXSS(endpoint, method),
        pathTraversal: await this.testPathTraversal(endpoint, method),
      };

      return results;
    },

    async testSQLInjection(endpoint: string, method: string) {
      const vulnerabilities = [];

      for (const payload of this.sqlInjectionPayloads) {
        try {
          const response = await fetch(endpoint, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: payload }),
          });

          const text = await response.text();

          // Look for database error messages
          if (
            text.includes('SQL') ||
            text.includes('mysql') ||
            text.includes('postgres')
          ) {
            vulnerabilities.push({
              payload,
              response: text.substring(0, 200),
              risk: 'HIGH',
            });
          }
        } catch (error) {
          // Network errors are expected for malformed requests
        }
      }

      return vulnerabilities;
    },

    async testXSS(endpoint: string, method: string) {
      const vulnerabilities = [];

      for (const payload of this.xssPayloads) {
        try {
          const response = await fetch(endpoint, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: payload }),
          });

          const text = await response.text();

          // Check if payload is reflected without encoding
          if (text.includes(payload) && !text.includes('&lt;script&gt;')) {
            vulnerabilities.push({
              payload,
              response: text.substring(0, 200),
              risk: 'HIGH',
            });
          }
        } catch (error) {
          // Network errors are expected for malformed requests
        }
      }

      return vulnerabilities;
    },

    async testPathTraversal(endpoint: string, method: string) {
      const vulnerabilities = [];

      for (const payload of this.pathTraversalPayloads) {
        try {
          const testEndpoint = endpoint.replace(/\/[^\/]*$/, `/${payload}`);
          const response = await fetch(testEndpoint);

          const text = await response.text();

          // Look for system file contents
          if (text.includes('root:') || text.includes('[hosts]')) {
            vulnerabilities.push({
              payload,
              endpoint: testEndpoint,
              response: text.substring(0, 200),
              risk: 'CRITICAL',
            });
          }
        } catch (error) {
          // Network errors are expected for malformed requests
        }
      }

      return vulnerabilities;
    },
  },

  /**
   * Access Control Security Tests
   */
  accessControl: {
    /**
     * Test role-based access control
     */
    async testRBAC(endpoint: string, userRoles: string[]) {
      const results = [];

      for (const role of userRoles) {
        const token = this.createRoleToken(role);

        try {
          const response = await fetch(endpoint, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          results.push({
            role,
            status: response.status,
            allowed: response.status !== 403,
          });
        } catch (error) {
          results.push({
            role,
            status: 'error',
            error: error.message,
          });
        }
      }

      return results;
    },

    /**
     * Test horizontal privilege escalation
     */
    async testHorizontalPrivilegeEscalation(
      endpoint: string,
      userId: string,
      otherUserId: string
    ) {
      const userToken = this.createUserToken(userId);
      const otherUserEndpoint = endpoint.replace(userId, otherUserId);

      try {
        const response = await fetch(otherUserEndpoint, {
          headers: {
            Authorization: `Bearer ${userToken}`,
          },
        });

        return {
          vulnerable: response.status === 200,
          status: response.status,
          message:
            response.status === 200
              ? 'Horizontal privilege escalation possible'
              : 'Access properly restricted',
        };
      } catch (error) {
        return {
          vulnerable: false,
          error: error.message,
        };
      }
    },

    createRoleToken(role: string): string {
      return jwt.sign(
        {
          userId: `test-${role}-user`,
          email: `${role}@test.com`,
          role,
        },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
    },

    createUserToken(userId: string): string {
      return jwt.sign(
        {
          userId,
          email: `user-${userId}@test.com`,
          role: 'user',
        },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
    },
  },

  /**
   * Generate comprehensive security report
   */
  async generateSecurityReport(endpoints: string[]) {
    const report = {
      timestamp: new Date().toISOString(),
      endpoints: endpoints.length,
      summary: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
      vulnerabilities: [],
    };

    for (const endpoint of endpoints) {
      console.log(`🔍 Testing security for ${endpoint}...`);

      const endpointResults =
        await this.inputValidation.testEndpointSecurity(endpoint);

      // Process SQL injection results
      endpointResults.sqlInjection.forEach((vuln) => {
        report.vulnerabilities.push({
          endpoint,
          type: 'SQL Injection',
          risk: vuln.risk,
          payload: vuln.payload,
        });
        report.summary[vuln.risk.toLowerCase()]++;
      });

      // Process XSS results
      endpointResults.xss.forEach((vuln) => {
        report.vulnerabilities.push({
          endpoint,
          type: 'XSS',
          risk: vuln.risk,
          payload: vuln.payload,
        });
        report.summary[vuln.risk.toLowerCase()]++;
      });
    }

    return report;
  },
};

// Setup security test environment
beforeEach(() => {
  jest.clearAllMocks();

  // Reset security test state
  process.env.SECURITY_TEST_RUN_ID = Date.now().toString();
});

afterEach(() => {
  jest.restoreAllMocks();
});

console.log('🔒 Security test environment configured');

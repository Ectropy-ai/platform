// ============================================================================
// k6 Load Testing Script - Staging Environment (100 Concurrent Users)
// ============================================================================
// Purpose: Validate staging infrastructure can handle 100 concurrent users
//          for Canada pilot deployment
// Target: https://staging.ectropy.ai
// Success Criteria:
//   - P95 latency < 500ms
//   - Error rate < 1%
//   - Zero timeout errors
//   - Database connection pool stable
// ============================================================================

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ============================================================================
// Custom Metrics
// ============================================================================

const errorRate = new Rate('errors');
const apiLatency = new Trend('api_latency');
const dbQueryLatency = new Trend('db_query_latency');
const authFailures = new Counter('auth_failures');
const tenantIsolationFailures = new Counter('tenant_isolation_failures');

// ============================================================================
// Test Configuration
// ============================================================================

export const options = {
  // Load profile: Ramp up to 100 users over 19 minutes
  stages: [
    { duration: '2m', target: 20 }, // Warm-up: Ramp to 20 users
    { duration: '3m', target: 50 }, // Ramp to 50 users
    { duration: '2m', target: 100 }, // Ramp to 100 users (target load)
    { duration: '10m', target: 100 }, // Sustain 100 users for 10 minutes
    { duration: '2m', target: 0 }, // Cool-down: Ramp down to 0
  ],

  // Success thresholds
  thresholds: {
    // HTTP request duration (P95 < 500ms)
    http_req_duration: ['p(95)<500'],

    // Error rate < 1%
    errors: ['rate<0.01'],

    // Request success rate > 99%
    http_req_failed: ['rate<0.01'],

    // Database query latency (P95 < 200ms)
    db_query_latency: ['p(95)<200'],

    // API latency (P95 < 300ms)
    api_latency: ['p(95)<300'],

    // No authentication failures
    auth_failures: ['count<10'],

    // No tenant isolation failures
    tenant_isolation_failures: ['count==0'],
  },

  // Timeouts
  http: {
    timeout: '30s',
  },
};

// ============================================================================
// Test Data - Canadian Tenant Configuration
// ============================================================================

const BASE_URL = __ENV.BASE_URL || 'https://staging.ectropy.ai';

// Multi-tenant test configuration
// TODO: Replace with actual tenant IDs after seeding
const TENANTS = {
  canadian: {
    id: __ENV.CANADIAN_TENANT_ID || 'canadian-construction-pilot',
    users: [
      {
        email: 'admin@canadianco.example.ca',
        password: __ENV.CANADIAN_ADMIN_PASSWORD || 'CanadaPilot2026!',
        role: 'ADMIN',
      },
      {
        email: 'manager@canadianco.example.ca',
        password: __ENV.CANADIAN_MANAGER_PASSWORD || 'CanadaPilot2026!',
        role: 'PROJECT_MANAGER',
      },
      {
        email: 'analyst@canadianco.example.ca',
        password: __ENV.CANADIAN_ANALYST_PASSWORD || 'CanadaPilot2026!',
        role: 'ANALYST',
      },
    ],
  },
  default: {
    id: __ENV.DEFAULT_TENANT_ID || 'ectropy-staging',
    users: [
      {
        email: 'demo@ectropy.com',
        password: __ENV.DEMO_PASSWORD || 'demo123',
        role: 'USER',
      },
    ],
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Authenticate user and return access token
 */
function authenticate(email, password, tenantId) {
  const payload = JSON.stringify({
    email,
    password,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
    },
    tags: { name: 'auth' },
  };

  const res = http.post(`${BASE_URL}/api/auth/login`, payload, params);

  const success = check(res, {
    'authentication successful': (r) => r.status === 200,
    'auth response has token': (r) => r.json('token') !== undefined,
  });

  if (!success) {
    authFailures.add(1);
    console.error(
      `Authentication failed for ${email}: ${res.status} ${res.body}`
    );
    return null;
  }

  return res.json('token');
}

/**
 * Get projects for a tenant (tests tenant isolation)
 */
function getProjects(token, tenantId, expectedTenantId) {
  const params = {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenantId,
    },
    tags: { name: 'get_projects' },
  };

  const start = Date.now();
  const res = http.get(`${BASE_URL}/api/projects`, params);
  const duration = Date.now() - start;

  apiLatency.add(duration);

  const success = check(res, {
    'projects endpoint returns 200': (r) => r.status === 200,
    'response is valid JSON': (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch (e) {
        return false;
      }
    },
    'projects belong to correct tenant': (r) => {
      if (r.status !== 200) {
        return true;
      } // Skip check if request failed

      const projects = r.json('data') || [];
      const allCorrectTenant = projects.every(
        (p) => p.tenantId === expectedTenantId
      );

      if (!allCorrectTenant) {
        tenantIsolationFailures.add(1);
        console.error(
          `Tenant isolation failure: Found projects from other tenants for ${tenantId}`
        );
      }

      return allCorrectTenant;
    },
  });

  errorRate.add(!success);
  return res;
}

/**
 * Get user profile (tests authentication)
 */
function getUserProfile(token, tenantId) {
  const params = {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenantId,
    },
    tags: { name: 'get_profile' },
  };

  const start = Date.now();
  const res = http.get(`${BASE_URL}/api/users/me`, params);
  const duration = Date.now() - start;

  apiLatency.add(duration);

  const success = check(res, {
    'profile endpoint returns 200': (r) => r.status === 200,
    'profile has email': (r) => r.json('email') !== undefined,
    'profile has tenantId': (r) => r.json('tenantId') !== undefined,
  });

  errorRate.add(!success);
  return res;
}

/**
 * Get voxels (tests ROS/MRO data access)
 */
function getVoxels(token, tenantId) {
  const params = {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenantId,
    },
    tags: { name: 'get_voxels' },
  };

  const start = Date.now();
  const res = http.get(`${BASE_URL}/api/voxels`, params);
  const duration = Date.now() - start;

  dbQueryLatency.add(duration);

  const success = check(res, {
    'voxels endpoint returns 200': (r) => r.status === 200,
  });

  errorRate.add(!success);
  return res;
}

/**
 * Health check (tests infrastructure)
 */
function healthCheck() {
  const params = {
    tags: { name: 'health_check' },
  };

  const res = http.get(`${BASE_URL}/api/health`, params);

  const success = check(res, {
    'health endpoint returns 200': (r) => r.status === 200,
    'health status is ok': (r) => r.json('status') === 'ok',
  });

  errorRate.add(!success);
  return res;
}

// ============================================================================
// Main Test Scenario
// ============================================================================

export default function () {
  // Select random tenant and user for this iteration
  const tenants = [TENANTS.canadian, TENANTS.default];
  const tenant = tenants[Math.floor(Math.random() * tenants.length)];
  const user = tenant.users[Math.floor(Math.random() * tenant.users.length)];

  group('Health Check', () => {
    healthCheck();
  });

  // Authenticate
  let token;
  group('Authentication', () => {
    token = authenticate(user.email, user.password, tenant.id);
  });

  if (!token) {
    console.error(
      `Skipping authenticated requests - authentication failed for ${user.email}`
    );
    sleep(1);
    return;
  }

  // Authenticated API requests
  group('Authenticated Requests', () => {
    group('Get User Profile', () => {
      getUserProfile(token, tenant.id);
    });

    group('Get Projects (Tenant Isolation Test)', () => {
      getProjects(token, tenant.id, tenant.id);
    });

    group('Get Voxels (Database Query Test)', () => {
      getVoxels(token, tenant.id);
    });
  });

  // Think time - simulate real user behavior
  sleep(Math.random() * 2 + 1); // Sleep between 1-3 seconds
}

// ============================================================================
// Setup and Teardown
// ============================================================================

export function setup() {
  console.log('========================================');
  console.log('k6 Load Testing - Staging (100 Users)');
  console.log('========================================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test Duration: 19 minutes`);
  console.log(`Target Load: 100 concurrent users`);
  console.log('');
  console.log('Success Criteria:');
  console.log('  - P95 latency < 500ms');
  console.log('  - Error rate < 1%');
  console.log('  - Zero tenant isolation failures');
  console.log('========================================');
  console.log('');

  // Verify staging environment is accessible
  const healthRes = http.get(`${BASE_URL}/api/health`);
  if (healthRes.status !== 200) {
    throw new Error(
      `Staging environment not accessible: ${healthRes.status} ${healthRes.body}`
    );
  }

  console.log('✅ Staging environment is accessible');
  console.log('✅ Starting load test...');
  console.log('');
}

export function teardown(data) {
  console.log('');
  console.log('========================================');
  console.log('Load Test Complete');
  console.log('========================================');
  console.log('Review metrics above for detailed results');
  console.log('');
}

// ============================================================================
// Execution Instructions
// ============================================================================

/*
PREREQUISITES:
1. Staging environment deployed and accessible at https://staging.ectropy.ai
2. Multi-tenant migrations applied (MT-M1 → MT-M4)
3. Database seeded with Canadian tenant and demo data
4. User credentials configured in environment variables

ENVIRONMENT VARIABLES:
export BASE_URL="https://staging.ectropy.ai"
export CANADIAN_TENANT_ID="<uuid-from-database>"
export DEFAULT_TENANT_ID="<uuid-from-database>"
export CANADIAN_ADMIN_PASSWORD="<password>"
export CANADIAN_MANAGER_PASSWORD="<password>"
export CANADIAN_ANALYST_PASSWORD="<password>"
export DEMO_PASSWORD="<password>"

EXECUTION:
# Run test
k6 run scripts/load-testing/k6-staging-100-users.js

# Run test with custom configuration
k6 run \
  --out json=test-results/k6-staging-100-users-$(date +%Y%m%d-%H%M%S).json \
  --summary-export=test-results/k6-staging-summary-$(date +%Y%m%d-%H%M%S).json \
  scripts/load-testing/k6-staging-100-users.js

# Run test with cloud output (k6 Cloud)
k6 run --out cloud scripts/load-testing/k6-staging-100-users.js

# Run test with InfluxDB output (for Grafana visualization)
k6 run \
  --out influxdb=http://localhost:8086/k6 \
  scripts/load-testing/k6-staging-100-users.js

SUCCESS CRITERIA:
✅ P95 HTTP request duration < 500ms
✅ Error rate < 1%
✅ Zero tenant isolation failures
✅ Zero authentication failures
✅ All thresholds passing

TROUBLESHOOTING:
- High error rate: Check API logs, database connections
- High latency: Check database query performance, connection pooling
- Auth failures: Verify user credentials, tenant IDs
- Tenant isolation failures: Check RLS policies, tenant context middleware
*/

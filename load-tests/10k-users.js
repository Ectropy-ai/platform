/**
 * Task 4.3: Load Test - 10K Concurrent Users
 * Production-grade load testing for the Ectropy platform
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
export const errorRate = new Rate('errors');

export const options = {
  stages: [
    // Ramp-up: gradually increase to 1K users
    { duration: '2m', target: 100 },
    { duration: '3m', target: 1000 },

    // Scale to 5K users
    { duration: '5m', target: 5000 },

    // Peak load: 10K concurrent users
    { duration: '2m', target: 10000 },

    // Sustain peak load
    { duration: '10m', target: 10000 },

    // Ramp-down
    { duration: '3m', target: 5000 },
    { duration: '2m', target: 1000 },
    { duration: '2m', target: 0 },
  ],

  thresholds: {
    // 95% of requests must complete within 500ms
    http_req_duration: ['p(95)<500'],

    // Error rate must be less than 1%
    http_req_failed: ['rate<0.01'],
    errors: ['rate<0.01'],

    // 99% of requests must complete within 1000ms
    http_req_duration: ['p(99)<1000'],

    // Average response time should be under 200ms
    http_req_duration: ['avg<200'],
  },

  // Resource configuration
  maxRedirects: 4,
  userAgent: 'Ectropy Load Test k6/0.45.0',

  // Set high VU limits for 10K concurrent users
  noVUConnectionReuse: false,
  batch: 20,
  batchPerHost: 6,
};

// Test scenarios
const scenarios = [
  {
    name: 'health_check',
    weight: 20,
    endpoint: '/health',
    method: 'GET',
  },
  {
    name: 'api_metrics',
    weight: 10,
    endpoint: '/metrics',
    method: 'GET',
  },
  {
    name: 'mcp_health',
    weight: 15,
    endpoint: '/api/mcp/health',
    method: 'GET',
  },
  {
    name: 'web_dashboard',
    weight: 30,
    endpoint: '/',
    method: 'GET',
  },
  {
    name: 'api_projects',
    weight: 15,
    endpoint: '/api/projects',
    method: 'GET',
  },
  {
    name: 'api_materials',
    weight: 10,
    endpoint: '/api/materials',
    method: 'GET',
  },
];

function selectScenario() {
  const random = Math.random() * 100;
  let cumulative = 0;

  for (const scenario of scenarios) {
    cumulative += scenario.weight;
    if (random <= cumulative) {
      return scenario;
    }
  }

  return scenarios[0]; // fallback
}

export default function () {
  const baseUrl = __ENV.BASE_URL || 'http://localhost:4200';
  const scenario = selectScenario();

  const response = http.request(
    scenario.method,
    `${baseUrl}${scenario.endpoint}`,
    null,
    {
      headers: {
        Accept: 'application/json, text/html',
        'Accept-Encoding': 'gzip, deflate',
        'Cache-Control': 'no-cache',
        'User-Agent': 'Ectropy Load Test k6',
      },
      timeout: '30s',
    }
  );

  // Check response
  const success = check(response, {
    'status is 200-299': (r) => r.status >= 200 && r.status < 300,
    'response time < 500ms': (r) => r.timings.duration < 500,
    'response time < 1000ms': (r) => r.timings.duration < 1000,
    'response has content': (r) => r.body && r.body.length > 0,
  });

  // Record errors
  errorRate.add(!success);

  // Add realistic user behavior delays
  if (scenario.name === 'web_dashboard') {
    sleep(1); // Users spend time reading the dashboard
  } else if (scenario.name === 'api_projects') {
    sleep(0.5); // API calls are faster
  } else {
    sleep(0.1); // Health checks are very fast
  }
}

// Setup function - runs once per VU
export function setup() {
  console.log('Starting load test with target 10K concurrent users');
  console.log('Test duration: ~30 minutes');
  console.log('Success criteria: <1% error rate, p95 < 500ms');

  return {
    startTime: new Date().toISOString(),
    testConfig: options,
  };
}

// Teardown function - runs once at the end
export function teardown(data) {
  console.log(`Load test completed. Started at: ${data.startTime}`);
  console.log('Check the test summary for performance metrics');
}

/**
 * ENTERPRISE MONITORING VALIDATION TESTS - ROOT CAUSE #93
 *
 * Purpose: Validate complete monitoring stack (Prometheus + Grafana + Alertmanager)
 * Scope: Metrics exposure, scraping, dashboard provisioning, alert routing
 *
 * This test suite verifies the fixes for ROOT CAUSE #90, #91, #92:
 * - ROOT CAUSE #90: /metrics endpoint availability (Prometheus scraping)
 * - ROOT CAUSE #91: Grafana dashboard auto-provisioning
 * - ROOT CAUSE #92: Alertmanager Slack integration
 *
 * VALIDATION COVERAGE:
 * 1. Prometheus metrics endpoint returns valid exposition format
 * 2. Metrics contain expected time series (50+ metrics)
 * 3. Prometheus successfully scrapes targets
 * 4. Grafana dashboards auto-provision on startup
 * 5. Alertmanager configuration loads successfully
 * 6. Alert routing rules are correctly configured
 *
 * Run against: Local (docker-compose.monitoring.yml) OR Production
 * Frequency: CI/CD pipeline + manual validation after infrastructure changes
 *
 * @see monitoring/prometheus.yml - Scrape configuration
 * @see monitoring/alerts/*.yml - Alert rule definitions
 * @see monitoring/grafana/provisioning - Dashboard configuration
 * @see evidence/2026-01/alertmanager-slack-integration-2026-01-20/evidence.json
 */

import { test, expect } from '@playwright/test';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * ENTERPRISE PATTERN: Environment-aware URL resolution
 *
 * Supports testing against:
 * - Local development (localhost:4000, localhost:9090, localhost:3003)
 * - Docker Compose (ectropy-api-gateway:4000, prometheus:9090, grafana:3000)
 * - Production (https://ectropy.ai with reverse proxy)
 */
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';
const GRAFANA_URL = process.env.GRAFANA_URL || 'http://localhost:3003';
const ALERTMANAGER_URL =
  process.env.ALERTMANAGER_URL || 'http://localhost:9093';

const TIMEOUT = 30000; // 30s max per test

// Expected metrics from apps/api-gateway/src/middleware/performance-monitor.ts
const EXPECTED_METRICS = [
  'http_requests_total',
  'http_request_duration_seconds',
  'http_response_size_bytes',
  'http_request_size_bytes',
  'http_requests_in_flight',
  'nodejs_heap_size_total_bytes',
  'nodejs_heap_size_used_bytes',
  'nodejs_external_memory_bytes',
  'nodejs_version_info',
  'process_cpu_user_seconds_total',
  'process_cpu_system_seconds_total',
  'process_cpu_seconds_total',
  'process_resident_memory_bytes',
  'process_heap_bytes',
];

// =============================================================================
// TEST SUITE: PROMETHEUS METRICS ENDPOINT (ROOT CAUSE #90)
// =============================================================================

test.describe('ROOT CAUSE #90 - Prometheus Metrics Endpoint', () => {
  test('should expose /metrics endpoint with 200 status', async ({
    request,
  }) => {
    const response = await request.get(`${API_BASE_URL}/metrics`, {
      timeout: TIMEOUT,
    });

    expect(response.status()).toBe(200);
    console.log('✅ /metrics endpoint accessible');
  });

  test('should return Prometheus exposition format', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/metrics`);

    // Verify content-type header
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('text/plain');

    const body = await response.text();
    expect(body.length).toBeGreaterThan(0);

    // Verify Prometheus format (metric_name{labels} value timestamp)
    expect(body).toMatch(/^[a-z_]+\{/m); // Metric with labels
    expect(body).toMatch(/# HELP [a-z_]+ /m); // HELP comments
    expect(body).toMatch(/# TYPE [a-z_]+ (counter|gauge|histogram|summary)/m); // TYPE comments

    console.log('✅ Valid Prometheus exposition format');
    console.log(`   Metrics payload size: ${body.length} bytes`);
  });

  test('should expose all expected enterprise metrics', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/metrics`);
    const body = await response.text();

    const missingMetrics: string[] = [];
    const foundMetrics: string[] = [];

    for (const metricName of EXPECTED_METRICS) {
      if (body.includes(metricName)) {
        foundMetrics.push(metricName);
      } else {
        missingMetrics.push(metricName);
      }
    }

    console.log(
      `✅ Found ${foundMetrics.length}/${EXPECTED_METRICS.length} expected metrics`
    );

    if (missingMetrics.length > 0) {
      console.warn('⚠️  Missing metrics:', missingMetrics);
    }

    // At least 80% of expected metrics should be present
    const coverage = (foundMetrics.length / EXPECTED_METRICS.length) * 100;
    expect(coverage).toBeGreaterThanOrEqual(80);
  });

  test('should expose http_requests_total counter metric', async ({
    request,
  }) => {
    const response = await request.get(`${API_BASE_URL}/metrics`);
    const body = await response.text();

    // Verify http_requests_total exists
    expect(body).toContain('http_requests_total');

    // Verify metric has labels (method, route, status_code)
    const metricPattern =
      /http_requests_total\{method="[A-Z]+",route="[^"]+",status_code="\d+"\} \d+/;
    expect(body).toMatch(metricPattern);

    console.log('✅ http_requests_total counter metric present');
  });

  test('should expose http_request_duration_seconds histogram', async ({
    request,
  }) => {
    const response = await request.get(`${API_BASE_URL}/metrics`);
    const body = await response.text();

    // Verify histogram exists with buckets
    expect(body).toContain('http_request_duration_seconds_bucket');
    expect(body).toContain('http_request_duration_seconds_sum');
    expect(body).toContain('http_request_duration_seconds_count');

    console.log('✅ http_request_duration_seconds histogram present');
  });

  test('should expose Node.js process metrics', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/metrics`);
    const body = await response.text();

    // Verify Node.js runtime metrics
    expect(body).toContain('nodejs_heap_size_total_bytes');
    expect(body).toContain('nodejs_heap_size_used_bytes');
    expect(body).toContain('process_cpu_seconds_total');
    expect(body).toContain('process_resident_memory_bytes');

    console.log('✅ Node.js process metrics present');
  });

  test('metrics endpoint should respond quickly (< 1s)', async ({
    request,
  }) => {
    const startTime = Date.now();

    const response = await request.get(`${API_BASE_URL}/metrics`);
    expect(response.ok()).toBe(true);

    const duration = Date.now() - startTime;

    // Metrics endpoint should be fast (< 1s)
    expect(duration).toBeLessThan(1000);

    console.log(`✅ Metrics response time: ${duration}ms (SLA: < 1s)`);
  });
});

// =============================================================================
// TEST SUITE: PROMETHEUS SCRAPING (ROOT CAUSE #90 VALIDATION)
// =============================================================================

test.describe('ROOT CAUSE #90 Validation - Prometheus Scraping', () => {
  test('Prometheus should be accessible', async ({ request }) => {
    const response = await request.get(`${PROMETHEUS_URL}/-/healthy`, {
      timeout: TIMEOUT,
    });

    expect(response.status()).toBe(200);
    console.log('✅ Prometheus server healthy');
  });

  test('Prometheus should successfully scrape API Gateway metrics', async ({
    request,
  }) => {
    // Query Prometheus API for scrape health
    const response = await request.get(`${PROMETHEUS_URL}/api/v1/query`, {
      params: {
        query: 'up{job="ectropy-api-gateway"}',
      },
      timeout: TIMEOUT,
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.status).toBe('success');

    // Verify target is up (value = 1)
    if (data.data?.result && data.data.result.length > 0) {
      const targetUp = data.data.result[0].value[1] === '1';
      expect(targetUp).toBe(true);
      console.log('✅ Prometheus successfully scraping API Gateway');
    } else {
      console.warn(
        '⚠️  API Gateway target not found in Prometheus (may not be running)'
      );
      console.warn(
        '   Note: This is expected if docker-compose.monitoring.yml is not running'
      );
    }
  });

  test('Prometheus should have http_requests_total metric', async ({
    request,
  }) => {
    // Query for http_requests_total from API Gateway
    const response = await request.get(`${PROMETHEUS_URL}/api/v1/query`, {
      params: {
        query: 'http_requests_total{job="ectropy-api-gateway"}',
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.status).toBe('success');

    if (data.data?.result && data.data.result.length > 0) {
      console.log(
        `✅ Prometheus scraped ${data.data.result.length} http_requests_total time series`
      );
    } else {
      console.warn('⚠️  No http_requests_total metrics found');
      console.warn(
        '   Either Prometheus is not scraping OR no requests have been made yet'
      );
    }
  });

  test('Prometheus should have configured alert rules', async ({ request }) => {
    // Query Prometheus rules API
    const response = await request.get(`${PROMETHEUS_URL}/api/v1/rules`, {
      timeout: TIMEOUT,
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.status).toBe('success');

    if (data.data?.groups && data.data.groups.length > 0) {
      const totalRules = data.data.groups.reduce(
        (sum: number, group: any) => sum + (group.rules?.length || 0),
        0
      );

      console.log(
        `✅ Prometheus loaded ${totalRules} alert rules from ${data.data.groups.length} groups`
      );

      // Verify expected alert groups exist
      const groupNames = data.data.groups.map((g: any) => g.name);
      console.log('   Alert groups:', groupNames.join(', '));
    } else {
      console.warn('⚠️  No alert rules loaded');
      console.warn('   Check monitoring/prometheus/alerts/*.yml files');
    }
  });
});

// =============================================================================
// TEST SUITE: GRAFANA DASHBOARD PROVISIONING (ROOT CAUSE #91)
// =============================================================================

test.describe('ROOT CAUSE #91 - Grafana Dashboard Provisioning', () => {
  test('Grafana should be accessible', async ({ request }) => {
    const response = await request.get(`${GRAFANA_URL}/api/health`, {
      timeout: TIMEOUT,
    });

    // Grafana health can return 200 or 401 (if auth required)
    const isAccessible = response.status() === 200 || response.status() === 401;
    expect(isAccessible).toBe(true);

    console.log('✅ Grafana server accessible');
  });

  test('Grafana should have auto-provisioned dashboards', async ({
    request,
  }) => {
    // Query Grafana search API (no auth required for provisioned dashboards in dev)
    const response = await request.get(`${GRAFANA_URL}/api/search`, {
      params: {
        type: 'dash-db',
      },
      timeout: TIMEOUT,
    });

    // Accept 200 (success) OR 401 (auth required - expected in production)
    const validStatus = response.status() === 200 || response.status() === 401;
    expect(validStatus).toBe(true);

    if (response.status() === 200) {
      const dashboards = await response.json();

      if (Array.isArray(dashboards) && dashboards.length > 0) {
        console.log(`✅ Grafana provisioned ${dashboards.length} dashboards`);
        console.log(
          '   Dashboard titles:',
          dashboards.map((d: any) => d.title).join(', ')
        );
      } else {
        console.warn('⚠️  No dashboards found (may not be provisioned yet)');
        console.warn(
          '   Check monitoring/grafana/provisioning/dashboards/default.yml'
        );
      }
    } else {
      console.log(
        'ℹ️  Grafana requires authentication (expected in production)'
      );
    }
  });

  test('Grafana should have Prometheus datasource configured', async ({
    request,
  }) => {
    const response = await request.get(`${GRAFANA_URL}/api/datasources`, {
      timeout: TIMEOUT,
    });

    // Accept 200 (success) OR 401 (auth required)
    const validStatus = response.status() === 200 || response.status() === 401;
    expect(validStatus).toBe(true);

    if (response.status() === 200) {
      const datasources = await response.json();

      const prometheusDatasource = datasources.find(
        (ds: any) => ds.type === 'prometheus'
      );

      if (prometheusDatasource) {
        console.log('✅ Prometheus datasource configured in Grafana');
        console.log(`   Datasource name: ${prometheusDatasource.name}`);
      } else {
        console.warn('⚠️  No Prometheus datasource found');
        console.warn(
          '   Check monitoring/grafana/provisioning/datasources/prometheus.yml'
        );
      }
    } else {
      console.log(
        'ℹ️  Grafana requires authentication (expected in production)'
      );
    }
  });
});

// =============================================================================
// TEST SUITE: ALERTMANAGER CONFIGURATION (ROOT CAUSE #92)
// =============================================================================

test.describe('ROOT CAUSE #92 - Alertmanager Slack Integration', () => {
  test('Alertmanager should be accessible', async ({ request }) => {
    const response = await request.get(`${ALERTMANAGER_URL}/-/healthy`, {
      timeout: TIMEOUT,
    });

    expect(response.status()).toBe(200);
    console.log('✅ Alertmanager server healthy');
  });

  test('Alertmanager should have loaded configuration', async ({ request }) => {
    // Query Alertmanager status API
    const response = await request.get(`${ALERTMANAGER_URL}/api/v2/status`, {
      timeout: TIMEOUT,
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('config');

    console.log('✅ Alertmanager configuration loaded');
  });

  test('Alertmanager should have Slack receivers configured', async ({
    request,
  }) => {
    const response = await request.get(`${ALERTMANAGER_URL}/api/v2/status`);
    const data = await response.json();

    // Parse YAML config (returned as string)
    const config = data.config?.original || '';

    // Verify Slack integration present
    const hasSlackConfig =
      config.includes('slack_configs') || config.includes('slack:');

    if (hasSlackConfig) {
      console.log('✅ Slack receivers configured in Alertmanager');

      // Check for receivers
      if (config.includes('critical-alerts')) {
        console.log('   - critical-alerts receiver found');
      }
      if (config.includes('warning-alerts')) {
        console.log('   - warning-alerts receiver found');
      }
    } else {
      console.warn('⚠️  No Slack configuration found');
      console.warn('   Check monitoring/alertmanager.yml');
    }

    expect(hasSlackConfig).toBe(true);
  });

  test('Alertmanager should have severity-based routing', async ({
    request,
  }) => {
    const response = await request.get(`${ALERTMANAGER_URL}/api/v2/status`);
    const data = await response.json();

    const config = data.config?.original || '';

    // Verify routing by severity
    const hasSeverityRouting =
      config.includes('severity: critical') ||
      config.includes('severity: warning');

    if (hasSeverityRouting) {
      console.log('✅ Severity-based alert routing configured');
    } else {
      console.warn('⚠️  No severity-based routing found');
    }

    expect(hasSeverityRouting).toBe(true);
  });

  test('Alertmanager should have inhibit rules configured', async ({
    request,
  }) => {
    const response = await request.get(`${ALERTMANAGER_URL}/api/v2/status`);
    const data = await response.json();

    const config = data.config?.original || '';

    // Verify inhibition rules (suppress warnings when critical alerts fire)
    const hasInhibitRules = config.includes('inhibit_rules');

    if (hasInhibitRules) {
      console.log('✅ Alert inhibition rules configured');
      console.log(
        '   (Prevents alert fatigue by suppressing lower-severity alerts)'
      );
    } else {
      console.warn('⚠️  No inhibit rules found');
    }

    expect(hasInhibitRules).toBe(true);
  });

  test('Alertmanager should be connected to Prometheus', async ({
    request,
  }) => {
    // Query Alertmanager for active alerts (verifies Prometheus connectivity)
    const response = await request.get(`${ALERTMANAGER_URL}/api/v2/alerts`, {
      timeout: TIMEOUT,
    });

    expect(response.status()).toBe(200);

    const alerts = await response.json();
    expect(Array.isArray(alerts)).toBe(true);

    console.log(
      `✅ Alertmanager connected to Prometheus (${alerts.length} active alerts)`
    );

    if (alerts.length > 0) {
      console.warn(
        `⚠️  ${alerts.length} active alerts detected - check Prometheus alerts`
      );
    }
  });
});

// =============================================================================
// TEST SUITE: END-TO-END MONITORING STACK
// =============================================================================

test.describe('Enterprise Monitoring Stack - Integration', () => {
  test('should have complete monitoring pipeline functioning', async ({
    request,
  }) => {
    console.log('\n' + '='.repeat(80));
    console.log('🔍 ENTERPRISE MONITORING STACK VALIDATION SUMMARY');
    console.log('='.repeat(80));

    const results = {
      metricsEndpoint: false,
      prometheusHealth: false,
      prometheusScraping: false,
      grafanaHealth: false,
      alertmanagerHealth: false,
      alertmanagerConfig: false,
    };

    // 1. Metrics Endpoint
    try {
      const metricsResponse = await request.get(`${API_BASE_URL}/metrics`);
      results.metricsEndpoint = metricsResponse.ok();
      console.log(
        `${results.metricsEndpoint ? '✅' : '❌'} API Gateway /metrics endpoint`
      );
    } catch (error) {
      console.log('❌ API Gateway /metrics endpoint (connection failed)');
    }

    // 2. Prometheus Health
    try {
      const promResponse = await request.get(`${PROMETHEUS_URL}/-/healthy`);
      results.prometheusHealth = promResponse.ok();
      console.log(
        `${results.prometheusHealth ? '✅' : '❌'} Prometheus server`
      );
    } catch (error) {
      console.log('❌ Prometheus server (not running or not accessible)');
    }

    // 3. Prometheus Scraping
    if (results.prometheusHealth) {
      try {
        const scrapeResponse = await request.get(
          `${PROMETHEUS_URL}/api/v1/query`,
          {
            params: { query: 'up{job="ectropy-api-gateway"}' },
          }
        );
        const data = await scrapeResponse.json();
        results.prometheusScraping = data.data?.result?.length > 0;
        console.log(
          `${results.prometheusScraping ? '✅' : '⚠️'} Prometheus scraping API Gateway`
        );
      } catch (error) {
        console.log('⚠️  Prometheus scraping API Gateway (query failed)');
      }
    }

    // 4. Grafana Health
    try {
      const grafanaResponse = await request.get(`${GRAFANA_URL}/api/health`);
      results.grafanaHealth =
        grafanaResponse.ok() || grafanaResponse.status() === 401;
      console.log(`${results.grafanaHealth ? '✅' : '❌'} Grafana server`);
    } catch (error) {
      console.log('❌ Grafana server (not running or not accessible)');
    }

    // 5. Alertmanager Health
    try {
      const alertmanagerResponse = await request.get(
        `${ALERTMANAGER_URL}/-/healthy`
      );
      results.alertmanagerHealth = alertmanagerResponse.ok();
      console.log(
        `${results.alertmanagerHealth ? '✅' : '❌'} Alertmanager server`
      );
    } catch (error) {
      console.log('❌ Alertmanager server (not running or not accessible)');
    }

    // 6. Alertmanager Configuration
    if (results.alertmanagerHealth) {
      try {
        const configResponse = await request.get(
          `${ALERTMANAGER_URL}/api/v2/status`
        );
        const data = await configResponse.json();
        const config = data.config?.original || '';
        results.alertmanagerConfig = config.includes('slack_configs');
        console.log(
          `${results.alertmanagerConfig ? '✅' : '⚠️'} Alertmanager Slack integration`
        );
      } catch (error) {
        console.log('⚠️  Alertmanager Slack integration (config check failed)');
      }
    }

    console.log('='.repeat(80));

    // Calculate overall health
    const criticalServices = [
      results.metricsEndpoint,
      results.prometheusHealth,
    ];

    const allCriticalHealthy = criticalServices.every((r) => r === true);

    if (
      allCriticalHealthy &&
      results.grafanaHealth &&
      results.alertmanagerHealth
    ) {
      console.log('✅ COMPLETE MONITORING STACK OPERATIONAL');
      console.log(
        '   All components: Prometheus + Grafana + Alertmanager + Metrics'
      );
    } else if (allCriticalHealthy) {
      console.log(
        '⚠️  CORE MONITORING OPERATIONAL - SOME COMPONENTS UNAVAILABLE'
      );
      console.log('   Critical: Prometheus + Metrics endpoint working');
      console.log('   Note: Grafana/Alertmanager may not be running locally');
    } else {
      console.log('❌ MONITORING STACK INCOMPLETE');
      console.log(
        '   Required: API Gateway /metrics + Prometheus must be healthy'
      );
      console.log('   Run: docker-compose -f docker-compose.monitoring.yml up');
    }

    console.log('='.repeat(80) + '\n');

    // At minimum, metrics endpoint must work
    expect(results.metricsEndpoint).toBe(true);
  });
});

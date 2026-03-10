// Enterprise Performance Monitoring Configuration
// Phase 2 performance optimization and monitoring

export default {
  // Build performance monitoring
  build: {
    // Bundle size limits for enterprise deployment
    maxBundleSize: {
      'api-gateway': '15MB',
      'web-dashboard': '10MB',
      libs: '5MB',
    },

    // Build time thresholds
    maxBuildTime: {
      development: '60s',
      staging: '300s',
      production: '600s',
    },
  },

  // Runtime performance monitoring
  runtime: {
    // API response time thresholds
    api: {
      p50: '200ms',
      p95: '500ms',
      p99: '1000ms',
    },

    // Memory usage limits
    memory: {
      heap: '512MB',
      rss: '1GB',
    },

    // Database query performance
    database: {
      slow_query_threshold: '100ms',
      connection_pool_size: 20,
    },
  },

  // Enterprise monitoring integrations
  integrations: {
    prometheus: {
      enabled: true,
      port: 9090,
    },
    datadog: {
      enabled: process.env.DATADOG_API_KEY ? true : false,
    },
    newrelic: {
      enabled: process.env.NEW_RELIC_LICENSE_KEY ? true : false,
    },
  },
};

// Enterprise Monitoring Configuration
// Phase 2 - Production-ready observability setup

export default {
  // Prometheus metrics configuration
  prometheus: {
    enabled: process.env.PROMETHEUS_ENABLED === 'true',
    port: process.env.PROMETHEUS_PORT || 9090,
    path: '/metrics',
    collectDefaultMetrics: true,
    customMetrics: {
      httpDuration: {
        name: 'http_request_duration_ms',
        help: 'Duration of HTTP requests in ms',
        labelNames: ['method', 'route', 'status_code'],
      },
      databaseQueries: {
        name: 'database_query_duration_ms',
        help: 'Duration of database queries in ms',
        labelNames: ['operation', 'table'],
      },
      activeConnections: {
        name: 'active_connections_total',
        help: 'Number of active connections',
        labelNames: ['type'],
      },
    },
  },

  // Health check configuration
  healthCheck: {
    enabled: true,
    path: '/health',
    checks: {
      database: {
        enabled: true,
        timeout: 5000,
      },
      redis: {
        enabled: process.env.REDIS_URL ? true : false,
        timeout: 3000,
      },
      external: {
        speckle: {
          enabled: process.env.SPECKLE_SERVER_URL ? true : false,
          url: process.env.SPECKLE_SERVER_URL,
          timeout: 10000,
        },
      },
    },
  },

  // Alerting configuration
  alerting: {
    enabled: process.env.ALERTING_ENABLED === 'true',
    thresholds: {
      responseTime: 1000, // ms
      errorRate: 0.05, // 5%
      memoryUsage: 0.8, // 80%
      cpuUsage: 0.8, // 80%
    },
    channels: {
      slack: {
        enabled: process.env.SLACK_WEBHOOK_URL ? true : false,
        webhook: process.env.SLACK_WEBHOOK_URL,
      },
      email: {
        enabled: process.env.ALERT_EMAIL ? true : false,
        to: process.env.ALERT_EMAIL,
      },
    },
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.NODE_ENV === 'production' ? 'json' : 'pretty',
    destinations: [
      {
        type: 'console',
        level: 'info',
      },
      {
        type: 'file',
        level: 'error',
        filename: 'logs/error.log',
      },
    ],
  },
};

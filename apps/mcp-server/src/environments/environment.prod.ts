export const environment = {
  production: true,
  development: false,
  logLevel: 'info',
  enableMetrics: true,
  enableHealthChecks: true,
  port: process.env.MCP_PORT || 3001,
  host: process.env.MCP_HOST || '0.0.0.0'
};
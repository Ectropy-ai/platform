export const environment = {
  production: false,
  development: true,
  logLevel: 'debug',
  enableMetrics: true,
  enableHealthChecks: true,
  port: process.env.MCP_PORT || 3001,
  host: process.env.MCP_HOST || 'localhost'
};
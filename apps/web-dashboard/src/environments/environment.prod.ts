/**
 * @fileoverview Production environment configuration for Ectropy web dashboard
 * @version 1.0.0
 */

export const environment = {
  production: true,
  development: false,
  apiUrl: process.env['REACT_APP_API_URL'] || '/api',
  wsUrl: process.env['REACT_APP_WS_URL'] || `wss://${window.location.host}`,
  enableLogging: false,
  enableDebugMode: false,
  version: process.env['REACT_APP_VERSION'] || '0.1.0',
};
